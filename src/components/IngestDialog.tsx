"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";
import { clsx } from "clsx";
import { useStore, uid } from "@/lib/store";
import { Dialog, DialogHeader } from "./Dialog";
import { formatDuration } from "@/lib/scheduler";
import { TASK_TYPE_LABEL, TRACK_COLORS, type Task, type Track } from "@/lib/types";
import { riseIn, staggerParent } from "@/lib/motion";
import type { ExtractedTask } from "@/lib/extract";

type Stage = "input" | "working" | "review";

/**
 * The route clamps at 60k characters. Saying so up front beats silently
 * truncating a 400kB paste and letting someone wonder why half their document
 * was ignored.
 */
const MAX_CHARS = 60_000;

/**
 * Files are read as text, so a PDF or a .docx arrives as replacement characters
 * and mojibake. Detecting that is cheap: real text does not contain NUL bytes,
 * and a healthy sample has very few unprintable ones.
 */
function looksBinary(text: string): boolean {
  const sample = text.slice(0, 2000);
  if (sample.length === 0) return false;

  let control = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Tab, newline and carriage return are the only control codes real text has.
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code === 127) control++;
    // A replacement character means the decoder already gave up on these bytes.
    if (code === 0xfffd) control++;
  }
  // Counting control codes rather than "characters I don't recognise" matters:
  // the naive version flags perfectly good Arabic, Devanagari or emoji text.
  return control / sample.length > 0.02;
}

const PLACEHOLDER = `Paste anything with dates in it — a project brief, a syllabus, a statement of work, meeting notes, a contract, an email thread.

Kairos pulls out every dated commitment, estimates the effort, and works out whether the whole set actually fits.`;

export function IngestDialog() {
  const { ingestOpen, setIngestOpen, tracks, addTasks, importState, toast, replan } =
    useStore();

  const [stage, setStage] = useState<Stage>("input");
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{
    source: "ai" | "heuristic";
    reason?: string;
    tracks: Array<{ name: string; code: string }>;
    tasks: ExtractedTask[];
  } | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Kept so the request can actually be abandoned. A model call behind a
  // spinner with no way out is a trap, not a loading state.
  const inflight = useRef<AbortController | null>(null);

  const close = () => {
    inflight.current?.abort();
    inflight.current = null;
    setIngestOpen(false);
    // Reset a beat later so the dialog doesn't visibly rewind while animating out.
    setTimeout(() => {
      setStage("input");
      setText("");
      setResult(null);
      setChosen(new Set());
      setError(null);
    }, 200);
  };

  const cancel = () => {
    inflight.current?.abort();
    inflight.current = null;
    setStage("input");
  };

  const extract = useCallback(async () => {
    if (!text.trim()) return;

    const controller = new AbortController();
    inflight.current = controller;
    setError(null);
    setStage("working");

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          text: text.slice(0, MAX_CHARS),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);

      setResult(data);
      setChosen(new Set(data.tasks.map((_: unknown, i: number) => i)));
      setStage("review");
    } catch (err) {
      // A deliberate cancellation is not a failure and must not be reported as one.
      if (err instanceof DOMException && err.name === "AbortError") return;
      /*
       * Say what went wrong, in the dialog, next to the thing that failed.
       * "Extraction failed — check the console" told a non-developer nothing and
       * asked them to open a tool they have never heard of.
       */
      const message =
        err instanceof TypeError
          ? "No connection. Extraction needs the network; everything else in Kairos works offline."
          : err instanceof Error
            ? err.message
            : "Extraction failed for an unknown reason.";
      setError(message);
      setStage("input");
    } finally {
      inflight.current = null;
    }
  }, [text]);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => setError(`Couldn't read ${file.name}.`);
    reader.onload = () => {
      const contents = String(reader.result ?? "");
      if (looksBinary(contents)) {
        setError(
          `${file.name} isn't plain text. Export it as .txt or .md, or paste the text directly.`,
        );
        return;
      }
      setError(null);
      if (contents.length > MAX_CHARS) {
        setError(
          `${file.name} is longer than ${MAX_CHARS.toLocaleString()} characters — only the first part will be read.`,
        );
      }
      setText(contents.slice(0, MAX_CHARS));
    };
    reader.readAsText(file);
  };

  const commit = () => {
    if (!result) return;
    const selected = result.tasks.filter((_, i) => chosen.has(i));
    if (selected.length === 0) return;

    // Reconcile extracted track names against existing ones so a second import
    // from the same project doesn't create duplicate tracks.
    const existingByName = new Map(
      tracks.map((t) => [t.name.toLowerCase(), t]),
    );
    const newTracks: Track[] = [];

    const resolveTrack = (name?: string | null): string | null => {
      if (!name) return null;
      const key = name.toLowerCase();
      const found = existingByName.get(key);
      if (found) return found.id;
      const already = newTracks.find((t) => t.name.toLowerCase() === key);
      if (already) return already.id;

      const meta = result.tracks.find(
        (t) => t.name.toLowerCase() === key,
      );
      const track: Track = {
        id: uid("trk"),
        name,
        code: (meta?.code ?? name.slice(0, 4)).toUpperCase(),
        color: (tracks.length + newTracks.length) % TRACK_COLORS.length,
      };
      newTracks.push(track);
      return track.id;
    };

    const payload: Array<Omit<Task, "id">> = selected.map((t) => ({
      trackId: resolveTrack(t.trackName),
      title: t.title,
      due: t.due,
      estimateMin: t.estimateMin,
      doneMin: 0,
      type: t.type,
      weight: t.weight,
      completed: false,
      notes: t.notes ?? undefined,
    }));

    if (newTracks.length > 0) {
      importState({ tracks: [...tracks, ...newTracks] });
    }
    addTasks(payload);

    toast(
      `Imported ${payload.length} commitment${payload.length === 1 ? "" : "s"}`,
      "success",
      { label: "Auto-plan", run: replan },
    );
    close();
  };

  const totalEffort =
    result?.tasks
      .filter((_, i) => chosen.has(i))
      .reduce((sum, t) => sum + t.estimateMin, 0) ?? 0;

  return (
    <Dialog
      open={ingestOpen}
      onClose={close}
      labelledBy="ingest-title"
      className="max-w-2xl"
    >
      <DialogHeader
        id="ingest-title"
        title="Ingest a document"
        subtitle="Any text with dates in it becomes scheduled, estimated commitments."
        icon={<Sparkles size={15} className="text-accent" />}
        onClose={close}
      />

      <AnimatePresence mode="wait">
        {stage === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) readFile(file);
              }}
              className={clsx(
                "relative min-h-0 flex-1 space-y-2 p-4 transition-colors",
                dragOver && "bg-accent/[0.06]",
              )}
            >
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/[0.07] px-3 py-2"
                >
                  <AlertTriangle
                    size={12}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-danger"
                  />
                  <p className="text-mini leading-relaxed text-ink-soft">{error}</p>
                </div>
              )}
              <textarea
                data-autofocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={PLACEHOLDER}
                className="field h-56 w-full resize-none leading-relaxed"
                aria-label="Document text"
              />
              {dragOver && (
                <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-xl border-2 border-dashed border-accent/60 bg-void/80">
                  <span className="text-dense text-accent">Drop to read the file</span>
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3">
              <input
                ref={fileInput}
                type="file"
                accept=".txt,.md,.csv,.json,text/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) readFile(file);
                }}
              />
              <button
                onClick={() => fileInput.current?.click()}
                className="btn !px-2.5 !py-1.5 text-dense"
              >
                <Upload size={13} />
                File
              </button>
              <span
                className={clsx(
                  "metric text-micro",
                  text.length > MAX_CHARS ? "text-warn" : "text-ink-faint",
                )}
              >
                {text.length.toLocaleString()} chars
                {text.length > MAX_CHARS &&
                  ` · first ${MAX_CHARS.toLocaleString()} will be read`}
              </span>
              <div className="flex-1" />
              <button onClick={close} className="btn btn-ghost text-dense">
                Cancel
              </button>
              <button
                onClick={extract}
                disabled={!text.trim()}
                className="btn btn-accent text-dense"
              >
                <Sparkles size={13} />
                Extract
              </button>
            </footer>
          </motion.div>
        )}

        {stage === "working" && (
          <motion.div
            key="working"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16"
          >
            <Loader2 size={22} className="animate-spin text-accent" aria-hidden />
            <p className="text-dense text-ink-soft" role="status">
              Reading the document…
            </p>
            <p className="max-w-xs text-center text-mini leading-relaxed text-ink-faint">
              Pulling out dated commitments, estimating effort, and grouping them
              into tracks.
            </p>
            {/* A model call can take a while. Waiting should always be optional. */}
            <button onClick={cancel} className="btn btn-ghost mt-1 text-dense">
              Cancel
            </button>
          </motion.div>
        )}

        {stage === "review" && result && (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
              <span
                className={clsx(
                  "chip",
                  result.source === "ai"
                    ? "!border-accent/40 !text-accent"
                    : "!border-warn/40 !text-warn",
                )}
              >
                {result.source === "ai" ? (
                  <>
                    <Sparkles size={9} /> Claude
                  </>
                ) : (
                  <>
                    <Zap size={9} /> local parser
                  </>
                )}
              </span>
              <span className="text-mini text-ink-faint">
                {result.tasks.length} found
                {result.source === "heuristic" &&
                  result.reason === "no_api_key" &&
                  " · add ANTHROPIC_API_KEY for deeper extraction"}
              </span>
            </div>

            {result.tasks.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-14 text-center">
                <FileText size={20} className="text-ink-faint" />
                <p className="text-dense text-ink-soft">No dated commitments found.</p>
                <p className="max-w-xs text-mini leading-relaxed text-ink-faint">
                  The document may not contain explicit deadlines. Try pasting a
                  section that lists dates.
                </p>
              </div>
            ) : (
              <motion.ul
                variants={staggerParent(0.02)}
                initial="hidden"
                animate="visible"
                className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
              >
                {result.tasks.map((t, i) => {
                  const on = chosen.has(i);
                  return (
                    <motion.li key={`${t.title}-${i}`} variants={riseIn}>
                      <button
                        onClick={() =>
                          setChosen((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                        className={clsx(
                          "flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition-all",
                          on
                            ? "border-accent/40 bg-accent/[0.06]"
                            : "border-line bg-transparent opacity-55 hover:opacity-80",
                        )}
                      >
                        <span
                          className={clsx(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                            on
                              ? "border-accent bg-accent text-void"
                              : "border-lineBright",
                          )}
                        >
                          {on && <Check size={11} strokeWidth={3} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-dense text-ink">
                            {t.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="chip">
                              {format(new Date(t.due), "EEE d MMM · HH:mm")}
                            </span>
                            <span className="chip">
                              {formatDuration(t.estimateMin)}
                            </span>
                            <span className="chip">{TASK_TYPE_LABEL[t.type]}</span>
                            {t.trackName && (
                              <span className="chip !border-accent/30 !text-accent">
                                {t.trackName}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}

            <footer className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3">
              <button
                onClick={() =>
                  setChosen(
                    chosen.size === result.tasks.length
                      ? new Set()
                      : new Set(result.tasks.map((_, i) => i)),
                  )
                }
                className="btn btn-ghost text-dense"
              >
                {chosen.size === result.tasks.length ? "None" : "All"}
              </button>
              <span className="metric text-mini text-ink-faint">
                {chosen.size} selected · {formatDuration(totalEffort)} of work
              </span>
              <div className="flex-1" />
              <button onClick={() => setStage("input")} className="btn btn-ghost text-dense">
                Back
              </button>
              <button
                onClick={commit}
                disabled={chosen.size === 0}
                className="btn btn-accent text-dense"
              >
                Import {chosen.size > 0 ? chosen.size : ""}
              </button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}

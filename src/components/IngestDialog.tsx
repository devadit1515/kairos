"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { format } from "date-fns";
import { Check, FileText, Loader2, Sparkles, Upload, Zap } from "lucide-react";
import { clsx } from "clsx";
import { useStore, uid } from "@/lib/store";
import { Dialog, DialogHeader } from "./Dialog";
import { formatDuration } from "@/lib/scheduler";
import { TASK_TYPE_LABEL, TRACK_COLORS, type Task, type Track } from "@/lib/types";
import { riseIn, staggerParent } from "@/lib/motion";
import type { ExtractedTask } from "@/lib/extract";

type Stage = "input" | "working" | "review";

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
  const fileInput = useRef<HTMLInputElement>(null);

  const close = () => {
    setIngestOpen(false);
    // Reset a beat later so the dialog doesn't visibly rewind while animating out.
    setTimeout(() => {
      setStage("input");
      setText("");
      setResult(null);
      setChosen(new Set());
    }, 200);
  };

  const extract = useCallback(async () => {
    if (!text.trim()) return;
    setStage("working");
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Extraction failed");

      setResult(data);
      setChosen(new Set(data.tasks.map((_: unknown, i: number) => i)));
      setStage("review");
    } catch (err) {
      console.error(err);
      toast("Extraction failed — check the console", "danger");
      setStage("input");
    }
  }, [text, toast]);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
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
                "relative min-h-0 flex-1 p-4 transition-colors",
                dragOver && "bg-accent/[0.06]",
              )}
            >
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
                  <span className="text-[12px] text-accent">Drop to read the file</span>
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
                className="btn !px-2.5 !py-1.5 text-xs"
              >
                <Upload size={13} />
                File
              </button>
              <span className="metric text-[10px] text-ink-faint">
                {text.length.toLocaleString()} chars
              </span>
              <div className="flex-1" />
              <button onClick={close} className="btn btn-ghost text-xs">
                Cancel
              </button>
              <button
                onClick={extract}
                disabled={!text.trim()}
                className="btn btn-accent text-xs"
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
            <Loader2 size={22} className="animate-spin text-accent" />
            <p className="text-[12.5px] text-ink-soft">Reading the document…</p>
            <p className="max-w-xs text-center text-[11px] leading-relaxed text-ink-faint">
              Pulling out dated commitments, estimating effort, and grouping them
              into tracks.
            </p>
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
              <span className="text-[11px] text-ink-faint">
                {result.tasks.length} found
                {result.source === "heuristic" &&
                  result.reason === "no_api_key" &&
                  " · add ANTHROPIC_API_KEY for deeper extraction"}
              </span>
            </div>

            {result.tasks.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-14 text-center">
                <FileText size={20} className="text-ink-faint" />
                <p className="text-[12.5px] text-ink-soft">No dated commitments found.</p>
                <p className="max-w-xs text-[11px] leading-relaxed text-ink-faint">
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
                          <div className="truncate text-[12.5px] text-ink">
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
                className="btn btn-ghost text-xs"
              >
                {chosen.size === result.tasks.length ? "None" : "All"}
              </button>
              <span className="metric text-[10.5px] text-ink-faint">
                {chosen.size} selected · {formatDuration(totalEffort)} of work
              </span>
              <div className="flex-1" />
              <button onClick={() => setStage("input")} className="btn btn-ghost text-xs">
                Back
              </button>
              <button
                onClick={commit}
                disabled={chosen.size === 0}
                className="btn btn-accent text-xs"
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

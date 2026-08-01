"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Wand2, Clock3 } from "lucide-react";
import { format } from "date-fns";
import { useStore } from "@/lib/store";
import { useCapacity, useNextOpenWindow } from "@/lib/capacity";
import { formatDuration, minutesBetween } from "@/lib/scheduler";
import { CapacityRing } from "./CapacityRing";
import { riseIn, staggerParent } from "@/lib/motion";
import { colorOf } from "@/lib/types";
import { clsx } from "clsx";

/**
 * The headline. Everything else in the app exists to make this number true.
 *
 * The report comes from the shared capacity hook rather than being recomputed
 * locally, so the figure on screen is provably the same one the task rail, the
 * grid and the inspector are reading — and it advances as the day does.
 */
export function CapacityPanel() {
  const { tracks, prefs, replan, selectTask, setFocusTrack, focusTrackId } =
    useStore();

  const report = useCapacity();
  const nextWindow = useNextOpenWindow();

  const short = report.deficitMin > 0;
  const headline = short
    ? `${formatDuration(report.deficitMin)} short`
    : `${formatDuration(Math.abs(report.deficitMin))} spare`;

  // Per-track load, so you can see *which* commitment is eating the week.
  const byTrack = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of report.outlook) {
      if (o.remainingMin <= 0) continue;
      const key = o.task.trackId ?? "none";
      map.set(key, (map.get(key) ?? 0) + o.remainingMin);
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    return [...map.entries()]
      .map(([id, min]) => ({
        id,
        min,
        share: min / total,
        track: tracks.find((t) => t.id === id),
      }))
      .sort((a, b) => b.min - a.min);
  }, [report.outlook, tracks]);

  const toggleFocus = (id: string) =>
    setFocusTrack(focusTrackId === id || id === "none" ? null : id);

  return (
    <motion.section
      variants={staggerParent()}
      initial="hidden"
      animate="visible"
      className="panel flex flex-col gap-4 p-4"
      aria-labelledby="capacity-heading"
    >
      <motion.div variants={riseIn} className="flex items-center justify-between">
        <div>
          <h2 id="capacity-heading" className="eyebrow">
            Capacity · next {prefs.horizonDays}d
          </h2>
          {/*
            Announced politely: auto-planning changes this number without moving
            focus, so a screen-reader user would otherwise get no confirmation
            that the most important figure in the app had just changed.
          */}
          <p
            aria-live="polite"
            className={clsx(
              "metric mt-1 text-xl font-semibold leading-none",
              short ? "text-danger" : "text-ok",
            )}
          >
            {headline}
          </p>
        </div>
        <CapacityRing
          load={report.load}
          size={92}
          stroke={7}
          label={`${Math.round(report.load * 100)}%`}
          sublabel="load"
        />
      </motion.div>

      {/* The two inputs to the subtraction, shown plainly so the number is auditable. */}
      <motion.div variants={riseIn} className="grid grid-cols-2 gap-2">
        <Stat label="Work owed" value={formatDuration(report.requiredMin)} />
        <Stat label="Free time" value={formatDuration(report.availableMin)} />
      </motion.div>

      {byTrack.length > 0 && (
        <motion.div variants={riseIn} className="space-y-2">
          <h3 className="eyebrow">Where it goes</h3>
          {/*
            One stacked bar reads faster than four separate meters, and it is a
            readout rather than a control: it used to be a row of 6px-tall
            buttons, which is a target nobody can hit on a phone and which
            duplicated a job the legend below already does properly.

            Widths also transition in CSS now rather than being driven
            frame-by-frame from JS — animating flex-grow from JavaScript cost a
            layout pass per frame for a change nobody is watching closely.
          */}
          <div
            aria-hidden
            className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/[0.04]"
          >
            {byTrack.map((t) => (
              <span
                key={t.id}
                className="h-full rounded-full transition-[width,opacity] duration-300 ease-out"
                style={{
                  width: `${Math.max(2, t.share * 100)}%`,
                  background: t.track ? colorOf(t.track.color) : "var(--untracked)",
                  opacity: focusTrackId && focusTrackId !== t.id ? 0.3 : 1,
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {byTrack.slice(0, 4).map((t) => (
              <button
                key={t.id}
                onClick={() => toggleFocus(t.id)}
                aria-pressed={focusTrackId === t.id}
                // The visible label is a 4-character code; spell it out for
                // anyone who can't see the colour it sits next to.
                aria-label={`Filter by ${t.track?.name ?? "untracked commitments"}, ${formatDuration(t.min)} outstanding`}
                title={`${t.track?.name ?? "Untracked"} — ${formatDuration(
                  t.min,
                )} outstanding. Click to filter.`}
                className={clsx(
                  "flex min-h-[28px] items-center gap-1.5 rounded-lg border px-2 py-1 text-mini transition-colors",
                  focusTrackId === t.id
                    ? "border-accent/40 bg-accent/[0.08] text-ink"
                    : "border-transparent text-ink-soft hover:border-line hover:bg-white/[0.04] hover:text-ink",
                )}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: t.track ? colorOf(t.track.color) : "var(--untracked)",
                  }}
                />
                <span className="truncate">{t.track?.code ?? "Untracked"}</span>
                <span className="metric text-ink-faint">{formatDuration(t.min)}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Next actionable window — the single most useful line for someone
          glancing at this between meetings. */}
      {nextWindow && (
        <motion.div
          variants={riseIn}
          className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.02] px-3 py-2"
        >
          <Clock3 size={13} className="shrink-0 text-accent" />
          <span className="text-dense text-ink-soft">
            Next open window{" "}
            <span className="metric text-ink">
              {formatDuration(minutesBetween(nextWindow.start, nextWindow.end))}
            </span>{" "}
            at{" "}
            <span className="metric text-ink">
              {format(nextWindow.start, "HH:mm")}
            </span>
          </span>
        </motion.div>
      )}

      <AnimatePresence initial={false}>
        {report.atRisk.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-danger/30 bg-danger/[0.07] p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={13} className="shrink-0 text-danger" />
                <span className="text-mini font-medium text-danger">
                  {report.atRisk.length} unreachable at current pace
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {report.atRisk.slice(0, 3).map((o) => (
                  <li key={o.task.id}>
                    <button
                      onClick={() => selectTask(o.task.id)}
                      className="flex w-full items-baseline justify-between gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <span className="truncate text-dense text-ink">
                        {o.task.title}
                      </span>
                      <span className="metric shrink-0 text-micro text-danger">
                        {formatDuration(o.remainingMin - o.runwayMin)} over
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-mini leading-relaxed text-ink-faint">
                Even with a perfect schedule these can&apos;t finish in time. Cut
                scope, move the date, or free up hours.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {report.atRisk.length === 0 && report.requiredMin > 0 && (
        <motion.div
          variants={riseIn}
          className="flex items-center gap-2 rounded-xl border border-ok/25 bg-ok/[0.06] px-3 py-2"
        >
          <Check size={13} className="shrink-0 text-ok" />
          <span className="text-dense text-ink-soft">
            Every deadline is reachable.
          </span>
        </motion.div>
      )}

      <motion.button
        variants={riseIn}
        onClick={replan}
        className="btn btn-accent w-full"
      >
        <Wand2 size={14} />
        Auto-plan the week
      </motion.button>
    </motion.section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] px-3 py-2">
      <div className="eyebrow">{label}</div>
      <div className="metric mt-0.5 text-sm text-ink">{value}</div>
    </div>
  );
}

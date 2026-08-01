"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Wand2, Clock3 } from "lucide-react";
import { format } from "date-fns";
import { useStore } from "@/lib/store";
import {
  analyzeCapacity,
  formatDuration,
  nextOpenWindow,
  minutesBetween,
} from "@/lib/scheduler";
import { CapacityRing } from "./CapacityRing";
import { riseIn, staggerParent } from "@/lib/motion";
import { colorOf } from "@/lib/types";
import { clsx } from "clsx";

/**
 * The headline. Everything else in the app exists to make this number true.
 *
 * `now` is recomputed on each render rather than held in state — the panel
 * re-renders whenever tasks or blocks change, which is exactly when the
 * arithmetic could have shifted. A ticking clock here would cause re-layout
 * once a second for a number that changes once an hour.
 */
export function CapacityPanel() {
  const { tasks, blocks, tracks, prefs, replan, selectTask, setFocusTrack, focusTrackId } =
    useStore();

  const report = useMemo(
    () => analyzeCapacity(tasks, blocks, new Date(), prefs),
    [tasks, blocks, prefs],
  );

  const window = useMemo(
    () => nextOpenWindow(blocks, new Date(), prefs),
    [blocks, prefs],
  );

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

  return (
    <motion.section
      variants={staggerParent()}
      initial="hidden"
      animate="visible"
      className="panel flex flex-col gap-4 p-4"
      aria-label="Capacity"
    >
      <motion.div variants={riseIn} className="flex items-center justify-between">
        <div>
          <h2 className="eyebrow">Capacity · next {prefs.horizonDays}d</h2>
          <p
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
          <span className="eyebrow">Where it goes</span>
          {/* Single stacked bar reads faster than four separate meters. */}
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/[0.04]">
            {byTrack.map((t) => (
              <motion.button
                key={t.id}
                layout
                onClick={() =>
                  setFocusTrack(focusTrackId === t.id ? null : t.id === "none" ? null : t.id)
                }
                initial={{ flexGrow: 0 }}
                animate={{ flexGrow: t.share }}
                transition={{ type: "spring", stiffness: 200, damping: 26 }}
                className="h-full rounded-full transition-opacity hover:opacity-80"
                style={{
                  background: t.track ? colorOf(t.track.color) : "#3A4152",
                  opacity: focusTrackId && focusTrackId !== t.id ? 0.3 : 1,
                }}
                aria-label={`${t.track?.name ?? "Unassigned"}: ${formatDuration(t.min)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {byTrack.slice(0, 4).map((t) => (
              <button
                key={t.id}
                onClick={() => setFocusTrack(focusTrackId === t.id ? null : t.id)}
                className="group flex items-center gap-1.5 text-[11px] text-ink-soft transition-colors hover:text-ink"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: t.track ? colorOf(t.track.color) : "#3A4152" }}
                />
                <span className="truncate">{t.track?.code ?? "—"}</span>
                <span className="metric text-ink-faint">{formatDuration(t.min)}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Next actionable window — the single most useful line for someone
          glancing at this between meetings. */}
      {window && (
        <motion.div
          variants={riseIn}
          className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.02] px-3 py-2"
        >
          <Clock3 size={13} className="shrink-0 text-accent" />
          <span className="text-[11.5px] text-ink-soft">
            Next open window{" "}
            <span className="metric text-ink">
              {formatDuration(minutesBetween(window.start, window.end))}
            </span>{" "}
            at{" "}
            <span className="metric text-ink">{format(window.start, "HH:mm")}</span>
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
                <AlertTriangle size={13} className="text-danger" />
                <span className="text-[11px] font-medium text-danger">
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
                      <span className="truncate text-[11.5px] text-ink">
                        {o.task.title}
                      </span>
                      <span className="metric shrink-0 text-[10px] text-danger">
                        {formatDuration(o.remainingMin - o.runwayMin)} over
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10.5px] leading-relaxed text-ink-faint">
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
          <Check size={13} className="text-ok" />
          <span className="text-[11.5px] text-ink-soft">
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
      <div className="eyebrow !text-[9px]">{label}</div>
      <div className="metric mt-0.5 text-sm text-ink">{value}</div>
    </div>
  );
}

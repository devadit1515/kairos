"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { AlertTriangle, Check, Plus, ListFilter } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "@/lib/store";
import { useCapacity } from "@/lib/capacity";
import { formatDuration } from "@/lib/scheduler";
import { colorOf } from "@/lib/types";
import { riseIn, spring, staggerParent } from "@/lib/motion";

type Filter = "active" | "risk" | "done";

const FILTER_LABEL: Record<Filter, string> = {
  active: "Active",
  risk: "At risk",
  done: "Done",
};

/** Human-relative deadline labels — "Thu 17:00" is less useful than "Tomorrow". */
function dueLabel(due: Date): { text: string; urgent: boolean } {
  if (isPast(due)) return { text: `Overdue · ${format(due, "d MMM")}`, urgent: true };
  if (isToday(due)) return { text: `Today ${format(due, "HH:mm")}`, urgent: true };
  if (isTomorrow(due)) return { text: `Tomorrow ${format(due, "HH:mm")}`, urgent: false };
  return { text: format(due, "EEE d MMM"), urgent: false };
}

export function TaskRail() {
  const {
    tasks,
    tracks,
    selectedTaskId,
    focusTrackId,
    selectTask,
    toggleTask,
    setPaletteOpen,
  } = useStore();

  const [filter, setFilter] = useState<Filter>("active");

  // Shared report — the risk set here is the same object the capacity panel and
  // the grid read, so the three can never contradict each other.
  const report = useCapacity();
  const riskIds = useMemo(
    () => new Set(report.atRisk.map((o) => o.task.id)),
    [report.atRisk],
  );
  const outlookById = useMemo(
    () => new Map(report.outlook.map((o) => [o.task.id, o])),
    [report.outlook],
  );

  const visible = useMemo(() => {
    let list = tasks.filter((t) =>
      filter === "done" ? t.completed : !t.completed,
    );
    if (filter === "risk") list = list.filter((t) => riskIds.has(t.id));
    if (focusTrackId) list = list.filter((t) => t.trackId === focusTrackId);
    return list.sort(
      (a, b) => new Date(a.due).getTime() - new Date(b.due).getTime(),
    );
  }, [tasks, filter, riskIds, focusTrackId]);

  const counts = useMemo(
    () => ({
      active: tasks.filter((t) => !t.completed).length,
      risk: riskIds.size,
      done: tasks.filter((t) => t.completed).length,
    }),
    [tasks, riskIds],
  );

  return (
    <section
      className="panel flex min-h-0 flex-1 flex-col"
      aria-labelledby="commitments-heading"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <ListFilter size={12} className="text-ink-faint" aria-hidden />
          <h2 id="commitments-heading" className="eyebrow">
            Commitments
          </h2>
        </div>
        <button
          onClick={() => setPaletteOpen(true)}
          className="btn btn-ghost !px-2 !py-1"
          aria-label="Add a commitment"
          title="Add a commitment (⌘K)"
        >
          <Plus size={13} />
        </button>
      </header>

      {/* Segmented filter with a sliding indicator — cheaper visually than
          three separate buttons that all light up differently. */}
      <div
        className="relative flex shrink-0 gap-1 p-2"
        role="tablist"
        aria-label="Filter commitments"
      >
        {(["active", "risk", "done"] as Filter[]).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={clsx(
              "relative flex-1 rounded-lg px-2 py-1.5 text-mini transition-colors",
              filter === f ? "text-ink" : "text-ink-faint hover:text-ink-soft",
            )}
          >
            {filter === f && (
              <motion.span
                layoutId="task-filter-pill"
                transition={spring.snappy}
                className="absolute inset-0 rounded-lg border border-line bg-white/[0.06]"
              />
            )}
            <span className="relative flex items-center justify-center gap-1">
              {FILTER_LABEL[f]}
              <span
                className={clsx(
                  "metric text-micro",
                  f === "risk" && counts.risk > 0 ? "text-danger" : "text-ink-faint",
                )}
              >
                {counts[f]}
              </span>
            </span>
          </button>
        ))}
      </div>

      <motion.ul
        variants={staggerParent(0.02)}
        initial="hidden"
        animate="visible"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.map((task) => {
            const track = tracks.find((t) => t.id === task.trackId);
            const outlook = outlookById.get(task.id);
            const due = dueLabel(new Date(task.due));
            const atRisk = riskIds.has(task.id);
            const selected = selectedTaskId === task.id;

            return (
              /*
               * The row used to be a `div role="button"` with a real <button>
               * nested inside it. Interactive descendants of a button are
               * invalid ARIA and break both screen readers and tab order, so the
               * row-select target is now a sibling overlay button with the
               * checkbox layered above it. Same hit area, correct semantics.
               *
               * At-risk state is a background tint plus an icon rather than a
               * coloured left stripe: colour alone can't carry meaning, and the
               * stripe competed with the selected-state border.
               */
              <motion.li
                key={task.id}
                layout
                variants={riseIn}
                exit={{ opacity: 0, x: -8, transition: { duration: 0.14 } }}
                className={clsx(
                  "relative overflow-hidden rounded-xl border transition-colors duration-150",
                  selected
                    ? "border-accent/50 bg-accent/[0.07]"
                    : atRisk
                      ? "border-danger/25 bg-danger/[0.05] hover:border-danger/40"
                      : "border-transparent hover:border-line hover:bg-white/[0.03]",
                )}
              >
                <button
                  onClick={() => selectTask(selected ? null : task.id)}
                  aria-pressed={selected}
                  aria-label={`${task.title}. Due ${due.text}, ${formatDuration(
                    task.estimateMin,
                  )} estimated${atRisk ? ", not reachable in time" : ""}`}
                  className="absolute inset-0 cursor-pointer"
                />

                <div className="pointer-events-none relative z-block flex items-start gap-2.5 px-2.5 py-2">
                  <button
                    role="checkbox"
                    aria-checked={task.completed}
                    onClick={() => toggleTask(task.id)}
                    aria-label={`Mark “${task.title}” ${
                      task.completed ? "incomplete" : "complete"
                    }`}
                    className={clsx(
                      "pointer-events-auto mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                      task.completed
                        ? "border-ok bg-ok text-void"
                        : "border-lineBright hover:border-accent hover:bg-accent/10",
                    )}
                  >
                    {task.completed && <Check size={11} strokeWidth={3} />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      {track && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: colorOf(track.color) }}
                          aria-hidden
                        />
                      )}
                      <span
                        className={clsx(
                          "truncate text-dense leading-snug",
                          task.completed ? "text-ink-faint line-through" : "text-ink",
                        )}
                      >
                        {task.title}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-2">
                      {atRisk && (
                        <AlertTriangle
                          size={10}
                          className="shrink-0 text-danger"
                          aria-hidden
                        />
                      )}
                      <span
                        className={clsx(
                          "metric text-micro",
                          atRisk
                            ? "text-danger"
                            : due.urgent
                              ? "text-warn"
                              : "text-ink-faint",
                        )}
                      >
                        {due.text}
                      </span>
                      <span className="metric text-micro text-ink-faint">
                        {formatDuration(task.estimateMin)}
                      </span>
                    </div>

                    {/* Progress = logged + already scheduled. Showing booked
                        time as progress is the honest reading: it's spoken for. */}
                    {!task.completed && outlook && outlook.progress > 0 && (
                      <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
                        <motion.div
                          className="h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.min(1, outlook.progress) * 100}%`,
                          }}
                          transition={spring.smooth}
                          style={{
                            background: track ? colorOf(track.color) : "var(--accent)",
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>

        {visible.length === 0 && (
          <motion.li
            variants={riseIn}
            className="px-3 py-10 text-center text-dense leading-relaxed text-ink-faint"
          >
            {filter === "risk"
              ? "Nothing at risk. Every deadline is reachable."
              : filter === "done"
                ? "Nothing completed yet."
                : focusTrackId
                  ? "No commitments on this track."
                  : "No commitments yet. Press ⌘K to capture one."}
          </motion.li>
        )}
      </motion.ul>
    </section>
  );
}

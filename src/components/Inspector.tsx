"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { format } from "date-fns";
import {
  CalendarClock,
  Layers,
  Pin,
  PinOff,
  Repeat,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "@/lib/store";
import { analyzeCapacity, formatDuration, minutesBetween } from "@/lib/scheduler";
import { colorOf, TASK_TYPE_LABEL, type TaskType } from "@/lib/types";
import { spring } from "@/lib/motion";

const TYPES: TaskType[] = ["task", "writing", "project", "research", "milestone", "admin"];

/**
 * Detail drawer for whatever is selected.
 *
 * Slides in from the right on desktop and up from the bottom on mobile — the
 * same component, positioned by breakpoint, because the content is identical
 * and maintaining two of these would guarantee they drift.
 */
export function Inspector() {
  const {
    tasks,
    blocks,
    tracks,
    prefs,
    selectedTaskId,
    selectedBlockId,
    selectTask,
    selectBlock,
    updateTask,
    removeTask,
    updateBlock,
    removeBlock,
    logTime,
    buildPrepLadder,
  } = useStore();

  const task = tasks.find((t) => t.id === selectedTaskId);
  const block = blocks.find((b) => b.id === selectedBlockId);
  const open = Boolean(task || block);

  const outlook = useMemo(() => {
    if (!task) return null;
    const report = analyzeCapacity(tasks, blocks, new Date(), prefs);
    return report.outlook.find((o) => o.task.id === task.id) ?? null;
  }, [task, tasks, blocks, prefs]);

  const close = () => {
    selectTask(null);
    selectBlock(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={spring.smooth}
          className="panel-raised fixed inset-x-3 bottom-20 z-[70] max-h-[62vh] overflow-y-auto p-4
            sm:inset-x-auto sm:right-4 sm:top-[70px] sm:bottom-4 sm:max-h-none sm:w-[320px]"
          aria-label="Details"
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <span className="eyebrow">{task ? "Commitment" : "Block"}</span>
            <button
              onClick={close}
              aria-label="Close details"
              className="rounded-lg p-1 text-ink-faint transition-colors hover:bg-white/5 hover:text-ink"
            >
              <X size={13} />
            </button>
          </div>

          {task && (
            <div className="space-y-4">
              <input
                value={task.title}
                onChange={(e) => updateTask(task.id, { title: e.target.value })}
                className="field !border-transparent !bg-transparent !px-0 text-[15px] font-medium leading-snug focus:!border-transparent"
                aria-label="Title"
              />

              {/* Feasibility verdict, stated plainly. This is the number the
                  whole engine exists to produce, so it leads. */}
              {outlook && (
                <div
                  className={clsx(
                    "rounded-xl border px-3 py-2.5",
                    outlook.feasible
                      ? "border-ok/25 bg-ok/[0.06]"
                      : "border-danger/30 bg-danger/[0.07]",
                  )}
                >
                  <div
                    className={clsx(
                      "text-[11.5px] font-medium",
                      outlook.feasible ? "text-ok" : "text-danger",
                    )}
                  >
                    {outlook.feasible ? "Reachable" : "Not reachable in time"}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                    {formatDuration(outlook.remainingMin)} left to do ·{" "}
                    {formatDuration(outlook.runwayMin)} of free time before the
                    deadline
                    {!outlook.feasible && (
                      <>
                        {" "}
                        — short by{" "}
                        <span className="text-danger">
                          {formatDuration(outlook.remainingMin - outlook.runwayMin)}
                        </span>
                      </>
                    )}
                    .
                  </div>
                </div>
              )}

              <Field label="Deadline">
                <input
                  type="datetime-local"
                  value={format(new Date(task.due), "yyyy-MM-dd'T'HH:mm")}
                  onChange={(e) =>
                    updateTask(task.id, {
                      due: new Date(e.target.value).toISOString(),
                    })
                  }
                  className="field"
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Estimate">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step={15}
                      value={task.estimateMin}
                      onChange={(e) =>
                        updateTask(task.id, {
                          estimateMin: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="field metric"
                    />
                    <span className="text-[10px] text-ink-faint">min</span>
                  </div>
                </Field>
                <Field label="Logged">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step={15}
                      value={task.doneMin}
                      onChange={(e) =>
                        updateTask(task.id, {
                          doneMin: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="field metric"
                    />
                    <span className="text-[10px] text-ink-faint">min</span>
                  </div>
                </Field>
              </div>

              {/* One-tap time logging beats making someone do arithmetic in an
                  input they have to select first. */}
              <div className="flex gap-1">
                {[15, 30, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => logTime(task.id, m)}
                    className="btn flex-1 !px-2 !py-1 text-[11px]"
                  >
                    +{m}m
                  </button>
                ))}
              </div>

              <Field label="Type">
                <div className="flex flex-wrap gap-1">
                  {TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => updateTask(task.id, { type: t })}
                      className={clsx(
                        "rounded-lg border px-2 py-1 text-[10.5px] transition-colors",
                        task.type === t
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-line text-ink-faint hover:text-ink-soft",
                      )}
                    >
                      {TASK_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Priority">
                <div className="flex gap-1">
                  {([1, 2, 3] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => updateTask(task.id, { weight: w })}
                      className={clsx(
                        "flex-1 rounded-lg border px-2 py-1 text-[10.5px] transition-colors",
                        task.weight === w
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-line text-ink-faint hover:text-ink-soft",
                      )}
                    >
                      {w === 1 ? "Low" : w === 2 ? "Normal" : "High"}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Track">
                <select
                  value={task.trackId ?? ""}
                  onChange={(e) =>
                    updateTask(task.id, { trackId: e.target.value || null })
                  }
                  className="field"
                >
                  <option value="">— none —</option>
                  {tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Notes">
                <textarea
                  value={task.notes ?? ""}
                  onChange={(e) => updateTask(task.id, { notes: e.target.value })}
                  rows={3}
                  placeholder="Context, blockers, definition of done…"
                  className="field resize-none leading-relaxed"
                />
              </Field>

              <div className="rule" />

              <div className="space-y-1.5">
                <button
                  onClick={() => buildPrepLadder(task.id)}
                  className="btn w-full !justify-start text-[12px]"
                >
                  <Repeat size={13} className="text-accent" />
                  Build prep ladder
                  <span className="ml-auto text-[10px] text-ink-faint">14·7·3·1d</span>
                </button>
                <button
                  onClick={() => {
                    removeTask(task.id);
                    close();
                  }}
                  className="btn w-full !justify-start text-[12px] hover:!border-danger/40 hover:!text-danger"
                >
                  <Trash2 size={13} />
                  Delete commitment
                </button>
              </div>
            </div>
          )}

          {block && (
            <div className="space-y-4">
              <input
                value={block.title}
                onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                className="field !border-transparent !bg-transparent !px-0 text-[15px] font-medium leading-snug"
                aria-label="Title"
              />

              <div className="flex items-center gap-2 text-[11.5px] text-ink-soft">
                <CalendarClock size={13} className="text-ink-faint" />
                <span className="metric">
                  {format(new Date(block.start), "EEE d MMM · HH:mm")} –{" "}
                  {format(new Date(block.end), "HH:mm")}
                </span>
                <span className="metric text-ink-faint">
                  {formatDuration(
                    minutesBetween(new Date(block.start), new Date(block.end)),
                  )}
                </span>
              </div>

              {block.auto && (
                <div className="flex items-start gap-2 rounded-xl border border-line bg-white/[0.02] px-3 py-2">
                  <Zap size={12} className="mt-0.5 shrink-0 text-accent" />
                  <p className="text-[11px] leading-relaxed text-ink-soft">
                    Placed by the planner. Re-planning will move it unless you pin
                    it.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Field label="Start">
                  <input
                    type="datetime-local"
                    value={format(new Date(block.start), "yyyy-MM-dd'T'HH:mm")}
                    onChange={(e) =>
                      updateBlock(block.id, {
                        start: new Date(e.target.value).toISOString(),
                      })
                    }
                    className="field"
                  />
                </Field>
                <Field label="End">
                  <input
                    type="datetime-local"
                    value={format(new Date(block.end), "yyyy-MM-dd'T'HH:mm")}
                    onChange={(e) =>
                      updateBlock(block.id, {
                        end: new Date(e.target.value).toISOString(),
                      })
                    }
                    className="field"
                  />
                </Field>
              </div>

              <Field label="Track">
                <select
                  value={block.trackId ?? ""}
                  onChange={(e) =>
                    updateBlock(block.id, { trackId: e.target.value || null })
                  }
                  className="field"
                >
                  <option value="">— none —</option>
                  {tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>

              {tracks.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Layers size={11} className="text-ink-faint" />
                  {tracks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => updateBlock(block.id, { trackId: t.id })}
                      aria-label={`Assign to ${t.name}`}
                      className={clsx(
                        "h-4 w-4 rounded-full border-2 transition-transform hover:scale-110",
                        block.trackId === t.id ? "border-ink" : "border-transparent",
                      )}
                      style={{ background: colorOf(t.color) }}
                    />
                  ))}
                </div>
              )}

              <div className="rule" />

              <div className="space-y-1.5">
                {block.auto && (
                  <button
                    onClick={() =>
                      updateBlock(block.id, { pinned: !block.pinned })
                    }
                    className="btn w-full !justify-start text-[12px]"
                  >
                    {block.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                    {block.pinned ? "Unpin — let the planner move it" : "Pin in place"}
                  </button>
                )}
                <button
                  onClick={() => {
                    removeBlock(block.id);
                    close();
                  }}
                  className="btn w-full !justify-start text-[12px] hover:!border-danger/40 hover:!text-danger"
                >
                  <Trash2 size={13} />
                  Delete block
                </button>
              </div>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}

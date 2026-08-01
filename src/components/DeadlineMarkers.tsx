"use client";

import { motion } from "motion/react";
import { format, isSameDay } from "date-fns";
import { Flag } from "lucide-react";
import { clsx } from "clsx";
import { colorOf, type Task, type Track } from "@/lib/types";

/**
 * Deadlines drawn onto the grid.
 *
 * Without these the product is two disconnected halves: a list of things you
 * owe on the left, and a wall of time on the right. The marker is what makes
 * the relationship legible — you can see that three deadlines land on Thursday
 * and that the run-up to them is already full.
 *
 * Rendered as a hairline rather than a block on purpose. A deadline consumes
 * no time; drawing it as a rectangle would double-count it against capacity in
 * the one place users read capacity visually.
 */
export function DeadlineMarkers({
  tasks,
  tracks,
  day,
  dayStartMin,
  dayEndMin,
  atRiskIds,
  onSelect,
}: {
  tasks: Task[];
  tracks: Track[];
  day: Date;
  dayStartMin: number;
  dayEndMin: number;
  atRiskIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const span = dayEndMin - dayStartMin;

  const due = tasks.filter((t) => {
    if (t.completed) return false;
    const d = new Date(t.due);
    if (!isSameDay(d, day)) return false;
    const minute = d.getHours() * 60 + d.getMinutes();
    return minute >= dayStartMin && minute <= dayEndMin;
  });

  if (due.length === 0) return null;

  return (
    <>
      {due.map((task) => {
        const d = new Date(task.due);
        const minute = d.getHours() * 60 + d.getMinutes();
        const ratio = (minute - dayStartMin) / span;
        const track = tracks.find((t) => t.id === task.trackId);
        const risk = atRiskIds.has(task.id);
        const accent = risk ? "var(--danger)" : track ? colorOf(track.color) : "#7C8598";

        return (
          <motion.button
            key={task.id}
            initial={{ opacity: 0, scaleX: 0.7 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(task.id);
            }}
            style={{ top: `${ratio * 100}%`, originX: 0 }}
            className="group/marker absolute inset-x-0 z-[35] -translate-y-1/2 cursor-pointer"
            aria-label={`Deadline: ${task.title} at ${format(d, "HH:mm")}`}
          >
            <span
              className="block h-px w-full"
              style={{
                background: `repeating-linear-gradient(90deg, ${accent} 0 5px, transparent 5px 10px)`,
                opacity: risk ? 0.95 : 0.6,
              }}
            />
            {/* The label sits above the line and only fills in on hover, so a
                day with four deadlines doesn't become unreadable. */}
            <span
              className={clsx(
                "absolute right-0.5 top-0 flex -translate-y-full items-center gap-0.5 rounded px-1",
                "text-[9px] leading-tight transition-colors",
                "bg-void/70 opacity-70 group-hover/marker:opacity-100",
              )}
              style={{ color: accent }}
            >
              <Flag size={7} />
              <span className="max-w-[90px] truncate">{task.title}</span>
            </span>
          </motion.button>
        );
      })}
    </>
  );
}

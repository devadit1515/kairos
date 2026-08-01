"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import {
  addDays,
  format,
  isSameDay,
  isToday,
  startOfDay,
} from "date-fns";
import { clsx } from "clsx";
import { useStore } from "@/lib/store";
import { colorOf } from "@/lib/types";
import { formatDuration, freeSlots, minutesBetween, totalMinutes } from "@/lib/scheduler";
import { riseIn, staggerParent } from "@/lib/motion";

/**
 * A linear read of the next fortnight.
 *
 * The grid is good for spatial reasoning ("is Thursday afternoon free?"); the
 * agenda is better for sequential reasoning ("what's actually next?"). Each day
 * carries its own free-time total, which turns the list into a capacity
 * readout rather than just a schedule dump.
 */
export function AgendaView() {
  const {
    blocks,
    tracks,
    prefs,
    anchorDate,
    selectedBlockId,
    focusTrackId,
    selectBlock,
  } = useStore();

  const days = useMemo(() => {
    const start = startOfDay(new Date(anchorDate));
    return Array.from({ length: prefs.horizonDays }, (_, i) => addDays(start, i));
  }, [anchorDate, prefs.horizonDays]);

  return (
    <div className="h-full overflow-y-auto px-3 py-3 sm:px-5">
      <motion.ol
        variants={staggerParent(0.02)}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-3xl space-y-1"
      >
        {days.map((day) => {
          const dayBlocks = blocks
            .filter((b) => isSameDay(new Date(b.start), day))
            .sort(
              (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
            );

          const free = totalMinutes(
            freeSlots(blocks, startOfDay(day), addDays(startOfDay(day), 1), prefs),
          );
          const isWorkDay = prefs.workDays.includes(day.getDay());

          return (
            <motion.li key={day.toISOString()} variants={riseIn}>
              <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-3 py-2.5">
                {/*
                  Sticky date column so the day stays identifiable while
                  scrolling. It needs its own opaque backing — without one the
                  block rows scrolled up behind the date and the two sets of
                  glyphs overlapped into an unreadable smudge.
                */}
                <div className="sticky top-0 z-sticky self-start rounded-lg bg-surface/90 py-1 pl-0.5 backdrop-blur-sm">
                  <div
                    className={clsx(
                      "eyebrow",
                      isToday(day) && "!text-accent",
                    )}
                  >
                    {format(day, "EEE")}
                  </div>
                  <div
                    className={clsx(
                      "metric text-lg leading-tight",
                      isToday(day) ? "text-accent" : "text-ink-soft",
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  <div className="metric text-micro text-ink-faint">
                    {isWorkDay ? `${formatDuration(free)} free` : "off"}
                  </div>
                </div>

                <div className="min-w-0 space-y-1 border-l border-line pl-3">
                  {dayBlocks.length === 0 && (
                    <div className="py-2 text-dense text-ink-faint">
                      {isWorkDay ? "Entirely open." : "Not a working day."}
                    </div>
                  )}

                  {dayBlocks.map((b) => {
                    const track = tracks.find((t) => t.id === b.trackId);
                    const accent = track ? colorOf(track.color) : "var(--untracked)";
                    const mins = minutesBetween(new Date(b.start), new Date(b.end));
                    const selected = selectedBlockId === b.id;
                    // Focusing a track dimmed the grid and the month view but
                    // left the agenda untouched, so the filter looked broken
                    // depending on which view you happened to be in.
                    const dimmed =
                      Boolean(focusTrackId) && b.trackId !== focusTrackId;

                    return (
                      <button
                        key={b.id}
                        onClick={() => selectBlock(selected ? null : b.id)}
                        className={clsx(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all duration-150",
                          dimmed && "opacity-30",
                          selected
                            ? "border-accent/50 bg-accent/[0.07]"
                            : "border-transparent hover:border-line hover:bg-white/[0.03]",
                        )}
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: accent, opacity: b.auto ? 0.55 : 1 }}
                        />
                        <span className="metric w-[42px] shrink-0 text-mini text-ink-soft">
                          {format(new Date(b.start), "HH:mm")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-dense text-ink">
                          {b.title}
                        </span>
                        {b.auto && (
                          <span className="chip shrink-0">auto</span>
                        )}
                        <span className="metric shrink-0 text-mini text-ink-faint">
                          {formatDuration(mins)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rule opacity-40" />
            </motion.li>
          );
        })}
      </motion.ol>
    </div>
  );
}

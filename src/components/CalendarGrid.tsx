"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  addDays,
  format,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { clsx } from "clsx";
import { useStore } from "@/lib/store";
import { useAtRiskIds } from "@/lib/capacity";
import { layoutDay, offsetToDate, formatHour } from "@/lib/layout";
import { CalendarBlock } from "./CalendarBlock";
import { NowLine } from "./NowLine";
import { DeadlineMarkers } from "./DeadlineMarkers";
import { formatDuration } from "@/lib/scheduler";
import { spring } from "@/lib/motion";
import type { Block } from "@/lib/types";

const HOUR_HEIGHT = 56;
/** Kept in sync with `--gutter-width`; used for both grid templates. */
const GUTTER = "var(--gutter-width)";

export function CalendarGrid() {
  const {
    blocks,
    tasks,
    tracks,
    prefs,
    view,
    anchorDate,
    selectedBlockId,
    focusTrackId,
    selectBlock,
    selectTask,
    addBlock,
    toast,
    updateBlock,
  } = useStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Vertical scale is fixed by the hour height, so it needs no measurement.
  // Horizontal scale depends on the viewport, so it does.
  const pxPerMinute = HOUR_HEIGHT / 60;
  const [dayWidth, setDayWidth] = useState(0);

  const anchor = useMemo(() => new Date(anchorDate), [anchorDate]);

  const days = useMemo(() => {
    if (view === "day") return [startOfDay(anchor)];
    const first = startOfWeek(anchor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(first, i));
  }, [anchor, view]);

  const gridTemplate = `${GUTTER} repeat(${days.length}, minmax(0,1fr))`;
  const gridHeight =
    ((prefs.dayEndMin - prefs.dayStartMin) / 60) * HOUR_HEIGHT;

  /* Track column width so a horizontal drag can move a block between days. */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setDayWidth(el.clientWidth / Math.max(1, days.length));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [days.length]);

  /**
   * Commit a drag.
   *
   * Moving shifts both edges; resizing moves only the end. A day delta is
   * applied as whole days so a block dragged sideways keeps its time of day,
   * which is almost always the intent.
   */
  const commitDrag = useCallback(
    (blockId: string, deltaMinutes: number, deltaDays: number, mode: "move" | "resize") => {
      const target = blocks.find((b) => b.id === blockId);
      if (!target) return;

      const shift = (iso: string) =>
        new Date(
          new Date(iso).getTime() + deltaMinutes * 60000 + deltaDays * 86_400_000,
        ).toISOString();

      const patch: Partial<Block> =
        mode === "resize"
          ? { end: shift(target.end) }
          : { start: shift(target.start), end: shift(target.end) };

      // A hand-placed block is a decision; record it so the planner respects it.
      if (target.auto) patch.pinned = true;

      updateBlock(blockId, patch);
    },
    [blocks, updateBlock],
  );

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    const firstHour = Math.ceil(prefs.dayStartMin / 60);
    const lastHour = Math.floor(prefs.dayEndMin / 60);
    for (let h = firstHour; h <= lastHour; h++) marks.push(h * 60);
    return marks;
  }, [prefs.dayStartMin, prefs.dayEndMin]);

  /**
   * Scroll so "now" sits about a third down the viewport — the most useful
   * default position, since you care more about what's ahead than behind.
   *
   * This runs on every explicit navigation, not once per mount. It used to be
   * latched behind a `didAutoScroll` ref, which meant pressing T to jump to
   * today did nothing visible once you had scrolled away.
   */
  const recentre = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!days.some((d) => isToday(d))) {
      el.scrollTop = 0;
      return;
    }
    const now = new Date();
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    const ratio =
      (minuteOfDay - prefs.dayStartMin) / (prefs.dayEndMin - prefs.dayStartMin);
    el.scrollTop =
      ratio > 0 && ratio < 1
        ? Math.max(0, ratio * gridHeight - el.clientHeight / 3)
        : 0;
  }, [days, gridHeight, prefs.dayStartMin, prefs.dayEndMin]);

  // Deliberately keyed on navigation alone. Including `recentre` would re-scroll
  // while someone drags a working-hours slider, yanking the view out from under
  // them for a change that has nothing to do with where they are looking.
  useEffect(() => {
    recentre();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorDate, view]);

  // ---- drag to create ------------------------------------------------------
  const [draft, setDraft] = useState<{
    dayIndex: number;
    from: Date;
    to: Date;
  } | null>(null);
  const dragging = useRef(false);

  const dateFromPointer = useCallback(
    (clientY: number, day: Date) => {
      const rect = bodyRef.current?.getBoundingClientRect();
      if (!rect) return day;
      return offsetToDate(
        clientY - rect.top,
        rect.height,
        day,
        prefs.dayStartMin,
        prefs.dayEndMin,
        15,
      );
    },
    [prefs.dayStartMin, prefs.dayEndMin],
  );

  const onPointerDown = (e: React.PointerEvent, dayIndex: number) => {
    // Only primary button, and never when starting on an existing block.
    if (e.button !== 0) return;
    // Blocks handle their own pointer sequences and stop propagation, but guard
    // here too so a stray hit on block chrome can't start a create-drag.
    if ((e.target as HTMLElement).closest('button,[role="button"]')) return;
    const day = days[dayIndex];
    const at = dateFromPointer(e.clientY, day);
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDraft({ dayIndex, from: at, to: new Date(at.getTime() + 30 * 60000) });
  };

  const onPointerMove = (e: React.PointerEvent, dayIndex: number) => {
    if (!dragging.current || !draft || draft.dayIndex !== dayIndex) return;
    const at = dateFromPointer(e.clientY, days[dayIndex]);
    setDraft((d) => (d ? { ...d, to: at } : d));
  };

  const onPointerUp = () => {
    if (!dragging.current || !draft) return;
    dragging.current = false;

    const start = draft.from < draft.to ? draft.from : draft.to;
    const end = draft.from < draft.to ? draft.to : draft.from;
    const minutes = (end.getTime() - start.getTime()) / 60000;

    setDraft(null);
    // A click (rather than a drag) shouldn't silently create a 0-minute block.
    if (minutes < 15) return;

    const created = addBlock({
      title: "New block",
      kind: "fixed",
      trackId: null,
      start: start.toISOString(),
      end: end.toISOString(),
    });
    selectBlock(created.id);
    toast(`Blocked ${formatDuration(minutes)}`, "success");
  };

  const draftGeometry = useMemo(() => {
    if (!draft) return null;
    const span = prefs.dayEndMin - prefs.dayStartMin;
    const toMin = (d: Date) =>
      (d.getTime() - startOfDay(days[draft.dayIndex]).getTime()) / 60000;
    const a = toMin(draft.from);
    const b = toMin(draft.to);
    const top = (Math.min(a, b) - prefs.dayStartMin) / span;
    const height = Math.abs(b - a) / span;
    return { top, height, minutes: Math.abs(b - a) };
  }, [draft, days, prefs.dayStartMin, prefs.dayEndMin]);

  /* Deadlines are drawn on the grid, and unreachable ones are drawn in red —
     from the same shared report the capacity panel reads. */
  const atRiskIds = useAtRiskIds();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/*
        The day headers live *inside* the scroll container as a sticky row.
        Keeping them outside meant compensating for the scrollbar with a
        hard-coded 10px of padding, which was wrong on macOS (overlay scrollbars
        are 0px) and wrong again whenever the thin-scrollbar rule applied — the
        header columns simply didn't line up with the day columns. Sharing one
        scroll box makes the alignment structural instead of guessed.
      */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div
          className="sticky top-0 z-sticky grid border-b border-line bg-[#0b0d12]/95 backdrop-blur-md"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="flex items-end justify-end pb-2 pr-2">
            <span className="eyebrow">{format(anchor, "MMM")}</span>
          </div>
          {days.map((day) => {
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className="relative flex flex-col items-center gap-0.5 py-2"
              >
                <span className={clsx("eyebrow", today && "!text-accent")}>
                  {format(day, "EEE")}
                </span>
                <span
                  className={clsx(
                    "metric flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors",
                    today ? "bg-accent font-semibold text-void" : "text-ink-soft",
                  )}
                >
                  {format(day, "d")}
                </span>
                {today && (
                  <motion.span
                    layoutId="today-underline"
                    transition={spring.smooth}
                    className="absolute inset-x-3 bottom-0 h-px bg-accent"
                    style={{ boxShadow: "0 0 12px var(--accent-glow)" }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: gridTemplate, height: gridHeight }}
        >
          {/* hour gutter */}
          <div className="relative border-r border-line">
            {hourMarks.map((m) => (
              <div
                key={m}
                className="absolute right-2 -translate-y-1/2"
                style={{
                  top: `${((m - prefs.dayStartMin) / (prefs.dayEndMin - prefs.dayStartMin)) * 100}%`,
                }}
              >
                <span className="metric text-micro text-ink-faint">
                  {formatHour(m)}
                </span>
              </div>
            ))}
          </div>

          {/* day columns */}
          <div
            ref={bodyRef}
            className="col-span-full col-start-2 grid"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}
          >
            {days.map((day, dayIndex) => {
              const dayBlocks = layoutDay(
                blocks,
                day,
                prefs.dayStartMin,
                prefs.dayEndMin,
              );
              const isWorkDay = prefs.workDays.includes(day.getDay());

              return (
                <div
                  key={day.toISOString()}
                  onPointerDown={(e) => onPointerDown(e, dayIndex)}
                  onPointerMove={(e) => onPointerMove(e, dayIndex)}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) selectBlock(null);
                  }}
                  className={clsx(
                    "relative border-r border-line last:border-r-0",
                    // Non-working days are still visible, just visibly inert.
                    !isWorkDay && "bg-black/25",
                    isToday(day) && "bg-accent/[0.02]",
                  )}
                >
                  {/* hour lines */}
                  {hourMarks.map((m) => (
                    <div
                      key={m}
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 border-t border-line/60"
                      style={{
                        top: `${((m - prefs.dayStartMin) / (prefs.dayEndMin - prefs.dayStartMin)) * 100}%`,
                      }}
                    />
                  ))}

                  <AnimatePresence mode="popLayout">
                    {dayBlocks.map((p) => (
                      <CalendarBlock
                        key={p.block.id}
                        positioned={p}
                        track={tracks.find((t) => t.id === p.block.trackId)}
                        selected={selectedBlockId === p.block.id}
                        dimmed={
                          Boolean(focusTrackId) && p.block.trackId !== focusTrackId
                        }
                        pxPerMinute={pxPerMinute}
                        dayWidth={dayWidth}
                        onSelect={() => selectBlock(p.block.id)}
                        onCommit={(dm, dd, mode) =>
                          commitDrag(p.block.id, dm, dd, mode)
                        }
                        compact={days.length > 1}
                      />
                    ))}
                  </AnimatePresence>

                  {/* drag ghost */}
                  {draft?.dayIndex === dayIndex && draftGeometry && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-drag rounded-lg border border-accent/70 bg-accent/15 backdrop-blur-sm"
                      style={{
                        top: `${draftGeometry.top * 100}%`,
                        height: `${draftGeometry.height * 100}%`,
                      }}
                    >
                      <span className="metric absolute left-2 top-1 text-micro text-accent">
                        {formatDuration(draftGeometry.minutes)}
                      </span>
                    </div>
                  )}

                  <DeadlineMarkers
                    tasks={tasks}
                    tracks={tracks}
                    day={day}
                    dayStartMin={prefs.dayStartMin}
                    dayEndMin={prefs.dayEndMin}
                    atRiskIds={atRiskIds}
                    onSelect={selectTask}
                  />

                  {isSameDay(day, new Date()) && (
                    <NowLine
                      dayStartMin={prefs.dayStartMin}
                      dayEndMin={prefs.dayEndMin}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

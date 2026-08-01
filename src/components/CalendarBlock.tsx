"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Lock, Sparkles, Flag, Repeat, Pin } from "lucide-react";
import { addMinutes, format } from "date-fns";
import { clsx } from "clsx";
import type { PositionedBlock } from "@/lib/layout";
import { snapMinutes } from "@/lib/layout";
import { colorOf, type Track } from "@/lib/types";
import { blockIn, spring } from "@/lib/motion";
import { formatDuration, minutesBetween } from "@/lib/scheduler";

interface Props {
  positioned: PositionedBlock;
  track?: Track;
  selected: boolean;
  dimmed: boolean;
  compact?: boolean;
  /** Vertical pixels per minute — the conversion factor for drag maths. */
  pxPerMinute: number;
  /** Width of one day column, so horizontal drags can move between days. */
  dayWidth: number;
  onSelect: () => void;
  onCommit: (deltaMinutes: number, deltaDays: number, mode: "move" | "resize") => void;
}

const KIND_ICON = {
  fixed: Lock,
  focus: Sparkles,
  prep: Repeat,
  milestone: Flag,
  personal: null,
} as const;

/** Below this many pixels of travel, a pointer sequence is a click, not a drag. */
const DRAG_THRESHOLD_PX = 4;

export function CalendarBlock({
  positioned,
  track,
  selected,
  dimmed,
  compact,
  pxPerMinute,
  dayWidth,
  onSelect,
  onCommit,
}: Props) {
  const { block, top, height, column, columns, clippedStart, clippedEnd } = positioned;
  const accent = track ? colorOf(track.color) : "var(--untracked)";
  const start = new Date(block.start);
  const end = new Date(block.end);
  const minutes = minutesBetween(start, end);

  const gap = 3;
  const widthPct = 100 / columns;
  const Icon = KIND_ICON[block.kind];
  const provisional = Boolean(block.auto) && !block.pinned;

  // ---- direct manipulation -------------------------------------------------
  const origin = useRef<{ x: number; y: number; mode: "move" | "resize" } | null>(null);
  const moved = useRef(false);
  const [drag, setDrag] = useState<{
    deltaMin: number;
    deltaDays: number;
    mode: "move" | "resize";
  } | null>(null);

  const beginDrag = (e: React.PointerEvent, mode: "move" | "resize") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    origin.current = { x: e.clientX, y: e.clientY, mode };
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const updateDrag = (e: React.PointerEvent) => {
    const o = origin.current;
    if (!o) return;
    const dx = e.clientX - o.x;
    const dy = e.clientY - o.y;

    if (!moved.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    moved.current = true;

    // Snap to quarter-hours: fine enough to be precise, coarse enough that a
    // shaky hand still lands on a round number.
    const deltaMin = snapMinutes(dy / pxPerMinute, 15);
    // Resizing never changes the day; only a move can cross columns.
    const deltaDays =
      o.mode === "move" && dayWidth > 0 ? Math.round(dx / dayWidth) : 0;

    setDrag({ deltaMin, deltaDays, mode: o.mode });
  };

  const endDrag = (e: React.PointerEvent) => {
    const o = origin.current;
    origin.current = null;

    if (!o) return;
    if (!moved.current) {
      // A tap: select rather than nudge by zero.
      setDrag(null);
      onSelect();
      return;
    }

    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.deltaMin === 0 && d.deltaDays === 0) return;

    // Never let a resize invert or collapse the block.
    if (d.mode === "resize" && minutes + d.deltaMin < 15) return;

    onCommit(d.deltaMin, d.deltaDays, d.mode);
    e.stopPropagation();
  };

  const dragging = drag !== null && moved.current;

  // Preview offsets. Motion owns the transform, so these compose cleanly with
  // the hover scale instead of fighting an inline `transform`.
  const offsetY = drag ? drag.deltaMin * pxPerMinute : 0;
  const offsetX = drag && drag.mode === "move" ? drag.deltaDays * dayWidth : 0;
  const stretchY = drag && drag.mode === "resize" ? drag.deltaMin * pxPerMinute : 0;

  const previewStart =
    drag && drag.mode === "move" ? addMinutes(start, drag.deltaMin) : start;
  // Both a move and a resize shift the end edge by the same delta; the two
  // branches of the ternary that used to be here were identical.
  const previewEnd = drag ? addMinutes(end, drag.deltaMin) : end;

  return (
    <motion.div
      // Layout animation is suspended mid-drag; otherwise the spring fights
      // the pointer and the block lags behind the cursor.
      layout={!dragging}
      layoutId={block.id}
      variants={blockIn}
      initial="hidden"
      animate={{
        opacity: dimmed ? 0.25 : 1,
        x: offsetX,
        y: drag?.mode === "move" ? offsetY : 0,
        scale: 1,
      }}
      exit="exit"
      transition={dragging ? { duration: 0 } : spring.smooth}
      style={{
        top: `${top * 100}%`,
        height: `calc(${height * 100}% + ${stretchY}px)`,
        left: `calc(${column * widthPct}% + ${gap / 2}px)`,
        width: `calc(${widthPct}% - ${gap}px)`,
        background: provisional
          ? `linear-gradient(180deg, ${accent}1F, ${accent}12)`
          : `linear-gradient(180deg, ${accent}33, ${accent}1C)`,
        borderColor: selected || dragging ? accent : `${accent}55`,
        borderStyle: provisional ? "dashed" : "solid",
        boxShadow:
          selected || dragging
            ? `0 0 0 1px ${accent}, 0 10px 30px -12px ${accent}99`
            : undefined,
        // Lifts to the `drag` layer so it clears neighbours mid-move.
        zIndex: dragging ? 50 : undefined,
      }}
      className={clsx(
        "group absolute z-block overflow-hidden rounded-lg border text-left",
        "gpu drag-none touch-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        clippedStart && "rounded-t-none border-t-0",
        clippedEnd && "rounded-b-none border-b-0",
      )}
      onPointerDown={(e) => beginDrag(e, "move")}
      onPointerMove={updateDrag}
      onPointerUp={endDrag}
      onPointerCancel={() => {
        origin.current = null;
        setDrag(null);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Keyboard nudging: the calendar shouldn't require a mouse.
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          onCommit(e.key === "ArrowUp" ? -15 : 15, 0, e.shiftKey ? "resize" : "move");
        }
      }}
      aria-label={`${block.title}, ${format(start, "HH:mm")} to ${format(end, "HH:mm")}`}
      aria-pressed={selected}
    >
      {/*
        No coloured left spine. The block's fill *and* its border are already
        drawn from the track colour, so a stripe added a third element competing
        to say the same thing — and at 2.5px inside a 40px-tall block it mostly
        just ate the text's left margin.
      */}
      <div className="px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {Icon && minutes >= 45 && (
            <Icon size={10} style={{ color: accent }} className="shrink-0 opacity-80" />
          )}
          {block.pinned && (
            <Pin size={9} className="shrink-0 text-ink-soft" aria-label="Pinned" />
          )}
          <span
            className={clsx(
              "truncate font-medium leading-tight text-ink",
              minutes < 40 || compact ? "text-mini" : "text-dense",
            )}
          >
            {block.title}
          </span>
        </div>

        {(minutes >= 50 || dragging) && (
          <div className="mt-0.5 flex items-center gap-1.5">
            {/* While dragging, the label previews the *destination* time —
                otherwise you're reading a number that's already wrong. */}
            <span
              className={clsx(
                "metric text-micro",
                dragging ? "text-accent" : "text-ink-soft",
              )}
            >
              {format(previewStart, "HH:mm")}
            </span>
            <span className="metric text-micro text-ink-faint">
              {formatDuration(minutesBetween(previewStart, previewEnd))}
            </span>
          </div>
        )}

        {minutes >= 100 && track && !dragging && (
          <div className="mt-1">
            <span className="chip !border-transparent !bg-black/25 !px-1.5 !py-0">
              {track.code}
            </span>
          </div>
        )}
      </div>

      {/*
        Resize grip. Revealed on hover on a pointer device, but permanently
        visible on a touch screen — `grip-on-hover` is forced opaque under
        `(pointer: coarse)`, because a control that only appears on hover simply
        does not exist on a phone, and resizing was therefore impossible there.
        The strip is 14px tall rather than 8px for the same reason.
      */}
      {minutes >= 30 && (
        <div
          onPointerDown={(e) => beginDrag(e, "resize")}
          onPointerMove={updateDrag}
          onPointerUp={endDrag}
          className="grip-on-hover absolute inset-x-0 bottom-0 z-block flex h-[14px] items-end justify-center pb-[3px] opacity-0 transition-opacity group-hover:opacity-100"
          style={{ cursor: "ns-resize" }}
          aria-hidden
        >
          <span
            className="block h-[3px] w-7 rounded-full"
            style={{ background: accent }}
          />
        </div>
      )}

      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: `linear-gradient(180deg, ${accent}14, transparent 60%)` }}
      />
    </motion.div>
  );
}

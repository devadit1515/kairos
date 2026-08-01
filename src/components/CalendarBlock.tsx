"use client";

import { motion } from "motion/react";
import { Lock, Sparkles, Flag, Repeat } from "lucide-react";
import { format } from "date-fns";
import type { PositionedBlock } from "@/lib/layout";
import { colorOf, type Track } from "@/lib/types";
import { blockIn, spring } from "@/lib/motion";
import { formatDuration, minutesBetween } from "@/lib/scheduler";
import { clsx } from "clsx";

interface Props {
  positioned: PositionedBlock;
  track?: Track;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  compact?: boolean;
}

const KIND_ICON = {
  fixed: Lock,
  focus: Sparkles,
  prep: Repeat,
  milestone: Flag,
  personal: null,
} as const;

export function CalendarBlock({
  positioned,
  track,
  selected,
  dimmed,
  onSelect,
  compact,
}: Props) {
  const { block, top, height, column, columns, clippedStart, clippedEnd } = positioned;
  const accent = track ? colorOf(track.color) : "#7C8598";
  const start = new Date(block.start);
  const end = new Date(block.end);
  const minutes = minutesBetween(start, end);

  // Gutter between lanes so adjacent blocks read as separate objects.
  const gap = 3;
  const widthPct = 100 / columns;
  const Icon = KIND_ICON[block.kind];

  // Auto-planned blocks are provisional and shouldn't compete visually with
  // commitments the user actually made — hence the dashed edge and lower fill.
  const provisional = Boolean(block.auto) && !block.pinned;

  return (
    <motion.button
      layout
      layoutId={block.id}
      variants={blockIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={spring.smooth}
      whileHover={{ scale: 1.012, zIndex: 30 }}
      whileTap={{ scale: 0.99 }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      style={{
        top: `${top * 100}%`,
        height: `${height * 100}%`,
        left: `calc(${column * widthPct}% + ${gap / 2}px)`,
        width: `calc(${widthPct}% - ${gap}px)`,
        // Colour is derived from the track, so the block is tinted rather than
        // filled — keeps a dense week readable instead of a stained-glass mess.
        background: provisional
          ? `linear-gradient(180deg, ${accent}1F, ${accent}12)`
          : `linear-gradient(180deg, ${accent}33, ${accent}1C)`,
        borderColor: selected ? accent : `${accent}55`,
        borderStyle: provisional ? "dashed" : "solid",
        boxShadow: selected
          ? `0 0 0 1px ${accent}, 0 10px 30px -12px ${accent}99`
          : undefined,
      }}
      className={clsx(
        "group absolute z-10 overflow-hidden rounded-lg border px-2 py-1 text-left",
        "gpu drag-none transition-opacity duration-200",
        clippedStart && "rounded-t-none border-t-0",
        clippedEnd && "rounded-b-none border-b-0",
        dimmed ? "opacity-25" : "opacity-100",
      )}
      aria-label={`${block.title}, ${format(start, "HH:mm")} to ${format(end, "HH:mm")}`}
      aria-pressed={selected}
    >
      {/* Left spine: the strongest colour signal, always visible even at 15 min. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2.5px] rounded-full"
        style={{ background: accent, opacity: provisional ? 0.6 : 1 }}
      />

      <div className="flex min-w-0 items-center gap-1.5 pl-1">
        {Icon && minutes >= 45 && (
          <Icon size={10} style={{ color: accent }} className="shrink-0 opacity-80" />
        )}
        <span
          className={clsx(
            "truncate font-medium leading-tight text-ink",
            minutes < 40 || compact ? "text-[10.5px]" : "text-xs",
          )}
        >
          {block.title}
        </span>
      </div>

      {/* Only show the time row when there's vertical room for it to not crowd. */}
      {minutes >= 50 && (
        <div className="mt-0.5 flex items-center gap-1.5 pl-1">
          <span className="metric text-[10px] text-ink-soft">
            {format(start, "HH:mm")}
          </span>
          <span className="metric text-[10px] text-ink-faint">
            {formatDuration(minutes)}
          </span>
        </div>
      )}

      {minutes >= 100 && track && (
        <div className="mt-1 pl-1">
          <span className="chip !border-transparent !bg-black/25 !px-1.5 !py-0">
            {track.code}
          </span>
        </div>
      )}

      {/* Hover sheen — a small, cheap signal that the element is interactive. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background: `linear-gradient(180deg, ${accent}14, transparent 60%)`,
        }}
      />
    </motion.button>
  );
}

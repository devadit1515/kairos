"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  addDays,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { clsx } from "clsx";
import { Flag, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAtRiskIds } from "@/lib/capacity";
import {
  formatDuration,
  freeSlots,
  minutesBetween,
  totalMinutes,
} from "@/lib/scheduler";
import { colorOf, type Block, type Task, type Track } from "@/lib/types";
import { riseIn, staggerParent } from "@/lib/motion";
import { useModalBehavior } from "./Dialog";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_PILLS = 3;

interface DayCell {
  date: Date;
  inMonth: boolean;
  blocks: Block[];
  deadlines: Task[];
  freeMin: number;
  committedMin: number;
  /** 0..1+ — committed time as a share of the working window. */
  load: number;
  isWorkDay: boolean;
}

/** Where the magnified card should appear to come from. */
interface ZoomOrigin {
  iso: string;
  dx: number;
  dy: number;
}

/**
 * Month view.
 *
 * The familiar Google/Apple grid, with the one thing those views never show:
 * how *full* each day actually is. A conventional month cell lists events, so
 * a day with three fifteen-minute calls looks identical to a day with three
 * four-hour blocks. The capacity bar under each date fixes that — you can scan
 * a month and see where the pressure is, not just where the appointments are.
 *
 * Clicking a day lifts it out of the grid into a magnified card that rises from
 * the cell you actually clicked, so the cell visibly *becomes* the detail view
 * rather than a modal appearing from nowhere.
 */
export function MonthView() {
  const {
    blocks,
    tasks,
    tracks,
    prefs,
    anchorDate,
    setAnchorDate,
    setView,
    selectBlock,
    selectTask,
    focusTrackId,
  } = useStore();

  const reduce = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<ZoomOrigin | null>(null);

  const anchor = useMemo(() => new Date(anchorDate), [anchorDate]);
  const atRiskIds = useAtRiskIds();

  /* Six weeks always — a fixed grid height stops the layout jumping as you
     page through months, which is far more distracting than one blank row. */
  const cells = useMemo<DayCell[]>(() => {
    const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const workingWindowMin = prefs.dayEndMin - prefs.dayStartMin;

    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(gridStart, i);
      const dayEnd = addDays(startOfDay(date), 1);

      const dayBlocks = blocks
        .filter((b) => isSameDay(new Date(b.start), date))
        .sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
        );

      const deadlines = tasks.filter(
        (t) => !t.completed && isSameDay(new Date(t.due), date),
      );

      const isWorkDay = prefs.workDays.includes(date.getDay());
      const freeMin = isWorkDay
        ? totalMinutes(freeSlots(blocks, startOfDay(date), dayEnd, prefs))
        : 0;

      const committedMin = dayBlocks.reduce(
        (sum, b) => sum + minutesBetween(new Date(b.start), new Date(b.end)),
        0,
      );

      return {
        date,
        inMonth: isSameMonth(date, anchor),
        blocks: dayBlocks,
        deadlines,
        freeMin,
        committedMin,
        load:
          workingWindowMin > 0
            ? Math.min(1.4, committedMin / workingWindowMin)
            : 0,
        isWorkDay,
      };
    });
  }, [anchor, blocks, tasks, prefs]);

  const zoomedCell = zoom
    ? cells.find((c) => c.date.toISOString() === zoom.iso)
    : undefined;

  /**
   * Measure the clicked cell against the grid so the card can animate out of
   * its actual position. Reading two rects on a click is cheap; the previous
   * approach put a `layoutId` on all 42 cells, which enrolled every one of them
   * in the layout projection tree on every render and animated nothing, because
   * no element on the other side shared the id.
   */
  const openZoom = (cell: DayCell, el: HTMLElement) => {
    const grid = gridRef.current?.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    setZoom({
      iso: cell.date.toISOString(),
      dx: grid ? rect.left + rect.width / 2 - (grid.left + grid.width / 2) : 0,
      dy: grid ? rect.top + rect.height / 2 - (grid.top + grid.height / 2) : 0,
    });
  };

  const openDay = (date: Date) => {
    setAnchorDate(date.toISOString());
    setView("day");
    setZoom(null);
  };

  return (
    // `relative` anchors the magnified day card, which is positioned against
    // this container rather than the viewport so it stays inside the panel.
    <div ref={gridRef} className="relative flex h-full min-h-0 flex-col">
      {/* Weekday header. Month name and paging live in the top bar — repeating
          them here meant two different controls for one job, which is how a
          "Next" button ends up disagreeing with a chevron. */}
      <div className="grid shrink-0 grid-cols-7 border-b border-line">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center">
            <span className="eyebrow">{d}</span>
          </div>
        ))}
      </div>

      <motion.div
        variants={staggerParent(0.006)}
        initial="hidden"
        animate="visible"
        className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6"
      >
        {cells.map((cell) => (
          <MonthCell
            key={cell.date.toISOString()}
            cell={cell}
            tracks={tracks}
            atRiskIds={atRiskIds}
            focusTrackId={focusTrackId}
            onZoom={(el) => openZoom(cell, el)}
            onOpenDay={() => openDay(cell.date)}
          />
        ))}
      </motion.div>

      <AnimatePresence>
        {zoomedCell && zoom && (
          <DayZoom
            cell={zoomedCell}
            origin={zoom}
            tracks={tracks}
            atRiskIds={atRiskIds}
            reduce={Boolean(reduce)}
            onClose={() => setZoom(null)}
            onSelectBlock={(id) => {
              selectBlock(id);
              setZoom(null);
            }}
            onSelectTask={(id) => {
              selectTask(id);
              setZoom(null);
            }}
            onOpenDay={() => openDay(zoomedCell.date)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------ month cell

function MonthCell({
  cell,
  tracks,
  atRiskIds,
  focusTrackId,
  onZoom,
  onOpenDay,
}: {
  cell: DayCell;
  tracks: Track[];
  atRiskIds: Set<string>;
  focusTrackId: string | null;
  onZoom: (el: HTMLElement) => void;
  onOpenDay: () => void;
}) {
  const today = isToday(cell.date);
  const overflow = cell.blocks.length - MAX_PILLS;
  const riskHere = cell.deadlines.some((t) => atRiskIds.has(t.id));

  // Load tint: the whole reason to build this view rather than reuse Google's.
  const tint =
    cell.load > 1
      ? "rgba(255,107,107,0.10)"
      : cell.load > 0.75
        ? "rgba(255,180,84,0.08)"
        : cell.load > 0.35
          ? "rgba(79,209,255,0.05)"
          : "transparent";

  return (
    <motion.button
      variants={riseIn}
      onClick={(e) => onZoom(e.currentTarget)}
      onDoubleClick={onOpenDay}
      className={clsx(
        "group relative flex flex-col gap-1 overflow-hidden border-b border-r border-line p-1.5 text-left transition-colors",
        !cell.inMonth && "opacity-40",
        !cell.isWorkDay && "bg-black/20",
        "hover:bg-white/[0.04]",
      )}
      style={{ background: cell.isWorkDay ? tint : undefined }}
      aria-label={`${format(cell.date, "EEEE d MMMM")}: ${cell.blocks.length} blocks, ${
        cell.isWorkDay ? `${formatDuration(cell.freeMin)} free` : "not a working day"
      }${cell.deadlines.length > 0 ? `, ${cell.deadlines.length} due` : ""}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={clsx(
            "metric flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-mini",
            today
              ? "bg-accent font-semibold text-void"
              : cell.inMonth
                ? "text-ink-soft"
                : "text-ink-faint",
          )}
        >
          {format(cell.date, "d")}
        </span>

        {cell.deadlines.length > 0 && (
          <span
            className={clsx(
              "flex items-center gap-0.5",
              riskHere ? "text-danger" : "text-ink-faint",
            )}
          >
            <Flag size={9} aria-hidden />
            <span className="metric text-micro">{cell.deadlines.length}</span>
          </span>
        )}
      </div>

      {/* Event pills — colour comes from the track, so a month scan reads as
          "which project is eating this week" rather than a wall of one hue.
          Identity is carried by a dot plus a tinted fill; a coloured left border
          on a pill this small is noise, and it was also the only thing on the
          pill fighting the fill for the same job. */}
      <div className="flex min-h-0 flex-1 flex-col gap-[2px] overflow-hidden">
        {cell.blocks.slice(0, MAX_PILLS).map((b) => {
          const track = tracks.find((t) => t.id === b.trackId);
          const accent = track ? colorOf(track.color) : "var(--untracked)";
          const dimmed = Boolean(focusTrackId) && b.trackId !== focusTrackId;
          return (
            <span
              key={b.id}
              className="flex items-center gap-1 truncate rounded px-1 py-[1px] text-micro leading-tight text-ink transition-opacity"
              style={{
                background: track
                  ? `color-mix(in srgb, ${accent} 16%, transparent)`
                  : "rgba(124,133,152,0.16)",
                /*
                 * One opacity, computed once. There used to be a Tailwind
                 * opacity class *and* an inline opacity here; the inline value
                 * always won, which meant track focusing silently did nothing
                 * in this view while working everywhere else.
                 */
                opacity: dimmed ? 0.2 : b.auto ? 0.8 : 1,
              }}
            >
              <span
                aria-hidden
                className="h-1 w-1 shrink-0 rounded-full"
                style={{ background: accent }}
              />
              <span className="truncate">{b.title}</span>
            </span>
          );
        })}
        {overflow > 0 && (
          <span className="metric px-1 text-micro text-ink-faint">
            +{overflow} more
          </span>
        )}
      </div>

      {/* Capacity bar. Committed time against the working window. */}
      {cell.isWorkDay && (
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{
              width: `${Math.min(100, cell.load * 100)}%`,
              background:
                cell.load > 1
                  ? "var(--danger)"
                  : cell.load > 0.75
                    ? "var(--warn)"
                    : "var(--accent)",
              opacity: 0.8,
            }}
          />
        </div>
      )}
    </motion.button>
  );
}

// ------------------------------------------------------------------- day zoom

function DayZoom({
  cell,
  origin,
  tracks,
  atRiskIds,
  reduce,
  onClose,
  onSelectBlock,
  onSelectTask,
  onOpenDay,
}: {
  cell: DayCell;
  origin: ZoomOrigin;
  tracks: Track[];
  atRiskIds: Set<string>;
  reduce: boolean;
  onClose: () => void;
  onSelectBlock: (id: string) => void;
  onSelectTask: (id: string) => void;
  onOpenDay: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Escape, focus trap, focus restore — the same behaviour every other dialog
  // in the app gets, rather than a second half-implementation.
  useModalBehavior(true, onClose, panelRef);

  return (
    <div className="absolute inset-0 z-zoom flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-void/80 backdrop-blur-md"
        aria-hidden
      />

      {/*
        The magnification. The card rises out of the clicked cell's position on
        the Z axis with a slight X-rotation that settles to flat — enough to read
        as physical depth, brief enough not to become a party trick. Reduced to a
        plain crossfade under prefers-reduced-motion, where a 3D tumble is
        actively unpleasant.
      */}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={format(cell.date, "EEEE d MMMM")}
        initial={
          reduce
            ? { opacity: 0 }
            : {
                opacity: 0,
                scale: 0.32,
                x: origin.dx,
                y: origin.dy,
                rotateX: 12,
                z: -140,
              }
        }
        animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotateX: 0, z: 0 }}
        exit={
          reduce
            ? { opacity: 0 }
            : {
                opacity: 0,
                scale: 0.4,
                x: origin.dx,
                y: origin.dy,
                rotateX: 8,
                transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
              }
        }
        transition={
          reduce
            ? { duration: 0.12 }
            : { type: "spring", stiffness: 300, damping: 30, mass: 0.9 }
        }
        style={{ transformPerspective: 1400, transformStyle: "preserve-3d" }}
        className="panel-raised relative flex max-h-[84%] w-full max-w-md flex-col overflow-hidden"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <div className="eyebrow">{format(cell.date, "EEEE")}</div>
            <div className="metric text-xl leading-tight text-ink">
              {format(cell.date, "d MMMM")}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="eyebrow">Free</div>
              <div
                className={clsx(
                  "metric text-sm",
                  cell.freeMin < 60 ? "text-warn" : "text-ok",
                )}
              >
                {cell.isWorkDay ? formatDuration(cell.freeMin) : "—"}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-white/5 hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {cell.deadlines.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="eyebrow">Due this day</h3>
              {cell.deadlines.map((t) => {
                const track = tracks.find((x) => x.id === t.trackId);
                const risk = atRiskIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelectTask(t.id)}
                    className={clsx(
                      "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                      risk
                        ? "border-danger/35 bg-danger/[0.07] hover:bg-danger/[0.1]"
                        : "border-line hover:bg-white/[0.04]",
                    )}
                  >
                    <Flag
                      size={11}
                      aria-hidden
                      className={clsx(
                        "shrink-0",
                        risk ? "text-danger" : "text-ink-faint",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-dense text-ink">
                      {t.title}
                    </span>
                    <span className="metric shrink-0 text-micro text-ink-faint">
                      {format(new Date(t.due), "HH:mm")}
                    </span>
                    {track && (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: colorOf(track.color) }}
                      />
                    )}
                  </button>
                );
              })}
            </section>
          )}

          <section className="space-y-1.5">
            <h3 className="eyebrow">
              Schedule · {formatDuration(cell.committedMin)} committed
            </h3>
            {cell.blocks.length === 0 && (
              <p className="py-3 text-dense text-ink-faint">
                {cell.isWorkDay ? "Entirely open." : "Not a working day."}
              </p>
            )}
            {cell.blocks.map((b) => {
              const track = tracks.find((t) => t.id === b.trackId);
              const accent = track ? colorOf(track.color) : "var(--untracked)";
              return (
                <button
                  key={b.id}
                  onClick={() => onSelectBlock(b.id)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-left transition-colors hover:border-line hover:bg-white/[0.04]"
                >
                  {/* Track identity is a dot here, matching the task rail and
                      the capacity legend. One affordance for one meaning. */}
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: accent, opacity: b.auto ? 0.6 : 1 }}
                  />
                  <span className="metric w-[38px] shrink-0 text-mini text-ink-soft">
                    {format(new Date(b.start), "HH:mm")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-dense text-ink">
                    {b.title}
                  </span>
                  {b.auto && <span className="chip shrink-0">auto</span>}
                  <span className="metric shrink-0 text-micro text-ink-faint">
                    {formatDuration(
                      minutesBetween(new Date(b.start), new Date(b.end)),
                    )}
                  </span>
                </button>
              );
            })}
          </section>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-2.5">
          <span className="metric text-micro text-ink-faint">
            {Math.round(cell.load * 100)}% of the working window
          </span>
          <div className="flex-1" />
          <button onClick={onOpenDay} className="btn !px-2.5 !py-1.5 text-mini">
            Open in day view
          </button>
        </footer>
      </motion.div>
    </div>
  );
}

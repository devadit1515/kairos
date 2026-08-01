"use client";

import { motion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  Settings2,
  Download,
  Undo2,
} from "lucide-react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  isSameMonth,
  startOfWeek,
} from "date-fns";
import { clsx } from "clsx";
import { useStore, type ViewMode } from "@/lib/store";
import { downloadICS } from "@/lib/ics";
import { spring } from "@/lib/motion";

const VIEWS: ViewMode[] = ["day", "week", "month", "agenda"];

export function TopBar() {
  const {
    view,
    setView,
    anchorDate,
    setAnchorDate,
    setPaletteOpen,
    setIngestOpen,
    setSettingsOpen,
    blocks,
    tracks,
    past,
    undo,
    toast,
  } = useStore();

  const anchor = new Date(anchorDate);

  const shift = (direction: 1 | -1) => {
    // Each view pages by its own unit — stepping a month view by a week is the
    // kind of small wrongness that makes navigation feel broken.
    const next =
      view === "day"
        ? addDays(anchor, direction)
        : view === "month"
          ? addMonths(anchor, direction)
          : view === "week"
            ? addWeeks(anchor, direction)
            : addDays(anchor, direction * 7);
    setAnchorDate(next.toISOString());
  };

  /* Range label collapses redundant information: "3 – 9 Mar" rather than
     "3 Mar – 9 Mar" when both ends share a month. */
  const rangeLabel = (() => {
    if (view === "day") return format(anchor, "EEEE d MMMM");
    if (view === "month") return format(anchor, "MMMM yyyy");
    const from = startOfWeek(anchor, { weekStartsOn: 1 });
    const to = endOfWeek(anchor, { weekStartsOn: 1 });
    return isSameMonth(from, to)
      ? `${format(from, "d")} – ${format(to, "d MMM yyyy")}`
      : `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}`;
  })();

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
      {/* ---- identity ---- */}
      <div className="flex items-center gap-2.5">
        <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden className="shrink-0">
          <circle cx="32" cy="32" r="19" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <path
            d="M32 13 a19 19 0 0 1 16.45 28.5"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="32" cy="32" r="3.2" fill="var(--accent)" />
          <line x1="32" y1="32" x2="32" y2="21.5" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <div className="leading-none">
          <div className="text-[13px] font-semibold tracking-tight text-ink">Kairos</div>
          <div className="hidden text-[10px] text-ink-faint sm:block">
            the time you actually have
          </div>
        </div>
      </div>

      <div className="mx-1 hidden h-6 w-px bg-line sm:block" />

      {/* ---- date navigation ---- */}
      <div className="flex items-center gap-1">
        <button onClick={() => shift(-1)} className="btn btn-ghost !px-1.5 !py-1.5" aria-label="Previous">
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={() => setAnchorDate(new Date().toISOString())}
          className="btn !px-2.5 !py-1 text-xs"
        >
          Today
        </button>
        <button onClick={() => shift(1)} className="btn btn-ghost !px-1.5 !py-1.5" aria-label="Next">
          <ChevronRight size={15} />
        </button>
      </div>

      <span className="metric ml-1 hidden text-[12.5px] text-ink-soft md:inline">
        {rangeLabel}
      </span>

      <div className="flex-1" />

      {/* ---- view switcher ---- */}
      <div
        className="relative flex items-center gap-0.5 rounded-xl border border-line bg-white/[0.02] p-0.5"
        role="tablist"
        aria-label="Calendar view"
      >
        {VIEWS.map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={clsx(
              "relative rounded-[9px] px-2.5 py-1 text-[11px] capitalize transition-colors",
              view === v ? "text-ink" : "text-ink-faint hover:text-ink-soft",
            )}
          >
            {view === v && (
              <motion.span
                layoutId="view-pill"
                transition={spring.snappy}
                className="absolute inset-0 rounded-[9px] border border-lineBright bg-white/[0.07]"
              />
            )}
            <span className="relative">{v}</span>
          </button>
        ))}
      </div>

      {/* ---- actions ---- */}
      <div className="flex items-center gap-1">
        {past.length > 0 && (
          <button onClick={undo} className="btn btn-ghost !px-2 !py-1.5" aria-label="Undo" title="Undo (⌘Z)">
            <Undo2 size={14} />
          </button>
        )}

        <button
          onClick={() => {
            if (blocks.length === 0) {
              toast("Nothing to export yet", "info");
              return;
            }
            downloadICS(blocks, tracks);
            toast("Exported .ics — opens in any calendar app", "success");
          }}
          className="btn btn-ghost !px-2 !py-1.5"
          aria-label="Export calendar"
          title="Export .ics"
        >
          <Download size={14} />
        </button>

        <button
          onClick={() => setIngestOpen(true)}
          className="btn !px-2.5 !py-1.5 text-xs"
          title="Extract commitments from any document"
        >
          <Sparkles size={13} className="text-accent" />
          <span className="hidden sm:inline">Ingest</span>
        </button>

        <button
          onClick={() => setPaletteOpen(true)}
          className="btn !px-2.5 !py-1.5 text-xs"
          aria-label="Open command palette"
        >
          <Search size={13} />
          <span className="hidden md:inline">Search</span>
          <kbd className="ml-1 hidden rounded border border-line bg-black/40 px-1 font-mono text-[9px] text-ink-faint md:inline">
            ⌘K
          </kbd>
        </button>

        <button
          onClick={() => setSettingsOpen(true)}
          className="btn btn-ghost !px-2 !py-1.5"
          aria-label="Settings"
        >
          <Settings2 size={14} />
        </button>
      </div>
    </header>
  );
}

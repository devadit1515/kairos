"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  CalendarDays,
  CornerDownLeft,
  Download,
  FlaskConical,
  Gauge,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import { format } from "date-fns";
import { clsx } from "clsx";
import { useStore } from "@/lib/store";
import { parseQuickAdd } from "@/lib/nlp";
import { formatDuration } from "@/lib/scheduler";
import { downloadICS } from "@/lib/ics";
import { colorOf, TASK_TYPE_LABEL } from "@/lib/types";
import { Dialog } from "./Dialog";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  run: () => void;
  group: string;
}

/**
 * Subsequence match — the same rule editors use. "awk" matches "Auto-plan the
 * week" because the characters appear in order. Cheap, predictable, and far
 * more forgiving than substring matching without the noise of full fuzzy
 * scoring.
 */
function subsequenceScore(needle: string, haystack: string): number | null {
  if (!needle) return 0;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  let hi = 0;
  let score = 0;
  let streak = 0;
  for (const ch of n) {
    const found = h.indexOf(ch, hi);
    if (found === -1) return null;
    // Reward adjacency and word-boundary hits so the best match sorts first.
    streak = found === hi ? streak + 1 : 0;
    score += streak * 2 + (found === 0 || h[found - 1] === " " ? 3 : 0);
    hi = found + 1;
  }
  return score - h.length * 0.01;
}

export function CommandPalette() {
  const store = useStore();
  const {
    paletteOpen,
    setPaletteOpen,
    setIngestOpen,
    setSettingsOpen,
    tasks,
    blocks,
    tracks,
    addTask,
    selectTask,
    selectBlock,
    setAnchorDate,
    setView,
    replan,
    loadSample,
    reset,
    undo,
    toast,
  } = store;

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setPaletteOpen(false);
    setQuery("");
    setCursor(0);
  };

  const commands: Command[] = useMemo(
    () => [
      { id: "plan", label: "Auto-plan the week", hint: "P", icon: Wand2, group: "Plan", run: () => { replan(); close(); } },
      { id: "ingest", label: "Ingest a document", hint: "I", icon: Sparkles, group: "Plan", run: () => { setIngestOpen(true); close(); } },
      { id: "today", label: "Jump to today", hint: "T", icon: CalendarDays, group: "Navigate", run: () => { setAnchorDate(new Date().toISOString()); close(); } },
      { id: "day", label: "Day view", hint: "D", icon: CalendarDays, group: "Navigate", run: () => { setView("day"); close(); } },
      { id: "week", label: "Week view", hint: "W", icon: CalendarDays, group: "Navigate", run: () => { setView("week"); close(); } },
      { id: "month", label: "Month view", hint: "M", icon: CalendarDays, group: "Navigate", run: () => { setView("month"); close(); } },
      { id: "agenda", label: "Agenda view", hint: "A", icon: Gauge, group: "Navigate", run: () => { setView("agenda"); close(); } },
      { id: "export", label: "Export to .ics", icon: Download, group: "Data", run: () => { downloadICS(blocks, tracks); toast("Exported .ics", "success"); close(); } },
      { id: "sample", label: "Load sample week", icon: FlaskConical, group: "Data", run: () => { loadSample(); close(); } },
      { id: "undo", label: "Undo last change", hint: "⌘Z", icon: Undo2, group: "Data", run: () => { undo(); close(); } },
      { id: "clear", label: "Clear workspace", icon: Trash2, group: "Data", run: () => { reset(); close(); } },
      { id: "settings", label: "Settings", hint: ",", icon: Settings2, group: "Data", run: () => { setSettingsOpen(true); close(); } },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, tracks],
  );

  const matchedCommands = useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map((c) => ({ c, s: subsequenceScore(query, c.label) }))
      .filter((x): x is { c: Command; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }, [commands, query]);

  const matchedTasks = useMemo(() => {
    if (!query.trim()) return [];
    return tasks
      .map((t) => ({ t, s: subsequenceScore(query, t.title) }))
      .filter((x): x is { t: (typeof tasks)[number]; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.t);
  }, [tasks, query]);

  const matchedBlocks = useMemo(() => {
    if (!query.trim()) return [];
    return blocks
      .map((b) => ({ b, s: subsequenceScore(query, b.title) }))
      .filter((x): x is { b: (typeof blocks)[number]; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.b);
  }, [blocks, query]);

  // Live parse of whatever is typed — shown as a create affordance whenever
  // the text isn't obviously a command.
  const parsed = useMemo(
    () => (query.trim().length >= 3 ? parseQuickAdd(query) : null),
    [query],
  );
  const showCreate = Boolean(parsed) && matchedCommands.length < commands.length;

  type Row =
    | { kind: "create" }
    | { kind: "command"; command: Command }
    | { kind: "task"; id: string }
    | { kind: "block"; id: string };

  const rows: Row[] = useMemo(() => {
    const r: Row[] = [];
    if (showCreate) r.push({ kind: "create" });
    matchedCommands.forEach((command) => r.push({ kind: "command", command }));
    matchedTasks.forEach((t) => r.push({ kind: "task", id: t.id }));
    matchedBlocks.forEach((b) => r.push({ kind: "block", id: b.id }));
    return r;
  }, [showCreate, matchedCommands, matchedTasks, matchedBlocks]);

  useEffect(() => setCursor(0), [query]);

  const runRow = (row: Row | undefined) => {
    if (!row) return;
    switch (row.kind) {
      case "create": {
        if (!parsed) return;
        const created = addTask({
          trackId: null,
          title: parsed.title,
          due: parsed.due.toISOString(),
          estimateMin: parsed.estimateMin,
          doneMin: 0,
          type: parsed.type,
          weight: parsed.weight,
          completed: false,
        });
        selectTask(created.id);
        toast(`Added “${parsed.title}”`, "success", { label: "Undo", run: undo });
        close();
        break;
      }
      case "command":
        row.command.run();
        break;
      case "task":
        selectTask(row.id);
        close();
        break;
      case "block": {
        const b = blocks.find((x) => x.id === row.id);
        if (b) setAnchorDate(b.start);
        selectBlock(row.id);
        close();
        break;
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % Math.max(1, rows.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + rows.length) % Math.max(1, rows.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runRow(rows[cursor]);
    }
  };

  // Keep the highlighted row inside the scroll viewport.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  let groupSeen = "";

  return (
    <Dialog open={paletteOpen} onClose={close} align="top" className="max-w-xl">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-3">
        <Search size={15} className="shrink-0 text-ink-faint" />
        <input
          data-autofocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search, or type a task — “ship v2 friday 3h !”"
          className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
          aria-label="Command palette"
        />
        <kbd className="hidden shrink-0 rounded border border-line bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-ink-faint sm:block">
          ESC
        </kbd>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {rows.length === 0 && (
          <div className="px-3 py-8 text-center text-[12px] text-ink-faint">
            No matches.
          </div>
        )}

        {rows.map((row, i) => {
          const active = i === cursor;

          if (row.kind === "create" && parsed) {
            return (
              <Row key="create" index={i} active={active} onClick={() => runRow(row)}>
                <Plus size={14} className="shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-ink">
                    Create{" "}
                    <span className="font-medium text-accent">{parsed.title}</span>
                  </div>
                  {/* Parse preview — shows exactly what will be created, so the
                      natural-language input never feels like a guess. */}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="chip">{TASK_TYPE_LABEL[parsed.type]}</span>
                    <span className="chip">{format(parsed.due, "EEE d MMM · HH:mm")}</span>
                    <span className="chip">{formatDuration(parsed.estimateMin)}</span>
                    {parsed.weight === 3 && (
                      <span className="chip !border-warn/40 !text-warn">high</span>
                    )}
                  </div>
                </div>
                <CornerDownLeft size={12} className="shrink-0 text-ink-faint" />
              </Row>
            );
          }

          if (row.kind === "command") {
            const showGroup = row.command.group !== groupSeen;
            groupSeen = row.command.group;
            const Icon = row.command.icon;
            return (
              <div key={row.command.id}>
                {showGroup && !query && (
                  <div className="eyebrow px-3 pb-1 pt-3">{row.command.group}</div>
                )}
                <Row index={i} active={active} onClick={() => runRow(row)}>
                  <Icon size={14} className="shrink-0 text-ink-faint" />
                  <span className="flex-1 truncate text-[12.5px] text-ink">
                    {row.command.label}
                  </span>
                  {row.command.hint && (
                    <kbd className="shrink-0 rounded border border-line bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-ink-faint">
                      {row.command.hint}
                    </kbd>
                  )}
                </Row>
              </div>
            );
          }

          if (row.kind === "task") {
            const t = tasks.find((x) => x.id === row.id)!;
            const track = tracks.find((x) => x.id === t.trackId);
            return (
              <Row key={row.id} index={i} active={active} onClick={() => runRow(row)}>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: track ? colorOf(track.color) : "#3A4152" }}
                />
                <span className="flex-1 truncate text-[12.5px] text-ink">{t.title}</span>
                <span className="metric shrink-0 text-[10px] text-ink-faint">
                  {format(new Date(t.due), "d MMM")}
                </span>
              </Row>
            );
          }

          // The create row is guarded on `parsed` above, so it can reach here
          // when the parse is empty — nothing to render in that case.
          if (row.kind !== "block") return null;

          const b = blocks.find((x) => x.id === row.id)!;
          return (
            <Row key={row.id} index={i} active={active} onClick={() => runRow(row)}>
              <CalendarDays size={13} className="shrink-0 text-ink-faint" />
              <span className="flex-1 truncate text-[12.5px] text-ink">{b.title}</span>
              <span className="metric shrink-0 text-[10px] text-ink-faint">
                {format(new Date(b.start), "d MMM HH:mm")}
              </span>
            </Row>
          );
        })}
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-2">
        {[
          ["↑↓", "navigate"],
          ["↵", "select"],
          ["esc", "close"],
        ].map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5">
            <kbd className="rounded border border-line bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-ink-faint">
              {k}
            </kbd>
            <span className="text-[10px] text-ink-faint">{l}</span>
          </span>
        ))}
      </footer>
    </Dialog>
  );
}

function Row({
  index,
  active,
  onClick,
  children,
}: {
  index: number;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      data-index={index}
      onClick={onClick}
      className={clsx(
        "relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors",
        active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
      )}
    >
      {active && (
        <motion.span
          layoutId="palette-cursor"
          transition={{ type: "spring", stiffness: 700, damping: 42 }}
          className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent"
        />
      )}
      {children}
    </motion.button>
  );
}

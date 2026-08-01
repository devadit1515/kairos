"use client";

/**
 * Application state.
 *
 * Local-first by design: everything works with zero configuration, persisted to
 * localStorage. Cloud sync layers on top when Supabase credentials exist rather
 * than being a precondition for the app functioning — which also means the demo
 * never depends on a network round trip.
 *
 * Undo is snapshot-based rather than command-based. For a dataset this size the
 * memory cost is irrelevant, and it means every mutation is undoable without
 * each action having to hand-write its own inverse.
 */

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { buildSample } from "./sample";
import {
  DEFAULT_PREFERENCES,
  type Block,
  type Preferences,
  type Task,
  type TaskType,
  type Track,
} from "./types";
import { autoPlan, planPrepLadder } from "./scheduler";

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export type ViewMode = "day" | "week" | "month" | "agenda";

interface Snapshot {
  tracks: Track[];
  tasks: Task[];
  blocks: Block[];
}

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "success" | "warn" | "danger";
  /** Optional single action, e.g. "Undo". */
  action?: { label: string; run: () => void };
}

interface KairosState extends Snapshot {
  prefs: Preferences;

  // ---- history -----------------------------------------------------------
  past: Snapshot[];
  future: Snapshot[];

  // ---- ui (not persisted) ------------------------------------------------
  anchorDate: string;
  view: ViewMode;
  paletteOpen: boolean;
  ingestOpen: boolean;
  settingsOpen: boolean;
  selectedTaskId: string | null;
  selectedBlockId: string | null;
  focusTrackId: string | null;
  toasts: Toast[];
  lastPlanSummary: string | null;

  // ---- actions -----------------------------------------------------------
  commit: () => void;
  undo: () => void;
  redo: () => void;

  addTrack: (t: Omit<Track, "id">) => Track;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  removeTrack: (id: string) => void;

  addTask: (t: Omit<Task, "id">) => Task;
  addTasks: (list: Array<Omit<Task, "id">>) => Task[];
  updateTask: (id: string, patch: Partial<Task>) => void;
  removeTask: (id: string) => void;
  toggleTask: (id: string) => void;
  logTime: (id: string, minutes: number) => void;

  addBlock: (b: Omit<Block, "id">) => Block;
  updateBlock: (id: string, patch: Partial<Block>) => void;
  removeBlock: (id: string) => void;

  replan: () => void;
  clearAutoBlocks: () => void;
  buildPrepLadder: (taskId: string) => void;

  setPrefs: (patch: Partial<Preferences>) => void;
  setAnchorDate: (iso: string) => void;
  setView: (v: ViewMode) => void;
  setPaletteOpen: (v: boolean) => void;
  setIngestOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  selectTask: (id: string | null) => void;
  selectBlock: (id: string | null) => void;
  setFocusTrack: (id: string | null) => void;

  toast: (message: string, tone?: Toast["tone"], action?: Toast["action"]) => void;
  dismissToast: (id: string) => void;

  loadSample: () => void;
  reset: () => void;
  importState: (data: Partial<Snapshot> & { prefs?: Preferences }) => void;
}

const HISTORY_LIMIT = 40;

function snapshot(s: Snapshot): Snapshot {
  return {
    tracks: s.tracks.map((x) => ({ ...x })),
    tasks: s.tasks.map((x) => ({ ...x })),
    blocks: s.blocks.map((x) => ({ ...x })),
  };
}

export const useStore = create<KairosState>()(
  persist(
    (set, get) => ({
      tracks: [],
      tasks: [],
      blocks: [],
      prefs: DEFAULT_PREFERENCES,
      past: [],
      future: [],

      anchorDate: new Date().toISOString(),
      view: "week",
      paletteOpen: false,
      ingestOpen: false,
      settingsOpen: false,
      selectedTaskId: null,
      selectedBlockId: null,
      focusTrackId: null,
      toasts: [],
      lastPlanSummary: null,

      commit: () =>
        set((s) => ({
          past: [...s.past, snapshot(s)].slice(-HISTORY_LIMIT),
          future: [],
        })),

      undo: () => {
        const { past } = get();
        if (past.length === 0) {
          get().toast("Nothing to undo", "info");
          return;
        }
        const previous = past[past.length - 1];
        set((s) => ({
          ...previous,
          past: s.past.slice(0, -1),
          future: [snapshot(s), ...s.future].slice(0, HISTORY_LIMIT),
        }));
      },

      redo: () => {
        const { future } = get();
        if (future.length === 0) return;
        const next = future[0];
        set((s) => ({
          ...next,
          past: [...s.past, snapshot(s)].slice(-HISTORY_LIMIT),
          future: s.future.slice(1),
        }));
      },

      // ---- tracks ----------------------------------------------------------
      addTrack: (t) => {
        get().commit();
        const track: Track = { ...t, id: uid("trk") };
        set((s) => ({ tracks: [...s.tracks, track] }));
        return track;
      },
      updateTrack: (id, patch) => {
        get().commit();
        set((s) => ({
          tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }));
      },
      removeTrack: (id) => {
        get().commit();
        set((s) => ({
          tracks: s.tracks.filter((t) => t.id !== id),
          tasks: s.tasks.map((t) => (t.trackId === id ? { ...t, trackId: null } : t)),
          blocks: s.blocks.map((b) => (b.trackId === id ? { ...b, trackId: null } : b)),
        }));
      },

      // ---- tasks -----------------------------------------------------------
      addTask: (t) => {
        get().commit();
        const task: Task = { ...t, id: uid("tsk") };
        set((s) => ({ tasks: [...s.tasks, task] }));
        return task;
      },
      addTasks: (list) => {
        get().commit();
        const created = list.map((t) => ({ ...t, id: uid("tsk") }));
        set((s) => ({ tasks: [...s.tasks, ...created] }));
        return created;
      },
      updateTask: (id, patch) => {
        get().commit();
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }));
      },
      removeTask: (id) => {
        get().commit();
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          // Orphaned auto blocks are noise — drop them with their task.
          blocks: s.blocks.filter((b) => !(b.taskId === id && b.auto)),
          selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
        }));
      },
      toggleTask: (id) => {
        get().commit();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completed: !t.completed } : t,
          ),
        }));
      },
      logTime: (id, minutes) => {
        get().commit();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, doneMin: Math.max(0, t.doneMin + minutes) } : t,
          ),
        }));
      },

      // ---- blocks ----------------------------------------------------------
      addBlock: (b) => {
        get().commit();
        const block: Block = { ...b, id: uid("blk") };
        set((s) => ({ blocks: [...s.blocks, block] }));
        return block;
      },
      updateBlock: (id, patch) => {
        get().commit();
        set((s) => ({
          blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        }));
      },
      removeBlock: (id) => {
        get().commit();
        set((s) => ({
          blocks: s.blocks.filter((b) => b.id !== id),
          selectedBlockId: s.selectedBlockId === id ? null : s.selectedBlockId,
        }));
      },

      // ---- planning --------------------------------------------------------
      clearAutoBlocks: () => {
        get().commit();
        set((s) => ({ blocks: s.blocks.filter((b) => !b.auto || b.pinned) }));
      },

      replan: () => {
        const { tasks, blocks, prefs } = get();
        get().commit();
        const kept = blocks.filter((b) => !b.auto || b.pinned);
        const result = autoPlan(tasks, kept, new Date(), prefs);

        const summary =
          result.unplacedMin > 0
            ? `Placed ${Math.round(result.placedMin / 60)}h · ${Math.round(
                result.unplacedMin / 60,
              )}h wouldn't fit`
            : `Placed ${result.blocks.length} session${
                result.blocks.length === 1 ? "" : "s"
              }`;

        set({ blocks: [...kept, ...result.blocks], lastPlanSummary: summary });

        get().toast(
          summary,
          result.unplacedMin > 0 ? "warn" : "success",
          { label: "Undo", run: () => get().undo() },
        );
      },

      buildPrepLadder: (taskId) => {
        const { tasks, blocks, prefs } = get();
        const task = tasks.find((t) => t.id === taskId);
        if (!task) return;
        get().commit();
        const ladder = planPrepLadder(task, blocks, new Date(), prefs);
        if (ladder.length === 0) {
          get().toast("No room for a prep ladder before that date", "warn");
          return;
        }
        set((s) => ({ blocks: [...s.blocks, ...ladder] }));
        get().toast(`Added ${ladder.length}-step prep ladder`, "success", {
          label: "Undo",
          run: () => get().undo(),
        });
      },

      // ---- ui --------------------------------------------------------------
      setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
      setAnchorDate: (iso) => set({ anchorDate: iso }),
      setView: (v) => set({ view: v }),
      setPaletteOpen: (v) => set({ paletteOpen: v }),
      setIngestOpen: (v) => set({ ingestOpen: v }),
      setSettingsOpen: (v) => set({ settingsOpen: v }),
      selectTask: (id) => set({ selectedTaskId: id, selectedBlockId: null }),
      selectBlock: (id) => set({ selectedBlockId: id, selectedTaskId: null }),
      setFocusTrack: (id) => set({ focusTrackId: id }),

      toast: (message, tone = "info", action) => {
        const id = uid("t");
        set((s) => ({ toasts: [...s.toasts, { id, message, tone, action }] }));
        if (typeof window !== "undefined") {
          window.setTimeout(() => get().dismissToast(id), action ? 6500 : 3800);
        }
      },
      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      loadSample: () => {
        get().commit();
        const data = buildSample(new Date());
        set({ ...data, selectedTaskId: null, selectedBlockId: null });
        get().toast("Loaded a sample week", "success", {
          label: "Undo",
          run: () => get().undo(),
        });
      },

      reset: () => {
        get().commit();
        set({ tracks: [], tasks: [], blocks: [] });
        get().toast("Workspace cleared", "info", {
          label: "Undo",
          run: () => get().undo(),
        });
      },

      importState: (data) => {
        get().commit();
        set((s) => ({
          tracks: data.tracks ?? s.tracks,
          tasks: data.tasks ?? s.tasks,
          blocks: data.blocks ?? s.blocks,
          prefs: data.prefs ?? s.prefs,
        }));
      },
    }),
    {
      name: "kairos.v1",
      storage: createJSONStorage(() => localStorage),
      // Persist data and preferences; never persist transient UI state, or the
      // app reopens with a stale modal on top of it.
      partialize: (s) => ({
        tracks: s.tracks,
        tasks: s.tasks,
        blocks: s.blocks,
        prefs: s.prefs,
      }),
    },
  ),
);

/**
 * Guards against SSR/client hydration mismatch on persisted state.
 * The server has no localStorage, so the first client render must match the
 * server's empty output before swapping in the real store contents.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

export const TASK_TYPES: TaskType[] = [
  "task",
  "writing",
  "project",
  "research",
  "milestone",
  "admin",
];

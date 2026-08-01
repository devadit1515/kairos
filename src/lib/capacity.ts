"use client";

/**
 * One clock, one capacity report.
 *
 * Five components used to each call `analyzeCapacity` with their own
 * `new Date()`, memoised on `[tasks, blocks, prefs]`. That was wrong twice
 * over. The same earliest-deadline-first walk ran five times per render, and
 * because `now` was not a dependency it never advanced — so a session left open
 * kept showing the free time it had computed at 9am. Worse, the five reports
 * could disagree with each other about which deadlines were reachable, which is
 * exactly the failure this product exists to prevent.
 *
 * Here there is a single shared clock, floored to the minute, and a single
 * memoised report derived from it. A calendar pixel is about a minute wide, so
 * a minute is the finest granularity that can change anything visible.
 */

import { useMemo, useSyncExternalStore } from "react";
import { useStore } from "./store";
import {
  analyzeCapacity,
  nextOpenWindow,
  type CapacityReport,
} from "./scheduler";

const MINUTE_MS = 60_000;
/** Checked more often than a minute so the flip lands close to the real one. */
const POLL_MS = 15_000;

const listeners = new Set<() => void>();
let currentMinute = floorToMinute(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

function floorToMinute(ms: number): number {
  return ms - (ms % MINUTE_MS);
}

function publish() {
  const next = floorToMinute(Date.now());
  if (next === currentMinute) return;
  currentMinute = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!timer) {
    timer = setInterval(publish, POLL_MS);
    // Background tabs throttle timers, so a tab returning to the foreground can
    // be many minutes stale. Catch up the moment it becomes visible again.
    document.addEventListener("visibilitychange", publish);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", publish);
    }
  };
}

const getSnapshot = () => currentMinute;
// The server has no clock worth agreeing on; every consumer renders after
// hydration, so this value is never actually painted server-side.
const getServerSnapshot = () => currentMinute;

/** Current time, floored to the minute and shared across every consumer. */
export function useMinute(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The one capacity report. Recomputes on data, preference, or minute change. */
export function useCapacity(): CapacityReport {
  const tasks = useStore((s) => s.tasks);
  const blocks = useStore((s) => s.blocks);
  const prefs = useStore((s) => s.prefs);
  const minute = useMinute();

  return useMemo(
    () => analyzeCapacity(tasks, blocks, new Date(minute), prefs),
    [tasks, blocks, prefs, minute],
  );
}

/**
 * Task ids that cannot be finished in time. Derived from the shared report so
 * the red hairline on the grid, the red badge in the rail, and the red count in
 * the capacity panel are guaranteed to be the same set.
 */
export function useAtRiskIds(): Set<string> {
  const report = useCapacity();
  return useMemo(
    () => new Set(report.atRisk.map((o) => o.task.id)),
    [report.atRisk],
  );
}

/** The next stretch of genuinely free time, or null if there is none ahead. */
export function useNextOpenWindow() {
  const blocks = useStore((s) => s.blocks);
  const prefs = useStore((s) => s.prefs);
  const minute = useMinute();

  return useMemo(
    () => nextOpenWindow(blocks, new Date(minute), prefs),
    [blocks, prefs, minute],
  );
}

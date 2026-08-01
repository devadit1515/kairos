/**
 * The capacity engine.
 *
 * Everything here is a pure function of (tasks, blocks, now, prefs) so it runs
 * identically in the browser, in a Next.js route handler, and inside the Render
 * Workflow nightly job. No React, no I/O, and `now` is always injected — which
 * also makes the whole thing trivially testable.
 *
 * The central claim of the product:
 *
 *     deficit = work you owe  −  time you actually have
 *
 * A conventional calendar never computes that number. It shows you a wall of
 * coloured rectangles and lets you draw your own conclusion, usually too late.
 */

import { addDays, endOfDay, startOfDay, max as maxDate, min as minDate } from "date-fns";
import type { Block, Preferences, Task } from "./types";

export interface Interval {
  start: Date;
  end: Date;
}

const MS_PER_MIN = 60_000;

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / MS_PER_MIN));
}

/** Set a Date to N minutes past midnight on its own day. */
function atMinuteOfDay(day: Date, minute: number): Date {
  return new Date(startOfDay(day).getTime() + minute * MS_PER_MIN);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Every stretch of unclaimed time between `from` and `to`, restricted to
 * working hours and working days, with existing blocks carved out.
 *
 * Walks day by day because the working-hours window is a per-day concept — a
 * gap never spans midnight, which is also what you want for focus sessions.
 */
export function freeSlots(
  blocks: Block[],
  from: Date,
  to: Date,
  prefs: Preferences,
): Interval[] {
  if (to <= from) return [];

  const busy: Interval[] = blocks
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
    .filter((i) => i.end > from && i.start < to)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: Interval[] = [];
  let cursorDay = startOfDay(from);
  const lastDay = startOfDay(to);
  const workDays = prefs.workDays?.length ? prefs.workDays : [0, 1, 2, 3, 4, 5, 6];

  while (cursorDay <= lastDay) {
    if (workDays.includes(cursorDay.getDay())) {
      const windowStart = maxDate([atMinuteOfDay(cursorDay, prefs.dayStartMin), from]);
      const windowEnd = minDate([atMinuteOfDay(cursorDay, prefs.dayEndMin), to]);

      if (windowEnd > windowStart) {
        let cursor = windowStart;
        for (const b of busy) {
          if (b.end <= cursor) continue;
          if (b.start >= windowEnd) break;
          if (b.start > cursor) {
            slots.push({ start: cursor, end: minDate([b.start, windowEnd]) });
          }
          cursor = maxDate([cursor, b.end]);
          if (cursor >= windowEnd) break;
        }
        if (cursor < windowEnd) slots.push({ start: cursor, end: windowEnd });
      }
    }
    cursorDay = addDays(cursorDay, 1);
  }

  // Drop slivers too short to be worth a session.
  return slots.filter((s) => minutesBetween(s.start, s.end) >= prefs.minSessionMin);
}

export function totalMinutes(slots: Interval[]): number {
  return slots.reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
}

/** Minutes of a task already reserved on the calendar by the planner. */
export function scheduledMinutes(task: Task, blocks: Block[]): number {
  return blocks
    .filter((b) => b.taskId === task.id)
    .reduce((sum, b) => sum + minutesBetween(new Date(b.start), new Date(b.end)), 0);
}

/** Work still owed: estimate minus logged minus already-blocked. */
export function remainingMinutes(task: Task, blocks: Block[]): number {
  if (task.completed) return 0;
  return Math.max(0, task.estimateMin - task.doneMin - scheduledMinutes(task, blocks));
}

export interface TaskOutlook {
  task: Task;
  remainingMin: number;
  scheduledMin: number;
  /** False when even a perfect schedule can't finish this before its deadline. */
  feasible: boolean;
  /** Free minutes available between now and this task's deadline. */
  runwayMin: number;
  /** Fraction of the estimate already done or booked. 0..1 */
  progress: number;
}

export interface CapacityReport {
  horizon: Date;
  /** Unscheduled work owed before the horizon. */
  requiredMin: number;
  /** Genuinely free minutes before the horizon. */
  availableMin: number;
  /** Positive means you are short. This is the headline number. */
  deficitMin: number;
  /** 0..1+ — how much of your free time the outstanding work consumes. */
  load: number;
  outlook: TaskOutlook[];
  /** Tasks that cannot be finished in time even with optimal scheduling. */
  atRisk: TaskOutlook[];
  /** Total minutes already committed to blocks inside the horizon. */
  committedMin: number;
}

/**
 * The reality check.
 *
 * Feasibility uses earliest-deadline-first, which is provably optimal for
 * preemptive single-resource scheduling: if EDF can't fit the work, no ordering
 * can. So "at risk" is a real guarantee rather than a heuristic guess — which
 * is what makes it honest enough to show in red.
 */
export function analyzeCapacity(
  tasks: Task[],
  blocks: Block[],
  now: Date,
  prefs: Preferences,
  horizonDays = prefs.horizonDays ?? 14,
): CapacityReport {
  const horizon = endOfDay(addDays(now, horizonDays));

  const live = tasks
    .filter((t) => !t.completed && new Date(t.due) > now)
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  const slots = freeSlots(blocks, now, horizon, prefs);
  const availableMin = totalMinutes(slots);

  // EDF walk: consume free time in deadline order and see who runs out of runway.
  const budget = slots.map((s) => ({
    end: s.end,
    left: minutesBetween(s.start, s.end),
  }));

  const outlook: TaskOutlook[] = live.map((task) => {
    const due = new Date(task.due);
    const remaining = remainingMinutes(task, blocks);
    const scheduled = scheduledMinutes(task, blocks);

    let need = remaining;
    let runway = 0;
    for (const slot of budget) {
      if (slot.end > due) break;
      runway += slot.left;
      if (need <= 0) continue;
      const take = Math.min(need, slot.left);
      slot.left -= take;
      need -= take;
    }

    const denominator = Math.max(1, task.estimateMin);
    return {
      task,
      remainingMin: remaining,
      scheduledMin: scheduled,
      feasible: need <= 0,
      runwayMin: runway,
      progress: Math.min(1, (task.doneMin + scheduled) / denominator),
    };
  });

  const requiredMin = live
    .filter((t) => new Date(t.due) <= horizon)
    .reduce((sum, t) => sum + remainingMinutes(t, blocks), 0);

  const committedMin = blocks
    .filter((b) => new Date(b.end) > now && new Date(b.start) < horizon)
    .reduce(
      (sum, b) =>
        sum +
        minutesBetween(maxDate([new Date(b.start), now]), minDate([new Date(b.end), horizon])),
      0,
    );

  return {
    horizon,
    requiredMin,
    availableMin,
    deficitMin: requiredMin - availableMin,
    load: availableMin === 0 ? (requiredMin > 0 ? 1 : 0) : requiredMin / availableMin,
    outlook,
    atRisk: outlook.filter((o) => !o.feasible && o.remainingMin > 0),
    committedMin,
  };
}

let autoSeq = 0;
function autoId(prefix: string): string {
  autoSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${autoSeq.toString(36)}`;
}

export interface PlanResult {
  blocks: Block[];
  /** Minutes the planner successfully placed. */
  placedMin: number;
  /** Minutes it could not fit anywhere before the relevant deadline. */
  unplacedMin: number;
  /** Task ids that could not be fully scheduled. */
  unplacedTaskIds: string[];
}

/**
 * Place focus sessions into real gaps.
 *
 * Deadline-ordered greedy placement. Two rules keep the output humane rather
 * than merely optimal:
 *   1. Sessions are clamped to [minSession, maxSession] — no 6-hour monoliths.
 *   2. Each task gets at most one max-length session per day, which spreads
 *      work across the week instead of front-loading it into whichever gap
 *      happens to be biggest.
 *
 * Returns only newly created blocks; the caller decides how to merge them.
 */
export function autoPlan(
  tasks: Task[],
  blocks: Block[],
  now: Date,
  prefs: Preferences,
): PlanResult {
  // Never plan around stale auto blocks. The caller clears them first, but stay
  // defensive so a direct call can't silently double-book.
  const fixed = blocks.filter((b) => !b.auto || b.pinned);

  const queue = tasks
    .filter((t) => !t.completed && new Date(t.due) > now)
    .map((t) => ({
      task: t,
      need: Math.max(0, t.estimateMin - t.doneMin - scheduledMinutes(t, fixed)),
    }))
    .filter((x) => x.need > 0)
    .sort((x, y) => {
      const d = new Date(x.task.due).getTime() - new Date(y.task.due).getTime();
      return d !== 0 ? d : y.task.weight - x.task.weight;
    });

  if (queue.length === 0) {
    return { blocks: [], placedMin: 0, unplacedMin: 0, unplacedTaskIds: [] };
  }

  const lastDue = queue.reduce(
    (m, x) => Math.max(m, new Date(x.task.due).getTime()),
    now.getTime(),
  );
  const slots = freeSlots(fixed, now, new Date(lastDue), prefs).map((s) => ({
    start: new Date(s.start),
    end: new Date(s.end),
  }));

  const created: Block[] = [];
  const perTaskPerDay = new Map<string, number>();
  let placedMin = 0;
  let unplacedMin = 0;
  const unplacedTaskIds: string[] = [];

  for (const { task, need: initialNeed } of queue) {
    let need = initialNeed;
    const due = new Date(task.due);

    for (const slot of slots) {
      if (need <= 0) break;
      if (slot.start >= due) break;

      const slotEnd = minDate([slot.end, due]);
      const free = minutesBetween(slot.start, slotEnd);
      if (free < prefs.minSessionMin) continue;

      const key = `${task.id}:${dayKey(slot.start)}`;
      const usedToday = perTaskPerDay.get(key) ?? 0;
      const dayAllowance = Math.max(0, prefs.maxSessionMin - usedToday);
      if (dayAllowance < prefs.minSessionMin) continue;

      const duration = Math.min(need, free, dayAllowance);
      if (duration < prefs.minSessionMin) continue;

      const start = new Date(slot.start);
      const end = new Date(start.getTime() + duration * MS_PER_MIN);

      created.push({
        id: autoId("blk"),
        title: task.title,
        kind: "focus",
        trackId: task.trackId,
        start: start.toISOString(),
        end: end.toISOString(),
        taskId: task.id,
        auto: true,
      });

      need -= duration;
      placedMin += duration;
      perTaskPerDay.set(key, usedToday + duration);

      // Consume the slot, leaving a buffer so sessions don't butt together.
      slot.start = new Date(end.getTime() + prefs.bufferMin * MS_PER_MIN);
    }

    if (need > 0) {
      unplacedMin += need;
      unplacedTaskIds.push(task.id);
    }
  }

  return { blocks: created, placedMin, unplacedMin, unplacedTaskIds };
}

/**
 * Ramp-up offsets, in days before a milestone.
 *
 * Expanding intervals mirror the forgetting curve — revisit material just
 * before it would decay. The same shape works for anything high-stakes with a
 * fixed date: a launch, a board review, a certification, a talk.
 */
export const PREP_OFFSETS_DAYS = [14, 7, 3, 1];

/** Weighting per offset — heavier as the date approaches. */
const PREP_WEIGHTS = [0.2, 0.25, 0.3, 0.25];

/**
 * Build a prep ladder for a milestone, placing each session in whatever free
 * time exists on its target day. Offsets in the past, or days with no room,
 * are skipped rather than crammed.
 */
export function planPrepLadder(
  milestone: Task,
  blocks: Block[],
  now: Date,
  prefs: Preferences,
): Block[] {
  const date = new Date(milestone.due);
  if (date <= now) return [];

  const totalPrep = Math.max(milestone.estimateMin, prefs.minSessionMin * 2);
  const created: Block[] = [];
  const working = [...blocks];

  PREP_OFFSETS_DAYS.forEach((offset, i) => {
    const target = addDays(date, -offset);
    if (target <= now) return;

    const duration = Math.max(
      prefs.minSessionMin,
      Math.min(prefs.maxSessionMin, Math.round((totalPrep * PREP_WEIGHTS[i]) / 5) * 5),
    );

    const dayStart = maxDate([atMinuteOfDay(target, prefs.dayStartMin), now]);
    const dayEnd = atMinuteOfDay(target, prefs.dayEndMin);
    const slot = freeSlots(working, dayStart, dayEnd, prefs).find(
      (s) => minutesBetween(s.start, s.end) >= duration,
    );
    if (!slot) return;

    const block: Block = {
      id: autoId("prep"),
      title: `Prep — ${milestone.title}`,
      kind: "prep",
      trackId: milestone.trackId,
      start: slot.start.toISOString(),
      end: new Date(slot.start.getTime() + duration * MS_PER_MIN).toISOString(),
      taskId: milestone.id,
      auto: true,
    };
    created.push(block);
    working.push(block);
  });

  return created;
}

/**
 * Find the largest uninterrupted stretch left today — powers the "you have a
 * 2h 40m window at 14:00" nudge, which is the single most actionable thing the
 * app can tell someone glancing at it.
 */
export function nextOpenWindow(
  blocks: Block[],
  now: Date,
  prefs: Preferences,
): Interval | null {
  const slots = freeSlots(blocks, now, endOfDay(now), prefs);
  if (slots.length === 0) return null;
  return slots.reduce((best, s) =>
    minutesBetween(s.start, s.end) > minutesBetween(best.start, best.end) ? s : best,
  );
}

/** "6h 30m" / "45m" — used everywhere a duration is shown. */
export function formatDuration(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

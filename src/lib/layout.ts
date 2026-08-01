/**
 * Calendar geometry.
 *
 * Turning a list of blocks into non-overlapping rectangles is the one genuinely
 * fiddly piece of a calendar UI. The approach here is the standard two-pass
 * interval-graph colouring that Google Calendar and friends use:
 *
 *   1. Sweep chronologically, grouping blocks into *clusters* — maximal runs
 *      where every block overlaps at least one other.
 *   2. Within a cluster, greedily assign each block the first column whose
 *      last occupant has already ended.
 *
 * Every block in a cluster then renders at 1/columns width. It's O(n log n)
 * dominated by the sort, and it degrades gracefully: a day with no overlaps
 * produces one column and full-width blocks, for free.
 */

import { startOfDay } from "date-fns";
import type { Block } from "./types";

export interface PositionedBlock {
  block: Block;
  /** 0..1 of the visible day range. */
  top: number;
  /** 0..1 of the visible day range. */
  height: number;
  /** Which lane within its overlap cluster. */
  column: number;
  /** How many lanes the cluster needs. */
  columns: number;
  /** True when the block starts before the visible window. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

function minutesIntoDay(d: Date, day: Date): number {
  return (d.getTime() - startOfDay(day).getTime()) / 60000;
}

export function layoutDay(
  blocks: Block[],
  day: Date,
  dayStartMin: number,
  dayEndMin: number,
): PositionedBlock[] {
  const span = Math.max(1, dayEndMin - dayStartMin);

  const items = blocks
    .map((block) => {
      const s = minutesIntoDay(new Date(block.start), day);
      const e = minutesIntoDay(new Date(block.end), day);
      return { block, s, e };
    })
    // Keep anything that intersects the visible window at all.
    .filter((i) => i.e > dayStartMin && i.s < dayEndMin)
    .sort((a, b) => a.s - b.s || b.e - a.e);

  const out: PositionedBlock[] = [];

  let cluster: typeof items = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;

    // Greedy lane assignment: reuse the first lane that's already free.
    const laneEnds: number[] = [];
    const laneOf = new Map<string, number>();

    for (const item of cluster) {
      let lane = laneEnds.findIndex((end) => end <= item.s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.e);
      } else {
        laneEnds[lane] = item.e;
      }
      laneOf.set(item.block.id, lane);
    }

    const columns = laneEnds.length;
    for (const item of cluster) {
      const visibleStart = Math.max(item.s, dayStartMin);
      const visibleEnd = Math.min(item.e, dayEndMin);
      out.push({
        block: item.block,
        top: (visibleStart - dayStartMin) / span,
        // Floor the height so a 15-minute block is still clickable.
        height: Math.max((visibleEnd - visibleStart) / span, 12 / span),
        column: laneOf.get(item.block.id) ?? 0,
        columns,
        clippedStart: item.s < dayStartMin,
        clippedEnd: item.e > dayEndMin,
      });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const item of items) {
    if (cluster.length > 0 && item.s >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.e);
  }
  flush();

  return out;
}

/** Snap a minute value to the nearest increment — used while dragging. */
export function snapMinutes(minutes: number, increment = 15): number {
  return Math.round(minutes / increment) * increment;
}

/** Convert a pointer offset within the grid back into a time on that day. */
export function offsetToDate(
  offsetY: number,
  containerHeight: number,
  day: Date,
  dayStartMin: number,
  dayEndMin: number,
  snap = 15,
): Date {
  const ratio = Math.min(1, Math.max(0, offsetY / Math.max(1, containerHeight)));
  const minute = snapMinutes(dayStartMin + ratio * (dayEndMin - dayStartMin), snap);
  return new Date(startOfDay(day).getTime() + minute * 60000);
}

export function formatHour(minuteOfDay: number, hour12 = false): string {
  const h = Math.floor(minuteOfDay / 60) % 24;
  const m = minuteOfDay % 60;
  if (hour12) {
    const suffix = h >= 12 ? "pm" : "am";
    const hh = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${hh}${suffix}` : `${hh}:${String(m).padStart(2, "0")}${suffix}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

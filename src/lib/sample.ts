/**
 * A sample week.
 *
 * Built relative to `now` rather than hard-coded, so it always lands on the
 * current week and is deliberately *slightly over-committed* — the point of the
 * app is visible within a second of loading it, without the numbers being
 * absurd enough to look staged.
 */

import { addDays, setHours, setMinutes, startOfDay } from "date-fns";
import type { Block, Task, Track } from "./types";

function at(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  return setMinutes(setHours(startOfDay(addDays(base, dayOffset)), hour), minute);
}

function iso(d: Date): string {
  return d.toISOString();
}

export function buildSample(now: Date): {
  tracks: Track[];
  tasks: Task[];
  blocks: Block[];
} {
  const tracks: Track[] = [
    { id: "trk_atlas", name: "Atlas Launch", code: "ATLAS", color: 0 },
    { id: "trk_northwind", name: "Northwind (client)", code: "NW", color: 1 },
    { id: "trk_research", name: "Research", code: "RSCH", color: 2 },
    { id: "trk_life", name: "Personal", code: "LIFE", color: 4 },
  ];

  const tasks: Task[] = [
    {
      id: "tsk_1",
      trackId: "trk_atlas",
      title: "Ship v2 onboarding flow",
      due: iso(at(now, 4, 17)),
      estimateMin: 420,
      doneMin: 60,
      type: "project",
      weight: 3,
      completed: false,
      notes: "Blocked on copy review. Needs QA pass before release cut.",
    },
    {
      id: "tsk_2",
      trackId: "trk_atlas",
      title: "Launch announcement post",
      due: iso(at(now, 5, 12)),
      estimateMin: 180,
      doneMin: 0,
      type: "writing",
      weight: 2,
      completed: false,
    },
    {
      id: "tsk_3",
      trackId: "trk_northwind",
      title: "Q3 integration audit",
      due: iso(at(now, 2, 18)),
      estimateMin: 300,
      doneMin: 45,
      type: "project",
      weight: 3,
      completed: false,
      notes: "Deliverable is a written findings doc, not a call.",
    },
    {
      id: "tsk_4",
      trackId: "trk_northwind",
      title: "Invoice + expense reconciliation",
      due: iso(at(now, 3, 17)),
      estimateMin: 45,
      doneMin: 0,
      type: "admin",
      weight: 1,
      completed: false,
    },
    {
      id: "tsk_5",
      trackId: "trk_research",
      title: "Read: distributed scheduling survey",
      due: iso(at(now, 6, 20)),
      estimateMin: 150,
      doneMin: 30,
      type: "research",
      weight: 1,
      completed: false,
    },
    {
      id: "tsk_6",
      trackId: "trk_atlas",
      title: "Board review — Atlas metrics",
      due: iso(at(now, 9, 10)),
      estimateMin: 240,
      doneMin: 0,
      type: "milestone",
      weight: 3,
      completed: false,
      notes: "Prep ladder candidate — fixed date, high stakes.",
    },
    {
      id: "tsk_7",
      trackId: "trk_life",
      title: "Renew passport",
      due: iso(at(now, 8, 17)),
      estimateMin: 60,
      doneMin: 0,
      type: "admin",
      weight: 2,
      completed: false,
    },
    {
      id: "tsk_8",
      trackId: "trk_research",
      title: "Summarise interview notes",
      due: iso(at(now, 1, 16)),
      estimateMin: 90,
      doneMin: 90,
      type: "writing",
      weight: 2,
      completed: true,
    },
  ];

  // Fixed commitments — the immovable furniture the planner must work around.
  const blocks: Block[] = [
    {
      id: "blk_s1",
      title: "Standup",
      kind: "fixed",
      trackId: "trk_atlas",
      start: iso(at(now, 1, 9, 30)),
      end: iso(at(now, 1, 9, 45)),
    },
    {
      id: "blk_s2",
      title: "Standup",
      kind: "fixed",
      trackId: "trk_atlas",
      start: iso(at(now, 2, 9, 30)),
      end: iso(at(now, 2, 9, 45)),
    },
    {
      id: "blk_s3",
      title: "Standup",
      kind: "fixed",
      trackId: "trk_atlas",
      start: iso(at(now, 3, 9, 30)),
      end: iso(at(now, 3, 9, 45)),
    },
    {
      id: "blk_nw",
      title: "Northwind weekly sync",
      kind: "fixed",
      trackId: "trk_northwind",
      start: iso(at(now, 1, 14)),
      end: iso(at(now, 1, 15)),
    },
    {
      id: "blk_design",
      title: "Design review",
      kind: "fixed",
      trackId: "trk_atlas",
      start: iso(at(now, 2, 11)),
      end: iso(at(now, 2, 12, 30)),
    },
    {
      id: "blk_1on1",
      title: "1:1",
      kind: "fixed",
      trackId: null,
      start: iso(at(now, 3, 15)),
      end: iso(at(now, 3, 15, 30)),
    },
    {
      id: "blk_gym",
      title: "Gym",
      kind: "personal",
      trackId: "trk_life",
      start: iso(at(now, 1, 18, 30)),
      end: iso(at(now, 1, 19, 30)),
    },
    {
      id: "blk_gym2",
      title: "Gym",
      kind: "personal",
      trackId: "trk_life",
      start: iso(at(now, 4, 18, 30)),
      end: iso(at(now, 4, 19, 30)),
    },
    {
      id: "blk_dinner",
      title: "Dinner with Sam",
      kind: "personal",
      trackId: "trk_life",
      start: iso(at(now, 5, 19)),
      end: iso(at(now, 5, 21)),
    },
    {
      id: "blk_board",
      title: "Board review — Atlas metrics",
      kind: "milestone",
      trackId: "trk_atlas",
      start: iso(at(now, 9, 10)),
      end: iso(at(now, 9, 12)),
      taskId: "tsk_6",
    },
    {
      id: "blk_deep",
      title: "Deep work (protected)",
      kind: "fixed",
      trackId: null,
      start: iso(at(now, 4, 9)),
      end: iso(at(now, 4, 11)),
    },
  ];

  return { tracks, tasks, blocks };
}

/**
 * Core domain model.
 *
 * Two things are deliberately separate:
 *   - `Task` is *work owed* — it has a deadline and an effort estimate.
 *   - `Block` is *time committed* — it occupies a real slot on the calendar.
 *
 * Keeping them apart is what makes the capacity engine possible: you can ask
 * "how much work do I owe?" and "how much time do I actually have?" as two
 * independent questions, then subtract. A conventional calendar only ever
 * models the second one, which is why it can tell you that you're busy but
 * never that you're over-committed.
 */

export type BlockKind =
  | "fixed" // meetings, classes, anything immovable
  | "focus" // deep-work session placed by the planner
  | "prep" // ramp-up session before a milestone
  | "milestone" // the deadline event itself
  | "personal";

export interface Track {
  id: string;
  name: string;
  /** Short label shown on dense calendar blocks, e.g. "ACME" or "CS-201". */
  code: string;
  /** Index into TRACK_COLORS. Stored as an index so palettes can be swapped. */
  color: number;
}

export type TaskType =
  | "task"
  | "writing"
  | "project"
  | "research"
  | "milestone"
  | "admin";

export interface Task {
  id: string;
  trackId: string | null;
  title: string;
  /** ISO timestamp of the deadline. */
  due: string;
  /** Estimated effort in minutes. The single most important field in the app. */
  estimateMin: number;
  /** Minutes already logged against this task. */
  doneMin: number;
  type: TaskType;
  /** 1 = low, 2 = normal, 3 = high. Breaks ties in the planner. */
  weight: 1 | 2 | 3;
  completed: boolean;
  /** Free-text detail, surfaced in the inspector. */
  notes?: string;
}

export interface Block {
  id: string;
  title: string;
  kind: BlockKind;
  trackId: string | null;
  /** ISO timestamp. */
  start: string;
  /** ISO timestamp. */
  end: string;
  /** Set when the planner created this block, so a re-plan can clear it. */
  taskId?: string | null;
  /** True when auto-generated — re-planning wipes and rebuilds these. */
  auto?: boolean;
  /** Marks a block the user dragged or resized; the planner leaves it alone. */
  pinned?: boolean;
}

export interface Preferences {
  /** Minutes from midnight. Nothing is scheduled before this. */
  dayStartMin: number;
  /** Minutes from midnight. Nothing is scheduled after this. */
  dayEndMin: number;
  /** Shortest useful focus block. Below this, context-switching wins. */
  minSessionMin: number;
  /** Longest block before diminishing returns. Work is split beyond this. */
  maxSessionMin: number;
  /** Breathing room inserted between back-to-back auto blocks. */
  bufferMin: number;
  /** Days of the week available for auto-planning. 0 = Sunday. */
  workDays: number[];
  /** Horizon, in days, for the capacity readout. */
  horizonDays: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  dayStartMin: 8 * 60,
  dayEndMin: 22 * 60,
  minSessionMin: 30,
  maxSessionMin: 120,
  bufferMin: 10,
  workDays: [0, 1, 2, 3, 4, 5, 6],
  horizonDays: 14,
};

/** Muted jewel tones — saturated enough to distinguish, dim enough for near-black. */
export const TRACK_COLORS = [
  { name: "cyan", hex: "#4FD1FF" },
  { name: "violet", hex: "#A78BFA" },
  { name: "mint", hex: "#3DDC97" },
  { name: "amber", hex: "#FFB454" },
  { name: "rose", hex: "#FF7A9C" },
  { name: "azure", hex: "#7C9CFF" },
  { name: "coral", hex: "#FF9A76" },
  { name: "lime", hex: "#B8E986" },
] as const;

export function colorOf(index: number): string {
  return TRACK_COLORS[Math.abs(index) % TRACK_COLORS.length].hex;
}

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  task: "Task",
  writing: "Writing",
  project: "Project",
  research: "Research",
  milestone: "Milestone",
  admin: "Admin",
};

export const BLOCK_KIND_LABEL: Record<BlockKind, string> = {
  fixed: "Fixed",
  focus: "Focus",
  prep: "Prep",
  milestone: "Milestone",
  personal: "Personal",
};

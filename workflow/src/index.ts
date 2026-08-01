/**
 * Kairos — Render Workflow
 *
 * A plan decays. Meetings get added, work slips, estimates turn out to be
 * wrong, and the schedule you generated on Monday quietly stops being true by
 * Wednesday. The whole premise of a capacity-aware calendar is that it tells
 * you *before* it matters, which means something has to keep checking while
 * you aren't looking.
 *
 * That's what this is. Three tasks, deliberately small and composable:
 *
 *   replanUser      — recompute one person's schedule from current state
 *   detectDrift     — flag deadlines that have become unreachable
 *   nightlySweep    — fan out across every active account, in parallel
 *
 * Tasks call other tasks, so the sweep is a genuine distributed fan-out rather
 * than a loop in one process: Render provisions an instance per task run and
 * retries failures independently. One account with corrupt data can't take
 * down the whole night's run.
 *
 * The scheduling engine is imported directly from the web app (`src/lib`) — the
 * same pure functions that run in the browser run here. There is exactly one
 * implementation of "is this reachable?", which is the only way the number a
 * user sees at 9am matches the one that generated their plan at 3am.
 */

import { startTaskServer, task } from "@renderinc/sdk/workflows";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  analyzeCapacity,
  autoPlan,
  formatDuration,
} from "../../src/lib/scheduler";
import { DEFAULT_PREFERENCES, type Block, type Preferences, type Task } from "../../src/lib/types";

// ---------------------------------------------------------------- infrastructure

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  // The service-role key bypasses RLS, which is exactly what a trusted
  // background worker needs and exactly what must never reach a browser.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the workflow service.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

interface UserState {
  tasks: Task[];
  blocks: Block[];
  prefs: Preferences;
}

async function loadUser(sb: SupabaseClient, userId: string): Promise<UserState> {
  const [tasks, blocks, prefs] = await Promise.all([
    sb.from("tasks").select("*").eq("user_id", userId).eq("completed", false),
    sb.from("blocks").select("*").eq("user_id", userId),
    sb.from("preferences").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const failure = tasks.error ?? blocks.error ?? prefs.error;
  if (failure) throw failure;

  return {
    tasks: (tasks.data ?? []).map((r): Task => ({
      id: r.id,
      trackId: r.track_id,
      title: r.title,
      due: r.due,
      estimateMin: r.estimate_min,
      doneMin: r.done_min,
      type: r.type,
      weight: r.weight,
      completed: r.completed,
      notes: r.notes ?? undefined,
    })),
    blocks: (blocks.data ?? []).map((r): Block => ({
      id: r.id,
      trackId: r.track_id,
      taskId: r.task_id,
      title: r.title,
      kind: r.kind,
      start: r.starts_at,
      end: r.ends_at,
      auto: r.auto,
      pinned: r.pinned,
    })),
    prefs: prefs.data
      ? {
          dayStartMin: prefs.data.day_start_min,
          dayEndMin: prefs.data.day_end_min,
          minSessionMin: prefs.data.min_session_min,
          maxSessionMin: prefs.data.max_session_min,
          bufferMin: prefs.data.buffer_min,
          workDays: prefs.data.work_days ?? DEFAULT_PREFERENCES.workDays,
          horizonDays: prefs.data.horizon_days ?? DEFAULT_PREFERENCES.horizonDays,
        }
      : DEFAULT_PREFERENCES,
  };
}

// ------------------------------------------------------------------- tasks

export interface ReplanReport {
  userId: string;
  placedMin: number;
  unplacedMin: number;
  sessionsWritten: number;
  deficitMin: number;
  atRisk: string[];
}

/**
 * Recompute one account's schedule.
 *
 * Only unpinned auto blocks are touched. Anything the user created or
 * explicitly pinned is treated as immovable — a background job that silently
 * moves a commitment someone made by hand is a job people turn off.
 */
export const replanUser = task(
  {
    name: "replanUser",
    timeoutSeconds: 120,
    retry: { maxRetries: 2, waitDurationMs: 2000, backoffScaling: 2 },
  },
  async (userId: string): Promise<ReplanReport> => {
    const sb = db();
    const { tasks, blocks, prefs } = await loadUser(sb, userId);
    const now = new Date();

    const keep = blocks.filter((b) => !b.auto || b.pinned);
    const result = autoPlan(tasks, keep, now, prefs);

    // Clear the previous machine-generated plan, then write the new one.
    const { error: deleteError } = await sb
      .from("blocks")
      .delete()
      .eq("user_id", userId)
      .eq("auto", true)
      .eq("pinned", false);
    if (deleteError) throw deleteError;

    if (result.blocks.length > 0) {
      const { error: insertError } = await sb.from("blocks").insert(
        result.blocks.map((b) => ({
          id: b.id,
          user_id: userId,
          track_id: b.trackId,
          task_id: b.taskId ?? null,
          title: b.title,
          kind: b.kind,
          starts_at: b.start,
          ends_at: b.end,
          auto: true,
          pinned: false,
        })),
      );
      if (insertError) throw insertError;
    }

    const report = analyzeCapacity(tasks, [...keep, ...result.blocks], now, prefs);

    return {
      userId,
      placedMin: result.placedMin,
      unplacedMin: result.unplacedMin,
      sessionsWritten: result.blocks.length,
      deficitMin: report.deficitMin,
      atRisk: report.atRisk.map((o) => o.task.title),
    };
  },
);

/**
 * Read-only capacity check.
 *
 * Separate from `replanUser` so it can run on a tighter cadence, or against
 * accounts that have opted out of automatic scheduling but still want to be
 * told when a deadline slips out of reach.
 */
export const detectDrift = task(
  { name: "detectDrift", timeoutSeconds: 60, retry: { maxRetries: 1, waitDurationMs: 1000, backoffScaling: 1 } },
  async (userId: string) => {
    const sb = db();
    const { tasks, blocks, prefs } = await loadUser(sb, userId);
    const report = analyzeCapacity(tasks, blocks, new Date(), prefs);

    return {
      userId,
      overCommitted: report.deficitMin > 0,
      deficit: formatDuration(Math.abs(report.deficitMin)),
      load: Math.round(report.load * 100),
      unreachable: report.atRisk.map((o) => ({
        title: o.task.title,
        due: o.task.due,
        shortBy: formatDuration(o.remainingMin - o.runwayMin),
      })),
    };
  },
);

/**
 * Nightly fan-out.
 *
 * Every account with at least one open commitment gets re-planned. The map to
 * `replanUser(...)` dispatches independent task runs rather than awaiting them
 * serially — Promise.all here means genuine parallelism across instances, so
 * wall-clock time is the slowest single account, not the sum of all of them.
 */
export const nightlySweep = task(
  { name: "nightlySweep", timeoutSeconds: 3600 },
  async () => {
    const sb = db();

    const { data, error } = await sb
      .from("tasks")
      .select("user_id")
      .eq("completed", false)
      .gte("due", new Date().toISOString());
    if (error) throw error;

    const userIds = [...new Set((data ?? []).map((r) => r.user_id as string))];
    if (userIds.length === 0) {
      return { swept: 0, overCommitted: 0, note: "No active accounts." };
    }

    const settled = await Promise.allSettled(userIds.map((id) => replanUser(id)));

    const succeeded = settled
      .filter((s): s is PromiseFulfilledResult<ReplanReport> => s.status === "fulfilled")
      .map((s) => s.value);
    const failed = settled.filter((s) => s.status === "rejected").length;

    return {
      swept: succeeded.length,
      failed,
      overCommitted: succeeded.filter((r) => r.deficitMin > 0).length,
      totalUnplaced: formatDuration(
        succeeded.reduce((sum, r) => sum + r.unplacedMin, 0),
      ),
      accountsWithUnreachableWork: succeeded
        .filter((r) => r.atRisk.length > 0)
        .map((r) => ({ userId: r.userId, count: r.atRisk.length })),
    };
  },
);

// ------------------------------------------------------------------ entry point
//
// Registering the tasks above isn't enough on its own — the process has to
// stay up and serve run requests. startTaskServer() is what Render's start
// command drives, and it both publishes the registry and executes incoming runs.
startTaskServer().catch((err: unknown) => {
  console.error("Failed to start the Kairos task server:", err);
  process.exit(1);
});

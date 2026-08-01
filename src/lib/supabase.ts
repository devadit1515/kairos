"use client";

/**
 * Optional cloud sync.
 *
 * Kairos is local-first: the app is fully functional with no Supabase project
 * at all. This module is the layer that *adds* durability and cross-device
 * access when credentials happen to exist, and every function here is a no-op
 * when they don't. That ordering matters — sync is an enhancement, never a
 * precondition, so a network failure degrades the product instead of breaking it.
 *
 * Conflict handling is deliberately last-write-wins by row. A calendar edited
 * by one person on two devices doesn't justify CRDTs, and pretending otherwise
 * would add a class of bugs far worse than the one it solves.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Block, Preferences, Task, Track } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const syncEnabled = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!syncEnabled) return null;
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

// ---------------------------------------------------------------- row shapes
interface TrackRow {
  id: string;
  user_id: string;
  name: string;
  code: string;
  color: number;
}

interface TaskRow {
  id: string;
  user_id: string;
  track_id: string | null;
  title: string;
  due: string;
  estimate_min: number;
  done_min: number;
  type: Task["type"];
  weight: number;
  completed: boolean;
  notes: string | null;
}

interface BlockRow {
  id: string;
  user_id: string;
  track_id: string | null;
  task_id: string | null;
  title: string;
  kind: Block["kind"];
  starts_at: string;
  ends_at: string;
  auto: boolean;
  pinned: boolean;
}

// The database uses snake_case; the domain model uses camelCase. Keeping the
// mapping in one place means neither side has to compromise for the other.
const toTrack = (r: TrackRow): Track => ({
  id: r.id,
  name: r.name,
  code: r.code,
  color: r.color,
});

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  trackId: r.track_id,
  title: r.title,
  due: r.due,
  estimateMin: r.estimate_min,
  doneMin: r.done_min,
  type: r.type,
  weight: (r.weight === 1 || r.weight === 3 ? r.weight : 2) as 1 | 2 | 3,
  completed: r.completed,
  notes: r.notes ?? undefined,
});

const toBlock = (r: BlockRow): Block => ({
  id: r.id,
  trackId: r.track_id,
  taskId: r.task_id,
  title: r.title,
  kind: r.kind,
  start: r.starts_at,
  end: r.ends_at,
  auto: r.auto,
  pinned: r.pinned,
});

// ---------------------------------------------------------------------- auth
export async function currentUserId(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

/** Passwordless sign-in. Nothing to remember, nothing to leak. */
export async function signInWithEmail(email: string): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("Sync is not configured.");
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}

// ---------------------------------------------------------------------- pull
export async function pullAll(): Promise<{
  tracks: Track[];
  tasks: Task[];
  blocks: Block[];
} | null> {
  const sb = supabase();
  const userId = await currentUserId();
  if (!sb || !userId) return null;

  const [tracks, tasks, blocks] = await Promise.all([
    sb.from("tracks").select("*").eq("user_id", userId),
    sb.from("tasks").select("*").eq("user_id", userId),
    sb.from("blocks").select("*").eq("user_id", userId),
  ]);

  const failure = tracks.error ?? tasks.error ?? blocks.error;
  if (failure) throw failure;

  return {
    tracks: (tracks.data as TrackRow[]).map(toTrack),
    tasks: (tasks.data as TaskRow[]).map(toTask),
    blocks: (blocks.data as BlockRow[]).map(toBlock),
  };
}

// ---------------------------------------------------------------------- push
/**
 * Mirror local state upward.
 *
 * Upsert then delete-what's-missing, rather than truncate-and-insert: a failed
 * insert after a successful truncate would leave the account empty, which is
 * the one outcome worth engineering against.
 */
export async function pushAll(
  tracks: Track[],
  tasks: Task[],
  blocks: Block[],
): Promise<void> {
  const sb = supabase();
  const userId = await currentUserId();
  if (!sb || !userId) return;

  if (tracks.length) {
    const { error } = await sb.from("tracks").upsert(
      tracks.map((t) => ({
        id: t.id,
        user_id: userId,
        name: t.name,
        code: t.code,
        color: t.color,
      })),
    );
    if (error) throw error;
  }

  if (tasks.length) {
    const { error } = await sb.from("tasks").upsert(
      tasks.map((t) => ({
        id: t.id,
        user_id: userId,
        track_id: t.trackId,
        title: t.title,
        due: t.due,
        estimate_min: t.estimateMin,
        done_min: t.doneMin,
        type: t.type,
        weight: t.weight,
        completed: t.completed,
        notes: t.notes ?? null,
      })),
    );
    if (error) throw error;
  }

  if (blocks.length) {
    const { error } = await sb.from("blocks").upsert(
      blocks.map((b) => ({
        id: b.id,
        user_id: userId,
        track_id: b.trackId,
        task_id: b.taskId ?? null,
        title: b.title,
        kind: b.kind,
        starts_at: b.start,
        ends_at: b.end,
        auto: Boolean(b.auto),
        pinned: Boolean(b.pinned),
      })),
    );
    if (error) throw error;
  }

  // Reap rows deleted locally. Guarded on a non-empty id list because an
  // empty `not in ()` clause is a syntax error, not a no-op.
  const reap = async (table: string, ids: string[]) => {
    const q = sb.from(table).delete().eq("user_id", userId);
    if (ids.length) await q.not("id", "in", `(${ids.map((i) => `"${i}"`).join(",")})`);
    else await q;
  };

  await reap("blocks", blocks.map((b) => b.id));
  await reap("tasks", tasks.map((t) => t.id));
  await reap("tracks", tracks.map((t) => t.id));
}

export async function pushPreferences(prefs: Preferences): Promise<void> {
  const sb = supabase();
  const userId = await currentUserId();
  if (!sb || !userId) return;

  const { error } = await sb.from("preferences").upsert({
    user_id: userId,
    day_start_min: prefs.dayStartMin,
    day_end_min: prefs.dayEndMin,
    min_session_min: prefs.minSessionMin,
    max_session_min: prefs.maxSessionMin,
    buffer_min: prefs.bufferMin,
    work_days: prefs.workDays,
    horizon_days: prefs.horizonDays,
  });
  if (error) throw error;
}

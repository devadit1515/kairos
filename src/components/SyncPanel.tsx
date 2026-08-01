"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  Loader2,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  currentUserId,
  pullAll,
  pushAll,
  pushPreferences,
  signInWithEmail,
  signOut,
  supabase,
  syncEnabled,
} from "@/lib/supabase";

/** Which action is in flight, so each button can show its own state. */
type Busy = "auth" | "push" | "pull" | null;

/**
 * Cloud sync controls.
 *
 * Sync is explicit rather than automatic. An always-on background sync would
 * need conflict resolution nobody asked for, and — worse — could overwrite a
 * device's local state before the user understood what was happening. Pushing
 * and pulling on demand is honest about what's going on, and for a
 * single-person calendar it's sufficient.
 */
export function SyncPanel() {
  const { tracks, tasks, blocks, prefs, importState, toast } = useStore();

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    if (!syncEnabled) return;
    currentUserId().then(setUserId);

    const sb = supabase();
    const { data } = sb!.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /*
   * Network failures used to be logged to the console and reported as "see the
   * console", which is an instruction to open a developer tool. Supabase errors
   * already carry a usable message; show it where the action was taken.
   */
  const describe = (err: unknown, fallback: string): string => {
    if (err instanceof TypeError) return "No connection to the sync service.";
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  };

  const handleSignIn = useCallback(async () => {
    if (!email.trim()) return;
    setBusy("auth");
    setError(null);
    try {
      await signInWithEmail(email.trim());
      setLinkSent(true);
    } catch (err) {
      setError(describe(err, "Couldn't send the sign-in link."));
    } finally {
      setBusy(null);
    }
  }, [email]);

  const handlePush = useCallback(async () => {
    setBusy("push");
    setError(null);
    try {
      await pushAll(tracks, tasks, blocks);
      await pushPreferences(prefs);
      setLastSynced(new Date().toLocaleTimeString());
      toast("Pushed to the cloud", "success");
    } catch (err) {
      setError(describe(err, "Push failed. Nothing was changed locally."));
    } finally {
      setBusy(null);
    }
  }, [tracks, tasks, blocks, prefs, toast]);

  const handlePull = useCallback(async () => {
    setBusy("pull");
    setError(null);
    try {
      const remote = await pullAll();
      if (!remote) {
        toast("Nothing stored in the cloud yet", "info");
        return;
      }
      importState(remote);
      setLastSynced(new Date().toLocaleTimeString());
      toast(
        `Pulled ${remote.tasks.length} commitments and ${remote.blocks.length} blocks`,
        "success",
        { label: "Undo", run: () => useStore.getState().undo() },
      );
    } catch (err) {
      setError(describe(err, "Pull failed. This device is unchanged."));
    } finally {
      setBusy(null);
    }
  }, [importState, toast]);

  // Not configured is a normal state, not an error — say so plainly.
  if (!syncEnabled) {
    return (
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <CloudOff size={12} className="text-ink-faint" aria-hidden />
          <h3 className="eyebrow">Cloud sync</h3>
        </div>
        <p className="text-mini leading-relaxed text-ink-faint">
          Not configured. Everything is stored in this browser, which is a
          complete and working setup. Add{" "}
          <code className="font-mono text-ink-soft">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          and an anon key to sync across devices.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Cloud
            size={12}
            aria-hidden
            className={userId ? "text-ok" : "text-ink-faint"}
          />
          <h3 className="eyebrow">Cloud sync</h3>
        </div>
        {lastSynced && (
          <span className="metric text-micro text-ink-faint">{lastSynced}</span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/[0.07] px-3 py-2"
        >
          <AlertTriangle
            size={12}
            aria-hidden
            className="mt-0.5 shrink-0 text-danger"
          />
          <p className="text-mini leading-relaxed text-ink-soft">{error}</p>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {userId ? (
          <motion.div
            key="signed-in"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2 rounded-xl border border-ok/25 bg-ok/[0.06] px-3 py-2">
              <Check size={12} className="shrink-0 text-ok" aria-hidden />
              <span className="truncate text-mini text-ink-soft">
                Signed in — your data is protected by row-level security.
              </span>
            </div>

            {/* Each button reflects its own progress. Previously only Push had a
                spinner, so pressing Pull looked like nothing had happened. */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handlePush}
                disabled={busy !== null}
                className="btn !px-2 !py-1.5 text-mini"
              >
                {busy === "push" ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                ) : (
                  <RefreshCw size={12} aria-hidden />
                )}
                Push
              </button>
              <button
                onClick={handlePull}
                disabled={busy !== null}
                className="btn !px-2 !py-1.5 text-mini"
              >
                {busy === "pull" ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                ) : (
                  <RefreshCw size={12} className="rotate-180" aria-hidden />
                )}
                Pull
              </button>
              <button
                onClick={async () => {
                  await signOut();
                  setUserId(null);
                  toast("Signed out — local data untouched", "info");
                }}
                disabled={busy !== null}
                className="btn !px-2 !py-1.5 text-mini"
              >
                <LogOut size={12} aria-hidden />
                Out
              </button>
            </div>

            <p className="text-mini leading-relaxed text-ink-faint">
              Push replaces the cloud copy with this device. Pull replaces this
              device with the cloud copy — undoable, like every other change.
            </p>
          </motion.div>
        ) : linkSent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-accent/30 bg-accent/[0.06] px-3 py-2.5"
          >
            <p className="text-dense text-accent">Check your email.</p>
            <p className="mt-1 text-mini leading-relaxed text-ink-soft">
              We sent a sign-in link to{" "}
              <span className="text-ink">{email}</span>. Opening it returns you
              here, signed in.
            </p>
            <button
              onClick={() => setLinkSent(false)}
              className="btn btn-ghost mt-2 !px-2 !py-1 text-mini"
            >
              Use a different address
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="signed-out"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                placeholder="you@example.com"
                className="field !py-1.5 text-dense"
                aria-label="Email address"
              />
              <button
                onClick={handleSignIn}
                disabled={!email.trim() || busy !== null}
                className="btn shrink-0 !px-3 !py-1.5 text-mini"
              >
                {busy === "auth" ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                ) : (
                  "Send link"
                )}
              </button>
            </div>
            <p className="text-mini leading-relaxed text-ink-faint">
              Passwordless. Nothing to remember, and nothing worth stealing from
              the database.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

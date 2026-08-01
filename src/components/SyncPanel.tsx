"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Cloud, CloudOff, Loader2, LogOut, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
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

type Phase = "idle" | "working" | "sent";

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
  const [phase, setPhase] = useState<Phase>("idle");
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

  const handleSignIn = useCallback(async () => {
    if (!email.trim()) return;
    setPhase("working");
    try {
      await signInWithEmail(email.trim());
      setPhase("sent");
    } catch (err) {
      console.error(err);
      toast("Couldn't send the sign-in link", "danger");
      setPhase("idle");
    }
  }, [email, toast]);

  const handlePush = useCallback(async () => {
    setPhase("working");
    try {
      await pushAll(tracks, tasks, blocks);
      await pushPreferences(prefs);
      setLastSynced(new Date().toLocaleTimeString());
      toast("Pushed to the cloud", "success");
    } catch (err) {
      console.error(err);
      toast("Push failed — see the console", "danger");
    } finally {
      setPhase("idle");
    }
  }, [tracks, tasks, blocks, prefs, toast]);

  const handlePull = useCallback(async () => {
    setPhase("working");
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
      console.error(err);
      toast("Pull failed — see the console", "danger");
    } finally {
      setPhase("idle");
    }
  }, [importState, toast]);

  // Not configured is a normal state, not an error — say so plainly.
  if (!syncEnabled) {
    return (
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <CloudOff size={12} className="text-ink-faint" />
          <h3 className="eyebrow">Cloud sync</h3>
        </div>
        <p className="text-[10.5px] leading-relaxed text-ink-faint">
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
          <Cloud size={12} className={userId ? "text-ok" : "text-ink-faint"} />
          <h3 className="eyebrow">Cloud sync</h3>
        </div>
        {lastSynced && (
          <span className="metric text-[9.5px] text-ink-faint">{lastSynced}</span>
        )}
      </div>

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
              <Check size={12} className="shrink-0 text-ok" />
              <span className="truncate text-[11px] text-ink-soft">
                Signed in — your data is protected by row-level security.
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handlePush}
                disabled={phase === "working"}
                className="btn !px-2 !py-1.5 text-[11px]"
              >
                {phase === "working" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                Push
              </button>
              <button
                onClick={handlePull}
                disabled={phase === "working"}
                className="btn !px-2 !py-1.5 text-[11px]"
              >
                <RefreshCw size={12} className="rotate-180" />
                Pull
              </button>
              <button
                onClick={async () => {
                  await signOut();
                  setUserId(null);
                  toast("Signed out — local data untouched", "info");
                }}
                className="btn !px-2 !py-1.5 text-[11px]"
              >
                <LogOut size={12} />
                Out
              </button>
            </div>

            <p className="text-[10.5px] leading-relaxed text-ink-faint">
              Push replaces the cloud copy with this device. Pull replaces this
              device with the cloud copy — undoable, like every other change.
            </p>
          </motion.div>
        ) : phase === "sent" ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-accent/30 bg-accent/[0.06] px-3 py-2.5"
          >
            <p className="text-[11.5px] text-accent">Check your email.</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-soft">
              We sent a sign-in link to{" "}
              <span className="text-ink">{email}</span>. Opening it returns you
              here, signed in.
            </p>
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
                className="field !py-1.5 text-[12px]"
                aria-label="Email address"
              />
              <button
                onClick={handleSignIn}
                disabled={!email.trim() || phase === "working"}
                className={clsx("btn shrink-0 !px-3 !py-1.5 text-[11px]")}
              >
                {phase === "working" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  "Send link"
                )}
              </button>
            </div>
            <p className="text-[10.5px] leading-relaxed text-ink-faint">
              Passwordless. Nothing to remember, and nothing worth stealing from
              the database.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

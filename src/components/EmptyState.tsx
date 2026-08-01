"use client";

import { motion } from "motion/react";
import { Sparkles, Wand2, FlaskConical } from "lucide-react";
import { useStore } from "@/lib/store";
import { riseIn, staggerParent } from "@/lib/motion";

/**
 * First run.
 *
 * An empty calendar can't demonstrate a capacity engine, so the primary action
 * is loading a realistic week rather than "create your first event". The
 * fastest path to understanding the product is seeing the deficit go red.
 */
export function EmptyState() {
  const { loadSample, setIngestOpen, setPaletteOpen } = useStore();

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <motion.div
        variants={staggerParent(0.06)}
        initial="hidden"
        animate="visible"
        className="w-full max-w-lg text-center"
      >
        <motion.div variants={riseIn} className="mb-6 flex justify-center">
          <div className="relative">
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
              <circle cx="32" cy="32" r="19" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="3" />
              <motion.path
                d="M32 13 a19 19 0 0 1 16.45 28.5"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              />
              <circle cx="32" cy="32" r="3.2" fill="var(--accent)" />
            </svg>
            <div
              aria-hidden
              className="absolute inset-0 -z-10 blur-2xl"
              style={{ background: "var(--accent-glow)", opacity: 0.25 }}
            />
          </div>
        </motion.div>

        {/* h2, not h1 — the top bar owns the document's single h1. */}
        <motion.h2
          variants={riseIn}
          className="text-balance text-2xl font-semibold tracking-tight text-ink"
        >
          The time you actually have
        </motion.h2>

        <motion.p
          variants={riseIn}
          className="mx-auto mt-3 max-w-md text-pretty text-body leading-relaxed text-ink-soft"
        >
          Every calendar tells you what you agreed to. None of them tell you
          whether it&apos;s possible. Kairos subtracts the work you owe from the
          time you have left, and shows you the difference before it becomes a
          problem.
        </motion.p>

        <motion.div
          variants={riseIn}
          className="mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row"
        >
          <button onClick={loadSample} className="btn btn-accent w-full sm:w-auto">
            <FlaskConical size={14} />
            Load a sample week
          </button>
          <button
            onClick={() => setIngestOpen(true)}
            className="btn w-full sm:w-auto"
          >
            <Sparkles size={14} className="text-accent" />
            Ingest a document
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="btn btn-ghost w-full sm:w-auto"
          >
            <Wand2 size={14} />
            Capture a task
          </button>
        </motion.div>

        <motion.p variants={riseIn} className="mt-6 text-mini text-ink-faint">
          Runs entirely in your browser. No account, no keys required.
        </motion.p>
      </motion.div>
    </div>
  );
}

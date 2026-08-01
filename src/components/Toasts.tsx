"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "@/lib/store";
import { toastIn } from "@/lib/motion";

const TONE = {
  info: "border-line",
  success: "border-ok/40",
  warn: "border-warn/40",
  danger: "border-danger/40",
} as const;

const DOT = {
  info: "bg-ink-faint",
  success: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
} as const;

export function Toasts() {
  const { toasts, dismissToast } = useStore();

  return (
    <div
      // aria-live so screen readers announce confirmations without stealing focus.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            variants={toastIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={clsx(
              "panel-raised pointer-events-auto flex max-w-md items-center gap-3 px-3.5 py-2.5",
              TONE[t.tone],
            )}
          >
            <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", DOT[t.tone])} />
            <span className="text-[12.5px] text-ink">{t.message}</span>

            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  dismissToast(t.id);
                }}
                className="ml-1 shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10"
              >
                {t.action.label}
              </button>
            )}

            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-white/5 hover:text-ink"
            >
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

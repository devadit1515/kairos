"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { fade, popIn } from "@/lib/motion";

/**
 * Modal primitive.
 *
 * Hand-rolled rather than pulled from a library because the requirements are
 * small and specific: escape to close, click-outside to close, focus moved in
 * on open and restored on close, and background scroll locked. Those four
 * behaviours are what separate a dialog from a div with a backdrop.
 */
export function Dialog({
  open,
  onClose,
  children,
  labelledBy,
  align = "center",
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  align?: "center" | "top";
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocus.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      // Minimal focus trap: wrap Tab within the panel.
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Defer so the panel exists before we try to focus into it.
    const raf = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        "[data-autofocus], input, textarea, button",
      );
      target?.focus();
    });

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(raf);
      restoreFocus.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className={clsx(
            "fixed inset-0 z-[80] flex justify-center p-4",
            align === "top" ? "items-start pt-[12vh]" : "items-center",
          )}
        >
          <motion.div
            variants={fade}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            variants={popIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={clsx(
              "panel-raised relative flex max-h-[82vh] w-full flex-col overflow-hidden",
              className ?? "max-w-lg",
            )}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function DialogHeader({
  title,
  subtitle,
  onClose,
  id,
  icon,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  id?: string;
  icon?: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex items-start gap-2.5">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div>
          <h2 id={id} className="text-[13.5px] font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-faint">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-white/5 hover:text-ink"
      >
        <X size={14} />
      </button>
    </header>
  );
}

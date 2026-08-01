"use client";

import { useEffect, useRef, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { fade, popIn } from "@/lib/motion";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Only elements a user can actually reach. The naive selector matches hidden
 * inputs too — this app has several (`<input type="file" class="hidden">`), and
 * including them means Tab lands on nothing visible and the trap appears broken.
 */
function visibleFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * The four behaviours that separate a dialog from a div with a backdrop:
 * escape to close, Tab wrapped inside the panel, focus moved in on open and
 * restored on close, and background scroll locked.
 *
 * Extracted as a hook because the magnified day card in the month view is also
 * a modal surface. It previously declared `role="dialog" aria-modal="true"` and
 * implemented none of this — so Escape did nothing and Tab walked off into the
 * calendar behind it.
 */
export function useModalBehavior(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
) {
  const restoreFocus = useRef<HTMLElement | null>(null);

  /*
   * Callers pass an inline arrow, so `onClose` has a new identity on every
   * render. Depending on it directly meant the whole effect tore down and set up
   * again each time the parent re-rendered: the focus-into-panel rAF fired again
   * (yanking focus back mid-typing), and `restoreFocus` was overwritten with
   * whatever was focused *inside* the panel — so closing restored focus to a
   * node that no longer existed. Reading it through a ref keeps the effect
   * anchored to `open` alone, which is the only thing that should re-run it.
   */
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    restoreFocus.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = visibleFocusable(panelRef.current);
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

    // Defer so the panel exists before we try to focus into it. `data-autofocus`
    // is queried on its own first — a single selector list resolves in document
    // order, so the opt-in was silently losing to whichever input came earlier.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>("[data-autofocus]");
      (preferred ?? visibleFocusable(panel)[0])?.focus();
    });

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(raf);
      restoreFocus.current?.focus?.();
    };
  }, [open, panelRef]);
}

/**
 * Modal primitive.
 *
 * Hand-rolled rather than pulled from a library because the requirements are
 * small and specific, and they all live in `useModalBehavior` above.
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
  useModalBehavior(open, onClose, panelRef);

  return (
    <AnimatePresence>
      {open && (
        <div
          className={clsx(
            "fixed inset-0 z-modal flex justify-center p-4",
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
          <h2 id={id} className="text-body font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 max-w-[52ch] text-mini leading-relaxed text-ink-faint">
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

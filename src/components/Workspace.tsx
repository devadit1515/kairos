"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Gauge, ListTodo } from "lucide-react";
import { clsx } from "clsx";
import { useStore, useHydrated } from "@/lib/store";
import { TopBar } from "./TopBar";
import { CalendarGrid } from "./CalendarGrid";
import { AgendaView } from "./AgendaView";
import { MonthView } from "./MonthView";
import { CapacityPanel } from "./CapacityPanel";
import { TaskRail } from "./TaskRail";
import { Inspector } from "./Inspector";
import { CommandPalette } from "./CommandPalette";
import { IngestDialog } from "./IngestDialog";
import { SettingsDialog } from "./SettingsDialog";
import { Toasts } from "./Toasts";
import { EmptyState } from "./EmptyState";
import { fade } from "@/lib/motion";

type MobilePane = "plan" | "calendar" | "tasks";

export function Workspace() {
  const hydrated = useHydrated();
  const {
    view,
    tasks,
    blocks,
    paletteOpen,
    setPaletteOpen,
    setIngestOpen,
    setSettingsOpen,
    selectBlock,
    selectTask,
    replan,
    undo,
    redo,
    setView,
    setAnchorDate,
  } = useStore();

  const [pane, setPane] = useState<MobilePane>("calendar");

  /**
   * Global keyboard map.
   *
   * Deliberately avoids single-letter shortcuts firing while the user is typing
   * — the check for an editable target is what separates a keyboard-first app
   * from one that eats your input.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (typing) return;
        e.preventDefault();
        undo();
        return;
      }
      if (mod && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) {
        if (typing) return;
        e.preventDefault();
        redo();
        return;
      }

      if (typing || mod) return;

      switch (e.key) {
        case "Escape":
          selectBlock(null);
          selectTask(null);
          break;
        case "d":
          setView("day");
          break;
        case "w":
          setView("week");
          break;
        case "m":
          setView("month");
          break;
        case "a":
          setView("agenda");
          break;
        case "t":
          setAnchorDate(new Date().toISOString());
          break;
        case "p":
          replan();
          break;
        case "i":
          setIngestOpen(true);
          break;
        case ",":
          setSettingsOpen(true);
          break;
        case "/":
          e.preventDefault();
          setPaletteOpen(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    setPaletteOpen,
    setIngestOpen,
    setSettingsOpen,
    selectBlock,
    selectTask,
    replan,
    undo,
    redo,
    setView,
    setAnchorDate,
  ]);

  /* Deep links from the PWA shortcuts in the manifest. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "day") setView("day");
    if (params.get("capture")) setPaletteOpen(true);
  }, [setView, setPaletteOpen]);

  // Until the persisted store rehydrates, render a matching shell rather than
  // real data — otherwise the server and client markup disagree.
  if (!hydrated) {
    return (
      <div className="flex h-dvh flex-col">
        <div className="h-[53px] shrink-0 border-b border-line" />
        <div className="grid flex-1 gap-3 p-3 lg:grid-cols-[340px_1fr]">
          <div className="skeleton hidden lg:block" />
          <div className="skeleton" />
        </div>
      </div>
    );
  }

  const isEmpty = tasks.length === 0 && blocks.length === 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar />

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[340px_minmax(0,1fr)]">
            {/* ---- left rail (desktop) / pane (mobile) ---- */}
            <div
              className={clsx(
                "min-h-0 flex-col gap-3 lg:flex",
                pane === "plan" || pane === "tasks" ? "flex" : "hidden",
              )}
            >
              <div className={clsx(pane === "tasks" && "hidden lg:block")}>
                <CapacityPanel />
              </div>
              <div
                className={clsx(
                  "min-h-0 flex-1",
                  pane === "plan" ? "hidden lg:flex" : "flex",
                )}
              >
                <TaskRail />
              </div>
            </div>

            {/* ---- calendar ---- */}
            <div
              className={clsx(
                "panel min-h-0 overflow-hidden",
                pane === "calendar" ? "block" : "hidden lg:block",
              )}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={view}
                  variants={fade}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="h-full"
                >
                  {view === "agenda" ? (
                    <AgendaView />
                  ) : view === "month" ? (
                    <MonthView />
                  ) : (
                    <CalendarGrid />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>

          {/* ---- mobile pane switcher ---- */}
          <nav
            className="flex shrink-0 items-center justify-around border-t border-line bg-black/40 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
            aria-label="Sections"
          >
            {(
              [
                ["plan", Gauge, "Capacity"],
                ["calendar", CalendarDays, "Calendar"],
                ["tasks", ListTodo, "Tasks"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                onClick={() => setPane(key)}
                aria-current={pane === key}
                className={clsx(
                  "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
                  pane === key ? "text-accent" : "text-ink-faint",
                )}
              >
                {pane === key && (
                  <motion.span
                    layoutId="mobile-pane-indicator"
                    className="absolute inset-x-6 top-0 h-px bg-accent"
                  />
                )}
                <Icon size={17} />
                {label}
              </button>
            ))}
          </nav>
        </>
      )}

      <Inspector />
      <AnimatePresence>{paletteOpen && <CommandPalette />}</AnimatePresence>
      <IngestDialog />
      <SettingsDialog />
      <Toasts />
    </div>
  );
}

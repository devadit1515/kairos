/**
 * The canonical keyboard map.
 *
 * There were three copies of this list — the settings sheet, the command
 * palette hints, and the README — and all three disagreed. The settings sheet
 * never mentioned `,` or redo, and the README omitted `,` entirely, so the app
 * had shortcuts nothing documented and documentation for shortcuts arranged in
 * an order the app didn't use. One list, imported wherever it's displayed.
 *
 * Bindings themselves live in `Workspace.tsx`; this is what the user is told.
 */

export interface Shortcut {
  keys: string;
  action: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "⌘K", action: "Command palette" },
  { keys: "D W M A", action: "Day, week, month, agenda" },
  { keys: "T", action: "Jump to today" },
  { keys: "P", action: "Auto-plan" },
  { keys: "I", action: "Ingest a document" },
  { keys: ",", action: "Settings" },
  { keys: "⌘Z", action: "Undo" },
  { keys: "⌘⇧Z", action: "Redo" },
  { keys: "Esc", action: "Clear selection" },
  { keys: "↑ ↓", action: "Nudge selected block 15m" },
  { keys: "⇧↑ ⇧↓", action: "Resize selected block" },
];

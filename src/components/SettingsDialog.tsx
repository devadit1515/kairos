"use client";

import { useRef } from "react";
import { Download, Keyboard, Plus, Trash2, Upload } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "@/lib/store";
import dynamic from "next/dynamic";
import { Dialog, DialogHeader } from "./Dialog";

/**
 * The Supabase client is ~65 kB and only reachable from this dialog, so it has
 * no business in the first load. Splitting it here keeps the calendar — the
 * thing people actually wait for — lean.
 */
const SyncPanel = dynamic(
  () => import("./SyncPanel").then((m) => m.SyncPanel),
  {
    ssr: false,
    loading: () => <div className="skeleton h-20 w-full" />,
  },
);
import { downloadICS, downloadJSON } from "@/lib/ics";
import { colorOf, TRACK_COLORS } from "@/lib/types";
import { formatDuration } from "@/lib/scheduler";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const SHORTCUTS: Array<[string, string]> = [
  ["⌘K", "Command palette"],
  ["D W M A", "Day, week, month, agenda"],
  ["T", "Jump to today"],
  ["P", "Auto-plan"],
  ["I", "Ingest a document"],
  ["⌘Z", "Undo"],
  ["Esc", "Clear selection"],
];

function minutesToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function SettingsDialog() {
  const {
    settingsOpen,
    setSettingsOpen,
    prefs,
    setPrefs,
    tracks,
    addTrack,
    updateTrack,
    removeTrack,
    tasks,
    blocks,
    importState,
    toast,
  } = useStore();

  const fileInput = useRef<HTMLInputElement>(null);
  const close = () => setSettingsOpen(false);

  const toggleDay = (day: number) => {
    const next = prefs.workDays.includes(day)
      ? prefs.workDays.filter((d) => d !== day)
      : [...prefs.workDays, day].sort();
    // Zero working days would make every deadline unreachable and the whole
    // capacity readout meaningless, so keep at least one.
    if (next.length === 0) return;
    setPrefs({ workDays: next });
  };

  const dailyCapacity = prefs.dayEndMin - prefs.dayStartMin;
  const weeklyCapacity = dailyCapacity * prefs.workDays.length;

  return (
    <Dialog
      open={settingsOpen}
      onClose={close}
      labelledBy="settings-title"
      className="max-w-lg"
    >
      <DialogHeader
        id="settings-title"
        title="Settings"
        subtitle="These constraints are what the planner schedules inside of."
        onClose={close}
      />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* ---- working hours ---- */}
        <section className="space-y-2">
          <h3 className="eyebrow">Working hours</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10.5px] text-ink-faint">Start</span>
              <input
                type="time"
                value={minutesToTime(prefs.dayStartMin)}
                onChange={(e) => {
                  const v = timeToMinutes(e.target.value);
                  if (v < prefs.dayEndMin) setPrefs({ dayStartMin: v });
                }}
                className="field metric"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10.5px] text-ink-faint">End</span>
              <input
                type="time"
                value={minutesToTime(prefs.dayEndMin)}
                onChange={(e) => {
                  const v = timeToMinutes(e.target.value);
                  if (v > prefs.dayStartMin) setPrefs({ dayEndMin: v });
                }}
                className="field metric"
              />
            </label>
          </div>

          <div className="flex items-center gap-1 pt-1">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                aria-pressed={prefs.workDays.includes(i)}
                className={clsx(
                  "h-7 flex-1 rounded-lg border text-[11px] transition-colors",
                  prefs.workDays.includes(i)
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-line text-ink-faint hover:text-ink-soft",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-[10.5px] leading-relaxed text-ink-faint">
            That&apos;s{" "}
            <span className="metric text-ink-soft">
              {formatDuration(weeklyCapacity)}
            </span>{" "}
            of schedulable time a week, before anything is booked.
          </p>
        </section>

        <div className="rule" />

        {/* ---- session shape ---- */}
        <section className="space-y-3">
          <h3 className="eyebrow">Session shape</h3>
          <Slider
            label="Minimum session"
            value={prefs.minSessionMin}
            min={15}
            max={90}
            step={15}
            onChange={(v) =>
              setPrefs({ minSessionMin: Math.min(v, prefs.maxSessionMin) })
            }
            hint="Shorter gaps are ignored — context switching costs more than they're worth."
          />
          <Slider
            label="Maximum session"
            value={prefs.maxSessionMin}
            min={60}
            max={300}
            step={30}
            onChange={(v) =>
              setPrefs({ maxSessionMin: Math.max(v, prefs.minSessionMin) })
            }
            hint="Also caps how much of one task lands in a single day, which spreads work out."
          />
          <Slider
            label="Buffer between sessions"
            value={prefs.bufferMin}
            min={0}
            max={30}
            step={5}
            onChange={(v) => setPrefs({ bufferMin: v })}
          />
          <Slider
            label="Planning horizon"
            value={prefs.horizonDays}
            min={7}
            max={60}
            step={7}
            unit="d"
            onChange={(v) => setPrefs({ horizonDays: v })}
          />
        </section>

        <div className="rule" />

        {/* ---- tracks ---- */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="eyebrow">Tracks</h3>
            <button
              onClick={() =>
                addTrack({
                  name: "New track",
                  code: "NEW",
                  color: tracks.length % TRACK_COLORS.length,
                })
              }
              className="btn btn-ghost !px-2 !py-1 text-[11px]"
            >
              <Plus size={12} />
              Add
            </button>
          </div>

          {tracks.length === 0 && (
            <p className="text-[11px] text-ink-faint">
              No tracks yet. They group commitments and colour the calendar.
            </p>
          )}

          <ul className="space-y-1">
            {tracks.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <button
                  onClick={() =>
                    updateTrack(t.id, {
                      color: (t.color + 1) % TRACK_COLORS.length,
                    })
                  }
                  aria-label="Cycle colour"
                  className="h-5 w-5 shrink-0 rounded-md border border-lineBright transition-transform hover:scale-110"
                  style={{ background: colorOf(t.color) }}
                />
                <input
                  value={t.name}
                  onChange={(e) => updateTrack(t.id, { name: e.target.value })}
                  className="field !py-1 text-[12px]"
                />
                <input
                  value={t.code}
                  onChange={(e) =>
                    updateTrack(t.id, { code: e.target.value.toUpperCase().slice(0, 6) })
                  }
                  className="field metric w-16 shrink-0 !py-1 text-center text-[11px]"
                  aria-label="Short code"
                />
                <button
                  onClick={() => removeTrack(t.id)}
                  aria-label={`Delete ${t.name}`}
                  className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="rule" />

        <SyncPanel />

        <div className="rule" />

        {/* ---- data ---- */}
        <section className="space-y-2">
          <h3 className="eyebrow">Data</h3>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                downloadICS(blocks, tracks);
                toast("Exported .ics", "success");
              }}
              className="btn !px-2 !py-1.5 text-[11px]"
            >
              <Download size={12} />
              .ics
            </button>
            <button
              onClick={() => {
                downloadJSON({ tracks, tasks, blocks, prefs });
                toast("Exported backup", "success");
              }}
              className="btn !px-2 !py-1.5 text-[11px]"
            >
              <Download size={12} />
              Backup
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              className="btn !px-2 !py-1.5 text-[11px]"
            >
              <Upload size={12} />
              Restore
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const data = JSON.parse(String(reader.result));
                  importState(data);
                  toast("Backup restored", "success");
                  close();
                } catch {
                  toast("That file isn't a valid backup", "danger");
                }
              };
              reader.readAsText(file);
            }}
          />
          <p className="text-[10.5px] leading-relaxed text-ink-faint">
            Everything is stored in this browser. Export a backup before clearing
            site data.
          </p>
        </section>

        <div className="rule" />

        {/* ---- shortcuts ---- */}
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Keyboard size={12} className="text-ink-faint" />
            <h3 className="eyebrow">Shortcuts</h3>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {SHORTCUTS.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <dt className="text-[11px] text-ink-soft">{label}</dt>
                <dd>
                  <kbd className="rounded border border-line bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-ink-faint">
                    {key}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </Dialog>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "m",
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] text-ink-soft">{label}</span>
        <span className="metric text-[11px] text-ink">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-accent"
        aria-label={label}
      />
      {hint && (
        <p className="text-[10.5px] leading-relaxed text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

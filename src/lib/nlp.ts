/**
 * Natural-language quick-add — deliberately *not* an LLM call.
 *
 * Typing "chem lab report friday 3h" and waiting 900ms for a network round trip
 * feels broken. This runs in microseconds on every keystroke so the command
 * palette can show a live preview of what will be created. The LLM is reserved
 * for the genuinely hard parsing job (a whole syllabus), where latency is fine.
 */

import { addDays, addWeeks, setHours, setMinutes, startOfDay } from "date-fns";
import type { TaskType } from "./types";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const TYPE_HINTS: Array<[RegExp, TaskType]> = [
  [/\b(exam|final|midterm|launch|ship|demo|pitch|presentation|interview|deadline)\b/i, "milestone"],
  [/\b(essay|paper|draft|writeup|write-up|blog|report|memo|proposal)\b/i, "writing"],
  [/\b(project|build|prototype|implement|refactor)\b/i, "project"],
  [/\b(read|reading|research|study|review|analy[sz]e|chapter)\b/i, "research"],
  [/\b(invoice|expense|email|form|paperwork|admin|renew|file)\b/i, "admin"],
];

export interface ParsedQuickAdd {
  title: string;
  due: Date;
  estimateMin: number;
  type: TaskType;
  weight: 1 | 2 | 3;
  /** Spans of the raw input that were consumed, so the UI can highlight them. */
  matched: string[];
}

/** "3h", "90m", "2.5h", "1h30", "1 hr" */
function parseDuration(input: string): { minutes: number; matched: string } | null {
  const combined = input.match(/\b(\d{1,2})\s*h(?:ours?|rs?)?\s*(\d{1,2})\s*m?\b/i);
  if (combined) {
    return {
      minutes: parseInt(combined[1], 10) * 60 + parseInt(combined[2], 10),
      matched: combined[0],
    };
  }
  const hours = input.match(/\b(\d{1,2}(?:\.\d)?)\s*h(?:ours?|rs?)?\b/i);
  if (hours) {
    return { minutes: Math.round(parseFloat(hours[1]) * 60), matched: hours[0] };
  }
  const mins = input.match(/\b(\d{1,3})\s*m(?:ins?|inutes?)?\b/i);
  if (mins) {
    return { minutes: parseInt(mins[1], 10), matched: mins[0] };
  }
  return null;
}

/** Time-of-day: "at 3pm", "by 17:00", "9am" */
function parseTimeOfDay(input: string): { hour: number; minute: number; matched: string } | null {
  const m = input.match(/\b(?:at|by)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m) {
    let hour = parseInt(m[1], 10) % 12;
    if (/pm/i.test(m[3])) hour += 12;
    return { hour, minute: m[2] ? parseInt(m[2], 10) : 0, matched: m[0] };
  }
  const m24 = input.match(/\b(?:at|by)\s+(\d{1,2}):(\d{2})\b/);
  if (m24) {
    return { hour: parseInt(m24[1], 10), minute: parseInt(m24[2], 10), matched: m24[0] };
  }
  return null;
}

function parseDate(input: string, now: Date): { date: Date; matched: string } | null {
  const lower = input.toLowerCase();

  if (/\btoday\b/.test(lower)) return { date: startOfDay(now), matched: "today" };
  if (/\btomorrow\b|\btmrw\b/.test(lower)) {
    const m = lower.match(/\btomorrow\b|\btmrw\b/)![0];
    return { date: startOfDay(addDays(now, 1)), matched: m };
  }

  // "next friday" / "friday"
  const dayMatch = lower.match(
    /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/,
  );
  if (dayMatch) {
    const token = dayMatch[2];
    const idx = WEEKDAYS.findIndex((d) => d.startsWith(token.slice(0, 3)));
    if (idx >= 0) {
      let delta = (idx - now.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // "friday" on a Friday means next Friday
      let date = addDays(startOfDay(now), delta);
      if (dayMatch[1]) date = addWeeks(date, 1);
      return { date, matched: dayMatch[0] };
    }
  }

  // "dec 5" / "5 dec" / "december 5th"
  const monthFirst = lower.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
  );
  if (monthFirst) {
    const month = MONTHS.indexOf(monthFirst[1]);
    const day = parseInt(monthFirst[2], 10);
    let date = new Date(now.getFullYear(), month, day);
    if (date < startOfDay(now)) date = new Date(now.getFullYear() + 1, month, day);
    return { date, matched: monthFirst[0] };
  }

  // "12/5" or "12/5/2026"
  const numeric = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numeric) {
    const month = parseInt(numeric[1], 10) - 1;
    const day = parseInt(numeric[2], 10);
    const year = numeric[3]
      ? parseInt(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3], 10)
      : now.getFullYear();
    let date = new Date(year, month, day);
    if (!numeric[3] && date < startOfDay(now)) date = new Date(year + 1, month, day);
    return { date, matched: numeric[0] };
  }

  // "in 3 days"
  const inDays = lower.match(/\bin\s+(\d{1,2})\s+days?\b/);
  if (inDays) {
    return {
      date: startOfDay(addDays(now, parseInt(inDays[1], 10))),
      matched: inDays[0],
    };
  }

  return null;
}

/**
 * Parse a quick-add string. Always succeeds — anything unrecognised becomes the
 * title, and missing fields fall back to sensible defaults (tomorrow, 1 hour).
 * A parser that can fail would make the palette feel fragile.
 */
export function parseQuickAdd(input: string, now = new Date()): ParsedQuickAdd {
  const matched: string[] = [];
  let rest = input;

  const consume = (token: string | undefined) => {
    if (!token) return;
    matched.push(token);
    rest = rest.replace(new RegExp(escapeRegex(token), "i"), " ");
  };

  const duration = parseDuration(rest);
  consume(duration?.matched);

  const time = parseTimeOfDay(rest);
  consume(time?.matched);

  const date = parseDate(rest, now);
  consume(date?.matched);

  // Priority markers: "!" or "!!" suffix, or the word "important".
  let weight: 1 | 2 | 3 = 2;
  const bang = rest.match(/(!{1,2})(?=\s|$)/);
  if (bang) {
    weight = bang[1].length === 2 ? 3 : 3;
    consume(bang[0]);
  }
  if (/\b(important|urgent|priority)\b/i.test(rest)) weight = 3;
  if (/\b(minor|optional|low)\b/i.test(rest)) weight = 1;

  // Strip filler words left behind by the date/duration extraction.
  const title =
    rest
      .replace(/\b(due|by|on|at|for|before)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim() || "Untitled task";

  let type: TaskType = "task";
  for (const [pattern, t] of TYPE_HINTS) {
    if (pattern.test(input)) {
      type = t;
      break;
    }
  }

  // Default deadline: end of the working day, tomorrow.
  let due = date?.date ?? addDays(startOfDay(now), 1);
  due = setMinutes(setHours(due, time?.hour ?? 23), time?.minute ?? 59);

  // Milestones imply real preparation; a one-line admin task rarely does.
  const fallbackEstimate =
    type === "milestone" ? 240 : type === "writing" || type === "project" ? 180 : type === "admin" ? 30 : 60;

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    due,
    estimateMin: duration?.minutes ?? fallbackEstimate,
    type,
    weight,
    matched,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deterministic document extraction.
 *
 * This is the fallback that runs when no model key is configured, or when the
 * API call fails. It is deliberately conservative — better to surface four
 * obviously-correct commitments than twelve speculative ones — but it means
 * "paste a document" is never a dead end, and the feature demos with no
 * network access at all.
 */

import { parseQuickAdd } from "./nlp";
import type { TaskType } from "./types";

export interface ExtractedTask {
  title: string;
  due: string;
  estimateMin: number;
  type: TaskType;
  weight: 1 | 2 | 3;
  trackName?: string | null;
  notes?: string | null;
}

/** Lines with no date signal are prose, not commitments. */
const DATE_SIGNAL =
  /\b(\d{1,2}\/\d{1,2}|\d{1,2}(st|nd|rd|th)?\s+(of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}|today|tomorrow|tmrw|mon|tues?|wed|thur?s?|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week|in\s+\d+\s+days?|week\s+\d+|due|deadline|by\s+\d)/i;

/** Bullets, numbering, and table pipes carry no meaning once split. */
function clean(line: string): string {
  return line
    .replace(/^[\s>*\-–—•·]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\|/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function heuristicExtract(text: string, now = new Date()): ExtractedTask[] {
  const lines = text
    .split(/\r?\n/)
    .map(clean)
    .filter((l) => l.length >= 6 && l.length <= 220);

  const seen = new Set<string>();
  const out: ExtractedTask[] = [];

  for (const line of lines) {
    if (!DATE_SIGNAL.test(line)) continue;

    const parsed = parseQuickAdd(line, now);

    // parseQuickAdd always succeeds, so guard against lines that produced a
    // title made only of leftover punctuation.
    if (parsed.title.replace(/[^a-z0-9]/gi, "").length < 3) continue;

    const key = `${parsed.title.toLowerCase()}|${parsed.due.toDateString()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title: parsed.title,
      due: parsed.due.toISOString(),
      estimateMin: parsed.estimateMin,
      type: parsed.type,
      weight: parsed.weight,
      notes: null,
      trackName: null,
    });
  }

  return out.slice(0, 40);
}

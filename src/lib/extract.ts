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

/**
 * Statements with no date signal are prose, not commitments.
 *
 * `due` and `deadline` used to be signals on their own, which meant "Nothing is
 * due yet." was extracted as a commitment titled "Nothing is yet" — the filler
 * stripper removes the very word that matched. They cost nothing to drop: any
 * real deadline sentence also contains a date, a weekday, or "tomorrow", all of
 * which are still matched here.
 */
const DATE_SIGNAL =
  /\b(\d{1,2}\/\d{1,2}|\d{1,2}(st|nd|rd|th)?\s+(of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}|today|tomorrow|tmrw|mon|tues?|wed|thur?s?|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week|in\s+\d+\s+days?|week\s+\d+|by\s+\d)/i;

/** Bullets, numbering, and table pipes carry no meaning once split. */
function clean(line: string): string {
  return line
    .replace(/^[\s>*\-–—•·]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\|/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Words that end in a full stop without ending a sentence. "may" is absent on
 * purpose — nobody writes "May." as an abbreviation, and including it would stop
 * "…slips to May. Ship v2 after that" from splitting.
 */
const ABBREVIATION =
  /(?:^|[\s(])(jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|approx|est|dept|no|vs|fig|figs|eg|ie)$/i;

/**
 * Split a line into statements.
 *
 * This is the difference between working and not working on real input. The
 * extractor used to split on newlines alone, so an ordinary prose paragraph —
 * "Board review on 21 March. Draft the strategy memo by 3rd of September. Ship
 * v2 on Sept 12." — collapsed into a *single* commitment whose title was all
 * three sentences run together and whose deadline was whichever date the parser
 * happened to match last. Bulleted documents worked; paragraphs did not.
 *
 * A boundary is terminal punctuation, then whitespace, then something that can
 * begin a statement. Requiring the whitespace is what keeps "3.5" and "v2.1"
 * intact; the abbreviation list is what keeps "Sept. 12" together.
 */
function splitStatements(line: string): string[] {
  const out: string[] = [];
  const boundary = /[.;!?](\s+)(?=["'([]?[A-Z0-9])/g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(line)) !== null) {
    const end = match.index + 1;
    const head = line.slice(start, end);
    if (ABBREVIATION.test(head.slice(0, -1))) continue;
    out.push(head.trim());
    start = end + match[1].length;
  }

  const tail = line.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

export function heuristicExtract(text: string, now = new Date()): ExtractedTask[] {
  const statements = text
    .split(/\r?\n/)
    .flatMap(splitStatements)
    .map(clean)
    // Bounds are per statement now, not per line, so a long paragraph is no
    // longer discarded wholesale for being over 220 characters.
    .filter((l) => l.length >= 6 && l.length <= 220);

  const seen = new Set<string>();
  const out: ExtractedTask[] = [];

  for (const line of statements) {
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

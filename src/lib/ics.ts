/**
 * RFC 5545 export.
 *
 * The cheapest possible interoperability win: an .ics file opens natively in
 * Apple Calendar, Google Calendar, Outlook, Fantastical, Thunderbird, and
 * every phone on earth. A plan you can't get onto your actual devices isn't
 * a plan, so Kairos treats export as a first-class feature rather than a
 * settings-page afterthought.
 */

import type { Block, Track } from "./types";

/** RFC 5545 wants UTC timestamps in basic ISO form with no punctuation. */
function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Escape per RFC 5545 §3.3.11. Order matters — backslashes first, or you
 * double-escape the escapes you just inserted.
 */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Lines must not exceed 75 octets; continuations begin with a single space.
 * Plenty of parsers tolerate long lines, but Outlook is not one of them.
 */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

const KIND_CATEGORY: Record<Block["kind"], string> = {
  fixed: "FIXED",
  focus: "FOCUS",
  prep: "PREP",
  milestone: "MILESTONE",
  personal: "PERSONAL",
};

export function blocksToICS(blocks: Block[], tracks: Track[] = []): string {
  const now = stamp(new Date());
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kairos//Capacity Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Kairos",
  ];

  for (const b of blocks) {
    const track = b.trackId ? trackName.get(b.trackId) : null;
    const description = [
      track ? `Track: ${track}` : null,
      b.auto ? "Scheduled automatically by Kairos." : null,
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.id}@kairos.app`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(new Date(b.start))}`,
      `DTEND:${stamp(new Date(b.end))}`,
      `SUMMARY:${esc(track ? `${b.title} · ${track}` : b.title)}`,
      `CATEGORIES:${KIND_CATEGORY[b.kind]}`,
      // Auto-planned time is movable, so publish it as tentative rather than
      // busy — it shouldn't block colleagues from proposing a real meeting.
      `STATUS:${b.auto ? "TENTATIVE" : "CONFIRMED"}`,
      `TRANSP:${b.kind === "personal" ? "TRANSPARENT" : "OPAQUE"}`,
    );
    if (description) lines.push(`DESCRIPTION:${esc(description)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

/** Trigger a client-side download without a server round trip. */
export function downloadICS(blocks: Block[], tracks: Track[], filename = "kairos.ics") {
  const blob = new Blob([blocksToICS(blocks, tracks)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick — revoking synchronously races the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJSON(data: unknown, filename = "kairos-backup.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

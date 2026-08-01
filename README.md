<div align="center">

# Kairos

**The time you actually have.**

A capacity-aware calendar. It doesn't just show what you committed to —
it works out whether it's possible, and then rebuilds your week so it is.

[Deploy](DEPLOY.md) · [Engine](src/lib/scheduler.ts) · [Schema](supabase/schema.sql)

</div>

---

## The problem

Every calendar answers the same question: *what did I agree to?*

None of them answer the one that matters: *can I actually do it?*

You end up with a wall of coloured rectangles, a list of deadlines somewhere
else, and no arithmetic connecting the two. The gap between "committed" and
"achievable" only becomes visible at 2am the night before — far too late for
the information to be worth anything.

Kairos closes that gap with one number:

```
deficit  =  work you owe  −  time you actually have
```

When it goes positive, you are over-committed. Kairos says so in plain
language, before it matters, and then fixes it.

## What it does

### Capacity engine

Continuously computes free time between now and every deadline, subtracts
outstanding work, and surfaces the difference. Feasibility is evaluated with
**earliest-deadline-first** scheduling, which is provably optimal for a single
resource — so when Kairos says a deadline is unreachable, that's a guarantee
rather than a heuristic guess. It's the only reason the warning is worth
showing in red.

### Auto-planner

Places focus sessions into genuinely free gaps. Respects working hours,
working days, minimum and maximum session length, and buffers between
sessions. Caps each task at one long session per day, so work spreads across
the week instead of collapsing into whichever gap happens to be biggest.

When something can't be fitted, it says so and tells you by how much, rather
than quietly dropping it.

### Paste-to-plan

Drop in any unstructured document — a project brief, a statement of work,
meeting notes, a contract, an email thread — and Kairos extracts every dated
commitment with an effort estimate, grouped into tracks.

Runs on Claude with a constrained output schema, so the response shape is
guaranteed rather than parsed hopefully. If no key is configured, or the API
is unreachable, it falls back to a deterministic parser and labels the result
honestly. The feature has no failure mode that ends in an error dialog.

### Prep ladders

Give any milestone a date and Kairos builds a ramp: sessions at 14, 7, 3 and 1
days out, weighted toward the deadline. Expanding intervals, borrowed from
spaced repetition, applied to launches, board reviews, certifications and
exams alike.

### Four views, one of which does something new

Day and week are the grid you already know. Agenda is a linear read of the
fortnight with per-day free totals.

**Month** is the familiar Google/Apple shape plus the thing those views never
show: how full each day actually *is*. A conventional month cell only lists
events, so a day with three fifteen-minute calls looks identical to a day with
three four-hour blocks. Every cell here carries a capacity bar and a load tint,
so you can scan a month and see where the pressure is rather than just where
the appointments are. Pills are coloured by track — a month scan answers "which
project is eating this fortnight".

Clicking a day lifts it out of the grid into a magnified card: it rises on the
Z axis with a slight rotation that settles flat, so the cell you clicked
visibly *becomes* the detail view instead of a modal appearing from nowhere.
Suppressed under `prefers-reduced-motion`.

### Direct manipulation

Drag blocks to move them, drag the grip to resize, drag sideways to change
day. Everything snaps to quarter hours; the time label previews the
destination while you drag. Dragging an auto-placed block pins it — moving
something by hand is a decision, and the planner stops overwriting it.

Arrow keys nudge by 15 minutes. Shift-arrow resizes. The grid never requires a
mouse.

### Keyboard-first capture

`⌘K` opens a palette with subsequence matching across commands, tasks and
blocks. Typing a task parses it locally, with no network round trip, and
previews exactly what will be created:

```
ship v2 friday 3h !   →   Ship v2 · Fri 7 Aug 23:59 · 3h · high priority
```

Day-first and month-first dates both work, because half the world writes
`21 March` and the other half writes `March 21`.

## Keyboard reference

| Key | Action |
|---|---|
| `⌘K` / `/` | Command palette |
| `D` `W` `M` `A` | Day, week, month, agenda |
| `T` | Jump to today |
| `P` | Auto-plan |
| `I` | Ingest a document |
| `,` | Settings |
| `⌘Z` / `⌘⇧Z` | Undo / redo |
| `Esc` | Clear selection |
| `↑` `↓` | Nudge selected block 15m |
| `⇧↑` `⇧↓` | Resize selected block |

Single-letter shortcuts are suppressed while a dialog is open and while you're
typing, so the app never eats your input. The list shown in Settings is
generated from [`src/lib/shortcuts.ts`](src/lib/shortcuts.ts) — one source, so the
documentation can't drift from the interface.

## Cross-platform

- **Installable PWA** with offline support. Navigations are network-first with
  a cached shell; assets are stale-while-revalidate; API calls are never
  cached. Checking what's next on a train with no signal is a core use case,
  not an edge case.
- **`.ics` export** (RFC 5545, properly folded and escaped) so plans reach
  Apple Calendar, Google Calendar, Outlook, and every phone on earth.
  Auto-planned time exports as `TENTATIVE`, so it doesn't block colleagues
  from proposing a real meeting.
- **Responsive** down to phone width with a dedicated pane switcher, and safe
  area insets respected.
- **JSON backup and restore** — your data is never hostage to one browser.

## Architecture

```
src/
  lib/
    scheduler.ts   pure capacity + planning engine — no React, no I/O
    layout.ts      interval-graph colouring for overlapping blocks
    nlp.ts         local natural-language parser (zero-latency capture)
    extract.ts     deterministic document extraction (the AI fallback)
    ics.ts         RFC 5545 export
    types.ts       domain model: Track, Task, Block, Preferences
    store.ts       state, persistence, snapshot undo
    capacity.ts    one shared clock + one capacity report for the whole UI
    shortcuts.ts   the canonical keyboard map, as displayed
    supabase.ts    optional cloud sync — no-ops without credentials
  app/api/
    ingest         Claude-backed document extraction
    replan         dispatches a Render Workflow run
  components/      calendar grid, capacity readout, palette, inspector
workflow/          Render Workflows: replanUser, detectDrift, nightlySweep
supabase/          Postgres schema with row-level security
```

Two decisions carry most of the weight:

**The engine is isolated from the UI.** `scheduler.ts` takes
`(tasks, blocks, now, preferences)` and returns plain data. The identical code
path runs in the browser, in a route handler, and inside the nightly Render
Workflow — so the plan generated at 3am agrees with the number shown at 9am.
`now` is always injected, never read from the ambient clock, which makes the
whole thing deterministic and testable.

**One clock, one report.** Because `now` is a parameter, it's tempting for each
component to supply its own — and five of them did, which meant the same
earliest-deadline-first walk ran five times per render and the five results could
disagree about which deadlines were reachable. `capacity.ts` holds a single
minute-resolution clock and derives one memoised report from it, so the red badge
in the rail, the red hairline on the grid, and the headline in the capacity panel
are reading the same object. It also means the numbers advance as the day does
rather than freezing at whatever time the tab was opened.

**Work owed and time committed are separate types.** `Task` has a deadline and
an effort estimate; `Block` occupies a slot. Keeping them apart is what makes
the subtraction possible at all — a calendar that models only the second one
can tell you that you're busy, but never that you're over-committed.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router), TypeScript, Tailwind |
| Motion | [motion.dev](https://motion.dev) |
| Data | Supabase — Postgres with row-level security |
| Hosting | Render web service |
| Jobs | Render Workflows |
| AI | Claude (`claude-opus-5`), constrained output schema |

## Running locally

```bash
npm install
npm run dev
```

That's the whole setup. Kairos is local-first: with no environment configured
it stores everything in the browser and uses the deterministic parser. Adding
credentials layers on cloud sync and AI extraction without changing anything
you already relied on.

| Variable | Enables | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI document ingestion | Local parser |
| `NEXT_PUBLIC_SUPABASE_URL` | Cloud sync | localStorage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cloud sync | localStorage |
| `RENDER_API_KEY` | Server-side re-planning | `/api/replan` returns 501 |

Full deployment instructions, including the Supabase schema and the Render
Workflow, are in [DEPLOY.md](DEPLOY.md).

## Licence

MIT

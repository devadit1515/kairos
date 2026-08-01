<div align="center">

# Kairos

**The time you actually have.**

A capacity-aware calendar. It doesn't just show you what you committed to —
it tells you whether it's *possible*, and then fixes it.

</div>

---

## The problem

Every calendar answers the same question: *what did I agree to?*

None of them answer the one that matters: *can I actually do it?*

You end up with a wall of coloured rectangles, a list of deadlines somewhere
else, and no arithmetic connecting the two. The gap between "committed" and
"achievable" only becomes visible at 2am the night before, which is far too
late for the information to be useful.

Kairos closes that gap with one number:

```
deficit  =  work you owe  −  time you actually have
```

When that number goes positive, you are over-committed. Kairos says so in
plain language, before it matters, and then rebuilds your week so it doesn't.

## What it does

**Capacity engine.** Continuously computes free time between now and every
deadline, subtracts outstanding work, and surfaces the deficit. Feasibility is
evaluated with earliest-deadline-first scheduling, which is provably optimal
for this problem — so when Kairos says a deadline is unreachable, that's a
guarantee, not a guess.

**Auto-planner.** Places focus sessions into genuinely free gaps. Respects
working hours, working days, minimum and maximum session length, and buffer
between sessions. Caps each task at one long session per day so work spreads
across the week instead of collapsing into whichever gap is biggest.

**Paste-to-plan.** Drop in any unstructured document — a project brief, a
syllabus, meeting notes, a contract, an email thread — and Kairos extracts
every dated commitment with an effort estimate. Runs on Claude server-side,
with a deterministic parser as fallback so it never hard-fails.

**Prep ladders.** Give any milestone a date and Kairos builds a ramp: sessions
at 14, 7, 3, and 1 days out, weighted toward the deadline. Expanding intervals,
borrowed from spaced repetition, applied to launches, reviews, and exams alike.

**Keyboard-first.** A command palette (`⌘K`) and natural-language capture that
parses locally, with no network round trip — `ship v2 friday 3h !` becomes a
weighted, dated, estimated task before you finish typing.

## Architecture

```
src/
  lib/
    scheduler.ts   pure capacity + planning engine — no React, no I/O
    nlp.ts         local natural-language parser (zero-latency capture)
    types.ts       domain model: Track, Task, Block, Preferences
    store.ts       state, persistence, undo
    ics.ts         RFC 5545 export — Apple / Google / Outlook interop
  app/
    api/ingest     Claude-backed document extraction
  components/      calendar grid, capacity readout, palette, inspector
workflow/          Render Workflow: nightly re-plan + drift detection
supabase/          Postgres schema with row-level security
```

The engine is deliberately isolated from the UI. `scheduler.ts` takes
`(tasks, blocks, now, preferences)` and returns plain data, so the identical
code path runs in the browser, in a route handler, and inside the nightly
Render Workflow job. `now` is always injected, never read from the ambient
clock, which makes the whole thing deterministic and testable.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router), TypeScript, Tailwind |
| Motion | [motion.dev](https://motion.dev) |
| Data | Supabase — Postgres with row-level security |
| Hosting | Render web service |
| Jobs | Render Workflows |
| AI | Claude (`claude-opus-5`) for document ingestion |

## Running locally

```bash
npm install
cp .env.example .env.local   # optional — the app runs fully without any keys
npm run dev
```

Kairos is local-first. With no environment configured it stores everything in
the browser and uses the deterministic parser; adding keys layers on cloud sync
and AI extraction without changing any behaviour you've already relied on.

| Variable | Enables | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI document ingestion | No — falls back to the local parser |
| `NEXT_PUBLIC_SUPABASE_URL` | Cloud sync | No — falls back to local storage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cloud sync | No |
| `RENDER_API_KEY` | Triggering the nightly workflow | No |

## Licence

MIT

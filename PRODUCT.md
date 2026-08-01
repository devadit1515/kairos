# Product

## Register

product

## Users

Anyone who owes work to a deadline and has to decide, today, whether the week is
survivable: independent consultants, founders, engineers, researchers, people
running several parallel commitments with no manager holding the schedule for
them. They arrive already behind. They open Kairos in a moment of doubt — "can I
actually do all of this?" — usually with 90 seconds of attention, often on a
phone between other things.

The job to be done: convert a vague sense of dread into a number, and then into a
plan. Not "organise my life" — that's an aspiration, not a task. The task is
*decide what to cut, or confirm nothing needs cutting.*

Explicitly **not** positioned for students. No coursework vocabulary, no
academic-term framing, no campus imagery. Tracks and tasks, not courses and
assignments.

## Product Purpose

Every calendar answers "what did I agree to?" and none answer "can I actually do
it?" Kairos closes that gap with one subtraction:

```
deficit = work you owe − time you actually have
```

Feasibility is computed with earliest-deadline-first scheduling, which is
provably optimal for a single resource — so "this deadline is unreachable" is a
guarantee, not a guess. That's the entire licence for showing it in red.

Success looks like: a user opens the month view, sees where the pressure is
without reading a single event title, and either re-plans in one keystroke or
closes the tab reassured.

## Brand Personality

**Instrument, not assistant.** Three words: *precise, calm, unsentimental.*

Voice: states facts and their consequences. "Nothing to export yet", not "Oops!
Looks like you haven't added anything." It never celebrates, never apologises,
never uses an exclamation mark. When it can't do something it says what it did
instead. Numbers are always tabular and always sourced from the same engine, so
the figure on screen at 9am agrees with the plan generated at 3am.

The emotional target is *relief through certainty* — the feeling of a good
altimeter, not a motivational app.

## Anti-references

- **Productivity-app cheer.** Notion/Todoist onboarding warmth, emoji, streaks,
  confetti, "You've got this!". Kairos is a measuring device.
- **Student planner aesthetics.** Pastel highlighters, notebook paper, term
  timetables, anything that reads as coursework.
- **AI-product chrome.** Gradient text, glass cards used decoratively, a purple
  sparkle glow on every surface, "✨ AI-powered" as a value proposition. AI here
  is one ingestion path with a deterministic fallback, not the pitch.
- **Dashboard hero metrics.** Giant number + tiny label + three supporting stats.
  The capacity readout must stay legible as an instrument, not a KPI poster.
- **Google Calendar's flatness** as the ceiling. Matching it is not the goal; the
  month view exists specifically because a conventional month cell can't
  distinguish three 15-minute calls from three four-hour blocks.

## Design Principles

1. **One number, then the reasoning.** Every screen resolves to the deficit or to
   free time. Detail is available on demand, never in the way of the headline.
2. **Say what you did instead.** Every degradation is announced in plain
   language: no API key falls back to the local parser and labels itself; a task
   that won't fit says by how many minutes. The app has no failure mode that
   ends in a shrug.
3. **Direct manipulation over dialogs.** Drag, resize, nudge with arrows. A modal
   is an admission that the surface couldn't express the action. Moving a block
   by hand is a decision, and the planner must respect it.
4. **Density is respect.** These users want more information per square inch, not
   more whitespace. Legibility is non-negotiable; airiness is not a virtue here.
5. **Motion explains provenance, nothing else.** Things come from where they came
   from — a month cell becomes the day detail. Anything decorative is deleted.

## Accessibility & Inclusion

Target **WCAG 2.2 AA**.

- Body text ≥ 4.5:1, large text and non-text UI ≥ 3:1, against the near-black
  canvas. Micro-labels are the standing risk and must be checked, not assumed.
- Colour is never the sole carrier of meaning. Track identity is colour *plus*
  a short code; capacity state is colour *plus* a word ("tight", "unreachable").
  This is required for the ~8% of male users with red/green deficiency, since the
  load ramp runs cyan → amber → red.
- Full keyboard operation, including block move and resize. Visible focus ring on
  every interactive element; never removed without replacement.
- `prefers-reduced-motion` collapses every transition to a crossfade or an
  instant change — including the month view's 3D magnification.
- Touch targets ≥ 44px on pointer-coarse devices, and the phone layout is a real
  layout, not a squeezed desktop.

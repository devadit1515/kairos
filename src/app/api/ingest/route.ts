import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { heuristicExtract, type ExtractedTask } from "@/lib/extract";

export const runtime = "nodejs";
// Extraction depends on "today", so a cached response would be wrong tomorrow.
export const dynamic = "force-dynamic";

const MAX_INPUT_CHARS = 60_000;

/**
 * Structured-output schema.
 *
 * Constraining the response shape at the API level means no parsing, no repair
 * prompts, and no defensive `typeof` checks downstream — the model is
 * physically unable to return a differently-shaped object.
 */
const SCHEMA = {
  type: "object",
  properties: {
    tracks: {
      type: "array",
      description: "Distinct workstreams, projects, or courses mentioned.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          code: { type: "string", description: "Short 2-6 char label." },
        },
        required: ["name", "code"],
        additionalProperties: false,
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          due: { type: "string", format: "date-time" },
          estimateMin: {
            type: "integer",
            description: "Realistic effort in minutes for a competent adult.",
          },
          type: {
            type: "string",
            enum: ["task", "writing", "project", "research", "milestone", "admin"],
          },
          weight: { type: "integer", enum: [1, 2, 3] },
          trackName: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
        },
        required: ["title", "due", "estimateMin", "type", "weight", "trackName", "notes"],
        additionalProperties: false,
      },
    },
  },
  required: ["tracks", "tasks"],
  additionalProperties: false,
} as const;

function systemPrompt(nowISO: string, tz: string): string {
  return [
    "You extract dated commitments from unstructured documents so they can be scheduled.",
    "",
    `The current date and time is ${nowISO} (${tz}). Resolve every relative date against it.`,
    "",
    "Rules:",
    "- Extract only items with a real deadline or a fixed date. Ignore background prose, policies, and contact details.",
    "- If a date has no time, use 17:00 local for deliverables and 09:00 for events.",
    "- If a year is absent, choose the interpretation that puts the date in the future.",
    "- estimateMin is your judgement of effort, not duration of an event. A 2-hour exam that needs revision is a milestone with a preparation estimate.",
    "- weight: 3 for graded, contractual, or externally-visible items; 1 for optional or trivial ones; 2 otherwise.",
    "- Group items under a track when the document implies a project, client, or course.",
    "- Deduplicate: the same deliverable mentioned twice is one task.",
    "- Return an empty tasks array rather than inventing items when the document contains no deadlines.",
  ].join("\n");
}

export async function POST(req: Request) {
  let text = "";
  let timezone = "UTC";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text : "";
    timezone = typeof body?.timezone === "string" ? body.timezone : "UTC";
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (!text.trim()) {
    return NextResponse.json({ error: "No text supplied." }, { status: 400 });
  }
  if (text.length > MAX_INPUT_CHARS) {
    text = text.slice(0, MAX_INPUT_CHARS);
  }

  const now = new Date();

  // No key configured — this is an expected state, not an error. The client
  // shows the same UI either way, just labelled differently.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      source: "heuristic" as const,
      reason: "no_api_key",
      tracks: [],
      tasks: heuristicExtract(text, now),
    });
  }

  try {
    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: systemPrompt(now.toISOString(), timezone),
      output_config: {
        // Extraction is a bounded, well-specified job — medium effort is the
        // right cost/quality point, and keeps the round trip short enough to
        // sit behind a spinner.
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Extract every dated commitment from the document below.\n\n<document>\n${text}\n</document>`,
        },
      ],
    });

    // Safety classifiers can decline; content is empty or partial when they do.
    if (response.stop_reason === "refusal") {
      return NextResponse.json({
        source: "heuristic" as const,
        reason: "refused",
        tracks: [],
        tasks: heuristicExtract(text, now),
      });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text block in response");
    }

    const parsed = JSON.parse(textBlock.text) as {
      tracks: Array<{ name: string; code: string }>;
      tasks: ExtractedTask[];
    };

    // The schema guarantees shape, not sanity — clamp values that would make
    // the scheduler behave oddly.
    const tasks = (parsed.tasks ?? [])
      .filter((t) => t.title && t.due && !Number.isNaN(Date.parse(t.due)))
      .map((t) => ({
        ...t,
        estimateMin: Math.min(60 * 40, Math.max(15, Math.round(t.estimateMin || 60))),
        weight: ([1, 2, 3] as const).includes(t.weight) ? t.weight : 2,
      }));

    return NextResponse.json({
      source: "ai" as const,
      tracks: parsed.tracks ?? [],
      tasks,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    });
  } catch (err) {
    // Degrade rather than fail. A slow or unavailable model must not turn
    // "paste a document" into a dead end.
    const reason =
      err instanceof Anthropic.RateLimitError
        ? "rate_limited"
        : err instanceof Anthropic.AuthenticationError
          ? "bad_key"
          : err instanceof Anthropic.APIError
            ? `api_error_${err.status}`
            : "unknown";

    console.error("[ingest] falling back to heuristic extraction:", reason, err);

    return NextResponse.json({
      source: "heuristic" as const,
      reason,
      tracks: [],
      tasks: heuristicExtract(text, now),
    });
  }
}

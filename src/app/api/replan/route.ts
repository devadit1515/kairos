import { NextResponse } from "next/server";
import { Render } from "@renderinc/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dispatch a re-plan to Render Workflows.
 *
 * The same planning runs client-side instantly, so this endpoint isn't how the
 * button in the UI works — it exists for the cases the browser can't cover:
 * scheduled sweeps, re-planning an account that isn't currently open in a tab,
 * and any run that needs the service-role key rather than a user session.
 *
 * `startTask` returns as soon as the run is created, so the caller gets a run
 * id immediately instead of holding a request open for the duration.
 */
export async function POST(req: Request) {
  const apiKey = process.env.RENDER_API_KEY;
  const slug = process.env.KAIROS_WORKFLOW_SLUG ?? "kairos-workflow";

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Workflow dispatch is not configured.",
        hint: "Set RENDER_API_KEY to enable server-side re-planning.",
      },
      { status: 501 },
    );
  }

  let userId: string | undefined;
  let sweep = false;
  try {
    const body = await req.json().catch(() => ({}));
    userId = typeof body?.userId === "string" ? body.userId : undefined;
    sweep = Boolean(body?.sweep);
  } catch {
    /* an empty body is valid — it means "sweep everything" */
  }

  if (!sweep && !userId) {
    return NextResponse.json(
      { error: "Provide either a userId or sweep: true." },
      { status: 400 },
    );
  }

  try {
    const client = new Render({ token: apiKey });

    const result = sweep
      ? await client.workflows.startTask(`${slug}/nightlySweep`, [])
      : await client.workflows.startTask(`${slug}/replanUser`, [userId!]);

    return NextResponse.json({
      dispatched: true,
      task: sweep ? "nightlySweep" : "replanUser",
      taskRunId: result.taskRunId,
    });
  } catch (err) {
    console.error("[replan] workflow dispatch failed:", err);
    return NextResponse.json(
      { error: "Could not reach Render Workflows." },
      { status: 502 },
    );
  }
}

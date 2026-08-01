# Deploying Kairos

Kairos is designed so each layer can be added independently. A deploy with no
environment variables at all is a working product — everything below is
additive.

---

## 1. Web service (Render)

The repository contains a `render.yaml` blueprint.

1. **New → Blueprint** in the Render dashboard, point it at this repo.
2. Render reads `render.yaml` and provisions a Node web service:
   - Build: `npm ci && npm run build`
   - Start: `npm run start`
   - Health check: `/`
3. Leave every `sync: false` variable blank for now. The app deploys and runs
   without them.

Next automatically binds to Render's `PORT`, so no port configuration is needed.

---

## 2. Cloud sync (Supabase) — optional

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the
   four tables, their indexes, the `updated_at` triggers, and — most
   importantly — the row-level security policies.
3. **Project Settings → API**, copy the URL and the `anon` key.
4. Set them on the Render web service:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> The `anon` key is public by design and safe in the browser bundle. It is only
> safe **because** RLS is enabled — every policy in the schema checks
> `auth.uid() = user_id` on both `using` and `with check`. Do not disable RLS
> to debug a query. The `service_role` key must never be set on the web
> service; it belongs only on the workflow below.

---

## 3. AI ingestion — optional

Set `ANTHROPIC_API_KEY` on the web service.

Without it, `POST /api/ingest` returns results from the deterministic parser in
`src/lib/extract.ts` and labels them as such in the UI. The endpoint never
returns an error for a missing key — a missing key is a configuration state,
not a failure.

---

## 4. Render Workflow — optional

Workflows aren't yet a blueprint resource type, so this one is created by hand.

1. **New → Workflow**, connect the same repository.
2. Configure:
   - **Root directory**: `workflow`
   - **Build command**: `npm ci && npm run build`
   - **Start command**: `npm start`
3. Set environment variables on the *workflow* service:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS; this is the only place it
     should ever exist.
4. Note the workflow slug (shown on its dashboard page). If it isn't
   `kairos-workflow`, set `KAIROS_WORKFLOW_SLUG` on the web service to match.

Three tasks are registered:

| Task | Purpose |
|---|---|
| `replanUser` | Recompute one account's schedule. Only unpinned auto blocks are touched. |
| `detectDrift` | Read-only capacity check — reports deadlines that became unreachable. |
| `nightlySweep` | Fans out `replanUser` across every account with open work, in parallel. |

Trigger them from the dashboard, on a schedule, or from the app by setting
`RENDER_API_KEY` on the web service and calling:

```bash
curl -X POST https://<your-app>.onrender.com/api/replan \
  -H 'Content-Type: application/json' \
  -d '{"sweep": true}'
```

The workflow imports the scheduling engine directly from `src/lib` — the same
pure functions the browser runs. There is one implementation of "is this
reachable?", which is why a plan generated at 3am agrees with the number shown
at 9am.

---

## Running locally

```bash
npm install
npm run dev
```

For the workflow:

```bash
cd workflow
npm install
npm run build
npm start          # requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

---

## Environment variable reference

| Variable | Service | Required | Without it |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | web | No | Ingestion uses the local parser |
| `NEXT_PUBLIC_SUPABASE_URL` | web | No | State stays in localStorage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | No | State stays in localStorage |
| `RENDER_API_KEY` | web | No | `/api/replan` returns 501 |
| `KAIROS_WORKFLOW_SLUG` | web | No | Defaults to `kairos-workflow` |
| `SUPABASE_URL` | workflow | Yes | Workflow can't start |
| `SUPABASE_SERVICE_ROLE_KEY` | workflow | Yes | Workflow can't start |

# Local Studio tiers (P03)

How to run Studio locally, from UI-only inspection to the full stack.
Env var **names** only below — never values. See also `/studio/setup` in the app.

## Tier table

| Tier | How to select it | What works | What stays `SETUP_REQUIRED` |
|---|---|---|---|
| `LOCAL_UI_ONLY` | Loopback lane: `NODE_ENV=development` + `ETHEN_STUDIO_LOCAL_AUTH_BYPASS=true` (see `studio-local.ts`) | Catalog (P01), projects/assets local lanes, identity reads, workflow graphs + canvas index (memory), every page renders | Every Supabase-backed route: collaboration, media, workbench, cinema, composites, realtime, audio, agent, gateway, policy, jobs truth |
| `LOCAL_FIXTURE_RUNTIME` | UI-only lane **plus** `STUDIO_LOCAL_RUNTIME=fixture` (and `ETHEN_STUDIO_ALLOW_PARTIAL=1` for PARTIAL-model execution) | Everything in UI-only, plus: create → History (quote → admit → drain → truth), review lifecycle (create/comment/decide/link/revoke), notifications read, exports claim/list, fixture cancel | Public review links (Supabase-only), downloads (no staged bytes; dependency `object-storage`), ingest (Supabase-only), P04/P05 surfaces until their jobs land |
| `LOCAL_FULL_STACK` | Real Supabase + Temporal + worker (below) | Everything, durably | Nothing (misconfig still reports `SETUP_REQUIRED`, never 500) |

Gate truth table (both required for memory stores): local request alone → Supabase path;
`STUDIO_LOCAL_RUNTIME=fixture` alone → Supabase path. Only both select the fixture lane
(`shouldUseFixtureStores` in `_lib/local-lane.ts`, covered by `tests/behavioral/studio-v5-p03.test.ts`).

## Tier 1 — UI-only (port 3015)

```sh
pnpm --filter @ethen/studio dev
```

Uses the app's existing local env (`ETHEN_STUDIO_LOCAL_AUTH_BYPASS=true`, dev only).
Every Supabase-backed route returns HTTP 503 `SETUP_REQUIRED` with
`details: { dependency }`, and every surface renders the shared setup state
(next action, "How to enable locally" link, no Retry).

## Tier 2 — fixture runtime (second server, port 3016)

Never reuse or restart the 3015 server — start a second one with inline env:

```sh
STUDIO_LOCAL_RUNTIME=fixture ETHEN_STUDIO_ALLOW_PARTIAL=1 pnpm --filter @ethen/studio exec next dev -p 3016 -H 127.0.0.1
```

Notes:

- `STUDIO_LOCAL_RUNTIME=fixture` selects the lane; `ETHEN_STUDIO_ALLOW_PARTIAL=1`
  lets PARTIAL-qualification models execute (without it, admission closes with an
  honest `PROVIDER_UNAVAILABLE`, and create → History cannot complete).
- Job, collaboration, and media state is process-local memory (`localStores()` on
  `globalThis`, survives dev HMR). Restarting the server wipes it; that is expected.
- Test hooks (never product paths): `resetLocalStores()`, `resetFixtureLane()`,
  `resetMemoryIdentityRepository()`.

## Tier 3 — full stack (needs Docker)

1. `supabase start` — applies all migrations, including the 35 `*studio*` ones.
2. Seed one synthetic tenant + project + membership:
   `psql` the file `supabase/seed/studio_local_project.sql` against local Supabase
   (service role; DB URL from `supabase status`). Re-apply after `supabase db reset`.
3. `temporal server start-dev` — local orchestrator.
4. `pnpm --filter @ethen/studio-worker dev` — the Studio worker.
5. Run the app with the Supabase/Temporal env set (names: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TEMPORAL_ADDRESS`,
   `TEMPORAL_NAMESPACE`, `STUDIO_WORKFLOW_QUEUE`, `STUDIO_ACTIVITY_QUEUE`).

When Docker is unavailable this tier is `ENV_BLOCKED` — use tier 1 or 2 instead.

## Verification

- Unit + lane suite: `node node_modules/vitest/vitest.mjs run tests/behavioral/studio-v5-p03.test.ts`
  (gate, registry, 503 mapping per family, review lifecycle, exports, History,
  setup UI, empty-state actions). Pre-existing baseline: 5 `m4-temporal` failures —
  report, do not fix.
- UI-only tier: every family route returns 503 with `details.dependency`
  (`collaboration/reviews`, `media/exports`, `workbench/timelines`,
  `workbench/cinema/sequences`, `composites/templates`, `realtime/sessions`,
  `audio/projects`, `agent/runs`, `workflows/runs/[runId]`, `gateway/keys`,
  `policy/decide`, `jobs`, `economics/estimate`); local lanes (`catalog`,
  `assets`, `projects`, `identities`, `workflows/graphs`) keep working; zero 500s.
- Fixture tier: create an asset → share for review → comment → decide → link →
  revoke; claim an export; submit a job and read it back in History.
- Browser: rerun `artifacts/studio-functional-audit/evidence/functional-probe.mjs`
  (copy it, point at the tier base URL, save JSON + shots under
  `artifacts/studio-functional-repair/p03/`).

## Troubleshooting

- A 500 with "not configured" in the message means a mapper missed the setup check —
  every V1 catch must call `setupRequiredResponse` first (the suite asserts one
  route per family; the full sweep covers all 89 route files).
- Fixture lane not engaging: both gates are required — loopback host
  (`localhost`/`127.0.0.1`/`::1`) **and** `STUDIO_LOCAL_RUNTIME=fixture`.
- Admission closes on the fixture tier: set `ETHEN_STUDIO_ALLOW_PARTIAL=1`
  (PARTIAL qualification gates execution).
- `details.dependency` values: `supabase`, `object-storage`, `temporal`,
  `worker`, `catalog`. The UI maps these to labels and never shows raw text.

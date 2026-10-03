# Studio migration manifest (for MUSE-009 production apply)

Owner: Studio namespace (`studio_v5_*`). Source of truth for file bytes:
monolith `/Users/sha/Documents/ethen/ethen/supabase/migrations/`
(read-only here; rehearsed by MUSE-004, applied by MUSE-009).

```text
MIGRATION_FILES=19
TABLES_CREATED=95
FUNCTIONS_CREATED=101 (1 intentional replace: studio_v5_record_operation, j05 -> m4)
POLICIES_TOP_LEVEL=55 (+ loop-generated member policies; see per-file notes)
INDEXES_CREATED=94
TRIGGERS_CREATED=33
VIEWS_CREATED=5 (all CREATE OR REPLACE compat views)
SYNTAX_LIBPG_QUERY=19/19 PASS
REPLAY_SAFE_FILES=14/19 (5 files hold 49 non-idempotent CREATE POLICY statements; see below)
```

## Ordered file list (apply in this order; order is enforced by in-file prereq gates)

| # | File (monolith `supabase/migrations/`) | SHA-256 | Creates (tables / functions / policies) | Replay |
|---|---|---|---|---|
| 1 | 20260921080000_studio_v5_j02_data.sql | `c9e073b7f0431e86d5a74b580d5487e91b7faec4a0e2283048fe2eacdc546135` | 5 / 6 / 20 loop (drop-first) | SAFE |
| 2 | 20260921140000_studio_v5_j03_policy.sql | `d6f852b6e7e77b4013e4b614d08d2d06ce5a864f3219ae3805b1eaa280229f08` | 6 / 8 / loop (drop-first) | SAFE |
| 3 | 20260921180000_studio_v5_j04_economics.sql | `dbc0e0d8c115155d8bb4a51b6730094ad80e211398e13a9ded74d139e8049e54` | 10 / 12 / 16 loop + 1 | **16 NON-IDEMPOTENT** |
| 4 | 20260921220000_studio_v5_j05_runtime.sql | `41477cc268464d07f24e9c1d274d173ba1571f20c4e0a40c5343343d5b16a252` | 8 / 21 / 16 loop + 1 | **17 NON-IDEMPOTENT** |
| 5 | 20260921230000_studio_v5_j06_catalog.sql | `c628f96a083057724284d5dd260cb9c6c929cc0398d1bd2fc7077505600a4c26` | 6 / 7 / 7 | **7 NON-IDEMPOTENT** |
| 6 | 20260922010000_studio_v5_j07_media.sql | `33eabe4022d5f0790132fe84065f14a0dccc63ebc7b93b2d37abbac2b12cbc96` | 5 / 9 / 8 | **8 NON-IDEMPOTENT** |
| 7 | 20260922090000_studio_v5_j10_identity.sql | `ba216925303c62b851c6af85b877b6f4e6a4942574a614e7c1b7db754ec40c5c` | 8 / 3 / 32 (drop-first loop) | SAFE |
| 8 | 20260922100000_studio_v5_j11_audio.sql | `93025c9764f259be6ee8b9db7fbb201e607f0254642d2b3476cefd7c7e64ece0` | 5 / 3 / 5 (paired drops) | SAFE |
| 9 | 20260922110000_studio_v5_j12_canvas.sql | `a8fa13108d42671390a3d4ad9c87062e9db7b4801d152d31f4fc5ec5679165e6` | 4 / 3 / loop (drop-first) | SAFE |
| 10 | 20260922120000_studio_v5_j13_runs.sql | `0f1530e83ede6def852f212d8876a1c1aeabdb4effd641cee84f356b8d5d5e0b` | 4 / 3 / loop (drop-first) + 1 view | SAFE |
| 11 | 20260922130000_studio_v5_j14_timeline.sql | `598431d78917cb0cee4792d8e05f434a346ae959c8935996bfb31690f4e9f8e4` | 6 / 3 / loop (drop-first) + 1 view | SAFE |
| 12 | 20260922140000_studio_v5_j15_composites.sql | `1ff847161cc3538000b1012fed3919d8533ee38e32b58bcc4e04a708b7a030d4` | 4 / 3 / loop (drop-first) + 1 view | SAFE |
| 13 | 20260922150000_studio_v5_j16_realtime.sql | `3956d0e9a1f0903de14144d87eb201f68029e29edb21420adf9848e89d552613` | 6 / 4 / loop (drop-first) + 1 view | SAFE |
| 14 | 20260922160000_studio_v5_j17_agent.sql | `9b94bae675219d692ae5c8994a47a61fb6c3a761b53b8204ac2bd65895e4ac14` | 5 / 5 / loop (drop-first) + 1 view | SAFE |
| 15 | 20260922170000_studio_v5_j18_collaboration.sql | `f522052d984d004aee2ab87f8cedb021f909053ef53c6732042889ceeee8ca59` | 5 / 3 / loop (drop-first) | SAFE |
| 16 | 20260922180000_studio_v5_j19_gateway.sql | `6aa2d5051134c1639827e359708bc4a7b6f646d92d1aee3799076a5cc79091e9` | 6 / 6 / 0 (fail-closed by design) | SAFE |
| 17 | 20260923120000_studio_v5_m2_catalog.sql | `9af233bb49987037fa0e0efc326b95902d95f058049b203d93a914016adc41c2` | 1 / 0 / 1 | **1 NON-IDEMPOTENT** |
| 18 | 20260923130000_studio_v5_provider_operations.sql | `a8d53cdd0a8f0a24bd436a0fa720a2f6fa6d4266e2f7825ba1f4aab29b11393b` | 1 / 1 / 0 | SAFE |
| 19 | 20260923140000_studio_v5_m4_record_operation_merge.sql | `47de676e8b952683316e2c58b5bc3c3b55559fc660ac7feb3fca1a36726e870b` | 0 / 1 / 0 | SAFE |

Verify bytes before applying: `sha256sum <file>` must match the table.

## Non-idempotent statements (replay fails; first apply succeeds)

49 `CREATE POLICY` statements across 5 files have no `DROP POLICY IF
EXISTS` guard. A second apply of any of these files aborts with
`policy already exists`. Everything else (tables, functions, indexes,
triggers, views, backfills, grants, comments) is replay-safe.

- j04: 16 loop policies (`studio_v5_{quotes,reservations,receipts,legacy_economics_map}_member_{select,insert,update,delete}`)
- j05: 16 loop policies (`studio_v5_{jobs,attempts,generations,job_events}_member_{select,insert,update,delete}`) + `studio_v5_legacy_job_map_read`
- j06: `studio_v5_endpoints_read`, `studio_v5_endpoint_attestations_read`, `studio_v5_endpoint_aliases_read`, `studio_v5_catalog_preferences_member_{select,insert,update,delete}`
- j07: `studio_v5_media_processes_member_{select,insert,update}`, `studio_v5_media_proxies_member_select`, `studio_v5_media_exports_member_{select,insert}`, `studio_v5_media_transcripts_member_select`, `studio_v5_media_unavailable_member_select`
- m2: `studio_v5_catalog_syncs_read`

Safe retry procedure (MUSE-009): if a file aborts partway, either
restore the pre-apply snapshot and re-apply once, or drop exactly the
listed policies on the affected tables (`DROP POLICY IF EXISTS ...`)
and re-apply the file. Do NOT edit the applied files; a permanent fix
belongs in a new forward migration owned by the Studio namespace.

## Dependencies on non-Studio objects (must exist in prod first)

Hard prereqs (migrations raise before doing anything when absent):

```text
public.projects(id, owner_user_id, tenant_id, name)   -- FK target + tenant authority
public.tenants(id)                                    -- FK target
public.project_members(project_id, user_id)           -- j18/j19 prereq; read by is_project_member
public.is_project_member(uuid)                        -- RLS policy function (from 0036_eval_project_tenancy_rls.sql)
roles authenticated, service_role                     -- GRANT targets
extension pgcrypto                                    -- gen_random_uuid() (IF NOT EXISTS)
```

Hard legacy-table prereqs (backfill sources; must exist, may be empty):

```text
j12: public.studio_workflows
j13: public.studio_workflow_runs
j14: public.studio_sequences, studio_scenes, studio_shots, studio_takes
j15: public.studio_campaigns, studio_briefs, studio_deliverables
j16: public.voice_realtime_sessions, voice_realtime_events
j17: public.studio_director_plans, studio_director_tasks
j18: public.studio_review_links
j19: public.gateway_api_keys
```

Soft (guarded) legacy reads — skipped when absent:
`studio_assets`, `studio_asset_links`, `voice_consents`,
`voice_usage_reservations`, `durable_jobs`, `voice_created_voices`,
`voice_dubbing_jobs`.

Cross-namespace notes for MUSE-009:

- `code_outbox` (20260924122000/20260925040000) only mirrors
  `studio_v5_dispatch_outbox` lease semantics in comments; no DDL
  dependency either way.
- `studio_v5_ensure_default_project()` inserts into `public.projects`
  at RUNTIME (not at apply time) when converging a default project.
- Backfills run at apply time (`perform studio_v5_j*_backfill()`)
  and are resumable (legacy-map PK skips + `ON CONFLICT DO NOTHING`;
  j13 is validation-only). They write only `studio_v5_*` tables.

## RLS posture

- Every `studio_v5_*` table enables RLS.
- Member tables: `*_member_{select,insert,update,delete}` policies via
  `public.is_project_member(project_id)`; grants to
  `authenticated, service_role`.
- Global catalog tables (`studio_v5_endpoints`,
  `studio_v5_endpoint_attestations`, `studio_v5_endpoint_aliases`,
  `studio_v5_price_configs`, `studio_v5_catalog_syncs`): read-only
  policies for authenticated.
- j19 gateway tables (`api_keys`, `byok_references`,
  `webhook_subscriptions`, `webhook_deliveries`,
  `gateway_idempotency`, `legacy_key_map`): RLS enabled with ZERO
  policies by design — fail-closed, service role only.

## Expected post-apply catalog checks (MUSE-009)

```sql
-- 1. Object census: only intended studio_v5_* objects exist.
select count(*) from pg_tables where schemaname = 'public' and tablename like 'studio_v5\_%';
-- 2. RLS everywhere (must return zero rows).
select relname from pg_class where relnamespace = 'public'::regnamespace
  and relkind = 'r' and relname like 'studio_v5\_%' and relrowsecurity = false;
-- 3. Key functions present.
select proname from pg_proc where proname in (
  'studio_v5_record_operation', 'studio_v5_worker_beat',
  'studio_v5_ensure_default_project', 'studio_v5_allocate_hold',
  'studio_v5_j02_backfill', 'validate_studio_v5_j02_scope');
-- 4. Backfill diagnostics (mapped counts vs quarantined/conflicts).
select * from public.studio_v5_j02_backfill();
-- 5. Compat views resolve.
select count(*) from public.studio_v5_workflow_runs_compat;
```

## Rehearsal record

- Method: static rehearsal — full-file parse with the real PostgreSQL
  grammar (libpg_query), 726-statement idempotency audit, prereq and
  legacy-dependency extraction. See
  `artifacts/studio-closure/migration-rehearsal/rehearsal.log`.
- Live PG17 apply was sandbox-blocked in this environment (no Docker;
  the sandbox denies SysV shared memory and loopback listeners, and
  unsandboxed execution needs a human approval that is unavailable).
  MUSE-009 must run the live apply + idempotent re-run on disposable
  PG17 before production; `seed.sql` + `apply.sh` in the rehearsal
  directory reproduce the intended setup.
- Studio Tier-3 tests: no Tier-3 suite exists in this repo (`tests/`
  holds only `baseline.head.json`; the behavioral suite named in
  `docs/LOCAL_STUDIO_TIERS.md` is absent), so there was nothing to run
  against the rehearsal schema.

# Production authority

Last updated: 2026-09-25 (S4B — production LIVE).

```text
PRODUCTION_DOMAIN=studio.upcube.ai
PRODUCTION_PROVIDER=Vercel
VERCEL_ACCOUNT_OR_TEAM=shadabchow-1091s-projects
VERCEL_PROJECT=ethen-studio
VERCEL_PROJECT_ID=prj_AAknemmdyqxQuYzMsO8l6HpLY73O
PRODUCTION_SOURCE_REPO=shadabchow-ui/ethen-studio
PRODUCTION_DEPLOYMENT_BRANCH=main (productionBranch)
DOMAIN_AUTHORITY=PASS (owner-authorized + DNS-verified CNAME)
TLS=PASS
PREVIOUS_PRODUCTION=NONE (first production)
```

## Standalone independence (proven)

```text
MONOREPO_REQUIRED_FOR_INSTALL=NO
MONOREPO_REQUIRED_FOR_BUILD=NO
MONOREPO_REQUIRED_FOR_DEPLOY=NO
OUTSIDE_REPO_IMPORTS=0
OUTSIDE_REPO_SYMLINKS=0
ABSOLUTE_LOCAL_PATH_DEPENDENCIES=0
```

## Rollback

First production has no predecessor. Rollback target after cutover is the
previous READY deployment on project `ethen-studio`. Rollback on P0/P1
regression, auth failure, Studio load failure, catalog failure, Create
failure, Assets/History regression, Canvas/Workflow regression, critical
API failure, asset failure, 5xx loop, or major parity regression.

## Enrollment (operator-managed)

Private alpha is fail-closed: empty `ETHEN_STUDIO_ENROLLED_ORG_IDS` /
`ETHEN_STUDIO_ENROLLED_USER_IDS` admit nobody. The operator enrolls Clerk
org/user IDs via project env after first sign-in, then redeploys. No user
IDs are hardcoded in code.

Legacy monorepo source `apps/studio` is FROZEN (see `FROZEN.md` there).
Never deploy Studio from the monorepo.

## Release plan — MUSE-004 closure promotion (MUSE-016, PREP ONLY)

Status: NOT RELEASED. This section is a runbook prepared 2026-10-03 while
`MUSE-009 step 1` (Studio prod schema) is UNAPPLIED and `OWNER-A02` /
`OWNER-A11` are PENDING. Do NOT merge or promote until every gate in §P0
holds. `PRODUCTION_CHANGED=NO`.

### Recorded state (2026-10-03)

```text
ROLLBACK_CANDIDATE_ID=dpl_5ahED5MVaVDvmHqe9HaqjK5r1o4Q
ROLLBACK_CANDIDATE_URL=https://ethen-studio-dswi94cee-shadabchow-1091s-projects.vercel.app
ROLLBACK_TARGET=production (Ready, created 2026-09-25, serves studio.upcube.ai)
MUSE004_PREVIEW_URL=https://ethen-studio-j60mgb9i9-shadabchow-1091s-projects.vercel.app
MUSE004_PREVIEW_ID=dpl_41xXHvkK6s9J5nHMqLzUfhrQn1z8 (Ready, auto-built from muse-004/studio-closure)
MERGE_REHEARSAL=CLEAN (2026-10-03, scratch worktree, main@362d74b + muse-004/studio-closure@5c245d7: 40 files, 0 conflicts; nothing pushed to main)
```

Re-verify the rollback candidate immediately before promotion (the Vercel
CLI is flaky inside sandboxes; run on a credentialed host):

```sh
vercel ls ethen-studio --scope shadabchow-1091s-projects
vercel inspect <production-url> --scope shadabchow-1091s-projects
```

### P0 — promotion gates (ALL must hold)

1. `MUSE-009 step 1` APPLIED to ethen-production (19 `studio_v5_*` files
   per `platform/docs/db/receipts/MUSE-009_RELEASE_PLAN.md`; post-census
   diff limited to `studio_v5_*`; public templates endpoint returns 200).
   Merging before this deploys code against an incompatible schema.
2. `OWNER-A11` DONE (Vercel promotion approval).
3. `OWNER-A02` DONE (Clerk Google sign-in fixed + controlled test identity
   available for signed-in smoke).
4. Enrollment decision recorded below (§P4).
5. `LOCK_STUDIO_MERGE` free, then held by the releasing job for the merge.

### P1 — merge to main

```sh
git fetch origin --prune
# re-run the rehearsal: merge-tree must show 0 conflict markers
git merge-tree $(git merge-base main origin/muse-004/studio-closure) main origin/muse-004/studio-closure | grep -c '^<<<<<<<'
git checkout main && git merge --no-ff origin/muse-004/studio-closure
git push origin main   # main = production deploy; triggers Vercel
```

If the merge conflicts (rehearsal was clean at 5c245d7): STOP, resolve in
a scratch worktree, re-run typecheck/test/build, re-certify.

### P2 — preview smoke checklist (signed-in session, 375/768/1440)

Run against the merge preview deployment BEFORE production traffic sees
it. `CONSOLE_ERRORS=0` on every route; any P0/P1 → rollback (§P5) + STOP.

Public entry:

- [ ] `/` loads, no placeholder media, no console errors (375/768/1440)
- [ ] `/sign-in` → Clerk Google sign-in succeeds (OWNER-A02 identity)

Catalog and discovery (signed in):

- [ ] `/studio/models` catalog renders; family count matches
      `artifacts/studio-closure/catalog-coverage.json`
- [ ] Model detail opens (pick one text-to-image family); license/openness
      badges render; compare tray works
- [ ] Favorites/recents add + persist across reload

Creation — low-cost image job + cancel:

- [ ] `/studio/image` (or `/studio/create/<tool>`) create form renders
- [ ] Submit ONE image job with the current cheapest text-to-image model
      (operator: pick from catalog, record model id + cost below)
- [ ] Job appears in `/studio/jobs` (and `/studio/work/jobs`) as queued/running
- [ ] CANCEL the job; status flips to cancelled; no orphan spend
      (record job id + cancelled status below)

Library and workbench:

- [ ] `/studio/assets` (+ `/studio/work/assets`) loads; upload/delete round-trip
- [ ] `/studio/work/notifications`, `/studio/work/reviews` load
- [ ] `/studio/canvas` loads; save/reopen round-trip
- [ ] `/studio/templates` loads (public templates endpoint 200 — also the
      MUSE-009 step-1 post-apply signal)
- [ ] `/studio/workflows` + one `/studio/workflows/[graphId]` load
- [ ] `/studio/voices` + `/studio/voice-agents` load; clone/bindings/
      sessions/revoke return honest 503 (never 500) without backends
- [ ] `/studio/audio`, `/studio/video`, `/studio/exports`, `/studio/archive` load
- [ ] `/studio/projects` + one `/studio/projects/[projectId]` load
- [ ] `/studio/settings` loads; usage/account/billing tabs render
- [ ] `/studio/setup` gateway-auth copy reads "Studio Media API"

Record: `SMOKE_MODEL_ID=`, `SMOKE_JOB_ID=`, `SMOKE_CANCELLED=YES`,
`CONSOLE_ERRORS=`, `P0_BLOCKERS=`, `P1_BLOCKERS=`.

### P3 — promote + 30-minute 5xx watch

1. Promote the certified preview to production (Vercel dashboard or
   `vercel promote`, per OWNER-A11 terms).
2. Repeat the full P2 checklist on `https://studio.upcube.ai`.
3. 30-minute watch: `5XX(30min)=0` on critical routes
   (`/`, `/sign-in`, `/studio/*`, `/api/studio/v1/*`).
   Watch command (credentialed host, Vercel logs for project
   `ethen-studio`); any 5xx on a critical route → rollback (§P5) + STOP.
4. Record the new production deployment id below as
   `NEW_PRODUCTION_ID`; the previous `ROLLBACK_CANDIDATE_ID` stays the
   rollback target until the watch passes.

### P4 — enrollment decision (owner)

```text
ENROLLMENT_DECISION=<PRIVATE_ALPHA | PUBLIC_ALPHA>
DECIDED_BY=
DATE=
PRIVATE_ALPHA_ORG_IDS=<operator sets ETHEN_STUDIO_ENROLLED_ORG_IDS, redeploys>
PRIVATE_ALPHA_USER_IDS=<operator sets ETHEN_STUDIO_ENROLLED_USER_IDS, redeploys>
PUBLIC_ALPHA_NOTE=<fail-closed default lifted only by explicit owner record here>
```

Fail-closed default stands: empty enrolled lists admit nobody. Env-only
change (`ETHEN_STUDIO_ENROLLED_*`); no code edit; no user IDs in code.

### P5 — rollback

On preview/prod smoke failure or 5xx during the watch:

```sh
vercel rollback dpl_5ahED5MVaVDvmHqe9HaqjK5r1o4Q --scope shadabchow-1091s-projects
# then re-run P2 core routes (/, /sign-in, /studio/models, /studio/jobs) and STOP
```

(Re-verify the id — it is the 2026-10-03 candidate; if production moved
since, roll back to the then-current previous READY production.)

### Launch certification record (template — fill at release)

```text
STUDIO_PROD_SERVICE_PATHS=
5XX(30min)=
CONSOLE_ERRORS=
ROLLBACK_REFERENCE=
LAUNCH_RECORD=WRITTEN
P0_BLOCKERS=
P1_BLOCKERS=
UNRELATED_DIRTY_DELTA=
```

## OPUS-FINAL-004 continuation — 2026-10-04

Production remains on main@362d74bac728e5382a66affd4caaa7872b908aa7.
Candidate branch: final-004/release. No merge or production promotion performed.
Private-alpha enrollment policy remains fail-closed.

The candidate preserves closure/hygiene/portfolio inputs, restores favorites,
recents and project-availability comparison to the V5 model browser, and lazily
loads checked-in provenance, license, pricing evidence and limits through the
existing authenticated endpoint-detail route. Catalog metadata never grants
execution. Current execution availability still comes from the project catalog;
current quotes remain required. The full generated registry stays server-side.
The loopback fixture detail lane returns metadata and no execution attestations.

Voice Agents placeholder contrast and current V5 sidebar asset/mobile contracts
were repaired. Final test, browser and source-SHA receipts are in the program
pack at opus-final-polish-pack/evidence/OPUS-FINAL-004; consume its result for
phase status. Earlier source-only and fixture evidence is not live certification.

Remaining release gates: OPUS-FINAL-002 Studio staging consumer certification
and STUDIO_PROD receipt; OA-05 promotion policy; authenticated preview generation,
cancel, persistence and consent deny/revoke; real provider/voice substrate.
The S1 staging receipt is APPLIED_NOT_CONSUMER_CERTIFIED. Tier-3 suite is absent;
real DB consumer substitution is NOT_RUN and remains owned by 002/004.

Rollback candidate re-observed during this run: dpl_5ahED5MVaVDvmHqe9HaqjK5r1o4Q
(READY production, main@362d74b). Re-query immediately before any future promotion.
Studio and Studio Voice launch status: NOT LIVE_CERTIFIED. Marketing job 008
may use fixture screenshots as fixture evidence only; real-capture readiness
requires authenticated preview certification and a matching release receipt.

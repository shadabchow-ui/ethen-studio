# Standalone certification (S2, Phases 12-13)

## Route census (static — all required surfaces present)

56 pages + 93 API routes. Required Phase-12 surfaces, all present as files:

```text
/studio, /studio/explore, /studio/models, /studio/apps, /studio/workflows,
/studio/workflows/[graphId], /studio/create/[tool], /studio/pro/[tool],
/studio/agent, /studio/work/{projects,assets,jobs,reviews},
/studio/projects/[projectId], /studio/marketing, /studio/influencer,
/studio/voice-agents, /studio/voices, /studio/cinema, /studio/canvas,
/studio/templates, /studio/settings, /studio/setup (+ legacy redirects
in next.config.ts; StudioModelSwitcher component present)
```

## Compile status per route (from typecheck + build)

- Root `app/layout.tsx` imports the HEAD-absent
  `@ethen/app-shell/instant-rum/next` and `@ethen/contracts/rum/route-identity`:
  all page renders fail until the missing HEAD modules are committed
  (identical in the monorepo at HEAD — inherited, not a regression).
- API routes: 92/93 compile clean; only `app/api/settings/route.ts`
  imports a HEAD-absent module (`@ethen/database/user-settings`).
- `proxy.ts` compiles clean; verified behaviorally (below).

## Functional proof (no-TCP sandbox — methods noted honestly)

Live HTTP serving was environment-blocked (`listen EPERM` on TCP and
unix sockets alike; escalated execution unavailable — approval prompts
disabled; same block as P08). The following ran instead, all with real
product code:

1. **P07 chain: PASS** (in-process, Tier-2 env, loopback host context):
   `fixture job admit -> drainScope -> COMPLETED -> normalized ingest
   outputs -> stageFixtureJobAssets -> canonical createAssetWithVersion ->
   project-scoped Assets -> History source -> reload stable -> replay
   idempotent` — 14/14 checks PASS, and PASS identically on the HEAD
   snapshot tree (parity). Only the Next request-context host header was
   simulated (exactly what `next dev` provides on loopback); every
   function under test is unmodified product code.
2. **Proxy gate: PASS** — `runStudioProxy` in-process: dev-bypass mode
   passes workbench page+API and public routes (200s); enforce mode
   returns 401 html (page) / 401 json (API) for workbench while public
   health/review/sign-in stay 200. Matches the documented contract.
3. **Catalog: PASS** — projector regenerates byte-identical JSON
   (491 records, 1499 endpoints); local catalog root resolution verified
   standalone; generated search index loads.
4. **Unit suites: 22/27 PASS, NEW_TEST_FAILURES=0** with signature-identical
   inherited failures (see INDEPENDENCE_REPORT.md).

```text
LIVE_HTTP_PROBE=BLOCKED_ENVIRONMENT (bind EPERM; no escalation path)
P07_CHAIN=PASS (in-process, parity vs HEAD)
CRITICAL_FUNCTIONAL_SMOKE=PARTIAL (API+chain+proxy proven; page renders
  blocked by HEAD-absent layout modules, identical at HEAD)
```

## Responsive / browser proof (Phase 13)

```text
BROWSER_PROOF=BLOCKED_ENVIRONMENT (no TCP bind for any server; Playwright
  cannot reach a serverless target)
```

Chromium (Playwright 1.61, Chrome-for-Testing 149) was installed and the
characterization probe plus the scroll-regression suite are ready to run
wherever binding is permitted; no browser verdict is claimed here
(never faked). Page renders additionally require the missing HEAD layout
modules (see promotion blocker), so even with binding, browser proof
must wait for that fix.

## Certification verdict

```text
STANDALONE_INSTALL=PASS
TYPECHECK=NO_REGRESSION_PRE_EXISTING_FAILURES (84 inherited, 0 new)
TESTS=NO_REGRESSION (22/27, 0 new failures, 5 signature-identical inherited)
BUILD=NO_REGRESSION (fails identically to HEAD: 5 missing modules)
P07_CHAIN=PASS (parity vs HEAD)
NO_P0_P1_MIGRATION_REGRESSIONS=YES
```

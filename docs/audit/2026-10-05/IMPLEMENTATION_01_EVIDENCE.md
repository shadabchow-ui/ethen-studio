# Implementation 01 — Evidence

Branch: `muse/studio-impl-01`. One commit per RC (13/13). No secret values.

## 1. Commands + exit codes

All run on Node v22.23.2 / pnpm 11.5.3, final state of the branch:

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck` | 0 | `tsc --noEmit` clean |
| `pnpm test` | 0 | 45/45 studio suites passed |
| `pnpm test:parity` | 0 | `NEW_TEST_FAILURES=0 FIXED_SINCE_HEAD=7` |
| `pnpm build` | 0 | `next build --webpack` succeeds |
| `pnpm check:shared-drift` | 0 | `SHARED_DRIFT=PASS` |
| `pnpm check:portfolio-pin` | 0 | `PORTFOLIO_PIN=PASS` |
| `pnpm catalog:project` | 0 | deterministic, no drift (see §3) |

New suites, each green standalone via
`node --conditions=react-server --import tsx`:

| Suite | Tests |
|---|---|
| studio-identity-state | RC1 matrix |
| studio-access-gate | RC4 resolver + consumers |
| studio-async-data | RC3 status + gating |
| studio-settings-contract | RC2 API table + sign-out |
| studio-route-authority | RC5 hrefs/redirects/aliases |
| studio-catalog-pipeline | RC6 14/14 |
| studio-search | RC7 4/4 |
| studio-library-frame | RC8 4/4 |
| studio-url-state | RC9 6/6 |
| studio-settings-primitives | RC10 10/10 |
| studio-navigation-payload | RC11 8/8 |
| studio-showcase-viewer | RC12 10/10 |
| studio-a11y | RC13 7/7 |

`__tests__/studio-v5-presentation.test.ts` (baseline) updated, still passing.

## 2. Commits (main..HEAD)

- `3dedb70` RC1 identity state contract
- `cb4f71d` RC4 shared access gate
- `1875851` RC3 explicit fetch states
- `414864f` RC2 settings API contract + sign-out
- `92fad36` RC5 route authority
- `9906d85` RC6 catalog pipeline
- `61aa5ca` RC7 Studio search
- `9fab841` RC8 LibraryFrame
- `c6012b4` RC9 URL/state contracts
- `d075fdc` RC10 settings primitives & copy
- `55d59cb` RC11 navigation feedback & payload
- `533f9ed` RC12 showcase data & viewer
- `ec616dd` RC13 rail names + dialog focus

No attribution trailer is configured in this repo (no commit
template, no trailer policy found), so none was added.

## 3. Catalog before/after (RC6)

Measured from `lib/media/generated/fal-catalog.json` (492 records,
1500 endpoints) plus the RC6 commit record:

| Metric | Before | After |
|---|---|---|
| Endpoints task=unknown | 586 (39.1%) | 6 (0.4%, ceiling 3%) |
| Families touched by unknown | 292 | 4 |
| All-unknown families | 190 | 2 |
| Reclassified endpoints | — | 1017 |
| Missing snapshots | — | 0 (counted, logged) |
| Candidates | 159 | 1372 |
| Executable | 0 | 0 (no owner attestations) |
| `/api/studio/v1/catalog` bytes | 1287359 | 1280173 |
| Endpoints with parameters | dev-only, untraced dynamic reads | 1487/1487 embedded, prod = dev |
| Filter labels | raw TaskName slugs | human TASK_LABELS; unknown hidden |

## 4. Navigation before/after (RC11)

Measured with real registry + projection code
(`/tmp/rc11-measure.mjs`, kept as scratch, not committed):

| Metric | Before | After |
|---|---|---|
| Home footer transfer | 1280173 B (full catalog) | 173 B (`?view=summary`) |
| Footer tallies | 492 / 1500 / 0 | identical from either response |
| Parse CPU per mount (Node median) | 2.38 ms | 0.001 ms |
| Anonymous Home→Models→Explore→Home | 5 × 1.28 MB (~6.4 MB) | 1.28 MB + 173 B |
| Catalog fetches per scope/session | 1 per page mount | 1 (cache + in-flight dedupe) |
| Sibling-navigation feedback | none | instant skeleton + per-link hint |

Live click→content browser timings: NOT_MEASURED here. The
sandbox denies `listen()`, and unsandboxed approval is disabled,
so no local server could run. A ready-to-run Playwright script is
left at `/tmp/rc11-browser-timings.mjs` (before tree kept at
`/tmp/rc11-before`, ports 3101/3102). No latency claims are made
beyond the table above.

## 5. Responsive

| Width | Result |
|---|---|
| 1440 | NOT_TESTED (no browser; sandbox blocks servers) |
| 1024 | NOT_TESTED |
| 768 | NOT_TESTED |
| 430 | NOT_TESTED |
| 375 | NOT_TESTED |

No horizontal-overflow, drawer, focus-visibility, console-error,
or failed-request sweep was possible. Screenshots: none captured.

## 6. Per-finding disposition

FIXED = code change + automated test pinning the mechanism.
FIXED_NEEDS_RUNTIME_PROOF = mechanism tested; the visible symptom
needs a live browser/authed session (blocked here, see §8).

### Muse findings (59)

| ID | RC | Disposition | Evidence |
|---|---|---|---|
| P0-001 | RC1 | FIXED_NEEDS_RUNTIME_PROOF | Pending UI replaces no-op Sign in; hook tested; needs Clerk session to observe |
| P1-001 | RC5 | FIXED | /upgrade → billing settings; redirect tested |
| P1-002 | RC2+RC3 | FIXED | Danger zone gated on signed_in; tested |
| P2-001 | RC6 | FIXED | Unknown 586→6; classifier + ceiling tested |
| P2-002 | RC6 | FIXED | TASK_LABELS exhaustive; filter tested |
| P2-003 | RC7 | FIXED | Studio index; voice/flux/templates/billing tested |
| P2-004 | RC8 | FIXED | Roving tabs; keyboard tested |
| P2-005 | RC1+RC4 | FIXED | Shared gate precedes mutations; resolver tested |
| P2-006 | RC11 | FIXED | Skeleton + hints + cache; audit's 3–5 s magnitude itself not reproduced |
| P2-007 | RC3 | FIXED | status split; rail/footer/consumers tested |
| P2-008 | RC9 | FIXED | ?remix= resolution + chip; round-trip tested |
| P2-009 | RC12 | FIXED | video-19 out of Images; id/workflow kept; tested |
| P2-010 | RC8 | FIXED | Toggle gated; Apps/Templates tables; tested |
| P2-011 | RC5 | FIXED | Sitemap retargeted; legacy-href test |
| P2-012 | RC5 | FIXED | Pro titles from registry; tested |
| P2-013 | RC4 | FIXED | Gate explains + acts in CloneDesignForms; tested |
| P2-014 | RC2 | FIXED | Routes + honest 501s; contract test |
| P2-015 | RC10 | FIXED | Guidance 7.5 commits; numeric tested |
| P2-016 | RC5 | FIXED | Branded root + studio 404s; tested |
| P2-017 | RC2 | FIXED | Delete eligibility GET-only; tested |
| P3-001 | RC8 | FIXED | Count-label spacing; tested |
| P3-002 | RC10 | FIXED | Settings copy/primitive; tested |
| P3-003..006 | RC12 | FIXED | Showcase data fixes; feed tests |
| P3-007 | RC3 | FIXED | Loading/error split; tested |
| P3-008 | RC13 | FIXED | Rail names qualified; map tested |
| P3-009 | RC4 | FIXED | Gate coverage; resolver tested |
| P3-010/011 | RC9 | FIXED | Draft/url contracts; tested |
| P3-012 | RC3 | FIXED | State honesty; tested |
| P3-013 | RC5 | FIXED | Route authority; tested |
| P3-014 | RC9 | FIXED | Empty-prompt inline validation; tested |
| P3-015..020 | RC12 | FIXED | Viewer/tiles/badges; component tests |
| P3-021/022 | RC9 | FIXED | Prompt caps + handoff; tested |
| P3-023 | RC12 | FIXED | App-card badge; decorative tiles tested |
| P3-024..026 | RC5 | FIXED | Aliases/params/titles; tested |
| P3-027 | RC12 | FIXED | Influencer locked preview; tested |
| P3-028 | RC2+RC3 | FIXED | Settings states; tested |
| P3-029 | RC10 | FIXED | Product copy via product prop; tested |
| P3-030 | RC5 | FIXED | Href authority; legacy test |
| P3-031..034 | RC10 | FIXED | Numeric/font/billing/nav; tested (see note) |
| P3-035 | RC13 | FIXED | Native task select verified + locked by test |
| P3-036/037/039 | RC4 | FIXED | Gate coverage; tested |

Note on P3-031..034: two audit sub-observations had no source
referent — no `withChat` string exists (exhaustive grep), and no
line-clamp/ellipsis truncates privacy/disclosure descriptions
(full-text render verified). Everything else in the group was
implemented and tested.

### New findings (11)

| ID | RC | Disposition | Evidence |
|---|---|---|---|
| N1 | RC1 | FIXED | Mapping states surface distinctly; tested |
| N2 | RC2 | FIXED_NEEDS_RUNTIME_PROOF | Clerk signOut + server revoke; landing needs browser |
| N3 | RC2 | FIXED | Sessions/logout-all live; rest honest 501; tested |
| N4 | RC6 | FIXED | Registry re-projected; drift test |
| N5 | RC6 | FIXED_NEEDS_RUNTIME_PROOF | Params embedded, no runtime reads; prod deploy is owner's |
| N6 | — | OWNER_BLOCKED | Attestations are owner data (D3); executable stays 0 |
| N7 | — | OWNER_BLOCKED | External worker is another repo; untouched |
| N8 | RC2 | FIXED | No pre-confirmation POST; tested |
| N9 | RC5 | FIXED | Canonical palette hrefs; legacy test |
| N10 | RC11 | FIXED | Cache + summary; measured in §4 |
| N11 | — | DEFERRED | /api/rum 404 harmless while flag off; needs owner wire-or-remove call |

## 7. Acceptance-gate checklist

- typecheck 0 errors: PASS. test:parity 0 new failures: PASS.
  build: PASS. shared-drift: PASS. portfolio-pin: PASS.
- No "Checking session" after settle: PASS (status split + tests).
- No no-op Sign in for Clerk-signed-in: PASS (code+test;
  live-modal proof needs a browser).
- Sign out ends Clerk session: NEEDS_RUNTIME_PROOF (no test
  instance configured; unit test covers the call chain).
- Every /api/settings literal returns JSON: PASS (contract test).
- No destructive control arms signed out: PASS (gated + tested).
- /upgrade → billing; branded 404s: PASS (tested).
- No internal href is a legacy source: PASS (tested).
- ?section=plan → Billing; guidance 7.5: PASS (tested).
- Registry = schema-coverage; params for every supported
  schema: PASS (pipeline tests).
- Unknown reduced + labels only: PASS (§3).
- ⌘K finds tools/models/apps/templates/settings: PASS (index tests).
- Toggle/tabs: PASS (RC8 tests).
- Remix with source context: PASS (round-trip tests).
- Models/URL + draft survival: PASS (RC9 tests).
- Pending feedback + once-per-scope fetch: PASS (RC11 tests).

## 8. Could not verify (blocked, not skipped)

- Live click→content browser timings (§4): sandbox denies
  `listen()`; script provided at `/tmp/rc11-browser-timings.mjs`.
- Responsive widths (§5), console/network sweeps, screenshots.
- Sign-in/sign-out against a real Clerk session (P0-001, N2).
- Authenticated catalog executable counts (needs Supabase + worker).
- Production snapshot/probe behavior (N5; deploy is owner's).
- Focus-trap feel, animations, native fullscreen/unmute
  behavior (mechanisms asserted; feel needs a browser).
- Muse's dead-UI list sweep: the list itself is not in the
  repo, and the browser sweep is blocked. No known dead
  controls remain in source (all RC4/RC8/RC12 controls render
  with reasons or were removed); the sweep is NOT_TESTED.
- REAL_GENERATIONS_ATTEMPTED=0 (none attempted, per scope).

## 9. Owner handoff

- N6 attestations / prices / executable flags (D3).
- N7 external worker liveness + job claim.
- N11 RUM endpoint: wire or remove.
- OD-1 just-in-time provisioning decision.
- D1–D4 deployment/config items from the audit plan.
- Production preview deploy + the §10 runtime-proof list.
- Impl02 preconditions (separate check; expected BLOCKED
  without owner handoff).


# Ethen V2 Freeze Manifest

Status: **FROZEN — SUPERSEDED BY EDS (D15 cutover performed)**

## Supersession (D15)

V2 is no longer the active production design authority. The D15 cutover made
the D14.5 Ethen Design System active (`lib/design/authority.ts`:
`APPROVED_SUCCESSOR_DESIGN_AUTHORITY.activeInProduction = true`,
`cutoverPerformed = true`), and `DESIGN_TOKEN_AUTHORITY` /
`DESIGN_SHELL_AUTHORITY` now point at the EDS token sheet and shells.

| Field | Value |
|---|---|
| Superseded by | `EDS_D14_5` (Mineral Paper + Ground Lapis; Instrument Sans / Newsreader / IBM Plex Mono) |
| Cutover milestone | `D15` |
| Production routes bound to a V2 shell | **0** (`validate:d15-shell-convergence`) |
| Active public V2 shell imports | **0** (9 raw importing files retained as rollback/reference) |
| Certification | `artifacts/d15/evidence/D15_J11_LOCAL_BROWSER_CERTIFICATION.json` |
| Decision | `artifacts/frontend-modernization/recovery/decisions/FJ-09-EDS-SUCCESSOR-AUTHORITY.md` |

**This manifest is amended, not retired.** Everything recorded below remains the
V2 freeze of record. The V2 tokens, shells and geometry stay in the tree and
`pnpm validate:v2-freeze` stays armed — the D15 rollback path depends on them.
Superseded does not license deleting a V2 rollback or reference file, and does
not license weakening a V2 validator.

The certification figures below (a11y 203/0/217, visual 150/0, 130 Darwin
baselines) are the V2-era record. The post-cutover EDS certification is a
separate record: visual regression 200/200 across eight projects and a11y
133 passed / 0 failed / 305 expected skips, captured in the evidence file above.

## Freeze identity

| Field | Value |
|---|---|
| Branch | `release/flagship-v2-design-lab-integration-20260814` |
| FINAL_CANDIDATE_SHA | `0ace9349da5ce09ceaa8536044a52830382b61ba` |
| M8R_REMEDIATION_SHA | `732a8ab46959073fb6119d712dbf04f496cdc9a6` |
| A11Y_CLOSURE_SHA | `e9f0bdb935cde662052240936fb1eef9b8048021` |
| VISUAL_CLOSURE_SHA | `f3910c67753066695a77f27b551f0d63472a940f` |
| Token authority | `styles/ethen-v2/tokens.css` — 65 defined / 55 consumed / **0 undefined** `--v2-*` |
| Geometry authority | `components/design-system/v2/geometry.ts` + `validate:v2-freeze` computed PASS |
| Theme authority | one `ethen-theme` preference; System / Light / Dark; marketing dark-locked |
| Production adoption | Composition coverage **179 / 191** routes PASS across 48 families; **12 / 191** documented redirect-only EXCEPTIONS. Per family: admin 11/11, agent-runs 2/2, agents 2/2, ai-gateway 13/14 (+1 redirect), approvals 1/1, artifacts 1/1, audit-log 1/1, billing 1/1, browser 2/2, chat 1/1, chats 0/1 (redirect), code 2/2, compute 5/5, console 1/1, cortex 4/4, designer 1/1, environment-variables 1/1, evals 1/1, firewall 1/1, founder-agent 4/4, help 1/1, job-seeker-agent 1/1, local-models 6/6, logs 1/1, marketplace 1/1, mcp 1/1, model-intelligence 11/11, model-library 3/3, models 1/1, observability 6/6, operator 1/1, platform-status 1/1, policies 1/1, projects 8/8, research 1/1, runs 0/1 (redirect), security 0/1 (redirect), sentinel 15/15, sessions 1/1, settings 1/1, studio 14/19 (+5 redirects), usage 1/1, voice 14/14, workflow-agent 13/16 (+3 redirects), workflow-automation 15/15, workflow-runs 2/2, workflows 2/2, workspace 2/2. Exception list (12): `/ai-gateway/keys`, `/chats`, `/runs`, `/security`, `/studio`, `/studio/audio`, `/studio/image`, `/studio/models`, `/studio/video`, `/workflow-agent/connections`, `/workflow-agent/create`, `/workflow-agent/mcp` — each is a Next.js `redirect()` template with no product chrome. `V2_TOKENS_ONLY` = 0. Authority: `pnpm validate:v2-composition` + `certification/route-family-composition.yaml`. |
| Certification gate environment | Reproduce HTTP certification with: `ETHEN_ENABLE_FROZEN_PRODUCTS=true` (voice 14 + workflow-agent 16 + workflow-automation 15 + workflows 2 + workflow-runs 2 = 49); `ETHEN_STUDIO_PRIVATE_ALPHA=true` + `ETHEN_STUDIO_STORAGE_READY=true` + `ETHEN_STUDIO_WORKER_READY=true` + `ETHEN_STUDIO_POLICY_READY=true` + `ETHEN_STUDIO_OPENAI_READY=true` + `ETHEN_STUDIO_FAL_READY=true` and `ETHEN_STUDIO_KILL_SWITCH` unset (studio 19); `ETHEN_ENABLE_SENTINEL=true` (sentinel 15); designer-guard + kill switch (designer 1) — registry lifecycle remains `unavailable` so designer-guard stays fail-closed for API surfaces (page still HTTP 200); `ETHEN_DISABLE_PRODUCTS` must not include `designer`. Wired into `playwright.config.ts` `webServer.env` and `e2e/harness/fixtures.ts` `E2E_ENV`. Unflagged `pnpm validate:route-smoke` remains the Level 5 boundary proof (`/voice` and `/workflow-agent` 404). |
| Accessibility | `pnpm validate:a11y` HARD PASS — 203 passed / 0 failed / 217 skipped |
| Visual | `ETHEN_CERTIFICATION=true pnpm validate:visual-regression` HARD PASS — 150 passed / 0 failed |
| Screenshot threshold | `maxDiffPixelRatio: 0.01` (unchanged) |
| Darwin baselines | 130 current-project visual-regression Darwin PNGs (≥ 120 required) + 41 V2 geometry PNGs |

## Validator

`pnpm validate:v2-freeze` runs `scripts/validate-v2-freeze.ts` (M7). It is the
mechanical V2 geometry/drift gate for this scope and checks:

0. **Design Lab structure** — 25 sections in historical order, 11 templates,
   Final Reference order Secondary → Remaining → Primary.
1. **Canonical geometry** — V2_GEOMETRY source contract: expanded sidebar 256,
   collapsed sidebar 56, topbar 56, nav row 36, controls 32/40/48, gutter 24,
   context rail 320/404, radii 6/12/16 + pill.
2. **Token contract** — undefined consumed `--v2-*` == 0 (M1 regression gate).
3. **Typography** — canonical classes resolve to 20/16/14/13/12; flags
   unclassified 9/10/11px production usages.
4. **Motion** — canonical durations 100/150/200/220ms; no `transition: all`.
5. **Radii** — flags unjustified `rounded-xl/2xl/3xl/4xl` in V2 scope.
6. **Colors** — flags direct surface color literals bypassing V2 authority.
7. **Spacing** — flags off-grid V2 spacing with documented exceptions.
8. **Computed geometry** — running-browser computed-style assertions on
   Design Lab 2 and Cortex (`ETHEN_CERTIFICATION=true` requires a reachable
   server; standard mode reports honestly). Visual baselines live in
   `e2e/v2-visual-geometry.spec.ts` and are not a substitute for this gate.

Certified `validate:v2-freeze` result at FINAL_CANDIDATE_SHA: **72 PASS / 0 FAIL / 0 WARN**.

## Playwright project coverage

Required certification projects (all exercised by `validate:a11y` and
`ETHEN_CERTIFICATION=true pnpm validate:visual-regression`):

- desktop-dark
- desktop-light
- desktop-dark-reduced-motion
- mobile-dark-coarse
- desktop-forced-colors
- desktop-reduced-transparency

## Known accepted pre-existing lint findings

Full-repo `pnpm run lint` reports **8 errors / 1827 warnings**. None were
introduced by M8R / M8R2 touched files. Accepted pre-existing errors:

1. `components/dev/ethen-design-lab-2/EthenDesignLab2.tsx` — `react-hooks/set-state-in-effect` (2)
2. `components/dev/ethen-design-lab-2/LabDataRowsTablesFiltersSection.tsx` — `react-hooks/set-state-in-effect` (2)
3. `scripts/capture-v2-flagship-visuals.cjs` — `@typescript-eslint/no-require-imports` (2)
4. `scripts/capture-v2-theme.cjs` — `@typescript-eslint/no-require-imports` (2)

## Gate chain (certified)

| Gate | Result |
|---|---|
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | 8 pre-existing errors only |
| `pnpm run build` | PASS |
| `pnpm validate:route-smoke` | 16 PASS / 0 FAIL |
| `pnpm validate:v2-freeze` | 72 PASS / 0 FAIL / 0 WARN |
| `pnpm validate:a11y` | HARD PASS |
| `ETHEN_CERTIFICATION=true pnpm validate:visual-regression` | HARD PASS |

This freeze is a production-console certification, not Design-Lab-only.
No push, merge, or deploy is implied by this status.

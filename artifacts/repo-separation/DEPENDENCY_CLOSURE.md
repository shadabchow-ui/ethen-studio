# Dependency closure (S2, Phase 4-5)

Source: committed `SOURCE_HEAD=cf3aabdb4` (clean `git archive` snapshot;
never the dirty working tree). Method: full import scan of `apps/studio`
(`import`/`export from`, dynamic `import()`, `require()`, CSS `@import`),
`@/` alias resolution (app tree first, repo root second), `tsconfig`
`paths` audit, `package.json` manifest audit, runtime `fs` read audit,
catalog/data input audit.

## apps/studio surface (772 files)

```text
387 .ts  204 .tsx  126 .jpg  34 .mp4  5 .css  4 .webp  4 .json
3 .png  3 .md  1 .ico  1 .gitignore
```

## @ethen/* specifiers: 93 unique (85 present, 8 missing at HEAD)

By package (occurrences): studio-core 216, ai 133, ui 53, database 29,
contracts 27, app-shell 19, navigation 7, config 6, security 5, usage 3,
billing 3, tools 1, auth 1, account 1 (last two: `transpilePackages`
strings only, no code import). `@ethen/studio` (bare) is string-only
(health payload + manifest assertion), not an import. `@ethen/models`:
zero direct imports.

Missing at HEAD (imported by Studio, never committed on this branch):

```text
@ethen/app-shell/instant-rum/next
@ethen/app-shell/latest-request-gate
@ethen/contracts/rum/route-identity
@ethen/database/user-settings
@ethen/ui/chat-lab/shared-chat-chrome
@ethen/ui/design-system/v2/canvas/CanvasViewport
@ethen/ui/settings/index
@ethen/ui/settings/settings-data
(+ components/studio/StudioLifecycle.tsx relative import of
 packages/app-shell/src/a11y/next — also HEAD-absent)
```

## @/ alias audit

60 unique `@/*` specifiers; all resolve app-locally except 4 root-only
modules (imported by `app/studio/layout.tsx`, `app/studio/error.tsx`,
`app/studio/loading.tsx`, 17 `cn()` consumers):

```text
lib/utils.ts
components/ui/state-surfaces.tsx (+ ./button.tsx, v2.module.css, lib/tools/types.ts)
components/design-system/eds/flagship (EdsScope + flagship-surface.css only)
components/shell/V2ProductionScope.tsx (+ components/theme/theme-store.ts)
```

Vendored (9 files, zero collisions with app-local paths). Monorepo
`@/lib/media/api-v1`-style duals resolve app-first per `paths` order —
verified file-by-file.

## Classification of every outside-apps/studio dependency

```text
APP_OWNED (moved into repo root):
  apps/studio/** (772 files), lib/media/generated/*.json (catalog, 1.6MB)
TRUE_SHARED (whole-package vendoring under packages/, existing names kept):
  account(16) ai(407) app-shell(36) auth(10) billing(21) config(19)
  contracts(58) database(19) models(164) navigation(10) security(57)
  studio(235) tools(109) ui(353) usage(17) = 1531 files
  Rationale: packages cross-import via both @ethen/* and relative
  ../../../<pkg>/src paths; whole-package vendoring preserves behavior
  with no new shared package. models has no direct Studio import but is
  required for typecheck (database/attachments types) and vendored whole.
  No giant ethen-shared / ethen-kit was created.
ACCIDENTAL_MONOREPO_DEPENDENCY (replaced):
  - undeclared @ethen/ai, @ethen/tools, @ethen/models -> declared deps
  - StudioLifecycle ../../../../packages import -> bare @ethen specifier
  - fixture-lane + memory-catalog monorepo-root fs reads -> dual-layout
  - ui exports map: 3 existing subpaths added (jobs/studio-job-ux,
    media/studio-preview-delivery, settings/studio-settings)
  - flagship barrel trimmed to EdsScope (Composer/BlockedRoute trees dropped)
  - projector OUT paths repointed to lib/media/generated/*
  - tests repointed (boundary rewritten; stu-31/34, fal-catalog, sidebar adapted)
DEV_TEST_ONLY (kept): vitest, tsx, playwright, @types/*; the
  studio-scroll-regression browser suite (needs live server).
BUILD_INPUT (vendored): data/media-models/{canonical-media-models.jsonl,
  fal-media-endpoints.jsonl, schema-coverage.json,
  schema-import-checkpoint.json, schema-snapshots/ (162 files)} (4.7MB) +
  scripts/media-models/{project-studio-catalog.mjs, lib.mjs}.
  Verified: regeneration is byte-identical (491 records, 1499 endpoints).
NOT_REQUIRED (excluded): @vercel/sandbox (zero code references),
  exa-js (ai/research only, unreachable), FlagshipComposerSurface /
  FlagshipBlockedRoute trees, security/provider-health (no studio
  importers), models data loaders (dormant), .next/node_modules/coverage,
  historic archives, other Ethen apps, the 35 studio SQL migrations
  (SHARED_SERVICE: applied at platform level, listed in the job record).
```

## External (npm) manifest

Root provides the hoisted set the workspace packages rely on (all pinned
to exact HEAD lockfile versions; workspace overrides in
`pnpm-workspace.yaml`, required by pnpm 11): next, react, react-dom,
@clerk/nextjs, @supabase/ssr, @supabase/supabase-js, server-only, clsx,
tailwind-merge, zod, stripe, ioredis, ws, ajv, https-proxy-agent,
@assistant-ui/react, react-syntax-highlighter + @types, typescript, tsx,
vitest, playwright, tailwindcss, @tailwindcss/postcss.

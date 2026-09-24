# Source provenance

```text
SOURCE_MONOREPO=/Users/sha/Documents/ethen/ethenv5
SOURCE_BRANCH=ethen/studio-v5-final
SOURCE_HEAD=b6fc3b9ca81d97b50c15e5e6120582a3f2349948
SOURCE_APP_PATH=apps/studio
EXTRACTION_DATE=2026-09-24
EXTRACTION_METHOD=git archive of SOURCE_HEAD into an isolated snapshot,
  then dependency-closure copy (never the dirty working tree)
TARGET_REPO=shadabchow-ui/ethen-studio
TARGET_BRANCH=main
```

## S3.5 source closure repair (2026-09-24)

Previous `SOURCE_HEAD=cf3aabdb4` was internally inconsistent: 9 Studio
dependency modules (plus their transitive closure) existed only as
uncommitted monorepo files. S3.5 committed the required-only closure on
`ethen/studio-v5-final` (`b03ab7dc` + `b6fc3b9c`) and re-vendored this repo
from the new HEAD:

- 24 previously uncommitted modules (RUM, a11y, settings authority,
  chat-lab chrome/prefs/greeting/launcher/segmented control, Canvas
  viewport, user-settings store)
- 8 required-only tracked updates (navigation/app-shell barrels, theme
  icons, StudioShell Job-12 surface, search-palette Studio props,
  SearchResult Studio group, workflow listGraphs, review-asset block)
- 15 committed CSS files the S2 extraction missed (root `styles/eds/*`
  + eds composer/primitives/qualification sheets backing the vendored
  `flagship-surface.css`)

Result: typecheck 84 → 0 errors, `next build` PASS, tests 22/27 with
zero new failures (5 remaining failures are pre-existing and
signature-verified, not closure issues).

Monorepo history was intentionally not imported: the standalone repo is a
clean snapshot plus this provenance record.

## What was extracted (HEAD-pure)

- `apps/studio/**` → repo root (`app/`, `components/`, `lib/`, `public/`,
  `__tests__/`, `proxy.ts`, `next.config.ts`, docs)
- `packages/{account,ai,app-shell,auth,billing,config,contracts,database,models,navigation,security,studio,tools,ui,usage}/**`
  → `packages/**` (whole-package vendoring preserves the existing
  cross-package relative imports; no new shared package was created)
- Root-owned closure files (see `artifacts/repo-separation/DEPENDENCY_CLOSURE.md`):
  `lib/utils.ts`, `lib/tools/types.ts`, `components/ui/{button,state-surfaces}.tsx`,
  `components/shell/V2ProductionScope.tsx`,
  `components/design-system/eds/flagship/{EdsScope.tsx,flagship-surface.css}`,
  `components/design-system/v2/v2.module.css`, `components/theme/theme-store.ts`
- Catalog build inputs: `data/media-models/{canonical-media-models.jsonl,
  fal-media-endpoints.jsonl,schema-coverage.json,schema-import-checkpoint.json,
  schema-snapshots/}` + `scripts/media-models/{project-studio-catalog.mjs,lib.mjs}`
- `postcss.config.mjs` (Tailwind v4; Studio has no local PostCSS config)

## Deliberate adaptations (all documented in DEPENDENCY_CLOSURE.md)

1. `tsconfig.json` paths rewritten from `../../packages/*` to `./packages/*`;
   `@/*` maps to the repo root only.
2. `package.json`: `@ethen/ai`, `@ethen/tools`, `@ethen/models` declared
   (undeclared at HEAD); `@vercel/sandbox` removed (zero code references);
   externals pinned to the exact HEAD lockfile versions; workspace overrides
   moved to `pnpm-workspace.yaml` (pnpm 11 requirement).
3. `components/.../flagship/index.ts`: trimmed to the `EdsScope` export Studio
   uses (Composer/BlockedRoute subtrees NOT_REQUIRED).
4. `components/studio/StudioLifecycle.tsx`: monorepo-relative
   `../../../../packages/...` import rewritten to `@ethen/app-shell/a11y/next`
   (module is HEAD-absent either way; decoupled form preserves the error).
5. `packages/ui/package.json`: exports map completed with the 3 existing
   subpaths Studio imports (`jobs/studio-job-ux`, `media/studio-preview-delivery`,
   `settings/studio-settings`).
6. Fixture catalog root (`packages/studio/.../fixture-lane.ts`) and local
   catalog root (`app/api/studio/v1/_lib/memory-catalog.ts`): dual-layout
   resolution (standalone `lib/media/...` first, monorepo `apps/studio/...`
   fallback). Behavior in the monorepo layout is unchanged.
7. `scripts/media-models/project-studio-catalog.mjs`: output paths repointed
   to `lib/media/generated/*`. Verified byte-identical regeneration.
8. Tests: `__tests__/boundary.test.ts` rewritten for standalone structure
   (behavioral sections identical); `sidebar-collapsed-logo` repointed +
   pinned-hash gate added; `stu-31`/`stu-34`/`fal-catalog` path assumptions
   adapted; `scripts/run-studio-tests.mjs` + `tests/baseline.head.json` added.

## Known HEAD-inherited state (not introduced by extraction)

Resolved by the S3.5 closure above: the previous SOURCE_HEAD's 9 missing
modules, 84 type errors, and 5 webpack module errors are gone. 5 test
suites still fail with pre-existing, signature-verified causes unrelated
to source closure (media tool registry count, rec02f mock-completion,
stu-31 registry promotion pinned against sol05, stu-34 stale API needles,
sidebar Chat brand assets). The S2 certification
(`artifacts/repo-separation/STANDALONE_CERTIFICATION.md`) describes the
pre-S3.5 state; the promotion blocker in `docs/PRODUCTION_AUTHORITY.md`
is cleared for the source-integrity item (S4 deployment gates still apply).

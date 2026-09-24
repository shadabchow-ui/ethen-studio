# Source provenance

```text
SOURCE_MONOREPO=/Users/sha/Documents/ethen/ethenv5
SOURCE_BRANCH=ethen/studio-v5-final
SOURCE_HEAD=cf3aabdb43137f904dfcf5b1d297e9d77834bbb8
SOURCE_APP_PATH=apps/studio
EXTRACTION_DATE=2026-09-24
EXTRACTION_METHOD=git archive of SOURCE_HEAD into an isolated snapshot,
  then dependency-closure copy (never the dirty working tree)
TARGET_REPO=shadabchow-ui/ethen-studio
TARGET_BRANCH=main
```

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

Committed SOURCE_HEAD is internally inconsistent for Studio: `apps/studio`
at HEAD imports 9 package modules that were never committed on this branch
(they exist only as uncommitted working-tree files). The standalone repo
faithfully reproduces HEAD behavior, including its 84 type errors, 5
webpack module errors, and 5 failing suites — with zero NEW failures.
See `artifacts/repo-separation/STANDALONE_CERTIFICATION.md` and the
promotion blocker in `docs/PRODUCTION_AUTHORITY.md`.

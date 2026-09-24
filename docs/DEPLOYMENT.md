# Deployment

## Toolchain

```text
Node  22  (.nvmrc; engines: >=22)
pnpm  11.5.3 (packageManager; install with corepack or npm i -g pnpm@11.5.3)
Next  16.3.4 (webpack build: `next build --webpack`)
```

## Install / verify

```sh
pnpm install --frozen-lockfile
pnpm typecheck          # tsc --noEmit (see note on inherited failures)
pnpm test               # all Studio suites (raw verdicts)
pnpm test:parity        # gate: NEW failures vs tests/baseline.head.json
pnpm build              # next build --webpack
```

`pnpm test` runs `scripts/run-studio-tests.mjs`: 23 tsx suites, 1
node:test suite, 1 vitest suite. The browser suite
(`__tests__/studio-scroll-regression.test.ts`) needs a live server and is
excluded by default; run it with `STUDIO_BASE_URL` set:

```sh
STUDIO_BASE_URL=http://127.0.0.1:3016 node --import tsx --test __tests__/studio-scroll-regression.test.ts
```

Note: at the extracted SOURCE_HEAD, `pnpm typecheck` reports 84
pre-existing failures and `pnpm build` stops on 5 pre-existing missing
modules (see `docs/SOURCE_PROVENANCE.md` and
`artifacts/repo-separation/STANDALONE_CERTIFICATION.md`). The migration
gate is no-regression (`NEW_TYPE_ERRORS=0`, `NEW_TEST_FAILURES=0`,
identical build behavior), not absolute green. Do not promote to
production until the recorded promotion blocker is cleared.

## Run (local tiers)

```sh
pnpm dev   # Tier 1 UI-only on :3015 (needs ETHEN_STUDIO_LOCAL_AUTH_BYPASS=true)
```

Tier 2 (fixture runtime, second server on :3016):

```sh
STUDIO_LOCAL_RUNTIME=fixture ETHEN_STUDIO_ALLOW_PARTIAL=1 \
  ./node_modules/.bin/next dev -p 3016 -H 127.0.0.1
```

Full tier table + verification steps: `docs/LOCAL_STUDIO_TIERS.md`.
Tier 3 (full stack) additionally needs Supabase, Temporal, and the
separate `@ethen/studio-worker` deployable (not part of this repo).

## Catalog regeneration

```sh
pnpm catalog:project   # data/media-models/* -> lib/media/generated/*.json
```

Deterministic: verified byte-identical output (491 records, 1499
endpoints). Never hand-edit `lib/media/generated/*`.

## Vercel (S3-owned)

- Framework: Next.js. Root directory: repo root. Build command:
  `pnpm install --frozen-lockfile && pnpm build` (or the Vercel pnpm
  defaults with `pnpm build`).
- Required env: see REQUIRED_PRODUCTION in
  `docs/ENVIRONMENT_VARIABLES.md`. Preserve existing project secrets;
  never commit values.
- `ALLOW_DOMAIN_CHANGES=NO`: reuse the proven Studio project/domain.
- Do not bind `studio.upcube.ai` (or any domain) without recorded
  authority evidence.
- Promotion gates (all S3): STANDALONE_INSTALL=PASS,
  STANDALONE_BUILD=PASS, NEW_TYPE_ERRORS=0, NEW_TEST_FAILURES=0,
  PREVIEW_PARITY=PASS, ROLLBACK_READY=YES.

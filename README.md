# Ethen Studio — standalone repository

Ethen Studio is an independent product: the canonical creative surface
(Create, Models, Canvas, Workflows, Apps, Projects, Assets, History,
Reviews, Pro Studio, Marketing Studio, AI Influencer, Voice Agents).

This repo was extracted from the Ethen monorepo as a standalone,
independently installable / buildable / testable / deployable unit.
Studio lives at the repo root; the `@ethen/*` workspace packages it
imports are vendored under `packages/`.

## Quick start

Requires Node 22 and pnpm 11 (see `.nvmrc`).

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm dev        # http://localhost:3015 (Tier 1, UI-only)
```

Local tiers (UI-only / fixture runtime / full stack) are documented in
`docs/LOCAL_STUDIO_TIERS.md`. No paid provider calls are made by any
local tier or test.

## Layout

```text
app/            Next.js routes: (studio) pages + api/studio/v1 routes
components/     Studio components + vendored shell/EDS scope deps
lib/            Studio libraries (media runtime, studio-v5, access guard)
packages/       Vendored @ethen/* workspace deps (source-linked)
public/         Served assets (brand, studio-v4-lab, studio-v5)
data/           Catalog BUILD_INPUTs (canonical jsonl, endpoints, snapshots)
scripts/        Catalog projector + standalone test runner
__tests__/      Repo-level suites (boundary, sidebar, presentation)
tests/          HEAD parity baseline
docs/           Provenance, environment, deployment, authority
artifacts/      Separation evidence (closure, independence, certification)
```

## Docs

- `docs/SOURCE_PROVENANCE.md` — where this snapshot came from
- `docs/ENVIRONMENT_VARIABLES.md` — env var names (never values)
- `docs/DEPLOYMENT.md` — build/run/deploy/test reference
- `docs/PRODUCTION_AUTHORITY.md` — production source authority (S3-owned)
- `artifacts/repo-separation/` — extraction evidence

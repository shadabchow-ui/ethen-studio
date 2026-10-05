# Studio media catalog — operator guide (MUSE-FINAL-003)

Source-bound to `muse-final-003/studio-catalog@5d978bd` (pushed):
import 1487/1500 supported, 13 explicit unsupported; 32/32 suites,
typecheck, and build green; projection `{records: 492, endpoints: 1500,
sha: 333e0a2021b1}`.

## Layout

- `data/media-models/fal-media-endpoints.jsonl` — endpoint registry (1500).
- `data/media-models/schema-snapshots/*.json` — per-endpoint schemas (1487).
- `data/media-models/schema-coverage.json` — run artifact (attempted /
  supported / failed + per-endpoint reason).
- `data/media-models/schema-import-checkpoint.json` — importer checkpoint.
- `data/media-models/canonical-media-models.jsonl` — canonical families.

## Import

Schemas import through the importer/schema/projector/input-output renderer
chain — never as bespoke per-model pages. Re-run the importer; coverage
regenerates with explicit per-endpoint status. Known unsupported (13,
honest, not retried blindly):

- 8× `schema fetch HTTP 404 (endpoint not published)`
- 3× `snapshot has no input.properties object` (openrouter router paths)
- 1× renderer gap (`crop_top_left: array of non-scalar items`)
- 1× `queue POST has no resolvable JSON requestBody schema`

## Projection (web PDP read contract)

`node scripts/media-models/project-studio-catalog.mjs` →
`{ok, records, endpoints, sha}`. Marketing PDPs consume this projection
through the owning read contract only — never by reaching into
`schema-snapshots/` directly. Current projection: 492 records / 1500
endpoints / sha `333e0a2021b1`.

## Provenance

Open-family license provenance is enforced by
`lib/media/__tests__/catalog-completeness.test.ts` (open-weights vs mixed
assertions, e.g. marigold-v2 / flux-1). Unknown provenance, license, or
pricing stays explicitly unknown — never invented.

## Gates

`node scripts/run-studio-tests.mjs` (32/32), `pnpm typecheck`,
`pnpm build`. Real provider/voice calls need legitimate stage substrate +
budget + WP-DB consumer certificates; fixture suites never count as live
proof. Setup-503 is not success.

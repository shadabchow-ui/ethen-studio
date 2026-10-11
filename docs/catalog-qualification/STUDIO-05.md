# STUDIO-05 — Catalog qualification findings

Job: STUDIO-05 · Repo: `shadabchow-ui/ethen-studio` · Baseline: `main` @ `843173f809250265c81b681fefc491aa075d21b1`

Scope: read-only investigation of the catalog projection, eligibility and price-mapping code, unit tests that pin
current behaviour, and a seed SPEC for owner review. No migration was applied, no database was contacted, and
`docs/catalog-qualification/STUDIO-05-seed.sql` was **never executed**.

## (a) Why 391 DERIVED entries stay `BLOCKED_PRICE_UNKNOWN`

The count is exactly 391. Measured by projecting the checked-in registry
(`lib/media/generated/fal-catalog.json`, `catalog_version: studio-fal-catalog-v2`) through the same path the public
catalog route uses:

| Metric | Value |
|---|---|
| Endpoints / families | 1500 / 492 |
| Price state `DERIVED` / `VERIFIED` / `STALE` / `UNKNOWN` | 391 / **0** / 0 / 1109 |
| Qualification state | `UNVERIFIED` = 1500; `QUALIFIED` = 0; `PARTIALLY_QUALIFIED` = 0 |
| `executable` | 0 |
| Of the 391 DERIVED: `BLOCKED_PRICE_UNKNOWN` only / + unmapped task / + schema unknown / + both | 369 / 20 / 1 / 1 |
| Of the 391 DERIVED, by output modality | image 198, video 150, model 23, audio 20 |

### Three-line explanation

1. **By design, DERIVED is never quotable:** `priceQuoteGuidance("DERIVED")` returns `canQuote:false` with
   `blockedCode:"BLOCKED_PRICE_UNKNOWN"` (`packages/studio/src/catalog/price-states.ts:41-42`), and `projectCatalog`
   appends that code to every endpoint whose guidance carries one (`packages/studio/src/catalog/projection.ts:118-119`).
   Only `VERIFIED` returns `blockedCode:null` (`price-states.ts:40`).
2. **Nothing in this repo produces a `VERIFIED` price:** the local lane emits only `DERIVED` price rows
   (`app/api/studio/v1/_lib/memory-catalog.ts:130-131`), and the Supabase lane takes `price_status` verbatim from
   `studio_v5_price_configs` (`app/api/studio/v1/_lib/supabase-catalog.ts:194-196`); any other value reads as `UNKNOWN`.
   No code here writes `VERIFIED`, and the live table was not inspected (no database access). The data gap is verified
   prices, not a mapping bug.
3. **Qualification is a separate, also-empty gate:** the public catalog route hard-codes an empty attestation map
   (`app/api/studio/v1/catalog/route.ts:35`), so `evaluateQualification` returns `UNQUALIFIED_ENDPOINT` for every row
   (`packages/studio/src/catalog/qualification.ts:41-51`) and all 1500 resolve to `UNVERIFIED`
   (`qualification.ts:241`). Seeding the database cannot change this lane's output.

### Supporting evidence

- **Where the 391 come from.** `memory-catalog.ts:118-134` runs `parsePriceSentences`
  (`packages/studio/src/server/economics/fal-price-parser.ts`) over each endpoint's `pricing.sentences`. Of 1500
  endpoints, 391 parse to exactly one exact rate. The other 1109 are `UNKNOWN`: 897 ambiguous sentences, 112 with no
  hash or sentences, 85 sub-ICU unit prices, 11 multiple rates, 4 no rate sentence.
- **Price block and qualification are independent.** `resolveQualificationState` never reads the price state beyond
  `hasPriceEvidence` (`projection.ts:108`, used only for `PARTIALLY_QUALIFIED` at `qualification.ts:221`). A `QUALIFIED`
  endpoint is `executable:true` even with a `DERIVED` price, and still lists `BLOCKED_PRICE_UNKNOWN` in `blockedCodes`.
  Nothing outside `projection.ts` reads `blockedCodes` (`types.ts:150` is its only other occurrence), so the code is
  informational, not an admission gate. Pinned by the test "executable is decided by the attestation".
- **The fixture lane agrees with the policy.** `fixture-lane.ts:360-362` states FULL qualification needs a `VERIFIED`
  price and a real canary; the ceiling with `DERIVED` is `PARTIAL`, which executes only with
  `ETHEN_STUDIO_ALLOW_PARTIAL=1`.
- **The comment and the code disagree.** `price-states.ts:36` says "VERIFIED quotes; DERIVED estimates labelled; else
  PRICE_UNKNOWN", but `DERIVED` also gets `blockedCode: BLOCKED_PRICE_UNKNOWN` (line 42). The name is misleading
  (the price is known but unconfirmed), but the behaviour is consistent with the fixture lane and the provider adapters
  (`fal.ts:382`: "no verified price"). It is a naming and wording issue, not a defect.

### Why 22 of the 391 carry extra codes

20 DERIVED entries have an unmapped task, 1 has an unknown schema, and 1 has both
(`projection.ts:116-117`). Those are separate gaps, see `packages/studio/src/catalog/task-map.ts` and
`artifacts/studio-closure/catalog-coverage.json`.

## (b) Decision: no code change

The cause is intentional policy plus missing data, **not** a clear code defect. Changing `priceQuoteGuidance` to let
`DERIVED` through would lower the price-verification bar, which is an owner decision. The relevant code was not
touched; none of the FORBIDDEN PATHS was needed.

Added `lib/media/__tests__/studio-catalog-qualification.test.ts` (17 tests, run by `pnpm test` through the
`lib/media/__tests__` glob in `scripts/run-studio-tests.mjs`). It pins:

- `resolvePriceState` (null/UNKNOWN, hash match, STALE demotion, missing hash cannot demote);
- `priceQuoteGuidance` for all four states (the 391 cause);
- projection: DERIVED/VERIFIED/UNKNOWN/STALE mapping, block-code ordering, executable decided by attestation not price,
  `PARTIALLY_QUALIFIED` plus `allowPartial`, expiry and tuple mismatch never qualify, terminal signals outrank an
  attestation;
- the real registry: 1500 endpoints, 391 DERIVED all blocked, 0 VERIFIED/QUALIFIED/executable. This exact-count test
  is deliberately brittle: when the registry is regenerated, update the numbers and this document;
- the seed SPEC (below), as a projection model only.

## (c) Seed SPEC for owner review

File: `docs/catalog-qualification/STUDIO-05-seed.sql` (generated from the registry and snapshots, not hand-typed).

### Endpoints (one per task family; all DERIVED, schema-known, `eligible`, single clean price sentence)

| Modality | Task | Endpoint | Derived price |
|---|---|---|---|
| image | `image.generate` | `fal-ai/bytedance/seedream/v4/text-to-image` | 30 ICU per image |
| video | `video.generate` | `fal-ai/minimax/video-01` | 500 ICU per task |
| audio | `audio.generate` | `fal-ai/mmaudio-v2/text-to-audio` | 1 ICU per second |
| audio | `speech.synthesize` | `fal-ai/kling-video/v1/tts` | 7 ICU per task |
| audio | `music.generate` | `fal-ai/minimax-music/v1.5` | 30 ICU per task |
| model | `mesh.generate` | `fal-ai/triposr` | 70 ICU per task |

`image.edit`, `video.edit` and `audio.transform` are not seeded (they need mask or media inputs for a canary).

### What the SQL does

Inserts only (`WHERE NOT EXISTS`): endpoint rows, `DERIVED` price rows, and `executable=true` attestations whose tuple
is copied from the endpoint row so it always self-matches. It runs in one transaction that ends in `ROLLBACK`.
It has `ON_ERROR_STOP`, and attestations need `-v attested_by` and a per-family `-v canary_evidence_<family>`
variable; an undefined variable is a syntax error, so no canary evidence means no attestation. An optional,
off-by-default section D promotes prices to `VERIFIED` only with `-v verify_prices=1` plus per-family evidence.
A test checks these safety properties.

### Owner must resolve before running (limitations of this SPEC)

1. **The DDL is not in this repository** (it is in the monolith's `supabase/migrations/`, see
   `docs/db/STUDIO_MIGRATION_MANIFEST.md`). Column names come from the readers (`supabase-catalog.ts`,
   `supabase-economics.ts`, `spec-reader.ts`); constraints, `NOT NULL`, defaults and extra columns are unknown, and
   the SQL was not parsed or run against anything. Diff it against j06, j04 and m2 first.
2. **Version-tuple convention is unconfirmed.** Section A uses the local-lane convention (`fal-queue@2026-08-02`,
   `schema_version` = snapshot sha256, `price_version` 1.0.0). If the live sync wrote different values, existing rows win
   and the attestation copies them, which is self-consistent. But `/jobs` defaults client pins to
   `DEFAULT_VERSION_PINS` (all `1.0.0`; `jobs/route.ts:39-48`), and when pins are non-null `evaluateQualification`
   requires the attestation to equal the pins (`qualification.ts:75-99`). With `adapter_version = 2026-08-02` an
   explicit default-pinned request would fail with `STALE_ADAPTER_ATTESTATION`. Confirm which convention the live
   catalog uses before attesting.
3. **Canary evidence does not exist.** `executable=true` asserts a real canary succeeded. The job ran none and has no
   credentials. The SQL refuses to run without owner-supplied hashes.
4. **Seeding does not change the public catalog.** The unscoped and local lane never reads attestations
   (`route.ts:35`), so `/api/studio/v1/catalog` without `projectId` will still show 0 executable. The seed affects only
   the project-scoped Supabase lane (`route.ts:82-101`). Making the public lane reflect attestations is a design change
   left out of this job.
5. **Qualified is not price-verified.** Seeded endpoints become `QUALIFIED` + `executable` but keep
   `BLOCKED_PRICE_UNKNOWN` until a `VERIFIED` price row exists (section D, after invoice reconciliation).
6. **Credentials are not modelled.** `projection.ts:105` hard-codes `credentialMissing:false`; a qualified endpoint can
   still fail at submit if no fal key is configured.
7. **Staleness is partly blind in the Supabase lane.** `catalog/route.ts:95` calls `specToCatalogSource` without
   `pricingSourceHash`, so a changed source hash never demotes a DB price to `STALE` there.

## Unexpected findings (not fixed, for the owner)

- **Parser under-states cost on some DERIVED rows.** At least 4 of the 391 have extra conditions the parser drops, so
  they appear as a clean base rate: `fal-ai/heygen/v3/filler-word-removal` (60 s minimum charge),
  `fal-ai/kling-image/o3/text-to-image` and `.../image-to-image` (double price at 4K), `fal-ai/wan-motion` (additional
  charge when `enhance_identity` is on, dropped by the `enabled` rule in `fal-price-parser.ts`). This supports not
  treating DERIVED as quotable. A parser tightening would change the 391 and was out of scope.
- The snapshot for `fal-ai/minimax/video-01` records `task: "video-editing"` while the registry maps it to
  `video.generate` (the snapshot `category` is `text-to-video`). Not investigated further.
- `pnpm install --frozen-lockfile` left the tree clean (no lockfile change).

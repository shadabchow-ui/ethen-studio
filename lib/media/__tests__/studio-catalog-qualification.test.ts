/**
 * STUDIO-05 — catalog qualification / price-mapping pins.
 *
 * These tests pin CURRENT behaviour; they do not change it. Evidence and the
 * explanation of why DERIVED-priced entries stay BLOCKED_PRICE_UNKNOWN live in
 * docs/catalog-qualification/STUDIO-05.md. If a test here fails after a
 * deliberate policy change (e.g. DERIVED becoming quotable), update the doc.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  priceQuoteGuidance,
  resolvePriceState,
  type PriceRowView,
} from "@ethen/studio-core/catalog/price-states";
import { projectCatalog } from "@ethen/studio-core/catalog/projection";
import {
  BLOCKED_PRICE_UNKNOWN,
  buildLocalSource,
  type CatalogSourceEndpoint,
  type LocalCatalogJson,
} from "@ethen/studio-core/catalog/source-local";
import type { QualificationAttestation } from "@ethen/studio-core/catalog/types";
import {
  listLocalCatalogSource,
  listLocalPrices,
  resetLocalCatalogCache,
} from "../../../app/api/studio/v1/_lib/memory-catalog";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NOW = "2026-10-11T00:00:00.000Z";
const LATER = "2026-11-11T00:00:00.000Z";
const SOURCE_HASH = "hash-a";

function row(overrides: Partial<CatalogSourceEndpoint> = {}): CatalogSourceEndpoint {
  return {
    endpointId: "fal-ai/test/endpoint",
    familyId: "falfam/test",
    familyLabel: "Test",
    providerId: "fal",
    label: "endpoint",
    description: "",
    tasks: ["image.generate"],
    capabilityTags: ["input:text"],
    modalityIn: ["text"],
    modalityOut: ["image"],
    requiredControls: ["prompt"],
    supportedControls: ["prompt"],
    parameterForm: [],
    schemaKnown: true,
    snapshotPath: null,
    pricingSourceHash: SOURCE_HASH,
    disposition: "eligible",
    dispositionReason: null,
    enabled: true,
    deprecated: false,
    unhealthy: false,
    adapterName: "fal-queue",
    adapterVersion: "2026-08-02",
    schemaVersion: "1.0.0",
    priceVersion: "1.0.0",
    policyProfile: "standard",
    identityBinding: false,
    priceRow: null,
    ...overrides,
  };
}

function attestation(
  endpointId: string,
  overrides: Partial<QualificationAttestation> = {},
): QualificationAttestation {
  return {
    endpointId,
    adapterName: "fal-queue",
    adapterVersion: "2026-08-02",
    schemaVersion: "1.0.0",
    policyProfile: "standard",
    priceVersion: "1.0.0",
    executable: true,
    evidenceHash: "canary",
    attestedBy: "owner",
    attestedAt: NOW,
    expiresAt: LATER,
    ...overrides,
  };
}

function project(
  source: readonly CatalogSourceEndpoint[],
  attestations: ReadonlyMap<string, QualificationAttestation>,
  prices: ReadonlyMap<string, PriceRowView>,
  allowPartial = false,
) {
  return projectCatalog(source, attestations, prices, new Set(), {
    catalogVersion: "test",
    nowIso: NOW,
    allowPartial,
  });
}

// ---------------------------------------------------------------------------
// price-states.ts
// ---------------------------------------------------------------------------

test("price state: absent and UNKNOWN rows resolve to UNKNOWN", () => {
  assert.equal(resolvePriceState(null, SOURCE_HASH), "UNKNOWN");
  assert.equal(resolvePriceState({ status: "UNKNOWN", evidenceHash: SOURCE_HASH }, SOURCE_HASH), "UNKNOWN");
});

test("price state: DERIVED/VERIFIED survive only while the source hash matches", () => {
  assert.equal(resolvePriceState({ status: "DERIVED", evidenceHash: SOURCE_HASH }, SOURCE_HASH), "DERIVED");
  assert.equal(resolvePriceState({ status: "VERIFIED", evidenceHash: SOURCE_HASH }, SOURCE_HASH), "VERIFIED");
  assert.equal(resolvePriceState({ status: "DERIVED", evidenceHash: "old" }, SOURCE_HASH), "STALE");
  assert.equal(resolvePriceState({ status: "VERIFIED", evidenceHash: "old" }, SOURCE_HASH), "STALE");
});

test("price state: a missing hash on either side cannot demote to STALE", () => {
  assert.equal(resolvePriceState({ status: "DERIVED", evidenceHash: null }, SOURCE_HASH), "DERIVED");
  assert.equal(resolvePriceState({ status: "DERIVED", evidenceHash: SOURCE_HASH }, null), "DERIVED");
});

test("price guidance: only VERIFIED quotes; DERIVED estimates but still carries BLOCKED_PRICE_UNKNOWN", () => {
  assert.deepEqual(priceQuoteGuidance("VERIFIED"), {
    canQuote: true,
    canEstimate: true,
    label: null,
    blockedCode: null,
  });
  // The 391-entry cause: DERIVED is deliberately non-quotable and blocked.
  assert.deepEqual(priceQuoteGuidance("DERIVED"), {
    canQuote: false,
    canEstimate: true,
    label: "unverified price",
    blockedCode: "BLOCKED_PRICE_UNKNOWN",
  });
  for (const state of ["STALE", "UNKNOWN"] as const) {
    assert.deepEqual(priceQuoteGuidance(state), {
      canQuote: false,
      canEstimate: false,
      label: "Price not verified",
      blockedCode: "BLOCKED_PRICE_UNKNOWN",
    });
  }
});

// ---------------------------------------------------------------------------
// projection.ts — eligibility / price mapping on synthetic rows
// ---------------------------------------------------------------------------

test("projection: DERIVED price without attestation => UNVERIFIED, not executable, BLOCKED_PRICE_UNKNOWN", () => {
  const r = row();
  const projection = project(
    [r],
    new Map(),
    new Map([[r.endpointId, { status: "DERIVED", evidenceHash: SOURCE_HASH }]]),
  );
  const endpoint = projection.endpoints[0]!;
  assert.equal(endpoint.priceState, "DERIVED");
  assert.equal(endpoint.qualificationState, "UNVERIFIED");
  assert.equal(endpoint.executable, false);
  assert.deepEqual(endpoint.blockedCodes, [BLOCKED_PRICE_UNKNOWN]);
  assert.ok(endpoint.disabledReasons.includes("Estimate only (unverified price)."));
  assert.equal(projection.tallies.byPrice.DERIVED, 1);
  assert.equal(projection.tallies.executable, 0);
});

test("projection: VERIFIED price carries no price block code", () => {
  const r = row();
  const projection = project(
    [r],
    new Map(),
    new Map([[r.endpointId, { status: "VERIFIED", evidenceHash: SOURCE_HASH }]]),
  );
  const endpoint = projection.endpoints[0]!;
  assert.equal(endpoint.priceState, "VERIFIED");
  assert.deepEqual(endpoint.blockedCodes, []);
});

test("projection: no price row => UNKNOWN with 'Price not verified.'", () => {
  const endpoint = project([row()], new Map(), new Map()).endpoints[0]!;
  assert.equal(endpoint.priceState, "UNKNOWN");
  assert.deepEqual(endpoint.blockedCodes, [BLOCKED_PRICE_UNKNOWN]);
  assert.ok(endpoint.disabledReasons.includes("Price not verified."));
});

test("projection: changed source hash demotes a DERIVED row to STALE", () => {
  const r = row({ pricingSourceHash: "hash-b" });
  const endpoint = project(
    [r],
    new Map(),
    new Map([[r.endpointId, { status: "DERIVED", evidenceHash: "hash-a" }]]),
  ).endpoints[0]!;
  assert.equal(endpoint.priceState, "STALE");
  assert.deepEqual(endpoint.blockedCodes, [BLOCKED_PRICE_UNKNOWN]);
});

test("projection: block codes accumulate in order (unmapped task, unknown schema, price)", () => {
  const r = row({ tasks: [], schemaKnown: false, requiredControls: [], supportedControls: [] });
  const endpoint = project(
    [r],
    new Map(),
    new Map([[r.endpointId, { status: "DERIVED", evidenceHash: SOURCE_HASH }]]),
  ).endpoints[0]!;
  assert.deepEqual(endpoint.blockedCodes, [
    "BLOCKED_UNMAPPED_TASK",
    "BLOCKED_SCHEMA_UNKNOWN",
    BLOCKED_PRICE_UNKNOWN,
  ]);
});

test("projection: executable is decided by the attestation, not by the price state (pins current behaviour)", () => {
  const r = row();
  const prices = new Map<string, PriceRowView>([[r.endpointId, { status: "DERIVED", evidenceHash: SOURCE_HASH }]]);
  const live = project([r], new Map([[r.endpointId, attestation(r.endpointId)]]), prices).endpoints[0]!;
  // QUALIFIED + executable even though the price is only DERIVED ...
  assert.equal(live.qualificationState, "QUALIFIED");
  assert.equal(live.executable, true);
  // ... and the price block code is still reported alongside it (informational).
  assert.deepEqual(live.blockedCodes, [BLOCKED_PRICE_UNKNOWN]);
});

test("projection: non-executable attestation + DERIVED price => PARTIALLY_QUALIFIED, executable only with allowPartial", () => {
  const r = row();
  const prices = new Map<string, PriceRowView>([[r.endpointId, { status: "DERIVED", evidenceHash: SOURCE_HASH }]]);
  const att = new Map([[r.endpointId, attestation(r.endpointId, { executable: false })]]);
  const closed = project([r], att, prices, false).endpoints[0]!;
  assert.equal(closed.qualificationState, "PARTIALLY_QUALIFIED");
  assert.equal(closed.executable, false);
  const open = project([r], att, prices, true).endpoints[0]!;
  assert.equal(open.qualificationState, "PARTIALLY_QUALIFIED");
  assert.equal(open.executable, true);
});

test("projection: non-executable attestation without price evidence stays UNVERIFIED", () => {
  const r = row();
  const att = new Map([[r.endpointId, attestation(r.endpointId, { executable: false })]]);
  const endpoint = project([r], att, new Map()).endpoints[0]!;
  assert.equal(endpoint.qualificationState, "UNVERIFIED");
  assert.equal(endpoint.executable, false);
});

test("projection: expired or tuple-mismatched attestations never qualify", () => {
  const r = row();
  const prices = new Map<string, PriceRowView>([[r.endpointId, { status: "VERIFIED", evidenceHash: SOURCE_HASH }]]);
  const cases: Partial<QualificationAttestation>[] = [
    { expiresAt: "2026-01-01T00:00:00.000Z" },
    { adapterVersion: "1.0.0" },
    { schemaVersion: "other" },
    { priceVersion: "2.0.0" },
    { policyProfile: "strict" },
  ];
  for (const overrides of cases) {
    const endpoint = project([r], new Map([[r.endpointId, attestation(r.endpointId, overrides)]]), prices).endpoints[0]!;
    assert.notEqual(endpoint.qualificationState, "QUALIFIED", JSON.stringify(overrides));
    assert.equal(endpoint.executable, false, JSON.stringify(overrides));
  }
});

test("projection: terminal signals outrank a live attestation", () => {
  const r = row({ enabled: false });
  const endpoint = project([r], new Map([[r.endpointId, attestation(r.endpointId)]]), new Map()).endpoints[0]!;
  assert.equal(endpoint.qualificationState, "DISABLED");
  assert.equal(endpoint.executable, false);
});

// ---------------------------------------------------------------------------
// Checked-in registry — the 391-entry data gap
// ---------------------------------------------------------------------------

test("registry: DERIVED entries all carry BLOCKED_PRICE_UNKNOWN; nothing is VERIFIED, qualified or executable", async () => {
  resetLocalCatalogCache();
  const source = await listLocalCatalogSource();
  const prices = await listLocalPrices();
  // Mirror of app/api/studio/v1/catalog/route.ts projectPublicCatalog:
  // attestations are hard-coded empty on the public/local lane.
  const projection = projectCatalog(source, new Map(), prices, new Set(), {
    catalogVersion: "test",
    nowIso: NOW,
  });
  const derived = projection.endpoints.filter((e) => e.priceState === "DERIVED");

  assert.equal(projection.tallies.endpoints, 1500);
  assert.equal(derived.length, 391, "DERIVED count changed: update docs/catalog-qualification/STUDIO-05.md");
  assert.equal(projection.tallies.byPrice.DERIVED, 391);
  assert.equal(projection.tallies.byPrice.VERIFIED, 0);
  assert.equal(projection.tallies.byPrice.STALE, 0);
  assert.equal(projection.tallies.byPrice.UNKNOWN, 1109);

  assert.ok(
    derived.every((e) => e.blockedCodes.includes(BLOCKED_PRICE_UNKNOWN)),
    "every DERIVED entry is blocked by design (priceQuoteGuidance)",
  );
  // Qualification is a separate gate: with no attestations everything is UNVERIFIED.
  assert.equal(projection.tallies.byQualification.UNVERIFIED, 1500);
  assert.equal(projection.tallies.byQualification.QUALIFIED, 0);
  assert.equal(projection.tallies.byQualification.PARTIALLY_QUALIFIED, 0);
  assert.equal(projection.tallies.executable, 0);

  // The local lane can only ever emit DERIVED price rows (memory-catalog.ts).
  assert.ok([...prices.values()].every((p) => p.status === "DERIVED"));
  assert.equal(prices.size, 391);
});

// ---------------------------------------------------------------------------
// Seed SPEC (docs/catalog-qualification/STUDIO-05-seed.sql) — model check only.
// The SQL is never executed; this proves the picked endpoints would qualify
// in the projection once the documented rows exist.
// ---------------------------------------------------------------------------

function seedEndpoints(): { endpointId: string; task: string }[] {
  const sql = readFileSync(join(ROOT, "docs/catalog-qualification/STUDIO-05-seed.sql"), "utf8");
  const out: { endpointId: string; task: string }[] = [];
  for (const m of sql.matchAll(/^-- SEED-ENDPOINT: (\S+) (\S+)$/gm)) {
    out.push({ endpointId: m[1]!, task: m[2]! });
  }
  return out;
}

test("seed SPEC: picks exist in the registry as DERIVED, schema-known, mapped, and cover every modality", async () => {
  const seeds = seedEndpoints();
  assert.ok(seeds.length >= 4, "at least one endpoint per modality");
  const catalog = JSON.parse(
    readFileSync(join(ROOT, "lib/media/generated/fal-catalog.json"), "utf8"),
  ) as LocalCatalogJson;
  const source = buildLocalSource(catalog, {});
  resetLocalCatalogCache();
  const prices = await listLocalPrices();

  const byId = new Map(source.map((s) => [s.endpointId, s]));
  const modalities = new Set<string>();
  for (const seed of seeds) {
    const s = byId.get(seed.endpointId);
    assert.ok(s, `${seed.endpointId} missing from registry`);
    assert.equal(s.tasks[0], seed.task, `${seed.endpointId} task drifted`);
    assert.equal(s.schemaKnown, true, `${seed.endpointId} schema unknown`);
    assert.equal(s.disposition, "eligible", `${seed.endpointId} disposition`);
    assert.equal(prices.get(seed.endpointId)?.status, "DERIVED", `${seed.endpointId} price`);
    for (const m of s.modalityOut) modalities.add(m);
  }
  for (const required of ["image", "video", "audio", "model"]) {
    assert.ok(modalities.has(required), `modality ${required} not covered`);
  }

  // Model of the seeded state: tuple-matching executable attestations, DERIVED prices.
  const attestations = new Map(
    seeds.map((seed) => [seed.endpointId, attestation(seed.endpointId)] as const),
  );
  const projection = projectCatalog(source, attestations, prices, new Set(), {
    catalogVersion: "test",
    nowIso: NOW,
  });
  for (const seed of seeds) {
    const endpoint = projection.endpoints.find((e) => e.endpointId === seed.endpointId)!;
    assert.equal(endpoint.qualificationState, "QUALIFIED", seed.endpointId);
    assert.equal(endpoint.executable, true, seed.endpointId);
    // Qualification does not verify price: the code remains until VERIFIED.
    assert.ok(endpoint.blockedCodes.includes(BLOCKED_PRICE_UNKNOWN), seed.endpointId);
  }
  assert.equal(projection.tallies.executable, seeds.length);
});

test("seed SPEC: SQL is fail-closed (single transaction, rollback default, no unconditional VERIFIED, inserts only)", () => {
  const sql = readFileSync(join(ROOT, "docs/catalog-qualification/STUDIO-05-seed.sql"), "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.match(statements, /\\set ON_ERROR_STOP on/);
  assert.match(statements, /^begin;$/m);
  assert.match(statements, /^rollback;$/m);
  assert.doesNotMatch(statements, /^commit;$/im);
  assert.doesNotMatch(statements, /\bdelete\s+from\b|\btruncate\b|\bdrop\b/i);
  // The only UPDATE is the opt-in VERIFIED promotion, inside \if :{?verify_prices}.
  const ifStart = statements.indexOf("\\if :{?verify_prices}");
  const ifEnd = statements.indexOf("\\endif");
  assert.ok(ifStart >= 0 && ifEnd > ifStart);
  for (const m of statements.matchAll(/\bupdate\s+public\./gi)) {
    assert.ok(m.index! > ifStart && m.index! < ifEnd, "UPDATE outside the verify_prices gate");
  }
  assert.doesNotMatch(statements.slice(0, ifStart) + statements.slice(ifEnd), /'VERIFIED'/);
  // Attestations require owner-supplied evidence variables.
  assert.match(statements, /:'attested_by'/);
  assert.match(statements, /:'canary_evidence_image'/);
});

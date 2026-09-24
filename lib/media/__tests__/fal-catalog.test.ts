import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  FAL_CATALOG_COUNT,
  FAL_CATALOG_ENDPOINT_COUNT,
  FAL_CATALOG_SHA,
  FAL_CATALOG_SOURCE,
  FAL_CATALOG_VERSION,
  getFalCatalogEndpoints,
  getFalCatalogModelById,
  getFalCatalogModels,
  getRegistryEndpointById,
  getRegistryEndpoints,
  getRegistryTallies,
  searchRegistry,
} from "../fal-catalog";
import {
  getAllMediaModels,
  getCatalogModelById,
  getDefaultModel,
  getRegistryAutoDefault,
  getRegistryModelOptions,
} from "../models";
import { getFalCatalogProviderEntries } from "../providers/models";
import { reconcileCatalog } from "../endpoint-registry";

interface GeneratedCatalog {
  catalog_version: string;
  source: string;
  record_count: number;
  endpoint_count: number;
  dispositions: { eligible: number; quarantined: number; excluded: number };
}

function readGeneratedCatalog(): GeneratedCatalog {
  const raw = readFileSync(new URL("../generated/fal-catalog.json", import.meta.url), "utf8");
  return JSON.parse(raw) as GeneratedCatalog;
}

test("projection rebuilds from the canonical authority", () => {
  const generated = readGeneratedCatalog();
  assert.equal(FAL_CATALOG_VERSION, "studio-fal-catalog-v2");
  assert.equal(FAL_CATALOG_SOURCE, "data/media-models/canonical-media-models.jsonl");
  assert.equal(FAL_CATALOG_COUNT, generated.record_count);
  assert.equal(FAL_CATALOG_ENDPOINT_COUNT, generated.endpoint_count);
  const raw = readFileSync(new URL("../../../data/media-models/canonical-media-models.jsonl", import.meta.url), "utf8");
  assert.equal(FAL_CATALOG_SHA, createHash("sha256").update(raw, "utf8").digest("hex"));
});

test("reconciliation covers every source endpoint exactly once", () => {
  const rows = readFileSync(new URL("../../../data/media-models/fal-media-endpoints.jsonl", import.meta.url), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line).endpoint_id as string);
  const projected = getRegistryEndpoints().map((endpoint) => endpoint.endpointId);
  const result = reconcileCatalog(rows, projected);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.extra, []);
  assert.equal(result.sourceIds, rows.length);
  assert.equal(result.projectedIds, rows.length);
});

test("dispositions and family/endpoint counts stay truthful", () => {
  const generated = readGeneratedCatalog();
  const tallies = getRegistryTallies();
  assert.equal(tallies.families, generated.record_count);
  assert.equal(tallies.endpoints, generated.endpoint_count);
  assert.equal(tallies.eligible, generated.dispositions.eligible);
  assert.equal(tallies.quarantined, generated.dispositions.quarantined);
  assert.equal(tallies.excluded, generated.dispositions.excluded);
  assert.ok(tallies.schemaSupported > 0);
  assert.equal(tallies.schemaSupported + tallies.schemaUnavailable, generated.endpoint_count);
});

test("catalog posture is setup-required, never executable", () => {
  const generated = readGeneratedCatalog();
  const models = getFalCatalogModels();
  assert.equal(models.length, generated.record_count);
  for (const model of models) {
    assert.equal(model.executionState, "contract_only");
    assert.equal(model.setupRequired, true);
    assert.equal(model.estimatedCredits, 0);
  }
  assert.equal(getFalCatalogEndpoints().length, generated.endpoint_count);
  assert.ok(getFalCatalogModelById("falfam/fal-ai-flux"));
});

test("bridge keeps compatibility aliases; active reads use the registry", () => {
  // Compat (runtime callers until Job 3): hardcoded ids still resolve.
  const union = getAllMediaModels();
  assert.equal(union.length, new Set(union.map((model) => model.id)).size);
  assert.equal(getDefaultModel("image")?.id, "sd-xl");
  assert.equal(getDefaultModel("video")?.id, "generic-video-default");
  // Legacy behavior deliberately evolved: no-shadow now spans registry ids.
  const hardcoded = new Set(["sd-xl", "generic-video-default"]);
  for (const endpoint of getFalCatalogEndpoints()) {
    assert.ok(!hardcoded.has(endpoint.endpointId), `shadowed id ${endpoint.endpointId}`);
  }
  // Active UI reads: Auto default + explicit registry options with support states.
  assert.equal(getRegistryAutoDefault().id, "auto");
  const options = getRegistryModelOptions();
  assert.equal(options[0]?.id, "auto");
  assert.ok(options.length > readGeneratedCatalog().endpoint_count);
  const selectable = options.filter((option) => !option.disabled);
  assert.ok(selectable.length > 0);
  assert.ok(selectable.every((option) => option.id === "auto" || getRegistryEndpointById(option.id)?.schema.status === "supported"));
  assert.equal(getCatalogModelById("fal-ai/wan-i2v")?.executionState, "available");
});

test("provider entries stay setup-required with unknown costs", () => {
  const entries = getFalCatalogProviderEntries();
  const tallies = getRegistryTallies();
  assert.equal(entries.length, tallies.eligible + tallies.quarantined);
  for (const entry of entries) {
    assert.equal(entry.status, "setup-required");
    assert.equal(entry.estimatedCost, "not provided");
  }
});

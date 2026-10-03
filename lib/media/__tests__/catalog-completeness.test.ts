import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { validateCatalog } from "../../../scripts/validate-catalog-completeness";
import {
  RENDERER_CONTROL_TYPES,
  controlForInput,
  isRendererSupported,
  outputSupportForSnapshot,
} from "../schema-controls";

test("catalog completeness: zero unjustified gaps", () => {
  const report = validateCatalog();
  assert.equal(report.gaps, 0, `unjustified gaps: ${report.entries.filter((e) => e.status === "gap").map((e) => `${e.family_id}: ${e.gaps.join("; ")}`).join(" | ")}`);
  assert.equal(report.entries_total, report.complete + report.exceptions + report.gaps);
  // Every exception is justified with a per-endpoint reason.
  for (const entry of report.entries.filter((e) => e.status === "exception")) {
    assert.ok(entry.exceptions.length > 0, `${entry.family_id}: exception without justification`);
  }
});

test("coverage artifact exists and matches the canonical source", () => {
  const coveragePath = new URL("../../../artifacts/studio-closure/catalog-coverage.json", import.meta.url);
  assert.ok(existsSync(coveragePath), "artifacts/studio-closure/catalog-coverage.json missing: run the validator");
  const coverage = JSON.parse(readFileSync(coveragePath, "utf8")) as {
    catalog_sha256: string;
    entries_total: number;
    gaps: number;
    open_model_families: string[];
  };
  const canonRaw = readFileSync(new URL("../../../data/media-models/canonical-media-models.jsonl", import.meta.url), "utf8");
  assert.equal(coverage.catalog_sha256, createHash("sha256").update(canonRaw, "utf8").digest("hex"));
  assert.equal(coverage.gaps, 0);
  assert.ok(coverage.open_model_families.length >= 1, "no open-model families with provenance");
  assert.ok(coverage.open_model_families.includes("falfam/fal-ai-marigold-v2"), "marigold-v2 provenance missing");
});

test("open-model families carry license provenance end to end", () => {
  const generated = JSON.parse(
    readFileSync(new URL("../generated/fal-catalog.json", import.meta.url), "utf8"),
  ) as {
    records: {
      family_id: string;
      openness: string;
      license: { id: string; upstream: string; evidence: string } | null;
      endpoints: { endpoint_id: string; license: { id: string; upstream: string } | null }[];
    }[];
  };
  const marigold = generated.records.find((r) => r.family_id === "falfam/fal-ai-marigold-v2");
  assert.ok(marigold, "marigold-v2 family missing from projection");
  assert.equal(marigold.openness, "open-weights");
  assert.equal(marigold.license?.id, "Apache-2.0");
  assert.equal(marigold.license?.upstream, "huawei-bayerlab/marigold-v2");
  assert.equal(marigold.endpoints[0]?.license?.id, "Apache-2.0");
  // Mixed families (proprietary + open endpoints) never claim full openness.
  const flux = generated.records.find((r) => r.family_id === "falfam/fal-ai-flux-1");
  assert.equal(flux?.openness, "mixed");
  const schnell = flux?.endpoints.find((e) => e.endpoint_id === "fal-ai/flux-1/schnell");
  assert.equal(schnell?.license?.id, "Apache-2.0");
  const dev = flux?.endpoints.find((e) => e.endpoint_id === "fal-ai/flux-1/dev");
  assert.equal(dev?.license, null);
});

test("renderer control taxonomy covers the catalog input shapes", () => {
  assert.deepEqual([...RENDERER_CONTROL_TYPES].sort(), [
    "file-upload", "group", "list", "multi-select", "number", "select", "slider",
    "tags", "text", "textarea", "toggle",
  ].sort());
  // Scalars.
  assert.equal(controlForInput("prompt", { type: "string" }).control, "textarea");
  assert.equal(controlForInput("cfg", { type: "number" }).control, "number");
  assert.equal(controlForInput("steps", { type: "integer", minimum: 1, maximum: 50 }).control, "slider");
  assert.equal(controlForInput("turbo", { type: "boolean" }).control, "toggle");
  assert.equal(controlForInput("style", { type: "string", enum: ["a", "b"] }).control, "select");
  assert.equal(controlForInput("image_url", { type: "string" }).control, "file-upload");
  // Structured shapes from real snapshots.
  assert.equal(controlForInput("voice", { type: "object", properties: { name: { type: "string", enum: ["a"] } } }).control, "select");
  assert.equal(controlForInput("inputs", {
    type: "array",
    items: { type: "object", properties: { text: { type: "string" }, voice: { type: "string" } }, required: ["text", "voice"] },
  }).control, "list");
  assert.equal(controlForInput("ids", { type: "array", items: { type: "integer" } }).control, "tags");
  // Unknown stays unsupported, never guessed.
  assert.equal(isRendererSupported(controlForInput("blob", { type: "object" }).control), false);
  assert.equal(isRendererSupported(controlForInput("blob", { type: "array", items: {} }).control), false);
});

test("output modality support follows the job-runner contract", () => {
  assert.deepEqual(outputSupportForSnapshot({ output_name: "QueueStatus", output: { properties: {} } }).supported, true);
  assert.equal(outputSupportForSnapshot({ output_name: "Other", output: { properties: {} } }).supported, false);
  assert.equal(
    outputSupportForSnapshot({ output_name: "Other", output: { properties: { image: { type: "string" } } } }).modality,
    "image",
  );
});

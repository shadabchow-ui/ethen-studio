// J03 Studio projection: canonical media catalog -> generated Studio inventory.
// V2 (Studio V3 Job 2): family records plus enriched endpoint members joined
// from endpoint rows (identities, developer evidence, disposition reasons,
// pricing provenance) and schema snapshots (refs, versions, verification).
// Rebuildable from the same authorities; carries source/version/hash.
// Usage: node scripts/media-models/project-studio-catalog.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { stableStringify } from "./lib.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const CANON = join(ROOT, "data/media-models/canonical-media-models.jsonl");
const ENDPOINTS = join(ROOT, "data/media-models/fal-media-endpoints.jsonl");
const COVERAGE = join(ROOT, "data/media-models/schema-coverage.json");
const CHECKPOINT = join(ROOT, "data/media-models/schema-import-checkpoint.json");
const OUT = join(ROOT, "lib/media/generated/fal-catalog.json");

const TASK_LABELS = {
  "text-to-image": "Text to Image", "image-generation": "Image Generation",
  "image-editing": "Image Editing", "image-to-image": "Image to Image",
  "text-to-video": "Text to Video", "image-to-video": "Image to Video",
  "reference-to-video": "Reference to Video", "video-to-video": "Video to Video",
  "video-editing": "Video Editing", "3d-generation": "3D Generation",
  "lora-training": "LoRA Training", speech: "Speech", "text-to-audio": "Text to Audio",
  "music-generation": "Music Generation", "language-model": "Language Model",
  "video-to-audio": "Video to Audio",
};
const AUDIO_CATEGORIES = new Set(["audio", "speech", "music"]);
const raw = readFileSync(CANON, "utf8");
const endpointRows = readFileSync(ENDPOINTS, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const byId = new Map(endpointRows.map((r) => [r.endpoint_id, r]));
let checkpoint = { done: {} };
try {
  checkpoint = JSON.parse(readFileSync(CHECKPOINT, "utf8"));
} catch { /* no imports yet */ }
let coverage = null;
try {
  coverage = JSON.parse(readFileSync(COVERAGE, "utf8"));
} catch { /* no coverage yet */ }

const tallies = { eligible: 0, quarantined: 0, excluded: 0 };
const records = raw.trim().split("\n").map((l) => JSON.parse(l)).map((r) => {
  const tasks = r.media.tasks;
  // Modality is a browse grouping only; execution stays gated by qualified routes.
  const modality = r.media.category === "video" || tasks.some((t) => t.includes("video")) ? "video"
    : AUDIO_CATEGORIES.has(r.media.category) ? "audio" : "image";
  return {
    family_id: r.identity.repo_id,
    name: r.identity.name,
    display_name: `fal · ${r.identity.name}`,
    modality,
    category: r.media.category,
    tasks: tasks.map((t) => TASK_LABELS[t] ?? t),
    task_ids: tasks,
    tier: r.media.tier,
    route: r.media.route,
    supports_fine_tuning: tasks.includes("lora-training"),
    endpoints: r.media.member_endpoints.map((e) => {
      const row = byId.get(e.endpoint_id);
      const disp = e.disposition ?? row?.disposition ?? "quarantined";
      if (tallies[disp] !== undefined) tallies[disp] += 1;
      const snap = checkpoint.done?.[e.endpoint_id];
      const snapPath = snap?.status === "supported" ? snap.snapshot : null;
      let requiredInputs = null;
      let supportedInputs = null;
      if (snapPath) {
        try {
          const snapDoc = JSON.parse(readFileSync(join(ROOT, snapPath), "utf8"));
          requiredInputs = [...(snapDoc.input?.required ?? [])];
          supportedInputs = Object.keys(snapDoc.input?.properties ?? {});
        } catch { /* snapshot unreadable: inputs stay unknown */ }
      }
      return {
        endpoint_id: e.endpoint_id,
        task: e.task ?? row?.task ?? "unknown",
        disposition: disp,
        disposition_reason: row?.disposition_reason ?? null,
        developer: row?.developer ?? "unknown",
        developer_clues: (row?.developer_clues ?? []).map((c) => `${c.kind ?? "clue"}:${c.value ?? ""}`),
        page_url: row?.url ?? null,
        row_sha256: row?.row_sha256 ?? null,
        pricing: {
          status: row?.pricing?.normalized?.status === "known" ? "known" : "unknown",
          sentences: row?.pricing?.price_sentences ?? [],
          raw_hash: row?.pricing?.raw_hash ?? null,
        },
        schema: snapPath
          ? { status: "supported", snapshot: snapPath, verified_at: snap.at ?? null }
          : {
              status: "unavailable",
              snapshot: null,
              reason: snap?.status === "failed" ? `import ${snap.reason}` : "not yet imported",
            },
        health: { status: "unknown", reason: "job-3-runtime" },
        capabilities: { required_inputs: requiredInputs, supported_inputs: supportedInputs },
      };
    }),
  };
});
records.sort((a, b) => a.family_id.localeCompare(b.family_id));
const endpointCount = records.reduce((n, r) => n + r.endpoints.length, 0);
const catalog = {
  catalog_version: "studio-fal-catalog-v2",
  source: "data/media-models/canonical-media-models.jsonl",
  endpoint_source: "data/media-models/fal-media-endpoints.jsonl",
  canonical_sha256: createHash("sha256").update(raw, "utf8").digest("hex"),
  record_count: records.length,
  endpoint_count: endpointCount,
  dispositions: tallies,
  schema_coverage: coverage
    ? { supported: coverage.supported, attempted: coverage.attempted, generated_at: coverage.generated_at }
    : { supported: 0, attempted: 0, generated_at: null },
  records,
};
const SEARCH_OUT = join(ROOT, "lib/media/generated/fal-catalog-search.json");
// Browser-safe lightweight projection: identities + dispositions + schema
// status only. Served paginated over /api/media/models/* — never bundled,
// with full schemas lazy-loaded per endpoint.
const search = {
  catalog_version: catalog.catalog_version,
  source: catalog.source,
  canonical_sha256: catalog.canonical_sha256,
  record_count: catalog.record_count,
  endpoint_count: catalog.endpoint_count,
  dispositions: catalog.dispositions,
  schema_coverage: catalog.schema_coverage,
  records: records.map((r) => ({
    family_id: r.family_id,
    name: r.name,
    display_name: r.display_name,
    modality: r.modality,
    category: r.category,
    task_ids: r.task_ids,
    tier: r.tier,
    endpoints: r.endpoints.map((e) => ({
      endpoint_id: e.endpoint_id,
      task: e.task,
      disposition: e.disposition,
      schema_status: e.schema.status,
    })),
  })),
};
mkdirSync(join(OUT, ".."), { recursive: true });
writeFileSync(OUT, `${stableStringify(catalog)}\n`);
writeFileSync(SEARCH_OUT, `${stableStringify(search)}\n`);
console.log(JSON.stringify({ ok: true, records: records.length, endpoints: endpointCount, sha: catalog.canonical_sha256.slice(0, 12) }));

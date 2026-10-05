// MUSE-004 — open-model provenance curation (deterministic, idempotent).
//
// Adds open-weight license provenance to the canonical catalog at the
// pipeline level (never by hand-editing generated files):
//  1. one NEW open-weight family (falfam/fal-ai-marigold-v2, Apache-2.0)
//     with an endpoint row, canonical record, schema snapshot, checkpoint
//     and coverage updates, all derived from frozen evidence bytes;
//  2. license annotations on existing open-weight member endpoints whose
//     upstream weight license was verified against a primary source
//     (Hugging Face model API or the upstream repo README).
//
// Evidence (frozen, content-hashed):
//  - artifacts/studio-closure/evidence/fal-index-marigold-v2.json
//  - artifacts/studio-closure/evidence/fal-openapi-marigold-v2.json
//
// J01 mirroring notes (deviations are documented, never silent):
//  - task comes from the live fal.ai index category (the J01 keyword
//    taxonomy has no depth-estimation signal), recorded in task_evidence.
//  - pricing raw text is the verbatim fal.ai pricingInfoOverride with
//    markdown bold markers stripped (the J01 CSV carried plain text);
//    normalizePrice semantics are otherwise unchanged.
//  - row_sha256 is namespaced muse-004-curated-row-v1 (J01 hashed CSV
//    cells, which do not exist for curated rows); fact_hash, source_hash
//    and member pricing status follow the J01 formulas exactly.
//  - the new family is tier C / DRAFT: the J02 editorial pass has not run.
//
// Usage: node scripts/media-models/add-open-model-provenance.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stableStringify, sha256Text } from "./lib.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const CANON = join(ROOT, "data/media-models/canonical-media-models.jsonl");
const ENDPOINTS = join(ROOT, "data/media-models/fal-media-endpoints.jsonl");
const CHECKPOINT = join(ROOT, "data/media-models/schema-import-checkpoint.json");
const COVERAGE = join(ROOT, "data/media-models/schema-coverage.json");
const SNAPSHOT_PATH = "data/media-models/schema-snapshots/fal-ai-marigold-v2.json";
const EVIDENCE_INDEX = join(ROOT, "artifacts/studio-closure/evidence/fal-index-marigold-v2.json");
const EVIDENCE_OPENAPI = join(ROOT, "artifacts/studio-closure/evidence/fal-openapi-marigold-v2.json");

// Retrieval instant of the frozen evidence (curl fetch, documented).
const RETRIEVED_AT = "2026-10-03T04:46:17Z";
const VERIFIED_AT = "2026-10-03";
const CAPTURED_AT = "2026-10-03";

const MARIGOLD = {
  endpointId: "fal-ai/marigold-v2",
  url: "https://fal.ai/models/fal-ai/marigold-v2",
  task: "image-to-image",
  taskEvidence: "fal-index-category:image-to-image",
  mediaClass: "image",
  familyId: "falfam/fal-ai-marigold-v2",
  name: "fal-ai-marigold-v2",
  route: "/models/falfam/fal-ai-marigold-v2",
  license: {
    id: "Apache-2.0",
    scheme: "SPDX",
    upstream: "huawei-bayerlab/marigold-v2",
    upstream_kind: "github",
    evidence: "https://github.com/huawei-bayerlab/marigold-v2",
    evidence_quote: "models are released under the Apache License, Version 2.0",
    verified_at: VERIFIED_AT,
  },
};

// Verified upstream weight licenses for existing catalog endpoints.
// Evidence is the primary source that was read (HF model API JSON or the
// upstream repo); unverifiable families stay unannotated (unknown).
const LICENSE_ANNOTATIONS = [
  {
    license: {
      id: "Apache-2.0", scheme: "SPDX", upstream: "black-forest-labs/FLUX.1-schnell",
      upstream_kind: "huggingface", evidence: "https://huggingface.co/api/models/black-forest-labs/FLUX.1-schnell",
      evidence_quote: 'license: "apache-2.0"', verified_at: VERIFIED_AT,
    },
    endpoints: ["fal-ai/flux/schnell", "fal-ai/flux/schnell/redux", "fal-ai/flux-1/schnell", "fal-ai/flux-1/schnell/redux"],
  },
  {
    license: {
      id: "MIT", scheme: "SPDX", upstream: "HiDream-ai/HiDream-I1-Dev",
      upstream_kind: "huggingface", evidence: "https://huggingface.co/api/models/HiDream-ai/HiDream-I1-Dev",
      evidence_quote: 'license: "mit"', verified_at: VERIFIED_AT,
    },
    endpoints: ["fal-ai/hidream-i1-dev"],
  },
  {
    license: {
      id: "MIT", scheme: "SPDX", upstream: "ResembleAI/chatterbox",
      upstream_kind: "huggingface", evidence: "https://huggingface.co/api/models/ResembleAI/chatterbox",
      evidence_quote: 'license: "mit"', verified_at: VERIFIED_AT,
    },
    endpoints: ["fal-ai/chatterbox/speech-to-speech", "fal-ai/chatterbox/text-to-speech", "fal-ai/chatterbox/text-to-speech/multilingual"],
  },
  {
    license: {
      id: "Apache-2.0", scheme: "SPDX", upstream: "nari-labs/Dia-1.6B",
      upstream_kind: "huggingface", evidence: "https://huggingface.co/api/models/nari-labs/Dia-1.6B",
      evidence_quote: 'license: "apache-2.0"', verified_at: VERIFIED_AT,
    },
    endpoints: ["fal-ai/dia-tts", "fal-ai/dia-tts/voice-clone"],
  },
  {
    license: {
      id: "OpenRAIL++", scheme: "huggingface-tag", upstream: "stabilityai/stable-diffusion-xl-base-1.0",
      upstream_kind: "huggingface", evidence: "https://huggingface.co/api/models/stabilityai/stable-diffusion-xl-base-1.0",
      evidence_quote: 'license: "openrail++"', verified_at: VERIFIED_AT,
    },
    endpoints: ["fal-ai/fast-sdxl", "fal-ai/fast-sdxl/image-to-image", "fal-ai/fast-sdxl/inpainting"],
  },
  {
    license: {
      id: "Apache-2.0", scheme: "SPDX", upstream: "ACE-Step/ACE-Step-v1-3.5B",
      upstream_kind: "huggingface", evidence: "https://huggingface.co/api/models/ACE-Step/ACE-Step-v1-3.5B",
      evidence_quote: 'license: "apache-2.0"', verified_at: VERIFIED_AT,
    },
    endpoints: [
      "fal-ai/ace-step", "fal-ai/ace-step/audio-inpaint", "fal-ai/ace-step/audio-outpaint",
      "fal-ai/ace-step/audio-to-audio", "fal-ai/ace-step/prompt-to-audio",
    ],
  },
];

// J01 normalizePrice semantics on plain text (see lib.mjs).
function normalizePricePlain(raw) {
  if (!raw.trim()) return { raw_hash: sha256Text(raw), normalized: { status: "unknown" }, price_sentences: [] };
  const sentences = raw.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const priceSentences = sentences.filter((s) => /\$|per\s+(image|video|second|minute|request|run|mp|megapixel)|free/i.test(s));
  const amounts = [...raw.matchAll(/\$(\d+(?:\.\d+)?)\s*(per|\/)?\s*([a-zA-Z]+(?:\s[a-zA-Z]+)?)?/g)];
  if (amounts.length === 1) {
    const [, amount, , unitRaw] = amounts[0];
    return {
      raw_hash: sha256Text(raw),
      normalized: { amount, currency: "USD", unit: (unitRaw || "unknown").trim().toLowerCase() || "unknown", status: "parsed" },
      price_sentences: priceSentences.slice(0, 4),
    };
  }
  return { raw_hash: sha256Text(raw), normalized: { status: "unknown" }, price_sentences: priceSentences.slice(0, 4) };
}

// Snapshot shaping mirrors the J01 importer: strip title/examples/x-*,
// resolve local $refs, keep anyOf/enum/descriptions/bounds.
function stripNode(value, components) {
  if (Array.isArray(value)) return value.map((entry) => stripNode(entry, components));
  if (typeof value !== "object" || value === null) return value;
  if (typeof value.$ref === "string") {
    const match = /^#\/components\/schemas\/([A-Za-z0-9_]+)$/.exec(value.$ref);
    if (match && components[match[1]]) {
      const resolved = stripNode(components[match[1]], components);
      const rest = { ...value };
      delete rest.$ref;
      return { ...resolved, ...stripNode(rest, components) };
    }
  }
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "title" || key === "examples" || key === "example" || key.startsWith("x-") || key === "$ref") continue;
    out[key] = stripNode(entry, components);
  }
  return out;
}

function readJsonl(path) {
  return readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function main() {
  const report = { added_family: null, annotated_members: 0, annotated_families: [], snapshot: null, already_applied: true };
  const indexItem = JSON.parse(readFileSync(EVIDENCE_INDEX, "utf8"));
  const openapiBytes = readFileSync(EVIDENCE_OPENAPI);
  const openapi = JSON.parse(openapiBytes.toString("utf8"));
  if (indexItem.id !== MARIGOLD.endpointId) throw new Error("frozen index evidence is not marigold-v2");

  // ── 1. endpoint row ──
  const rows = readJsonl(ENDPOINTS);
  const haveRow = rows.some((row) => row.endpoint_id === MARIGOLD.endpointId);
  // Verbatim pricing prose with markdown bold stripped (documented above).
  const priceRaw = String(indexItem.pricingInfoOverride || "").replace(/\*\*/g, "");
  const pricing = normalizePricePlain(priceRaw);
  const rowSha = sha256Text(`muse-004-curated-row-v1:${stableStringify({
    endpoint_id: MARIGOLD.endpointId, url: MARIGOLD.url, task: MARIGOLD.task,
    media_class: MARIGOLD.mediaClass, price_sentences: pricing.price_sentences,
  })}`);
  if (!haveRow) {
    report.already_applied = false;
    const nextIndex = Math.max(...rows.map((row) => row.row_index)) + 1;
    rows.push({
      endpoint_id: MARIGOLD.endpointId,
      url: MARIGOLD.url,
      row_index: nextIndex,
      row_sha256: rowSha,
      fal_namespace: "fal-ai",
      namespace_raw: "fal-ai",
      name_raw: "marigold-v2",
      developer: "unknown",
      developer_clues: [{ kind: "fal-namespace", value: "fal-ai" }],
      task: MARIGOLD.task,
      task_evidence: MARIGOLD.taskEvidence,
      media_class: MARIGOLD.mediaClass,
      disposition: "eligible",
      disposition_reason: `media_class=${MARIGOLD.mediaClass};task=${MARIGOLD.task}`,
      pricing,
      fact_hash: sha256Text(stableStringify({
        endpointId: MARIGOLD.endpointId, url: MARIGOLD.url, task: MARIGOLD.task,
        mediaClass: MARIGOLD.mediaClass, pricing: pricing.normalized,
      })),
    });
    writeFileSync(ENDPOINTS, `${rows.map((row) => stableStringify(row)).join("\n")}\n`);
  }
  const memberRowSha = haveRow ? rows.find((row) => row.endpoint_id === MARIGOLD.endpointId).row_sha256 : rowSha;

  // ── 2. canonical family record (tier C / DRAFT: J02 has not run) ──
  const records = readJsonl(CANON);
  const haveFamily = records.some((record) => record.identity.repo_id === MARIGOLD.familyId);
  const shortDescription = String(indexItem.shortDescription || "").trim();
  const sourceHash = sha256Text(stableStringify([memberRowSha]));
  if (!haveFamily) {
    report.already_applied = false;
    report.added_family = MARIGOLD.familyId;
    const evidenceHash = sha256Text(stableStringify({
      index: sha256Bytes(readFileSync(EVIDENCE_INDEX)),
      openapi: sha256Bytes(openapiBytes),
    }));
    records.push({
      catalog_family: "media",
      // Curated editorial stub: verbatim fal.ai copy only, flagged as
      // pre-J02. The J02 editorial pass replaces this with evidenced copy.
      editorial: {
        best_for: ["Monocular depth visualization"],
        capabilities: [],
        model_used: "muse-004-curation (pre-J02 stub)",
        overview: { evidence: ["fal-index"], text: shortDescription },
        prompt_version: "muse-004-curation-v1",
        short_description: { evidence: ["fal-index"], text: shortDescription },
        use_cases: [],
      },
      identity: { author: "falfam", name: MARIGOLD.name, repo_id: MARIGOLD.familyId },
      media: {
        availability: { eligible: 1, excluded: 0, quarantined: 0 },
        catalog_enabled: true,
        category: "image",
        delivery: "fal.ai",
        developer: "unknown",
        family_id: MARIGOLD.familyId,
        license: { ...MARIGOLD.license, scope: "family" },
        member_endpoints: [{
          disposition: "eligible",
          endpoint_id: MARIGOLD.endpointId,
          license: { ...MARIGOLD.license, scope: "endpoint" },
          pricing: { status: pricing.normalized.status },
          task: MARIGOLD.task,
          url: MARIGOLD.url,
        }],
        openness: "open-weights",
        route: MARIGOLD.route,
        studio_enabled: true,
        tasks: [MARIGOLD.task],
        tier: "C",
      },
      publication_candidate: {
        gates: { sufficient_facts: false, unique_route: true },
        index_candidate: false,
        recommended_state: "DRAFT",
        required_before_indexing: ["j02-editorial-pass"],
      },
      record_hashes: {
        content_kind: "muse-004-curated",
        content_sha256: sha256Text(stableStringify({ family: MARIGOLD.familyId, members: [MARIGOLD.endpointId] })),
        fact_pack_hash: evidenceHash,
        source_hash: sourceHash,
      },
      schema_version: "ethen-media-model-v1",
      seo: {
        faq: [],
        meta_description: shortDescription.slice(0, 160),
        primary_keyword: "Marigold V2 depth estimation",
        secondary_keywords: ["depth map", "monocular depth"],
        title: "Marigold V2 Depth",
      },
      source: {
        captured_at: CAPTURED_AT,
        parser_version: "muse-004-curation-v1",
        repo_id: MARIGOLD.familyId,
        snapshot_sha256: evidenceHash,
        source_type: "fal-index+muse-004-curation",
        source_url: MARIGOLD.url,
      },
    });
    records.sort((a, b) => a.identity.repo_id.localeCompare(b.identity.repo_id));
    writeFileSync(CANON, `${records.map((record) => stableStringify(record)).join("\n")}\n`);
  }

  // ── 3. schema snapshot ──
  const snapshotAbs = join(ROOT, SNAPSHOT_PATH);
  if (!existsSync(snapshotAbs)) {
    report.already_applied = false;
    const components = openapi.components?.schemas ?? {};
    const queuePath = "/fal-ai/marigold-v2";
    const post = openapi.paths?.[queuePath]?.post ?? {};
    const inputRef = post.requestBody?.content?.["application/json"]?.schema?.$ref ?? "";
    const inputName = (/\/([A-Za-z0-9_]+)$/.exec(inputRef) || [])[1] || "MarigoldV2Input";
    const snapshot = {
      snapshot_version: 1,
      endpoint_id: MARIGOLD.endpointId,
      task: MARIGOLD.task,
      source_url: MARIGOLD.url,
      schema_url: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(MARIGOLD.endpointId)}`,
      retrieved_at: RETRIEVED_AT,
      openapi_version: openapi.openapi,
      info_version: openapi.info?.version ?? null,
      category: indexItem.category,
      bytes_sha256: sha256Bytes(openapiBytes),
      queue_path: queuePath,
      input_name: inputName,
      input: { $refName: inputName, ...stripNode(components[inputName], components) },
      output_name: "QueueStatus",
      output: { $refName: "QueueStatus", ...stripNode(components.QueueStatus, components) },
      refs_available: Object.keys(components).sort(),
    };
    writeFileSync(snapshotAbs, `${JSON.stringify(snapshot, null, 2)}\n`);
    report.snapshot = SNAPSHOT_PATH;
  }

  // ── 4. checkpoint + coverage ──
  const checkpoint = JSON.parse(readFileSync(CHECKPOINT, "utf8"));
  if (!checkpoint.done?.[MARIGOLD.endpointId]) {
    report.already_applied = false;
    checkpoint.done[MARIGOLD.endpointId] = { status: "supported", snapshot: SNAPSHOT_PATH, at: RETRIEVED_AT };
    checkpoint.updated_at = RETRIEVED_AT;
    writeFileSync(CHECKPOINT, `${JSON.stringify(checkpoint, null, 2)}\n`);
  }
  const coverage = JSON.parse(readFileSync(COVERAGE, "utf8"));
  if (!coverage.this_run?.some((entry) => entry.endpoint_id === MARIGOLD.endpointId)) {
    report.already_applied = false;
    coverage.this_run.push({ endpoint_id: MARIGOLD.endpointId, status: "supported", snapshot: SNAPSHOT_PATH });
    coverage.endpoints_total += 1;
    coverage.attempted += 1;
    coverage.supported += 1;
    coverage.by_reason.supported += 1;
    coverage.generated_at = RETRIEVED_AT;
    writeFileSync(COVERAGE, `${JSON.stringify(coverage, null, 2)}\n`);
  }

  // ── 5. license annotations on existing families ──
  const licenseByEndpoint = new Map();
  for (const group of LICENSE_ANNOTATIONS) {
    for (const endpointId of group.endpoints) licenseByEndpoint.set(endpointId, group.license);
  }
  let touched = false;
  for (const record of records) {
    const members = record.media.member_endpoints;
    let annotated = 0;
    for (const member of members) {
      const license = licenseByEndpoint.get(member.endpoint_id);
      if (license && !member.license) {
        member.license = { ...license, scope: "endpoint" };
        annotated += 1;
        touched = true;
      } else if (member.license) {
        annotated += 1;
      }
    }
    if (annotated > 0) {
      const licensed = members.filter((member) => member.license);
      const uniform = licensed.length === members.length
        && licensed.every((member) => member.license.id === licensed[0].license.id && member.license.upstream === licensed[0].license.upstream);
      const openness = uniform ? "open-weights" : "mixed";
      if (record.media.openness !== openness) {
        record.media.openness = openness;
        touched = true;
      }
      if (uniform && !record.media.license) {
        record.media.license = { ...licensed[0].license, scope: "family" };
        touched = true;
      }
      report.annotated_members += annotated;
      report.annotated_families.push(record.identity.repo_id);
    }
  }
  if (touched) {
    report.already_applied = false;
    writeFileSync(CANON, `${records.map((record) => stableStringify(record)).join("\n")}\n`);
  }
  // Sanity: every annotated endpoint id resolved to a real member.
  const memberIds = new Set(records.flatMap((record) => record.media.member_endpoints.map((member) => member.endpoint_id)));
  const unresolved = [...licenseByEndpoint.keys()].filter((id) => !memberIds.has(id));
  if (unresolved.length > 0) throw new Error(`license annotation missed members: ${unresolved.join(", ")}`);

  console.log(JSON.stringify({ ok: true, ...report }));
}

main();

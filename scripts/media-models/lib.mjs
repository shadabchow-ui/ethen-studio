// Ethen media-models pipeline core (J01). Node built-ins only. Deterministic: no
// wall-clock, no randomness; all outputs sorted with stable key order.
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CAPTURED_DATE = "2026-09-19";
export const DOSSIER_SCHEMA = "ethen-media-dossier-v1";
export const DELTA_SCHEMA = "ethen-media-editorial-delta-v1";
export const BATCH_SCHEMA = "ethen-media-batch-manifest-v1";
export const PROMPT_VERSION = "j02-editorial-batch-v1";
export const PIPELINE_VERSION = "j01-media-pipeline-v1";
export const FAMILY_PUBLISHER = "falfam";

// ---------- stable primitives ----------
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}
export function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}
export function sha256Text(s) {
  return sha256Hex(Buffer.from(s, "utf8"));
}
// Same semantics as apps/web/scripts/model-publication-validator.mjs routeSlug.
export function routeSlug(value) {
  return String(value).normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
export const MEDIA_SCHEMA_VERSION = "ethen-media-model-v1";

// J03: deterministic internal record ID -> route publisher/slug + object key.
// Media IDs are slash-separated (falfam/<name>); colon IDs are rejected, never
// split with HF slash logic.
export function deriveMediaRoute(recordId) {
  if (typeof recordId !== "string" || recordId.includes(":")) throw new Error(`Invalid media record ID: ${recordId}`);
  const slash = recordId.indexOf("/");
  if (slash <= 0 || slash === recordId.length - 1) throw new Error(`Invalid media record ID: ${recordId}`);
  const publisher = recordId.slice(0, slash);
  const name = recordId.slice(slash + 1);
  if (publisher !== "falfam") throw new Error(`Unexpected media namespace: ${recordId}`);
  const publisherSlug = routeSlug(publisher);
  const modelSlug = routeSlug(name);
  if (!publisherSlug || !modelSlug) throw new Error(`Record ID does not produce a valid route: ${recordId}`);
  return { publisher, name, publisherSlug, modelSlug, route: `/models/${publisherSlug}/${modelSlug}`, r2Key: `models/${publisherSlug}/${modelSlug}/model.json.gz` };
}

// J03: candidate-permits rule shared by merge and publication validation.
export function mediaCandidatePermits(candidate) {
  return Boolean(candidate) && candidate.index_candidate === true
    && candidate.recommended_state === "INDEXABLE_AFTER_VALIDATION"
    && Array.isArray(candidate.required_before_indexing) && candidate.required_before_indexing.length === 0;
}

export function tokenUpperBoundUtf8(byteLength) {
  return Math.ceil(byteLength / 3); // conservative: <=1 token per 3 bytes labeled upper bound
}
export function deterministicGzipBytes(buf) {
  return gzipSync(buf, { mtime: 0, level: 9 });
}
export function gunzipToString(bytes) {
  return gunzipSync(bytes).toString("utf8");
}
export function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
export function readJsonl(path) {
  const text = readFileSync(path, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}
export function writeFileAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}
export function writeJsonlAtomic(path, rows) {
  writeFileAtomic(path, `${rows.map((r) => stableStringify(r)).join("\n")}\n`);
}
export function writeJsonAtomic(path, value) {
  writeFileAtomic(path, `${stableStringify(value)}\n`);
}

// ---------- URL / taxonomy ----------
export function falPathSegments(url) {
  const m = /^https:\/\/fal\.ai\/models\/([^?#]*)/.exec(String(url).trim());
  if (!m) return null;
  return m[1].replace(/\/+$/, "").split("/").filter(Boolean);
}
// Ordered task rules: first match wins. Evidence records which signal fired.
const TASK_RULES = [
  ["text-to-video", /\btext-to-video\b/i],
  ["image-to-video", /\bimage-to-video\b/i],
  ["reference-to-video", /\breference-to-video\b/i],
  ["video-to-video", /\bvideo-to-video\b/i],
  ["text-to-image", /\btext-to-image\b/i],
  ["image-to-image", /\bimage-to-image\b/i],
  ["image-editing", /\/(edit|inpaint|outpaint|background-removal|erase|upscale)(\/|$)/i],
  ["lora-training", /\/(lora|dreambooth|train|fine-?tune)(\/|$)/i],
  ["text-to-audio", /\btext-to-(audio|speech)\b|\btts\b/i],
  ["music-generation", /\bmusic\b/i],
  ["speech", /\b(speech|voice|transcri|lip-sync)\b/i],
  ["video-editing", /\bvideo\b/i],
  ["image-generation", /\bimage\b/i],
  ["3d-generation", /\b3d\b|tripo|hunyuan|mesh/i],
  ["language-model", /\b(llm|chat|completion|embedding)\b/i],
];
const MEDIA_CLASS_BY_TASK = {
  "text-to-video": "video", "image-to-video": "video", "reference-to-video": "video",
  "video-to-video": "video", "video-editing": "video",
  "text-to-image": "image", "image-to-image": "image", "image-editing": "image",
  "image-generation": "image", "lora-training": "adjacent-media",
  "text-to-audio": "audio", "music-generation": "audio", speech: "audio",
  "video-to-audio": "audio",
  "3d-generation": "adjacent-media", "language-model": "text-llm",
};
const VARIANT_ALIASES = new Set(["fast", "turbo", "pro", "dev", "schnell", "lightning", "edit", "lora", "v1", "v2", "v3"]);
const VERSION_SEGMENT = /^(v\d+([._-]\d+)*|\d+([._]\d+)+|20\d{2}[-_]\d{2}([-_]\d{2})?)$/i;

export function classifyTask(urlPath, identifier) {
  const hay = `${urlPath} ${identifier}`;
  for (const [task, re] of TASK_RULES) {
    if (re.test(hay)) return { task, task_evidence: `keyword:${re.source}` };
  }
  return { task: "unknown", task_evidence: "no-taxonomy-signal" };
}

function developerClues({ exploreHref, namespace, identifier }) {
  const clues = [];
  const m = /\/explore\/([^/?#]+)/i.exec(exploreHref || "");
  if (m) clues.push({ kind: "explore-link", value: m[1] });
  if (namespace) clues.push({ kind: "fal-namespace", value: namespace });
  return clues; // never promoted to developer without corroborated research (J02)
}

function normalizePrice(flexText) {
  const raw = String(flexText || "");
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

// ---------- prose cleaning ----------
const BOILER_LINE = [
  /^\s*(schema|overview|parameters?|request|response|examples?|usage|authentication|rate-?limits?|pricing|billing)\s*$/i,
  /^\s*(home|models|explore|docs|api|dashboard)(\s*[>/|]\s*\w+)+\s*$/i, // nav crumbs
  /^\s*(curl|import\s|from\s+\S+\s+import|const\s|let\s|var\s|def\s|function\s|pip\s+install|npm\s+(i|install)|Bearer\s|api[-_ ]?key)/i,
  /^\s*```/,
  /\b(api[-_ ]?key|bearer\s+[a-z0-9]|sk-[a-z0-9]{4})/i,
];
function isPricingOnly(paragraph) {
  const stripped = paragraph.replace(/\$[\d.,]+|\bper\b|\b\d+\b|\s|[.,;:()/-]/gi, "");
  return stripped.length < 20 && /\$/.test(paragraph);
}
export function cleanProse(prose) {
  const raw = String(prose || "");
  const removed = { code: 0, nav: 0, pricing_only: 0, duplicates: 0, short: 0 };
  if (!raw.trim()) return { useful_sentences: [], removed, raw_hash: sha256Text(raw) };
  const seen = new Set();
  const useful = [];
  for (const para of raw.split(/\n{2,}|\r?\n/)) {
    const p = para.replace(/\s+/g, " ").trim();
    if (!p) continue;
    if (/```|curl\s|pip install|npm install|api[-_ ]?key/i.test(p)) { removed.code++; continue; }
    if (BOILER_LINE.some((re) => re.test(p))) { removed.nav++; continue; }
    if (isPricingOnly(p)) { removed.pricing_only++; continue; }
    const key = p.toLowerCase();
    if (seen.has(key)) { removed.duplicates++; continue; }
    for (const s of p.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)) {
      if (s.length < 40) { removed.short++; continue; }
      if (BOILER_LINE.some((re) => re.test(s))) { removed.nav++; continue; }
      const skey = s.toLowerCase();
      if (seen.has(skey)) { removed.duplicates++; continue; }
      seen.add(skey);
      useful.push(s);
    }
  }
  return { useful_sentences: useful, removed, raw_hash: sha256Text(raw) };
}

// ---------- normalize ----------
export function normalizeSource(csvText, snapshotSha) {
  const rows = parseCsv(csvText);
  const header = rows[0];
  const expected = ["page-model-card href", "inline-flex", "shrink-0", "text-nowrap", "shrink-0 href", "size-full src", "flex", "prose"];
  if (stableStringify(header) !== stableStringify(expected)) throw new Error(`Unexpected CSV header: ${stableStringify(header)}`);
  if (!/^[a-f0-9]{64}$/.test(snapshotSha || "")) throw new Error("snapshotSha must be the sha256 of exact source bytes");
  const sourceRows = [];
  const endpoints = [];
  const seenUrls = new Set();
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.length === 1 && !cells[0].trim()) continue; // trailing blank line
    const raw = {};
    expected.forEach((h, k) => { raw[h] = cells[k] ?? ""; });
    const rowSha = sha256Text(stableStringify(raw));
    const url = raw["page-model-card href"].trim();
    if (!url) throw new Error(`Row ${i} lacks endpoint URL identity`);
    if (seenUrls.has(url)) throw new Error(`Duplicate endpoint URL: ${url}`);
    seenUrls.add(url);
    sourceRows.push({ row_index: i, endpoint_url: url, raw, row_sha256: rowSha, snapshot_sha256: snapshotSha, captured_date: CAPTURED_DATE });
    const segs = falPathSegments(url);
    if (!segs || segs.length < 2) throw new Error(`Row ${i} URL not a fal model path: ${url}`);
    const endpointId = segs.join("/");
    const namespace = raw["shrink-0"].trim();
    const identifier = raw["text-nowrap"].trim();
    const { task, task_evidence } = classifyTask(`/${segs.join("/")}`, identifier);
    const mediaClass = MEDIA_CLASS_BY_TASK[task] || "unknown";
    const pricing = normalizePrice(raw["flex"]);
    let disposition, dispositionReason;
    if (mediaClass === "image" || mediaClass === "video" || mediaClass === "adjacent-media" || mediaClass === "audio") {
      disposition = "eligible"; dispositionReason = `media_class=${mediaClass};task=${task}`;
    } else if (mediaClass === "text-llm") {
      disposition = "excluded"; dispositionReason = `text/llm utility-only;task=${task}`;
    } else {
      disposition = "quarantined"; dispositionReason = "unknown media class; reviewable";
    }
    endpoints.push({
      endpoint_id: endpointId, url, row_index: i, row_sha256: rowSha,
      fal_namespace: segs[0], namespace_raw: namespace || "unknown", name_raw: identifier || "unknown",
      developer: "unknown", developer_clues: developerClues({ exploreHref: raw["shrink-0 href"], namespace, identifier }),
      task, task_evidence, media_class: mediaClass, disposition, disposition_reason: dispositionReason,
      pricing,
      fact_hash: sha256Text(stableStringify({ endpointId, url, task, mediaClass, pricing: pricing.normalized })),
    });
  }
  endpoints.sort((a, b) => a.endpoint_id.localeCompare(b.endpoint_id));
  return { snapshotSha, sourceRows, endpoints };
}

// ---------- family resolution ----------
function versionCore(remaining) {
  for (const seg of remaining) {
    if (VERSION_SEGMENT.test(seg)) return seg.toLowerCase();
  }
  return "";
}
export function resolveFamilies(endpoints, overrides = {}) {
  // overrides: { endpoint_id: family_slug } explicit operator mapping (J02 re-resolution).
  const bins = new Map();
  for (const ep of endpoints) {
    const segs = ep.endpoint_id.split("/");
    const key = `${segs[0]}/${segs[1]}`;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(ep);
  }
  const families = [];
  const mappingLog = [];
  for (const [binKey, members] of [...bins.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...members].sort((a, b) => a.endpoint_id.localeCompare(b.endpoint_id));
    // Split only on differing strict version cores in remaining subpaths.
    const byVersion = new Map();
    for (const ep of sorted) {
      const remaining = ep.endpoint_id.split("/").slice(2);
      const core = versionCore(remaining) || "__base__";
      if (!byVersion.has(core)) byVersion.set(core, []);
      byVersion.get(core).push(ep);
    }
    const groups = byVersion.size > 1 ? [...byVersion.entries()].sort(([a], [b]) => a.localeCompare(b)) : [["__base__", sorted]];
    for (const [core, group] of groups) {
      const overrideSlugs = new Set(group.map((ep) => overrides[ep.endpoint_id]).filter(Boolean));
      let slugBase = core === "__base__" ? binKey : `${binKey}-${core}`.toLowerCase();
      if (overrideSlugs.size === 1) slugBase = [...overrideSlugs][0];
      const slug = routeSlug(slugBase);
      const canonical = [...group].sort((a, b) =>
        (VARIANT_ALIASES.has(a.endpoint_id.split("/").pop().toLowerCase()) ? 1 : 0) -
        (VARIANT_ALIASES.has(b.endpoint_id.split("/").pop().toLowerCase()) ? 1 : 0)
        || a.endpoint_id.length - b.endpoint_id.length
        || a.endpoint_id.localeCompare(b.endpoint_id))[0];
      const display = (canonical.name_raw !== "unknown" ? canonical.name_raw : canonical.endpoint_id).trim();
      const clues = [];
      for (const ep of group) for (const c of ep.developer_clues) clues.push({ ...c, endpoint_id: ep.endpoint_id });
      const family = {
        family_id: `${FAMILY_PUBLISHER}/${slug}`,
        canonical_slug: slug,
        display_name: display,
        developer: "unknown",
        developer_clues: clues.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
        member_endpoint_ids: group.map((ep) => ep.endpoint_id),
        canonical_endpoint_id: canonical.endpoint_id,
        route: `/models/${FAMILY_PUBLISHER}/${slug}`,
        version_core: core === "__base__" ? null : core,
        discovery_bin: binKey,
        research_status: "ok",
        research_reason: "two-segment discovery; version-distinct releases protected",
        mapping_reasons: group.map((ep) => ({
          endpoint_id: ep.endpoint_id,
          reason: overrides[ep.endpoint_id] ? `explicit-override:${overrides[ep.endpoint_id]}` : `discovery-bin:${binKey};version-core:${core === "__base__" ? "base" : core}`,
        })),
      };
      family.fact_hash = sha256Text(stableStringify({ family: family.family_id, members: family.member_endpoint_ids, canonical: family.canonical_endpoint_id }));
      families.push(family);
      for (const m of family.mapping_reasons) mappingLog.push({ family_id: family.family_id, ...m });
    }
  }
  families.sort((a, b) => a.family_id.localeCompare(b.family_id));
  // Deterministic collision guard: identical slugs after normalization.
  const seen = new Map();
  for (const f of families) {
    if (seen.has(f.canonical_slug)) {
      f.research_status = "needs-review";
      f.research_reason = `route-slug collision with ${seen.get(f.canonical_slug)}; manual override required`;
      const other = families.find((x) => x.family_id === seen.get(f.canonical_slug));
      if (other) { other.research_status = "needs-review"; other.research_reason = `route-slug collision with ${f.family_id}; manual override required`; }
    } else seen.set(f.canonical_slug, f.family_id);
  }
  const report = {
    pipeline_version: PIPELINE_VERSION,
    family_count: families.length,
    discovery_bins: bins.size,
    version_splits: families.length - bins.size,
    needs_review: families.filter((f) => f.research_status === "needs-review").map((f) => f.family_id),
    mapping_log: mappingLog.sort((a, b) => a.endpoint_id.localeCompare(b.endpoint_id)),
  };
  return { families, report };
}

// ---------- dossiers / candidates ----------
function factId(n) {
  return `F${String(n).padStart(3, "0")}`;
}
export function buildDossiers({ families, endpointsById, sourceByRow }) {
  const dossiers = [];
  for (const family of families) {
    const facts = [];
    const quarantined = [];
    let n = 0;
    const push = (scope, field, value, quote, sourceUrl, rowIndex) => {
      n += 1;
      facts.push({ id: factId(n), scope, field, value, quote: quote.slice(0, 600), source_url: sourceUrl, row_index: rowIndex, captured_date: CAPTURED_DATE, authority: "source-claim" });
    };
    const members = family.member_endpoint_ids.map((id) => endpointsById.get(id));
    const tasks = new Set(members.map((m) => m.task));
    if (tasks.size === 1 && !tasks.has("unknown")) {
      const m0 = members[0];
      push("family", "task", m0.task, `Task signal ${m0.task_evidence} shared by all ${members.length} member endpoint(s).`, m0.url, m0.row_index);
    } else {
      for (const m of members) push(`endpoint:${m.endpoint_id}`, "task", m.task, `Task signal ${m.task_evidence} for this endpoint.`, m.url, m.row_index);
    }
    // Pricing: conflicting normalized values quarantined at claim level.
    const parsed = members.filter((m) => m.pricing.normalized.status === "parsed");
    const distinct = new Set(parsed.map((m) => stableStringify(m.pricing.normalized)));
    if (distinct.size > 1) {
      for (const m of parsed) {
        n += 1;
        quarantined.push({ id: factId(n), scope: `endpoint:${m.endpoint_id}`, field: "pricing", value: stableStringify(m.pricing.normalized), quote: m.pricing.price_sentences[0]?.slice(0, 600) || "priced; conflicts with sibling", source_url: m.url, row_index: m.row_index, captured_date: CAPTURED_DATE, authority: "source-claim", quarantine_reason: "conflicting sibling pricing" });
      }
    } else {
      for (const m of members) {
        if (m.pricing.normalized.status === "parsed") push(`endpoint:${m.endpoint_id}`, "pricing", stableStringify(m.pricing.normalized), m.pricing.price_sentences[0]?.slice(0, 400) || "priced", m.url, m.row_index);
        else push(`endpoint:${m.endpoint_id}`, "pricing", "unknown", "No unambiguous price parse; raw pricing prose preserved in endpoint record.", m.url, m.row_index);
      }
    }
    // Useful prose sentences as endpoint-scoped facts.
    let usefulCount = 0;
    for (const m of members) {
      const src = sourceByRow.get(m.row_index);
      const { useful_sentences } = cleanProse(src.raw.prose);
      for (const s of useful_sentences.slice(0, 12)) {
        push(`endpoint:${m.endpoint_id}`, "description", s.slice(0, 400), s.slice(0, 600), m.url, m.row_index);
        usefulCount += 1;
      }
    }
    const directRich = members.filter((m) => cleanProse(sourceByRow.get(m.row_index).raw.prose).useful_sentences.length >= 3);
    const anyUseful = members.filter((m) => cleanProse(sourceByRow.get(m.row_index).raw.prose).useful_sentences.length >= 1);
    let tier, tierReason;
    if (usefulCount >= 3 && directRich.length >= 1) {
      tier = "A"; tierReason = `rich direct source: ${usefulCount} useful sentences; ${directRich.length} endpoint(s) with >=3`;
    } else if (anyUseful.length >= 1 && members.length > 1) {
      tier = "B"; tierReason = `sibling recovery: ${usefulCount} useful sentences across ${members.length} endpoints; scope-limited`;
    } else if (anyUseful.length >= 1) {
      tier = "B"; tierReason = `single-endpoint partial evidence: ${usefulCount} useful sentences; corroboration limited`;
    } else {
      tier = "C"; tierReason = "no useful prose after boilerplate removal; primary-source research required";
    }
    const dossier = {
      record_id: family.family_id, schema_version: DOSSIER_SCHEMA,
      source_hash: sha256Text(stableStringify(members.map((m) => m.row_sha256))),
      route: family.route, tier, tier_reason: tierReason,
      facts, quarantined_claims: quarantined,
      evidence_stats: { member_endpoints: members.length, useful_sentences: usefulCount, fact_count: facts.length, quarantined_count: quarantined.length },
    };
    dossier.fact_pack_hash = sha256Text(stableStringify({ facts, quarantined }));
    const bytes = Buffer.byteLength(stableStringify(dossier), "utf8");
    dossier.dossier_bytes = bytes;
    dossier.dossier_tokens_upper_bound = tokenUpperBoundUtf8(bytes);
    dossiers.push(dossier);
  }
  dossiers.sort((a, b) => a.record_id.localeCompare(b.record_id));
  // Cross-family exact-duplicate useful evidence -> later families need review.
  const seenEvidence = new Map();
  const duplicateOf = new Map();
  for (const d of dossiers) {
    const key = sha256Text(stableStringify(d.facts.filter((f) => f.field === "description").map((f) => f.value)));
    if (d.evidence_stats.useful_sentences > 0) {
      if (seenEvidence.has(key)) duplicateOf.set(d.record_id, seenEvidence.get(key));
      else seenEvidence.set(key, d.record_id);
    }
  }
  const candidates = [];
  const tierC = [];
  for (const d of dossiers) {
    const family = families.find((f) => f.family_id === d.record_id);
    const dup = duplicateOf.get(d.record_id);
    const identityOk = family.research_status === "ok" && !dup;
    const usefulOk = d.tier === "A" || (d.tier === "B" && d.evidence_stats.useful_sentences >= 2);
    const memberDisps = family.member_endpoint_ids.map((id) => endpointsById.get(id).disposition);
    const hasMediaMember = !memberDisps.every((d) => d === "excluded");
    const candidate = d.tier !== "C" && identityOk && usefulOk && hasMediaMember;
    const requirements = [];
    if (d.tier === "C") requirements.push("primary-source research before indexability");
    if (!identityOk) requirements.push(dup ? `duplicate useful evidence of ${dup}` : "identity/grouping review");
    if (!usefulOk && d.tier !== "C") requirements.push("insufficient corroborated facts");
    if (!hasMediaMember) requirements.push("no eligible image/video media member (audio/text/utility-only)");
    candidates.push({
      record_id: d.record_id, route: d.route, tier: d.tier,
      index_candidate: candidate,
      recommended_state: candidate ? "INDEXABLE_AFTER_VALIDATION" : "NOINDEX_PENDING",
      required_before_indexing: requirements,
      gates: { identity_verified: identityOk, useful_facts: usefulOk, unique_route: true, sufficient_copy: candidate, media_scope: hasMediaMember },
      fact_pack_hash: d.fact_pack_hash,
    });
    if (d.tier === "C" || !candidate) {
      tierC.push({
        record_id: d.record_id, tier: d.tier,
        reason: d.tier === "C" ? "no useful source prose" : requirements.join("; "),
        missing: d.tier === "C" ? ["model-specific description", "capabilities", "supported uses"] : requirements,
        representative_endpoints: family.member_endpoint_ids.slice(0, 3),
      });
    }
  }
  tierC.sort((a, b) => a.record_id.localeCompare(b.record_id));
  return { dossiers, candidates, tierCQueue: { pipeline_version: PIPELINE_VERSION, count: tierC.length, queue: tierC } };
}

// ---------- delta validation (pipeline-owned gate) ----------
export const PROTECTED_DELTA_FIELDS = ["publisher", "developer", "pricing", "parameter_schema", "record_ids", "route", "r2_key", "object_key", "hash", "hashes", "timestamp", "timestamps", "technical_limits", "publication", "robots", "index_candidate", "recommended_state", "ids", "enums"];
const NUMERIC_CLAIM = /\d+\s*(k\b|fps|ms\b|s\b|sec|mp\b|gb\b|mb\b|billion|million|%|x\b|px\b)/i;
export function validateDelta(delta, dossierById) {
  const errors = [];
  if (!delta || typeof delta !== "object") return ["delta must be an object"];
  const dossier = dossierById.get(delta.record_id);
  if (!dossier) errors.push(`unknown record_id: ${delta.record_id}`);
  for (const key of Object.keys(delta)) {
    if (!["record_id", "editorial", "seo"].includes(key)) errors.push(`top-level field not authored by writer: ${key}`);
  }
  const ed = delta.editorial || {};
  const seo = delta.seo || {};
  for (const f of ["short_description", "overview", "capabilities", "best_for", "use_cases"]) {
    if (ed[f] === undefined) errors.push(`editorial.${f} is required`);
  }
  for (const f of ["title", "meta_description", "primary_keyword", "secondary_keywords", "faq"]) {
    if (seo[f] === undefined) errors.push(`seo.${f} is required`);
  }
  const protectedHit = (obj, prefix) => {
    if (!obj || typeof obj !== "object") return;
    for (const k of Object.keys(obj)) {
      if (PROTECTED_DELTA_FIELDS.includes(k)) errors.push(`${prefix}.${k} is pipeline-owned and must not be authored`);
      else if (obj[k] && typeof obj[k] === "object") protectedHit(obj[k], `${prefix}.${k}`);
    }
  };
  protectedHit(ed, "editorial"); protectedHit(seo, "seo");
  if (typeof seo.title === "string" && !(seo.title.length >= 45 && seo.title.length <= 65)) errors.push(`seo.title length ${seo.title.length} not in 45-65`);
  if (typeof seo.meta_description === "string" && !(seo.meta_description.length >= 140 && seo.meta_description.length <= 165)) errors.push(`seo.meta_description length ${seo.meta_description.length} not in 140-165`);
  if (typeof ed.overview === "string" && ed.overview.trim().length === 0) errors.push("editorial.overview must be useful nonempty copy");
  // Evidence references must resolve to dossier fact IDs.
  const validIds = new Set((dossier?.facts || []).map((f) => f.id));
  const checkRefs = (map, label) => {
    if (map === undefined) return;
    if (!map || typeof map !== "object" || Array.isArray(map)) { errors.push(`${label} must be a field-to-Fxxx-reference map`); return; }
    for (const [field, refs] of Object.entries(map)) {
      if (!Array.isArray(refs)) { errors.push(`${label}.${field} must be an array of Fxxx references`); continue; }
      for (const r of refs) if (!validIds.has(r)) errors.push(`${label}.${field} references unknown fact ${r}`);
    }
  };
  checkRefs(ed.evidence, "editorial.evidence");
  checkRefs(seo.evidence, "seo.evidence");
  // Numeric/unit claims require field evidence.
  const gatedText = [ed.short_description, ed.overview, ...(ed.capabilities || []), ...(ed.best_for || []), ...(ed.use_cases || [])].filter((x) => typeof x === "string").join("\n");
  if (NUMERIC_CLAIM.test(gatedText)) {
    const refCount = Object.values(ed.evidence || {}).flat().length + Object.values(seo.evidence || {}).flat().length;
    if (refCount === 0) errors.push("numeric/unit claims require field-level Fxxx evidence references");
  }
  return errors;
}

// ---------- batch packing ----------
export function packBatches({ dossiers, candidates, sourceHash, plan }) {
  const eligible = candidates.filter((c) => c.index_candidate).map((c) => c.record_id).sort();
  const dossierById = new Map(dossiers.map((d) => [d.record_id, d]));
  const perFamily = new Map();
  for (const id of eligible) {
    const d = dossierById.get(id);
    perFamily.set(id, d.dossier_tokens_upper_bound + plan.initial_delta_estimate_tokens_per_family);
  }
  // Deterministic stratified canary: cover task strata present in eligible set.
  const strataOrder = ["text-to-image", "image-editing", "text-to-video", "image-to-video", "image-to-image", "video-editing", "3d-generation", "lora-training"];
  const taskOf = (id) => {
    const f = dossierById.get(id).facts.find((x) => x.field === "task");
    return f ? f.value : "unknown";
  };
  const canaryPicks = [];
  for (const task of strataOrder) {
    const pick = eligible.find((id) => !canaryPicks.includes(id) && taskOf(id) === task);
    if (pick && canaryPicks.length < plan.canary_count_max) canaryPicks.push(pick);
  }
  for (const id of eligible) {
    if (canaryPicks.length >= plan.canary_count_max) break;
    if (!canaryPicks.includes(id)) canaryPicks.push(id);
  }
  // Canary respects the same envelope: largest strata-ordered prefix that fits
  // (up to 10); a single oversized dossier goes alone and flagged.
  const canary = [];
  let canaryTokens = 2000;
  for (const id of canaryPicks) {
    if (canary.length && canaryTokens + perFamily.get(id) > plan.planning_input_envelope_tokens) break;
    canary.push(id); canaryTokens += perFamily.get(id);
  }
  if (!canary.length && canaryPicks.length) canary.push(canaryPicks[0]);
  // Pack largest sets fitting the planning input envelope; canary reserved first.
  const batches = [];
  const remaining = eligible.filter((id) => !canary.includes(id));
  const mkBatch = (ids, isCanary, batchIndex) => {
    const inputTokens = ids.reduce((a, id) => a + perFamily.get(id), 0) + 2000; // fixed prompt reserve
    return {
      batch_id: `media-batch-${String(batchIndex).padStart(3, "0")}`,
      status: "pending", lease: null, canary: isCanary,
      record_ids: ids,
      dossier_paths: ids.map((id) => `data/media-models/fal-media-dossiers.jsonl#${id}`),
      dossier_hashes: ids.map((id) => dossierById.get(id).fact_pack_hash),
      research_ids: isCanary ? candidates.filter((c) => !c.index_candidate).slice(0, 3).map((c) => c.record_id) : [],
      output_path: `data/media-models/editorial/${isCanary ? "canary" : `media-batch-${String(batchIndex).padStart(3, "0")}`}.jsonl`,
      oversized_for_envelope: inputTokens > plan.planning_input_envelope_tokens,
      estimated_input_tokens: inputTokens,
      estimated_delta_tokens: ids.length * plan.initial_delta_estimate_tokens_per_family,
      source_hash: sourceHash,
      fact_pack_hashes: ids.map((id) => dossierById.get(id).fact_pack_hash),
      prompt_version: PROMPT_VERSION,
      schema_version: DELTA_SCHEMA,
    };
  };
  let idx = 1;
  if (canary.length) { batches.push(mkBatch(canary, true, idx)); idx += 1; }
  let current = [];
  let currentTokens = 2000;
  for (const id of remaining) {
    const need = perFamily.get(id);
    if (current.length && currentTokens + need > plan.planning_input_envelope_tokens) {
      batches.push(mkBatch(current, false, idx)); idx += 1;
      current = []; currentTokens = 2000;
    }
    current.push(id); currentTokens += need;
  }
  if (current.length) batches.push(mkBatch(current, false, idx));
  const sizes = batches.map((b) => b.record_ids.length);
  return {
    manifest: {
      schema_version: BATCH_SCHEMA, status: "AWAITING_J02",
      model: "muse-spark-1.3-contributor",
      source_hash: sourceHash,
      prompt_version: PROMPT_VERSION,
      batch_count: batches.length,
      eligible_family_count: eligible.length,
      sizing_policy: "largest measured set fitting planning envelope; recalibrate unclaimed work after inline canary",
      batches,
    },
    stats: {
      eligible: eligible.length,
      batch_count: batches.length,
      target_batch_size_min: sizes.length ? Math.min(...sizes) : 0,
      target_batch_size_max: sizes.length ? Math.max(...sizes) : 0,
    },
  };
}

// ---------- J01 self-checks ----------
export function runChecks(ctx) {
  // ctx: {sourceRows,endpoints,families,dossiers,candidates,tierCQueue,manifest,rerunBytes,byteFiles}
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, status: ok ? "PASS" : "FAIL", detail });
  check("source_rows_1499", ctx.sourceRows.length === 1499, `rows=${ctx.sourceRows.length}`);
  check("endpoints_1499_unique", ctx.endpoints.length === 1499 && new Set(ctx.endpoints.map((e) => e.endpoint_id)).size === 1499, `endpoints=${ctx.endpoints.length}`);
  check("endpoint_url_identity", ctx.endpoints.every((e) => e.url.startsWith("https://fal.ai/models/")), "");
  const memberSets = ctx.families.map((f) => f.member_endpoint_ids);
  const allMembers = memberSets.flat();
  check("membership_exact", allMembers.length === 1499 && new Set(allMembers).size === 1499, `mapped=${allMembers.length}`);
  check("routes_unique", new Set(ctx.families.map((f) => f.route)).size === ctx.families.length, `families=${ctx.families.length}`);
  check("family_ids_unique", new Set(ctx.families.map((f) => f.family_id)).size === ctx.families.length, "");
  check("dossier_per_family", ctx.dossiers.length === ctx.families.length && ctx.dossiers.every((d) => ctx.families.some((f) => f.family_id === d.record_id)), "");
  check("candidate_per_family", ctx.candidates.length === ctx.families.length, "");
  check("developer_unassigned", ctx.endpoints.every((e) => e.developer === "unknown") && ctx.families.every((f) => f.developer === "unknown"), "no guessed attribution");
  check("unknown_task_preserved", ctx.endpoints.filter((e) => e.task === "unknown").every((e) => e.task_evidence === "no-taxonomy-signal"), "");
  check("version_releases_protected", ctx.families.every((f) => {
    const cores = new Set(f.member_endpoint_ids.map((id) => versionCore(id.split("/").slice(2)) || "__base__"));
    return cores.size === 1;
  }), "");
  check("sibling_scope", ctx.dossiers.every((d) => d.facts.filter((f) => f.scope === "family").every((f) => f.field === "task")), "family scope only for unanimous task");
  const factIds = new Set(ctx.dossiers.flatMap((d) => d.facts.map((f) => `${d.record_id}:${f.id}`)));
  const quarOverlap = ctx.dossiers.some((d) => d.quarantined_claims.some((q) => factIds.has(`${d.record_id}:${q.id}`)));
  check("quarantine_disjoint", !quarOverlap, "");
  const boilerHit = ctx.dossiers.flatMap((d) => d.facts).find((f) => /```|api[-_ ]?key|^\s*(schema|parameters?)\s*$/i.test(f.quote));
  check("boilerplate_excluded", !boilerHit, boilerHit ? `hit=${boilerHit.id}` : "");
  check("refs_resolve", ctx.candidates.every((c) => ctx.dossiers.some((d) => d.record_id === c.record_id && d.fact_pack_hash === c.fact_pack_hash)), "");
  const epDisp = new Map(ctx.endpoints.map((e) => [e.endpoint_id, e.disposition]));
  const famById = new Map(ctx.families.map((f) => [f.family_id, f]));
  check("candidate_media_scope", ctx.candidates.filter((c) => c.index_candidate).every((c) => !famById.get(c.record_id).member_endpoint_ids.every((id) => epDisp.get(id) === "excluded")), "candidates never all-excluded; quarantined scope stays J02-reviewable");
  // batch checks
  const batched = ctx.manifest.batches.flatMap((b) => b.record_ids);
  const eligSet = new Set(ctx.candidates.filter((c) => c.index_candidate).map((c) => c.record_id));
  check("batch_exact", batched.length === eligSet.size && batched.every((id) => eligSet.has(id)) && new Set(batched).size === batched.length, `batched=${batched.length} eligible=${eligSet.size}`);
  check("batch_sizing", ctx.manifest.batches.every((b) => b.estimated_input_tokens <= 48000 || (b.record_ids.length === 1 && b.oversized_for_envelope === true)), "oversized dossiers handled singly, flagged, never truncated");
  check("canary_exclusive", (() => {
    const can = ctx.manifest.batches.filter((b) => b.canary).flatMap((b) => b.record_ids);
    const rest = ctx.manifest.batches.filter((b) => !b.canary).flatMap((b) => b.record_ids);
    return can.length <= 10 && can.every((id) => !rest.includes(id));
  })(), "");
  // determinism: rerun bytes identical
  for (const [name, a, b] of ctx.rerunBytes) check(`deterministic_${name}`, a === b, a === b ? "" : "byte mismatch on rerun");
  return results;
}

export function defaultPaths(repoRoot) {
  const data = join(repoRoot, "data/media-models");
  const artifacts = join(repoRoot, "artifacts/media-models");
  return {
    data,
    artifacts,
    source: join(data, "fal-media-source.jsonl"),
    endpoints: join(data, "fal-media-endpoints.jsonl"),
    families: join(data, "fal-media-families.jsonl"),
    dossiers: join(data, "fal-media-dossiers.jsonl"),
    candidates: join(data, "fal-media-publication-candidates.jsonl"),
    schema: join(data, "editorial-delta.schema.json"),
    familyReport: join(artifacts, "family-resolution-report.json"),
    tierCQueue: join(artifacts, "tier-c-queue.json"),
    manifest: join(artifacts, "editorial-batches.json"),
    workload: join(artifacts, "workload-report.json"),
    commands: join(artifacts, "commands.json"),
    ledger: join(data, "editorial-ledger.jsonl"),
  };
}

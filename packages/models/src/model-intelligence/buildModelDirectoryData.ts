/**
 * lib/model-intelligence/buildModelDirectoryData.ts
 * Build the full model directory dataset at server/build time.
 * Reads all 550 normalized profiles and extracts columns for the comparison table.
 * Only called from server components (page.tsx) — never from client bundles.
 */

import fs from "node:fs";
import path from "node:path";
import { getAllModelEntries, type ModelIndexEntry } from "./getAllModelSlugs";
import { getModelIntelligenceDataPaths } from "./data-paths";

const PROFILES_DIR = getModelIntelligenceDataPaths().profilesDir;

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface ModelDirectoryRow {
  slug: string;
  name: string;
  provider: string;
  model_type: string;
  release_date: string;
  // Summary card values (null = not available for this model)
  intelligence: number | null;
  speed: number | null;
  latency: number | null;
  input_price: number | null;
  output_price: number | null;
  // Formatted display strings
  intelligence_display: string;
  speed_display: string;
  latency_display: string;
  input_price_display: string;
  output_price_display: string;
  // Tech specs
  context_window: number | null; // numeric (tokens)
  context_display: string; // e.g. "128k", "1M"
  openness: "open" | "proprietary" | "unknown";
  reasoning: boolean | null;
  // Index metadata
  chart_count: number;
  faq_count: number;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseSummaryValue(raw: string): number | null {
  const cleaned = raw.replace(/^[$]\s*/, "").replace(/s$/, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseContextWindow(raw: string): number | null {
  const s = raw.toLowerCase().replace(/,/g, "").trim();
  // "1.0m tokens", "128k tokens", "66k tokens"
  const mMatch = s.match(/([\d.]+)\s*m/);
  if (mMatch) {
    const n = parseFloat(mMatch[1]);
    return Number.isFinite(n) ? Math.round(n * 1_000_000) : null;
  }
  const kMatch = s.match(/([\d.]+)\s*k/);
  if (kMatch) {
    const n = parseFloat(kMatch[1]);
    return Number.isFinite(n) ? Math.round(n * 1_000) : null;
  }
  const plain = parseFloat(s);
  return Number.isFinite(plain) ? plain : null;
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    const v = tokens / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    const v = tokens / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}k`;
  }
  return String(tokens);
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

let _cache: ModelDirectoryRow[] | null = null;

export function buildModelDirectoryData(): ModelDirectoryRow[] {
  if (_cache) return _cache;

  const entries: ModelIndexEntry[] = getAllModelEntries();
  const rows: ModelDirectoryRow[] = [];

  for (const entry of entries) {
    const profilePath = path.join(
      PROFILES_DIR,
      `${entry.slug}.profile.json`,
    );
    if (!fs.existsSync(profilePath)) continue;

    let profile: Record<string, unknown>;
    try {
      profile = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    } catch {
      continue;
    }

    // --- Summary cards ---
    const cards: Array<{ id: string; value: string; unit: string }> =
      Array.isArray(profile.summary_cards)
        ? (profile.summary_cards as Array<{ id: string; value: string; unit: string }>)
        : [];

    const cardMap = new Map(cards.map((c) => [c.id, c]));

    const intelligenceCard = cardMap.get("intelligence");
    const speedCard = cardMap.get("speed");
    const latencyCard = cardMap.get("latency");
    const inputPriceCard = cardMap.get("input_price");
    const outputPriceCard = cardMap.get("output_price");

    const intelligence = intelligenceCard
      ? parseSummaryValue(intelligenceCard.value)
      : null;
    const speed = speedCard ? parseSummaryValue(speedCard.value) : null;
    const latency = latencyCard ? parseSummaryValue(latencyCard.value) : null;
    const input_price = inputPriceCard
      ? parseSummaryValue(inputPriceCard.value)
      : null;
    const output_price = outputPriceCard
      ? parseSummaryValue(outputPriceCard.value)
      : null;

    // --- Technical specs ---
    const specs: Array<{ key: string; value: string }> = Array.isArray(
      profile.technical_specs,
    )
      ? (profile.technical_specs as Array<{ key: string; value: string }>)
      : [];

    const specMap = new Map(specs.map((s) => [s.key, s.value]));

    // Context window
    const rawContext = specMap.get("context_window") ?? "";
    const context_window = rawContext ? parseContextWindow(rawContext) : null;
    const context_display = context_window ? formatContext(context_window) : "—";

    // Openness — MI-P0-04: only the explicit, researched `open_source` fact is
    // authoritative. Name/model_type substring matching is a non-authoritative
    // heuristic and is disabled: an unknown openness stays "unknown" rather
    // than being inferred from a model name containing "open"/"closed".
    const rawOpenSource = specMap.get("open_source") ?? "";
    const rawModelType = specMap.get("model_type") ?? entry.model_type ?? "";
    let openness: "open" | "proprietary" | "unknown" = "unknown";
    if (rawOpenSource.toLowerCase().startsWith("yes")) {
      openness = "open";
    } else if (rawOpenSource.toLowerCase().startsWith("no")) {
      openness = "proprietary";
    }

    // Reasoning
    const rawReasoning = specMap.get("reasoning") ?? "";
    let reasoning: boolean | null = null;
    if (rawReasoning.toLowerCase().startsWith("yes")) reasoning = true;
    else if (rawReasoning.toLowerCase().startsWith("no")) reasoning = false;

    rows.push({
      slug: entry.slug,
      name: entry.name,
      provider: entry.provider,
      model_type: entry.model_type || rawModelType || "—",
      release_date: entry.release_date,
      intelligence,
      speed,
      latency,
      input_price,
      output_price,
      intelligence_display:
        intelligence !== null ? intelligenceCard!.value : "—",
      speed_display: speed !== null ? speedCard!.value : "—",
      latency_display: latency !== null ? latencyCard!.value : "—",
      input_price_display: input_price !== null ? inputPriceCard!.value : "—",
      output_price_display:
        output_price !== null ? outputPriceCard!.value : "—",
      context_window,
      context_display,
      openness,
      reasoning,
      chart_count: entry.chart_count,
      faq_count: entry.faq_count,
    });
  }

  // Default sort: intelligence descending (nulls last)
  rows.sort((a, b) => {
    if (a.intelligence === null && b.intelligence === null) return 0;
    if (a.intelligence === null) return 1;
    if (b.intelligence === null) return -1;
    return b.intelligence - a.intelligence;
  });

  _cache = rows;
  return rows;
}

// ---------------------------------------------------------------------------
// Provider aggregates
// ---------------------------------------------------------------------------

export interface ProviderDirectoryRow {
  slug: string;
  name: string;
  model_count: number;
  top_model_name: string;
  top_model_slug: string;
  top_intelligence: number | null;
  top_intelligence_display: string;
  open_count: number;
  proprietary_count: number;
}

let _providerCache: ProviderDirectoryRow[] | null = null;

export function buildProviderDirectoryData(): ProviderDirectoryRow[] {
  if (_providerCache) return _providerCache;

  const rows = buildModelDirectoryData();
  const providerMap = new Map<string, ModelDirectoryRow[]>();

  for (const row of rows) {
    const key = row.provider || "unknown";
    if (!providerMap.has(key)) providerMap.set(key, []);
    providerMap.get(key)!.push(row);
  }

  const result: ProviderDirectoryRow[] = [];

  for (const [name, models] of providerMap.entries()) {
    // Already sorted by intelligence desc
    const top = models[0];
    const open_count = models.filter((m) => m.openness === "open").length;
    const proprietary_count = models.filter(
      (m) => m.openness === "proprietary",
    ).length;

    result.push({
      slug: name.toLowerCase().replace(/\s+/g, "-").replace(/\./g, ""),
      name,
      model_count: models.length,
      top_model_name: top.name,
      top_model_slug: top.slug,
      top_intelligence: top.intelligence,
      top_intelligence_display: top.intelligence_display,
      open_count,
      proprietary_count,
    });
  }

  // Sort by model count desc
  result.sort((a, b) => b.model_count - a.model_count);

  _providerCache = result;
  return result;
}

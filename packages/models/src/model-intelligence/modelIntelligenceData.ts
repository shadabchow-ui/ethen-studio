/**
 * lib/model-intelligence/modelIntelligenceData.ts
 * Data helpers for Model Intelligence navigation, categories, provider
 * listings, and leaderboards.
 *
 * All helpers are server-safe (callers must not import into client
 * components). Normalized data is read from the existing index and
 * profile caches — no scrape pipeline changes.
 */

import fs from "node:fs";
import path from "node:path";
import { getModelIndex } from "./getAllModelSlugs";
import type { ModelIndexEntry } from "./getAllModelSlugs";
import type {
  ModelCategoryKey,
  ModelCategoryDef,
  LeaderboardMetricKey,
  LeaderboardMetricDef,
  MIProviderEntry,
} from "./navigation/navTypes";
import type { RawModelProfile } from "./loadNormalizedModelProfile";
import { getModelIntelligenceDataPaths } from "./data-paths";

// ---------------------------------------------------------------------------
// Data directory constant (single committed authority via data-paths)
// ---------------------------------------------------------------------------

const NORM_DIR = getModelIntelligenceDataPaths().root;

// ---------------------------------------------------------------------------
// Internal profile cache (lazy, memoized)
// ---------------------------------------------------------------------------

let _profileCache: Map<string, RawModelProfile> | null = null;

/**
 * Read all normalized profiles into a lazy memoized cache.
 * Called on first access; subsequent calls return the cache.
 * 550 profiles × ~17KB average = ~9MB in memory.
 */
function getProfileCache(): Map<string, RawModelProfile> {
  if (_profileCache) return _profileCache;

  const profilesDir = path.join(NORM_DIR, "profiles");
  _profileCache = new Map();
  const files = fs.readdirSync(profilesDir);

  for (const file of files) {
    if (!file.endsWith(".profile.json")) continue;
    try {
      const raw = fs.readFileSync(path.join(profilesDir, file), "utf-8");
      const profile = JSON.parse(raw) as RawModelProfile;
      _profileCache.set(profile.slug, profile);
    } catch {
      // skip malformed profiles
    }
  }
  return _profileCache;
}

// ---------------------------------------------------------------------------
// Category definitions & derivation
// ---------------------------------------------------------------------------

const CATEGORY_DEFS: Record<ModelCategoryKey, ModelCategoryDef> = {
  "open-weight": {
    key: "open-weight",
    label: "Open Weight Models",
    description: "Models with publicly available weights, suitable for self-hosting, fine-tuning, and on-premises deployment.",
    href: "/model-intelligence/models?category=open-weight",
  },
  proprietary: {
    key: "proprietary",
    label: "Proprietary Models",
    description: "Closed-source models available only via API from frontier labs and enterprise providers.",
    href: "/model-intelligence/models?category=proprietary",
  },
  reasoning: {
    key: "reasoning",
    label: "Reasoning Models",
    description: "Models with chain-of-thought or extended reasoning capabilities for complex problem-solving and analysis.",
    href: "/model-intelligence/models?category=reasoning",
  },
  coding: {
    key: "coding",
    label: "Coding Models",
    description: "Models specialized or fine-tuned for code generation, debugging, and software engineering tasks.",
    href: "/model-intelligence/models?category=coding",
  },
  vision: {
    key: "vision",
    label: "Vision Models",
    description: "Multimodal models supporting image input for vision understanding, analysis, and reasoning.",
    href: "/model-intelligence/models?category=vision",
  },
  "long-context": {
    key: "long-context",
    label: "Long Context Models",
    description: "Models with context windows of 128K tokens or larger for long documents and extended conversations.",
    href: "/model-intelligence/models?category=long-context",
  },
  "low-cost": {
    key: "low-cost",
    label: "Low-Cost Models",
    description: "Budget-friendly models with input pricing below $0.20/M tokens, ideal for high-volume workloads.",
    href: "/model-intelligence/models?category=low-cost",
  },
  fastest: {
    key: "fastest",
    label: "Fastest Models",
    description: "Top-performing models by output speed (100+ tokens/sec) for real-time and latency-sensitive applications.",
    href: "/model-intelligence/models?category=fastest",
  },
};

/** Parse a context window string like "130k tokens" or "1.0M tokens" to a numeric byte count */
function parseContextWindow(val: string): number | null {
  const cleaned = val.replace(/[,\s]/g, " ").trim().toLowerCase();
  const m = cleaned.match(/^([\d.]+)\s*(k|m)?/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!Number.isFinite(num)) return null;
  const unit = m[2];
  if (unit === "m") return num * 1_000_000;
  if (unit === "k") return num * 1_000;
  return num; // raw number, assume tokens
}

/** Parse a price string like "$2.50" or "$10.00" to a numeric value */
function parsePrice(val: string): number | null {
  const cleaned = val.replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Parse a speed string like "206.8" or "206.8 output tokens/sec" */
function parseSpeed(val: string): number | null {
  const cleaned = val.replace(/[^0-9.]/g, " ").trim();
  const m = cleaned.match(/^([\d.]+)/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  return Number.isFinite(num) ? num : null;
}

// ---------------------------------------------------------------------------
// Category derivation from profile data
// ---------------------------------------------------------------------------

/** Coding-related keywords used to infer coding specialization from model name/slug */
const CODING_KEYWORDS = [
  "coder", "code", "codestral", "codegeex", "deepseek-coder",
  "instruct-code", "dev-coder", "qwen-coder",
];

/** Derive the categories that apply to a given profile */
function deriveCategories(profile: RawModelProfile): ModelCategoryKey[] {
  const categories: ModelCategoryKey[] = [];
  const specs: Record<string, string> = {};
  for (const s of profile.technical_specs) {
    specs[s.key] = s.value;
  }

  const cards: Record<string, string> = {};
  for (const c of profile.summary_cards) {
    cards[c.label] = c.value;
  }

  const nameLower = profile.name.toLowerCase();
  const slugLower = profile.slug.toLowerCase();

  // Open weight vs proprietary
  if (profile.model_type?.toLowerCase().includes("open")) {
    categories.push("open-weight");
  } else {
    categories.push("proprietary");
  }

  // Reasoning
  const reasoningVal = specs["reasoning"];
  if (reasoningVal && reasoningVal.toLowerCase().startsWith("y")) {
    categories.push("reasoning");
  }

  // Coding — name/slug keyword match
  if (CODING_KEYWORDS.some((kw) => nameLower.includes(kw) || slugLower.includes(kw))) {
    categories.push("coding");
  }

  // Vision — input_modalities contains "image"
  const modalities = specs["input_modalities"] || "";
  if (modalities.toLowerCase().includes("image")) {
    categories.push("vision");
  }

  // Long context — parse context window > 128K
  const ctxVal = specs["context_window"] || "";
  const ctxSize = parseContextWindow(ctxVal);
  if (ctxSize !== null && ctxSize >= 128_000) {
    categories.push("long-context");
  }

  // Low cost — input price < $0.20/M tokens
  const inputPrice = cards["Input Price"];
  if (inputPrice) {
    const price = parsePrice(inputPrice);
    if (price !== null && price < 0.20) {
      categories.push("low-cost");
    }
  }

  // Fastest — speed > 100 t/s
  const speedVal = cards["Speed"];
  if (speedVal) {
    const speed = parseSpeed(speedVal);
    if (speed !== null && speed > 100) {
      categories.push("fastest");
    }
  }

  return categories;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Get all model entries from the normalized index.
 * (Convenience re-export from getAllModelSlugs)
 */
export { getAllModelEntries, getModelEntryBySlug } from "./getAllModelSlugs";

// ---------------------------------------------------------------------------
// Provider helpers
// ---------------------------------------------------------------------------

/**
 * Get provider counts derived from the normalized index.
 * Returns entries sorted by model count descending.
 */
export function getProviderCounts(): MIProviderEntry[] {
  const index = getModelIndex();
  const rawProviders = index.quality?.providers;
  if (!rawProviders) {
    // Fallback: derive from profile entries
    const counts = new Map<string, number>();
    for (const p of index.profiles) {
      counts.set(p.provider, (counts.get(p.provider) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, modelCount]) => ({
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        modelCount,
      }))
      .sort((a, b) => b.modelCount - a.modelCount);
  }

  return Object.entries(rawProviders)
    .map(([name, count]) => ({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      modelCount: count as number,
    }))
    .sort((a, b) => b.modelCount - a.modelCount);
}

/**
 * Get a flat list of all available provider names derived from actual data.
 */
export function getAvailableProviders(): string[] {
  return getProviderCounts().map((p) => p.name);
}

// ---------------------------------------------------------------------------
// Category helpers
// ---------------------------------------------------------------------------

/**
 * Get all available category definitions.
 */
export function getAvailableCategories(): ModelCategoryDef[] {
  return Object.values(CATEGORY_DEFS);
}

/**
 * Get model entries that match a given category.
 * Categories are derived heuristically from profile data, not from explicit tags.
 *
 * Returns null for unsupported categories; empty array for supported but empty.
 */
export function getCategoryModelEntries(
  category: ModelCategoryKey,
): ModelIndexEntry[] | null {
  const def = CATEGORY_DEFS[category];
  if (!def) return null;

  const cache = getProfileCache();
  const entries = getModelIndex().profiles;

  // Fast-path for open-weight / proprietary (from index-level model_type)
  if (category === "open-weight") {
    return entries.filter((e) =>
      e.model_type?.toLowerCase().includes("open"),
    );
  }
  if (category === "proprietary") {
    return entries.filter((e) =>
      !!e.model_type && !e.model_type.toLowerCase().includes("open"),
    );
  }

  // For derived categories, we need profile data
  const matching: ModelIndexEntry[] = [];
  for (const entry of entries) {
    const profile = cache.get(entry.slug);
    if (!profile) continue;
    const cats = deriveCategories(profile);
    if (cats.includes(category)) {
      matching.push(entry);
    }
  }
  return matching;
}

// ---------------------------------------------------------------------------
// Leaderboard helpers
// ---------------------------------------------------------------------------

const LEADERBOARD_METRIC_DEFS: Record<LeaderboardMetricKey, LeaderboardMetricDef> = {
  intelligence: {
    key: "intelligence",
    label: "Intelligence",
    description: "Models ranked by composite intelligence index score (higher is better).",
    href: "/model-intelligence/leaderboards/intelligence",
    summaryCardLabel: "Intelligence",
  },
  speed: {
    key: "speed",
    label: "Speed",
    description: "Models ranked by output tokens per second (higher is better).",
    href: "/model-intelligence/leaderboards/speed",
    summaryCardLabel: "Speed",
  },
  latency: {
    key: "latency",
    label: "Latency",
    description: "Models ranked by time to first token in seconds (lower is better).",
    href: "/model-intelligence/leaderboards/latency",
    summaryCardLabel: "Latency",
  },
  "input-price": {
    key: "input-price",
    label: "Input Price",
    description: "Models ranked by input token pricing in $/M tokens (lower is better).",
    href: "/model-intelligence/leaderboards/input-price",
    summaryCardLabel: "Input Price",
  },
  "output-price": {
    key: "output-price",
    label: "Output Price",
    description: "Models ranked by output token pricing in $/M tokens (lower is better).",
    href: "/model-intelligence/leaderboards/output-price",
    summaryCardLabel: "Output Price",
  },
  "context-window": {
    key: "context-window",
    label: "Context Window",
    description: "Models ranked by context window size in tokens (larger is better).",
    href: "/model-intelligence/leaderboards/context-window",
  },
  "cost-per-task": {
    key: "cost-per-task",
    label: "Cost Per Task",
    description: "Models ranked by estimated cost to complete an intelligence-index task (lower is better).",
    href: "/model-intelligence/leaderboards/cost-per-task",
  },
};

export interface LeaderboardEntry {
  slug: string;
  name: string;
  provider: string;
  value: number | null;
  unit?: string;
  rank?: number;
}

/**
 * Get leaderboard entries for a given metric.
 * Values are read from normalized profile summary cards.
 * Missing data returns null values — no invented numbers.
 */
export function getLeaderboardEntries(
  metric: LeaderboardMetricKey,
): LeaderboardEntry[] {
  const def = LEADERBOARD_METRIC_DEFS[metric];
  if (!def) return [];

  const cache = getProfileCache();
  const entries: LeaderboardEntry[] = [];

  for (const [slug, profile] of cache) {
    // Build a lookup of summary cards by label
    const cards: Record<string, { value: string; unit: string }> = {};
    for (const c of profile.summary_cards) {
      cards[c.label] = { value: c.value, unit: c.unit };
    }

    let value: number | null = null;
    let unit: string | undefined;

    if (metric === "intelligence" || metric === "speed" || metric === "latency") {
      const label = def.summaryCardLabel!;
      const card = cards[label];
      if (card) {
        const parsed = parseSpeed(card.value); // parseSpeed handles generic number extraction
        value = parsed;
        unit = card.unit;
      }
    } else if (metric === "input-price" || metric === "output-price") {
      const label = def.summaryCardLabel!;
      const card = cards[label];
      if (card) {
        value = parsePrice(card.value);
        unit = card.unit;
      }
    } else if (metric === "context-window") {
      // Context window is in technical_specs, not summary cards
      for (const spec of profile.technical_specs) {
        if (spec.key === "context_window") {
          value = parseContextWindow(spec.value);
          unit = "tokens";
          break;
        }
      }
    } else if (metric === "cost-per-task") {
      // Cost-per-task is available in chart data, not directly in profile summary
      // Return null — chart-based helpers will populate when implemented
      value = null;
    }

    entries.push({
      slug,
      name: profile.name,
      provider: profile.provider,
      value,
      unit,
    });
  }

  // Sort: lower-is-better for pricing/latency, higher-is-better for others
  const lowerIsBetter = ["latency", "input-price", "output-price", "cost-per-task"];
  const desc = !lowerIsBetter.includes(metric);

  entries.sort((a, b) => {
    if (a.value === null && b.value === null) return 0;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return desc ? b.value - a.value : a.value - b.value;
  });

  // Assign ranks
  return entries.map((e, i) => ({ ...e, rank: e.value !== null ? i + 1 : undefined }));
}

/**
 * Get all available leaderboard metric definitions.
 */
export function getAvailableLeaderboardMetrics(): LeaderboardMetricDef[] {
  return Object.values(LEADERBOARD_METRIC_DEFS);
}

// ---------------------------------------------------------------------------
// Benchmark helpers
// ---------------------------------------------------------------------------

/**
 * Get benchmark chart IDs available in the normalized data.
 * This lists the unique chart IDs found across all model profiles.
 */
export function getAvailableBenchmarks(): Array<{ id: string; label: string }> {
  return [
    { id: "intelligence", label: "Intelligence Index" },
    { id: "artificial-analysis-intelligence-index", label: "AA Intelligence Index" },
    { id: "aa-omniscience-index", label: "Omniscience Index" },
    { id: "output-speed", label: "Output Speed" },
    { id: "latency-time-to-first-answer-token", label: "Latency (TTFT)" },
    { id: "context-window", label: "Context Window" },
    { id: "cost-per-task", label: "Cost Per Task" },
    { id: "cost-per-intelligence-index-task", label: "Cost Per Intelligence Task" },
    { id: "end-to-end-response-time", label: "End-to-End Response Time" },
    { id: "pricing-cache-hit-input-and-output", label: "Pricing (Cache Hit)" },
    { id: "model-size-total-and-active-parameters", label: "Model Size" },
  ];
}

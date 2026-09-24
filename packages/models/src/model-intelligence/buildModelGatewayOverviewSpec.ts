/**
 * buildModelGatewayOverviewSpec.ts
 *
 * Data/spec adapter that turns normalized Model Intelligence model entries
 * into an Ethen Model Gateway overview for `/model-intelligence/models`.
 *
 * Server-safe, synchronous filesystem reads via existing loaders.
 * Does not invent metrics; missing values stay null.
 */

import fs from "node:fs";
import path from "node:path";

import {
  getAllModelEntries,
  getModelIndex,
  type ModelIndexEntry,
} from "./getAllModelSlugs";
import {
  loadNormalizedModelProfile,
  type RawChartSpec,
  type RawModelProfile,
} from "./loadNormalizedModelProfile";
import type {
  MIBenchmarkBarDatum,
  MIBenchmarkScatterDatum,
  MIBenchmarkStackedDatum,
  MIChartSpec,
  MIMetricKind,
  MIProviderKey,
  ModelGatewayDecisionCard,
  ModelGatewayDeepChartCard,
  ModelGatewayDeepSection,
  ModelGatewayDirectoryRow,
  ModelGatewayGroupSpec,
  ModelGatewayHighlightChart,
  ModelGatewayOverviewSpec,
  ModelGatewayRoutingMatrixRow,
  ModelGatewaySectionSpec,
  ModelGatewayStat,
} from "./modelIntelligenceTypes";
import { getProviderFromModelLabel } from "../charts/providerColors";
import { getModelIntelligenceDataPaths } from "./data-paths";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NORM_DIR = getModelIntelligenceDataPaths().root;

const HIGHLIGHT_BAR_COUNT = 12;
const DENSE_VISIBLE_COUNT = 27;
const MINI_VISIBLE_COUNT = 12;
const GROUP_SIZE = 8;
const SOURCE_FOOTER = "Source benchmark snapshot normalized by Ethen.";

const SECTIONS: ModelGatewaySectionSpec[] = [
  {
    id: "hero",
    title: "Gateway overview",
    description: "Entry point for model selection across the Ethen Model Gateway.",
  },
  {
    id: "decision-cards",
    title: "Gateway decisions",
    description: "Top picks by intelligence, speed, cost, and fallback value.",
  },
  {
    id: "routing-matrix",
    title: "Routing matrix",
    description: "Suggested primary and fallback models for common gateway workloads.",
  },
  {
    id: "highlight-charts",
    title: "Benchmark highlights",
    description: "Comparative charts for intelligence, output speed, and cost per task.",
  },
  {
    id: "intelligence",
    title: "Ethen Intelligence Index",
    description: "Dense comparative ranking from normalized Intelligence summary scores.",
  },
  {
    id: "intelligence-breakdown",
    title: "Intelligence Breakdown",
    description: "Compact evaluation charts from the normalized corpus.",
  },
  {
    id: "price-and-cost",
    title: "Price and Cost",
    description: "Cost per task, pricing stacks, and intelligence vs cost tradeoffs.",
  },
  {
    id: "token-use",
    title: "Token Use",
    description: "Output tokens per Intelligence Index task when chart data exists.",
  },
  {
    id: "speed-and-latency",
    title: "Speed & Latency",
    description: "Output throughput and latency / time-per-task signals.",
  },
  {
    id: "api-provider-performance",
    title: "API Provider Performance",
    description: "Provider-level speed and price signals derived from model metrics.",
  },
  {
    id: "directory",
    title: "Model Directory",
    description: "Dense rows for every available normalized model profile.",
  },
];

// ---------------------------------------------------------------------------
// Parsing helpers (aligned with leaderboardHelpers)
// ---------------------------------------------------------------------------

function parseSummaryValue(value: string): number | null {
  const cleaned = value.replace(/^[$]\s*/, "").replace(/s$/i, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseContextWindow(value: string): number | null {
  const cleaned = value.replace(/,/g, "").toLowerCase().trim();
  const m = cleaned.match(/^([\d.]+)\s*k/);
  if (m) {
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n * 1000 : null;
  }
  const m2 = cleaned.match(/^([\d.]+)\s*m\b/);
  if (m2) {
    const n = parseFloat(m2[1]);
    return Number.isFinite(n) ? n * 1_000_000 : null;
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatContextValue(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(tokens % 1_000 === 0 ? 0 : 1)}k`;
  }
  return String(tokens);
}

function safeNumber(val: unknown): number | null {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function firstNumericField(item: Record<string, unknown>): number | null {
  for (const [key, val] of Object.entries(item)) {
    if (key === "label" || key === "detailsUrl" || key === "@type") continue;
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "string") {
      const n = parseFloat(val);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function slugFromDetailsUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  const cleaned = url.replace(/\/+$/, "");
  const part = cleaned.split("/").filter(Boolean).pop();
  return part || null;
}

function toProviderKey(label: string, provider?: string): MIProviderKey {
  // Prefer label-based inference used by existing charts; fall back to provider string.
  const fromLabel = getProviderFromModelLabel(label || provider || "");
  if (fromLabel !== "unknown") return fromLabel;
  if (provider) return getProviderFromModelLabel(provider);
  return "unknown";
}

function modelHref(slug: string): string {
  return `/model-intelligence/models/${slug}`;
}

// ---------------------------------------------------------------------------
// Per-model metric extraction
// ---------------------------------------------------------------------------

interface ModelMetrics {
  entry: ModelIndexEntry;
  intelligence: number | null;
  intelligenceDisplay: string | null;
  speed: number | null;
  speedDisplay: string | null;
  latency: number | null;
  latencyDisplay: string | null;
  inputPrice: number | null;
  inputPriceDisplay: string | null;
  outputPrice: number | null;
  outputPriceDisplay: string | null;
  contextWindow: number | null;
  contextWindowDisplay: string | null;
  costPerTask: number | null;
  costPerTaskDisplay: string | null;
  /** Simple derived score: intelligence / max(outputPrice, epsilon). Higher = better fallback value. */
  fallbackValue: number | null;
  isOpenWeight: boolean;
}

function extractCardMetric(
  profile: RawModelProfile,
  label: string,
): { value: number | null; display: string | null } {
  const target = label.toLowerCase();
  for (const sc of profile.summary_cards || []) {
    if ((sc.label || "").toLowerCase() === target) {
      const value = parseSummaryValue(sc.value);
      return {
        value,
        display: sc.value || null,
      };
    }
  }
  return { value: null, display: null };
}

function extractContext(
  profile: RawModelProfile,
): { value: number | null; display: string | null } {
  for (const ts of profile.technical_specs || []) {
    if (ts.key === "context_window") {
      const value = parseContextWindow(ts.value);
      return {
        value,
        display: value !== null ? formatContextValue(value) : ts.value || null,
      };
    }
  }
  return { value: null, display: null };
}

function isOpenWeight(entry: ModelIndexEntry, profile: RawModelProfile | null): boolean {
  const type = (entry.model_type || "").toLowerCase();
  if (type.includes("open")) return true;
  if (!profile) return false;
  for (const ts of profile.technical_specs || []) {
    if (ts.key === "open_source" || ts.key === "model_type") {
      const v = (ts.value || "").toLowerCase();
      if (v.includes("open weight") || v.startsWith("yes")) return true;
    }
  }
  return false;
}

function readChartJson(slug: string, chartId: string): RawChartSpec | null {
  const filePath = path.join(NORM_DIR, "charts", slug, `${chartId}.chart.json`);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as RawChartSpec;
  } catch {
    return null;
  }
}

/**
 * Extract this model's own cost-per-task value from its comparative chart when present.
 * Chart peer sets often omit the subject model — returns null in that case (no invention).
 */
function extractSelfCostPerTask(
  slug: string,
  name: string,
): { value: number | null; display: string | null } {
  const chart =
    readChartJson(slug, "cost-per-task") ||
    readChartJson(slug, "cost-per-intelligence-index-task");
  if (!chart?.dataset?.data?.length) {
    return { value: null, display: null };
  }

  const nameLower = name.toLowerCase();
  const hit = chart.dataset.data.find((row) => {
    const rowSlug = slugFromDetailsUrl(row.detailsUrl);
    if (rowSlug === slug) return true;
    const label = String(row.label ?? "").toLowerCase();
    return label === nameLower;
  });

  if (!hit) return { value: null, display: null };

  const preferred =
    safeNumber(hit.costPerIntelligenceIndexTask) ??
    safeNumber(hit.costPerTask) ??
    firstNumericField(hit as Record<string, unknown>);

  if (preferred === null) return { value: null, display: null };

  return {
    value: preferred,
    display: `$${preferred < 0.01 ? preferred.toFixed(4) : preferred.toFixed(3)}`,
  };
}

/**
 * Build a corpus map of cost-per-task values from comparative chart rows.
 * Uses detailsUrl slug as identity; keeps the lowest observed cost per slug.
 * Derivation: min(observed costPerIntelligenceIndexTask) across chart datasets.
 */
function buildCostPerTaskCorpus(
  entries: ModelIndexEntry[],
): Map<string, { value: number; label: string; provider: string }> {
  const map = new Map<string, { value: number; label: string; provider: string }>();
  const entryBySlug = new Map(entries.map((e) => [e.slug, e]));

  // Sample charts from models that declare a cost-per-task chart; union peer rows.
  // Cap file reads: walk all entries but only open chart when index chart_count > 0.
  for (const entry of entries) {
    if (!entry.chart_count) continue;
    const chart =
      readChartJson(entry.slug, "cost-per-task") ||
      readChartJson(entry.slug, "cost-per-intelligence-index-task");
    if (!chart?.dataset?.data?.length) continue;

    for (const row of chart.dataset.data) {
      const rowSlug = slugFromDetailsUrl(row.detailsUrl);
      if (!rowSlug) continue;
      const value =
        safeNumber(row.costPerIntelligenceIndexTask) ??
        safeNumber(row.costPerTask) ??
        firstNumericField(row as Record<string, unknown>);
      if (value === null || value < 0) continue;

      const existing = map.get(rowSlug);
      if (!existing || value < existing.value) {
        const meta = entryBySlug.get(rowSlug);
        map.set(rowSlug, {
          value,
          label: String(row.label ?? meta?.name ?? rowSlug),
          provider: meta?.provider ?? "",
        });
      }
    }
  }

  return map;
}

function loadAllMetrics(entries: ModelIndexEntry[]): ModelMetrics[] {
  const results: ModelMetrics[] = [];

  for (const entry of entries) {
    let profile: RawModelProfile | null = null;
    try {
      const bundle = loadNormalizedModelProfile(entry.slug);
      profile = bundle?.profile ?? null;
    } catch {
      profile = null;
    }

    const intelligence = profile
      ? extractCardMetric(profile, "Intelligence")
      : { value: null, display: null };
    const speed = profile
      ? extractCardMetric(profile, "Speed")
      : { value: null, display: null };
    const latency = profile
      ? extractCardMetric(profile, "Latency")
      : { value: null, display: null };
    const inputPrice = profile
      ? extractCardMetric(profile, "Input Price")
      : { value: null, display: null };
    const outputPrice = profile
      ? extractCardMetric(profile, "Output Price")
      : { value: null, display: null };
    const context = profile
      ? extractContext(profile)
      : { value: null, display: null };

    let costPerTask = { value: null as number | null, display: null as string | null };
    try {
      costPerTask = extractSelfCostPerTask(entry.slug, entry.name);
    } catch {
      costPerTask = { value: null, display: null };
    }

    // Fallback value: intelligence per dollar of output (simple ratio).
    // Only when both intelligence and output price are present and price > 0.
    let fallbackValue: number | null = null;
    if (
      intelligence.value !== null &&
      outputPrice.value !== null &&
      outputPrice.value > 0
    ) {
      fallbackValue = intelligence.value / outputPrice.value;
    }

    results.push({
      entry,
      intelligence: intelligence.value,
      intelligenceDisplay: intelligence.display,
      speed: speed.value,
      speedDisplay: speed.display,
      latency: latency.value,
      latencyDisplay: latency.display,
      inputPrice: inputPrice.value,
      inputPriceDisplay: inputPrice.display,
      outputPrice: outputPrice.value,
      outputPriceDisplay: outputPrice.display,
      contextWindow: context.value,
      contextWindowDisplay: context.display,
      costPerTask: costPerTask.value,
      costPerTaskDisplay: costPerTask.display,
      fallbackValue,
      isOpenWeight: isOpenWeight(entry, profile),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Ranking helpers
// ---------------------------------------------------------------------------

function sortByMetric(
  rows: ModelMetrics[],
  getValue: (m: ModelMetrics) => number | null,
  higherIsBetter: boolean,
): ModelMetrics[] {
  return [...rows]
    .filter((m) => getValue(m) !== null)
    .sort((a, b) => {
      const av = getValue(a)!;
      const bv = getValue(b)!;
      return higherIsBetter ? bv - av : av - bv;
    });
}

function topSlugs(
  rows: ModelMetrics[],
  getValue: (m: ModelMetrics) => number | null,
  higherIsBetter: boolean,
  limit = GROUP_SIZE,
): string[] {
  return sortByMetric(rows, getValue, higherIsBetter)
    .slice(0, limit)
    .map((m) => m.entry.slug);
}

function pickTop(
  rows: ModelMetrics[],
  getValue: (m: ModelMetrics) => number | null,
  higherIsBetter: boolean,
): ModelMetrics | null {
  return sortByMetric(rows, getValue, higherIsBetter)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Chart builders
// ---------------------------------------------------------------------------

function toBarDatum(
  label: string,
  value: number,
  provider: string,
  highlighted = false,
): MIBenchmarkBarDatum {
  return {
    label,
    value,
    provider: toProviderKey(label, provider),
    highlighted,
  };
}

function buildHighlightFromMetrics(
  id: string,
  title: string,
  subtitle: string,
  metricKind: ModelGatewayHighlightChart["metricKind"],
  rows: ModelMetrics[],
  getValue: (m: ModelMetrics) => number | null,
  higherIsBetter: boolean,
  footer: string,
): ModelGatewayHighlightChart {
  const ranked = sortByMetric(rows, getValue, higherIsBetter).slice(
    0,
    HIGHLIGHT_BAR_COUNT,
  );
  const data = ranked.map((m, i) =>
    toBarDatum(m.entry.name, getValue(m)!, m.entry.provider, i === 0),
  );

  if (data.length === 0) {
    return {
      id,
      title,
      subtitle,
      metricKind,
      empty: true,
      footer: "No normalized values available for this metric.",
      topModelSlug: null,
      chart: {
        type: "dense_bar",
        data: [],
        metricKind,
        visibleCount: HIGHLIGHT_BAR_COUNT,
      },
    };
  }

  return {
    id,
    title,
    subtitle,
    metricKind,
    empty: false,
    footer,
    topModelSlug: ranked[0]?.entry.slug ?? null,
    chart: {
      type: "dense_bar",
      data,
      metricKind,
      visibleCount: HIGHLIGHT_BAR_COUNT,
    },
  };
}

function buildCostPerTaskHighlight(
  corpus: Map<string, { value: number; label: string; provider: string }>,
  entries: ModelIndexEntry[],
): ModelGatewayHighlightChart {
  const entryBySlug = new Map(entries.map((e) => [e.slug, e]));
  const ranked = Array.from(corpus.entries())
    .map(([slug, info]) => ({
      slug,
      value: info.value,
      label: entryBySlug.get(slug)?.name || info.label,
      provider: entryBySlug.get(slug)?.provider || info.provider,
    }))
    .sort((a, b) => a.value - b.value)
    .slice(0, HIGHLIGHT_BAR_COUNT);

  if (ranked.length === 0) {
    return {
      id: "cost-per-task",
      title: "Cost per Task",
      subtitle: "Lowest observed cost per Intelligence Index task from comparative charts.",
      metricKind: "currency",
      empty: true,
      footer: "Cost-per-task chart data was not available.",
      topModelSlug: null,
      chart: {
        type: "dense_bar",
        data: [],
        metricKind: "currency",
        visibleCount: HIGHLIGHT_BAR_COUNT,
      },
    };
  }

  return {
    id: "cost-per-task",
    title: "Cost per Task",
    subtitle: "Lowest observed cost per Intelligence Index task from comparative charts.",
    metricKind: "currency",
    empty: false,
    footer:
      "Derived from normalized cost-per-task chart peer rows; keeps the lowest cost observed per model slug.",
    topModelSlug: ranked[0]?.slug ?? null,
    chart: {
      type: "dense_bar",
      data: ranked.map((r, i) => toBarDatum(r.label, r.value, r.provider, i === 0)),
      metricKind: "currency",
      visibleCount: HIGHLIGHT_BAR_COUNT,
    },
  };
}

// ---------------------------------------------------------------------------
// Decision cards, groups, routing matrix
// ---------------------------------------------------------------------------

function buildDecisionCard(
  id: string,
  title: string,
  description: string,
  metricKey: string,
  pick: ModelMetrics | null,
  display: (m: ModelMetrics) => string | null,
  valueOf: (m: ModelMetrics) => number | null,
): ModelGatewayDecisionCard {
  if (!pick) {
    return {
      id,
      title,
      description,
      metricKey,
      modelSlug: null,
      modelName: null,
      provider: null,
      value: null,
      displayValue: null,
      href: null,
    };
  }
  return {
    id,
    title,
    description,
    metricKey,
    modelSlug: pick.entry.slug,
    modelName: pick.entry.name,
    provider: pick.entry.provider,
    value: valueOf(pick),
    displayValue: display(pick),
    href: modelHref(pick.entry.slug),
  };
}

function buildRoutingMatrix(metrics: ModelMetrics[]): ModelGatewayRoutingMatrixRow[] {
  const byIntel = sortByMetric(metrics, (m) => m.intelligence, true);
  const bySpeed = sortByMetric(metrics, (m) => m.speed, true);
  const byLatency = sortByMetric(metrics, (m) => m.latency, false);
  const byCost = sortByMetric(
    metrics,
    (m) => m.costPerTask ?? m.outputPrice,
    false,
  );
  const byContext = sortByMetric(metrics, (m) => m.contextWindow, true);
  const byFallback = sortByMetric(metrics, (m) => m.fallbackValue, true);
  const openIntel = sortByMetric(
    metrics.filter((m) => m.isOpenWeight),
    (m) => m.intelligence,
    true,
  );

  const pair = (
    primaryList: ModelMetrics[],
    fallbackList: ModelMetrics[],
  ): { primary: ModelMetrics | null; fallback: ModelMetrics | null } => {
    const primary = primaryList[0] ?? null;
    const fallback =
      fallbackList.find((m) => m.entry.slug !== primary?.entry.slug) ??
      primaryList[1] ??
      null;
    return { primary, fallback };
  };

  // Research: prefer high intelligence among longer-context models when possible.
  const researchPool = sortByMetric(
    metrics.filter(
      (m) =>
        m.intelligence !== null &&
        (m.contextWindow === null || m.contextWindow >= 100_000),
    ),
    (m) => m.intelligence,
    true,
  );
  const researchSource = researchPool.length >= 2 ? researchPool : byIntel;

  // Enterprise: balance via fallback value (intelligence per $ output).
  const enterprise = pair(byFallback, byIntel);

  // Low-latency: prefer latency when present, else speed.
  const lowLatencySource = byLatency.length >= 2 ? byLatency : bySpeed;

  const coding = pair(byIntel, byFallback);
  const research = pair(researchSource, byContext);
  const batch = pair(byCost, bySpeed);
  const lowLatency = pair(lowLatencySource, bySpeed);
  const longContext = pair(byContext, byIntel);
  const openWeight = pair(openIntel, byFallback);

  const row = (
    id: string,
    useCase: string,
    description: string,
    picked: { primary: ModelMetrics | null; fallback: ModelMetrics | null },
    rationale: string,
  ): ModelGatewayRoutingMatrixRow => ({
    id,
    useCase,
    description,
    primarySlug: picked.primary?.entry.slug ?? null,
    primaryName: picked.primary?.entry.name ?? null,
    fallbackSlug: picked.fallback?.entry.slug ?? null,
    fallbackName: picked.fallback?.entry.name ?? null,
    rationale,
  });

  return [
    row(
      "coding-agent",
      "Coding agent",
      "Plan-first coding, tool use, and multi-step code changes.",
      coding,
      "Primary: highest Intelligence Index. Fallback: best intelligence-per-output-dollar among remaining models.",
    ),
    row(
      "research",
      "Research",
      "Deep reading, synthesis, and multi-source analysis.",
      research,
      "Primary: high intelligence among models with ≥100k context when available. Fallback: largest context window.",
    ),
    row(
      "enterprise-assistant",
      "Enterprise assistant",
      "General assistant workloads with cost awareness.",
      enterprise,
      "Primary: best fallback value (intelligence / output price). Fallback: highest intelligence.",
    ),
    row(
      "batch-summarization",
      "Batch summarization",
      "High-volume summarization and extraction jobs.",
      batch,
      "Primary: lowest cost per task when known, else lowest output price. Fallback: fastest output speed.",
    ),
    row(
      "low-latency-chat",
      "Low-latency chat",
      "Interactive chat where time-to-first-token or throughput matters.",
      lowLatency,
      "Primary: lowest latency when present, else highest output speed. Fallback: highest output speed.",
    ),
    row(
      "long-context-workflow",
      "Long-context workflow",
      "Long documents, large transcripts, and extended threads.",
      longContext,
      "Primary: largest context window. Fallback: highest intelligence.",
    ),
    row(
      "open-weight-deployment",
      "Open-weight deployment",
      "Self-hosted or open-weight gateway routes.",
      openWeight,
      "Primary: highest intelligence among open-weight models. Fallback: best intelligence-per-output-dollar overall.",
    ),
  ];
}

function buildGroups(
  metrics: ModelMetrics[],
  costCorpus: Map<string, { value: number; label: string; provider: string }>,
): ModelGatewayGroupSpec[] {
  const cheapestCostSlugs = Array.from(costCorpus.entries())
    .sort((a, b) => a[1].value - b[1].value)
    .slice(0, GROUP_SIZE)
    .map(([slug]) => slug);

  const longContext = topSlugs(metrics, (m) => m.contextWindow, true).filter(
    (slug) => {
      const m = metrics.find((x) => x.entry.slug === slug);
      return m?.contextWindow != null && m.contextWindow >= 100_000;
    },
  );

  return [
    {
      id: "best-intelligence",
      title: "Best intelligence models",
      description: "Highest Ethen Intelligence Index summary scores.",
      slugs: topSlugs(metrics, (m) => m.intelligence, true),
    },
    {
      id: "fastest-output",
      title: "Fastest output models",
      description: "Highest output speed (tok/s) from summary cards when present.",
      slugs: topSlugs(metrics, (m) => m.speed, true),
    },
    {
      id: "lowest-cost",
      title: "Lowest cost / cost-per-task models",
      description:
        cheapestCostSlugs.length > 0
          ? "Lowest observed cost-per-task from comparative charts."
          : "Lowest output token price when cost-per-task observations are unavailable.",
      slugs:
        cheapestCostSlugs.length > 0
          ? cheapestCostSlugs
          : topSlugs(metrics, (m) => m.outputPrice, false),
    },
    {
      id: "best-fallback-value",
      title: "Best fallback value candidates",
      description:
        "Highest intelligence per dollar of output price (intelligence / outputPrice).",
      slugs: topSlugs(metrics, (m) => m.fallbackValue, true),
    },
    {
      id: "long-context",
      title: "Long-context candidates",
      description: "Largest context windows (≥100k when available).",
      slugs: longContext.length > 0 ? longContext : topSlugs(metrics, (m) => m.contextWindow, true),
    },
  ];
}

function buildStats(
  entries: ModelIndexEntry[],
  metrics: ModelMetrics[],
): ModelGatewayStat[] {
  const index = getModelIndex();
  const providers = new Set(entries.map((e) => e.provider).filter(Boolean));
  const withIntel = metrics.filter((m) => m.intelligence !== null).length;
  const withSpeed = metrics.filter((m) => m.speed !== null).length;
  const withPrice = metrics.filter(
    (m) => m.inputPrice !== null || m.outputPrice !== null,
  ).length;

  return [
    {
      id: "models",
      label: "Models",
      value: String(entries.length),
      hint: "Normalized profiles in the Model Intelligence corpus",
    },
    {
      id: "providers",
      label: "Providers",
      value: String(providers.size),
      hint: "Distinct provider labels on index entries",
    },
    {
      id: "charts",
      label: "Chart specs",
      value: String(index.counts.chart_specs_generated ?? "—"),
      hint: "Total normalized chart specs across profiles",
    },
    {
      id: "with-intelligence",
      label: "With intelligence score",
      value: String(withIntel),
      hint: "Profiles with an Intelligence summary card",
    },
    {
      id: "with-speed",
      label: "With speed score",
      value: String(withSpeed),
      hint: "Profiles with a Speed summary card",
    },
    {
      id: "with-pricing",
      label: "With pricing",
      value: String(withPrice),
      hint: "Profiles with input and/or output price cards",
    },
  ];
}

function buildDirectoryRows(metrics: ModelMetrics[]): ModelGatewayDirectoryRow[] {
  return metrics
    .map((m) => ({
      name: m.entry.name,
      slug: m.entry.slug,
      provider: m.entry.provider,
      type: m.entry.model_type || null,
      intelligence: m.intelligence,
      intelligenceDisplay: m.intelligenceDisplay,
      speed: m.speed,
      speedDisplay: m.speedDisplay,
      inputPrice: m.inputPrice,
      inputPriceDisplay: m.inputPriceDisplay,
      outputPrice: m.outputPrice,
      outputPriceDisplay: m.outputPriceDisplay,
      contextWindow: m.contextWindow,
      contextWindowDisplay: m.contextWindowDisplay,
      costPerTask: m.costPerTask,
      costPerTaskDisplay: m.costPerTaskDisplay,
      chartCount: m.entry.chart_count ?? 0,
      faqCount: m.entry.faq_count ?? 0,
      href: modelHref(m.entry.slug),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Deep report chart extraction
// ---------------------------------------------------------------------------

/** Preferred intelligence-breakdown benchmarks (shown even when empty). */
const BREAKDOWN_PREFERRED: Array<{
  id: string;
  title: string;
  subtitle: string;
  chartIds: string[];
}> = [
  {
    id: "gdpval-aa-v2",
    title: "GDPval-AA v2",
    subtitle: "Agentic real-world work tasks",
    chartIds: ["gdpval-aa-v2", "gdpval"],
  },
  {
    id: "tau3-banking",
    title: "τ³-Banking",
    subtitle: "Banking agent evaluation",
    chartIds: ["tau3-banking", "tau-banking", "t3-banking"],
  },
  {
    id: "terminal-bench-v2-1",
    title: "Terminal-Bench v2.1",
    subtitle: "Agentic coding and terminal use",
    chartIds: ["terminal-bench-v2-1", "terminal-bench"],
  },
  {
    id: "scicode",
    title: "SciCode",
    subtitle: "Scientific coding evaluation",
    chartIds: ["scicode"],
  },
  {
    id: "aa-briefcase",
    title: "AA-Briefcase",
    subtitle: "Briefcase agent evaluation (Elo)",
    chartIds: ["aa-briefcase-elo", "aa-briefcase"],
  },
  {
    id: "ifbench",
    title: "IFBench",
    subtitle: "Instruction following benchmark",
    chartIds: ["ifbench"],
  },
  {
    id: "apex-agents-aa",
    title: "APEX-Agents-AA",
    subtitle: "Agentic evaluation suite",
    chartIds: ["apex-agents-aa", "apex-agents"],
  },
  {
    id: "mmmu-pro",
    title: "MMMU-Pro",
    subtitle: "Multimodal understanding",
    chartIds: ["mmmu-pro", "mmmu"],
  },
];

/** Extra evaluation charts present in the normalized corpus (not in preferred list). */
const BREAKDOWN_AVAILABLE_EXTRAS: Array<{
  id: string;
  title: string;
  subtitle: string;
  chartIds: string[];
  ethanTitle?: string;
}> = [
  {
    id: "ethen-intelligence-index-peer",
    title: "Ethen Intelligence Index",
    subtitle: "Comparative peer bars from normalized intelligence index charts",
    chartIds: ["artificial-analysis-intelligence-index", "intelligence"],
  },
  {
    id: "aa-omniscience",
    title: "AA-Omniscience Index",
    subtitle: "Knowledge / omniscience evaluation",
    chartIds: ["aa-omniscience-index"],
  },
  {
    id: "openness-index",
    title: "Openness Index",
    subtitle: "Open-weight openness scores",
    chartIds: ["artificial-analysis-openness-index-score"],
  },
  {
    id: "intelligence-open-vs-proprietary",
    title: "Intelligence · Open vs Proprietary",
    subtitle: "Index split across open-weight and proprietary models",
    chartIds: [
      "artificial-analysis-intelligence-index-by-open-weights-proprietary",
    ],
  },
  {
    id: "multilingual-index",
    title: "Multilingual Index",
    subtitle: "Cross-language normalized index when present",
    chartIds: ["multilingual-index-across-languages-normalized"],
  },
];

function emptyCard(
  id: string,
  title: string,
  subtitle: string,
  reason: string,
  layout: ModelGatewayDeepChartCard["layout"] = "full",
): ModelGatewayDeepChartCard {
  return {
    id,
    title,
    subtitle,
    empty: true,
    emptyReason: reason,
    footer: SOURCE_FOOTER,
    layout,
    chart: null,
  };
}

function chartCard(
  id: string,
  title: string,
  subtitle: string,
  chart: MIChartSpec,
  layout: ModelGatewayDeepChartCard["layout"] = "full",
  modelCountLabel?: string,
): ModelGatewayDeepChartCard {
  const count =
    modelCountLabel ??
    (chart.type === "dense_bar"
      ? `${Math.min(chart.data.length, chart.visibleCount ?? chart.data.length)} models`
      : chart.type === "stacked_bar"
        ? `${Math.min(chart.data.length, chart.visibleCount ?? chart.data.length)} models`
        : chart.type === "scatter"
          ? `${chart.data.length} models`
          : chart.type === "mini_grid"
            ? `${chart.charts.length} charts`
            : undefined);

  return {
    id,
    title,
    subtitle,
    empty: false,
    footer: SOURCE_FOOTER,
    layout,
    modelCountLabel: count,
    chart,
  };
}

/** chartId → model slugs that publish that chart file (built once per process). */
let _chartIdIndex: Map<string, string[]> | null = null;

function getChartIdIndex(): Map<string, string[]> {
  if (_chartIdIndex) return _chartIdIndex;
  const map = new Map<string, string[]>();
  const chartsRoot = path.join(NORM_DIR, "charts");
  try {
    for (const slug of fs.readdirSync(chartsRoot)) {
      const dir = path.join(chartsRoot, slug);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(dir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      let files: string[];
      try {
        files = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".chart.json")) continue;
        const id = f.slice(0, -".chart.json".length);
        const list = map.get(id) ?? [];
        list.push(slug);
        map.set(id, list);
      }
    }
  } catch {
    // charts root missing — leave empty index
  }
  _chartIdIndex = map;
  return map;
}

/**
 * Locate a comparative chart file using the on-disk chart id index.
 * Prefers slugs with higher chart_count when multiple hosts publish the same chart.
 */
function findChartById(
  chartIds: string[],
  entries: ModelIndexEntry[],
): RawChartSpec | null {
  const index = getChartIdIndex();
  const chartCount = new Map(entries.map((e) => [e.slug, e.chart_count ?? 0]));

  for (const id of chartIds) {
    const hosts = [...(index.get(id) ?? [])].sort(
      (a, b) => (chartCount.get(b) ?? 0) - (chartCount.get(a) ?? 0),
    );
    for (const slug of hosts.slice(0, 8)) {
      const chart = readChartJson(slug, id);
      if (chart?.dataset?.data?.length) return chart;
    }
  }
  return null;
}

/** Extract a single numeric from a chart row (handles PropertyValue mid arrays). */
function rowPrimaryNumber(row: Record<string, unknown>): number | null {
  for (const [key, val] of Object.entries(row)) {
    if (key === "label" || key === "detailsUrl" || key === "@type") continue;
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "string") {
      const n = parseFloat(val);
      if (Number.isFinite(n)) return n;
    }
    if (Array.isArray(val)) {
      // Elo-style: [{ name: 'mid', value }, { name: 'lower' }, …]
      const mid = val.find(
        (p) =>
          p &&
          typeof p === "object" &&
          String((p as { name?: string }).name ?? "").toLowerCase() === "mid",
      ) as { value?: unknown } | undefined;
      if (mid) {
        const n = safeNumber(mid.value);
        if (n !== null) return n;
      }
      for (const p of val) {
        if (p && typeof p === "object" && "value" in (p as object)) {
          const n = safeNumber((p as { value: unknown }).value);
          if (n !== null) return n;
        }
      }
    }
  }
  return null;
}

function rawBarToSpec(
  chart: RawChartSpec,
  metricKind: MIMetricKind,
  visibleCount = DENSE_VISIBLE_COUNT,
  higherIsBetter = true,
): MIChartSpec | null {
  const rows: MIBenchmarkBarDatum[] = [];
  for (const row of chart.dataset?.data ?? []) {
    const r = row as Record<string, unknown>;
    const label = String(r.label ?? "");
    const value = rowPrimaryNumber(r);
    if (!label || value === null) continue;
    rows.push({
      label,
      value,
      provider: toProviderKey(label),
      highlighted: false,
    });
  }

  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) =>
    higherIsBetter ? b.value - a.value : a.value - b.value,
  );
  if (sorted[0]) {
    sorted[0] = { ...sorted[0], highlighted: true };
  }

  return {
    type: "dense_bar",
    data: sorted,
    metricKind,
    visibleCount: Math.min(visibleCount, sorted.length),
    allowNegative: sorted.some((d) => d.value < 0),
  };
}

function rawStackedToSpec(
  chart: RawChartSpec,
  metricKind: MIMetricKind = "currency",
  visibleCount = 18,
): MIChartSpec | null {
  const colors = ["#c8c8c8", "#a8a8a8", "#888888", "#6a6a6a", "#4a4a4a"];
  const data: MIBenchmarkStackedDatum[] = [];

  for (const row of chart.dataset?.data ?? []) {
    const r = row as Record<string, unknown>;
    const label = String(r.label ?? "");
    if (!label) continue;
    const segments: MIBenchmarkStackedDatum["segments"] = [];

    const pricing = r.pricing;
    if (Array.isArray(pricing)) {
      pricing.forEach((p, i) => {
        if (!p || typeof p !== "object") return;
        const item = p as { name?: string; value?: unknown };
        const value = safeNumber(item.value);
        if (value === null || value < 0) return;
        const name = String(item.name ?? `seg-${i}`)
          .replace(/([A-Z])/g, " $1")
          .replace(/price/gi, "")
          .trim() || `seg-${i}`;
        segments.push({
          key: name,
          value,
          color: colors[i % colors.length],
        });
      });
    } else {
      // answer/reasoning/input style multi-key rows
      const skip = new Set(["label", "detailsUrl", "@type", "pricing"]);
      let i = 0;
      for (const [key, val] of Object.entries(r)) {
        if (skip.has(key)) continue;
        const value = safeNumber(val);
        if (value === null || value < 0) continue;
        segments.push({
          key: key.replace(/([A-Z])/g, " $1").trim(),
          value,
          color: colors[i % colors.length],
        });
        i += 1;
      }
    }

    if (segments.length === 0 || !segments.some((s) => s.value > 0)) continue;
    data.push({
      label,
      provider: toProviderKey(label),
      highlighted: false,
      segments,
    });
  }

  if (data.length === 0) return null;
  // Sort by total descending for readability
  data.sort((a, b) => {
    const ta = a.segments.reduce((s, x) => s + x.value, 0);
    const tb = b.segments.reduce((s, x) => s + x.value, 0);
    return tb - ta;
  });
  if (data[0]) data[0] = { ...data[0], highlighted: true };

  return {
    type: "stacked_bar",
    data,
    metricKind,
    visibleCount: Math.min(visibleCount, data.length),
  };
}

function metricsToDenseBar(
  rows: ModelMetrics[],
  getValue: (m: ModelMetrics) => number | null,
  higherIsBetter: boolean,
  metricKind: MIMetricKind,
  visibleCount = DENSE_VISIBLE_COUNT,
): MIChartSpec | null {
  const ranked = sortByMetric(rows, getValue, higherIsBetter);
  if (ranked.length === 0) return null;
  const data = ranked.map((m, i) =>
    toBarDatum(m.entry.name, getValue(m)!, m.entry.provider, i === 0),
  );
  return {
    type: "dense_bar",
    data,
    metricKind,
    visibleCount: Math.min(visibleCount, data.length),
  };
}

function buildMiniFromChartIds(
  id: string,
  title: string,
  subtitle: string,
  chartIds: string[],
  entries: ModelIndexEntry[],
  metricKind: MIMetricKind = "score",
): ModelGatewayDeepChartCard {
  const raw = findChartById(chartIds, entries);
  if (!raw) {
    return emptyCard(
      id,
      title,
      subtitle,
      `No normalized chart file found for ${chartIds.join(" / ")}.`,
      "mini",
    );
  }
  const spec = rawBarToSpec(raw, metricKind, MINI_VISIBLE_COUNT, true);
  if (!spec || spec.type !== "dense_bar" || spec.data.length === 0) {
    return emptyCard(
      id,
      title,
      subtitle,
      `Chart ${raw.id} exists but no numeric rows could be extracted.`,
      "mini",
    );
  }
  // Present as mini_grid-compatible dense data via dense_bar + layout mini
  return chartCard(id, title, subtitle, spec, "mini");
}

function buildIntelligenceVsCostScatter(
  metrics: ModelMetrics[],
): MIChartSpec | null {
  const points: MIBenchmarkScatterDatum[] = [];
  for (const m of metrics) {
    const y = m.intelligence;
    const x = m.costPerTask ?? m.outputPrice;
    if (y === null || x === null || x <= 0) continue;
    points.push({
      label: m.entry.name,
      provider: toProviderKey(m.entry.name, m.entry.provider),
      x,
      y,
      highlighted: false,
    });
  }
  if (points.length < 3) return null;
  // Highlight top intelligence
  const top = [...points].sort((a, b) => b.y - a.y)[0];
  if (top) top.highlighted = true;

  return {
    type: "scatter",
    data: points.slice(0, 80),
    xLabel: "Cost per task (or output $/1M)",
    yLabel: "Intelligence Index",
    xMetricKind: "currency",
    yMetricKind: "score",
    quadrantLabel: "Value candidates",
  };
}

interface ProviderAgg {
  provider: string;
  speedSum: number;
  speedN: number;
  priceSum: number;
  priceN: number;
  intelSum: number;
  intelN: number;
  models: number;
}

function buildProviderAggregates(metrics: ModelMetrics[]): ProviderAgg[] {
  const map = new Map<string, ProviderAgg>();
  for (const m of metrics) {
    const provider = m.entry.provider || "Unknown";
    let agg = map.get(provider);
    if (!agg) {
      agg = {
        provider,
        speedSum: 0,
        speedN: 0,
        priceSum: 0,
        priceN: 0,
        intelSum: 0,
        intelN: 0,
        models: 0,
      };
      map.set(provider, agg);
    }
    agg.models += 1;
    if (m.speed !== null) {
      agg.speedSum += m.speed;
      agg.speedN += 1;
    }
    if (m.outputPrice !== null) {
      agg.priceSum += m.outputPrice;
      agg.priceN += 1;
    }
    if (m.intelligence !== null) {
      agg.intelSum += m.intelligence;
      agg.intelN += 1;
    }
  }
  return Array.from(map.values());
}

function buildDeepSections(
  entries: ModelIndexEntry[],
  metrics: ModelMetrics[],
  costCorpus: Map<string, { value: number; label: string; provider: string }>,
): ModelGatewayDeepSection[] {
  // --- 1. Intelligence (dense) ---
  const intelDense = metricsToDenseBar(
    metrics,
    (m) => m.intelligence,
    true,
    "score",
    DENSE_VISIBLE_COUNT,
  );
  const intelligenceSection: ModelGatewayDeepSection = {
    id: "intelligence",
    title: "Ethen Intelligence Index",
    description:
      "Full comparative ranking from normalized Intelligence summary cards. Higher is stronger overall capability.",
    available: Boolean(intelDense),
    unavailableReason: intelDense
      ? undefined
      : "No Intelligence summary card values found in normalized profiles.",
    cards: intelDense
      ? [
          chartCard(
            "ethen-intelligence-index-dense",
            "Ethen Intelligence Index",
            "Top models by normalized Intelligence Index score.",
            intelDense,
            "full",
            `${Math.min(
              DENSE_VISIBLE_COUNT,
              intelDense.type === "dense_bar" ? intelDense.data.length : 0,
            )} models`,
          ),
        ]
      : [
          emptyCard(
            "ethen-intelligence-index-dense",
            "Ethen Intelligence Index",
            "Top models by normalized Intelligence Index score.",
            "No Intelligence summary card values found.",
          ),
        ],
  };

  // --- 2. Intelligence Breakdown (mini grid) ---
  const breakdownCards: ModelGatewayDeepChartCard[] = [];
  for (const pref of BREAKDOWN_PREFERRED) {
    breakdownCards.push(
      buildMiniFromChartIds(
        pref.id,
        pref.title,
        pref.subtitle,
        pref.chartIds,
        entries,
        pref.id === "aa-briefcase" ? "score" : "score",
      ),
    );
  }
  // Fill with corpus-available evaluation charts not already covered
  const coveredIds = new Set(breakdownCards.map((c) => c.id));
  for (const extra of BREAKDOWN_AVAILABLE_EXTRAS) {
    if (coveredIds.has(extra.id)) continue;
    // Skip if chart id already used by a preferred card that rendered
    const alreadyHasChart = breakdownCards.some(
      (c) => !c.empty && extra.chartIds.some((id) => c.id.includes(id)),
    );
    if (alreadyHasChart) continue;
    const card = buildMiniFromChartIds(
      extra.id,
      extra.title,
      extra.subtitle,
      extra.chartIds,
      entries,
      "score",
    );
    if (!card.empty) {
      breakdownCards.push(card);
      coveredIds.add(extra.id);
    }
  }
  // Ensure at least one extra real charts if preferred mostly empty
  const realBreakdown = breakdownCards.filter((c) => !c.empty);
  const breakdownAvailable = realBreakdown.length > 0;
  const intelligenceBreakdownSection: ModelGatewayDeepSection = {
    id: "intelligence-breakdown",
    title: "Intelligence Breakdown",
    description: breakdownAvailable
      ? `Compact evaluation charts from normalized data. ${realBreakdown.length} chart(s) with peer rows; preferred benchmarks without corpus files show as unavailable.`
      : "Preferred evaluation charts are not present as normalized chart files in this corpus.",
    available: breakdownAvailable,
    unavailableReason: breakdownAvailable
      ? undefined
      : "No evaluation breakdown charts could be extracted from data/model-intelligence/normalized/charts.",
    cards: breakdownCards,
  };

  // --- 3. Price and Cost ---
  const costBars: MIBenchmarkBarDatum[] = Array.from(costCorpus.entries())
    .map(([slug, info]) =>
      toBarDatum(info.label, info.value, info.provider, false),
    )
    .sort((a, b) => a.value - b.value);
  if (costBars[0]) costBars[0] = { ...costBars[0], highlighted: true };

  const costDense: MIChartSpec | null =
    costBars.length > 0
      ? {
          type: "dense_bar",
          data: costBars,
          metricKind: "currency",
          visibleCount: Math.min(DENSE_VISIBLE_COUNT, costBars.length),
        }
      : metricsToDenseBar(
          metrics,
          (m) => m.outputPrice,
          false,
          "currency",
          DENSE_VISIBLE_COUNT,
        );

  const pricingRaw = findChartById(
    ["pricing-cache-hit-input-and-output", "pricing-input-cached-hit-and-output"],
    entries,
  );
  const pricingStacked = pricingRaw
    ? rawStackedToSpec(pricingRaw, "currency", 18)
    : null;

  const scatter = buildIntelligenceVsCostScatter(metrics);

  const priceCards: ModelGatewayDeepChartCard[] = [];
  if (costDense) {
    priceCards.push(
      chartCard(
        "cost-per-task-dense",
        "Cost per Task",
        costCorpus.size > 0
          ? "Lowest observed cost per Intelligence Index task from comparative charts."
          : "Output token price ranking (cost-per-task chart observations sparse).",
        costDense,
        "full",
      ),
    );
  } else {
    priceCards.push(
      emptyCard(
        "cost-per-task-dense",
        "Cost per Task",
        "Cost per Intelligence Index task",
        "No cost-per-task or output-price values available.",
      ),
    );
  }
  if (pricingStacked) {
    priceCards.push(
      chartCard(
        "pricing-stacked",
        "Pricing · Input / Output / Cache",
        "Stacked token pricing from normalized pricing charts.",
        pricingStacked,
        "full",
      ),
    );
  } else {
    priceCards.push(
      emptyCard(
        "pricing-stacked",
        "Pricing · Input / Output / Cache",
        "Stacked token pricing",
        "No pricing stacked_bar chart could be loaded from the normalized corpus.",
        "half",
      ),
    );
  }
  if (scatter) {
    priceCards.push(
      chartCard(
        "intelligence-vs-cost",
        "Intelligence vs Cost",
        "Quality-to-cost tradeoff for routing substitutes and fallbacks.",
        scatter,
        "full",
      ),
    );
  } else {
    priceCards.push(
      emptyCard(
        "intelligence-vs-cost",
        "Intelligence vs Cost",
        "Quality-to-cost tradeoff",
        "Fewer than 3 models have both intelligence and cost/price values.",
        "half",
      ),
    );
  }

  const priceAvailable = priceCards.some((c) => !c.empty);
  const priceAndCostSection: ModelGatewayDeepSection = {
    id: "price-and-cost",
    title: "Price and Cost",
    description:
      "Cost efficiency signals for gateway routing — task cost, token pricing, and intelligence per dollar.",
    available: priceAvailable,
    unavailableReason: priceAvailable
      ? undefined
      : "No price or cost metrics available in normalized data.",
    cards: priceCards,
  };

  // --- 4. Token Use ---
  const tokenRaw = findChartById(
    ["output-tokens-per-intelligence-index-task"],
    entries,
  );
  let tokenChart: MIChartSpec | null = null;
  if (tokenRaw) {
    // Prefer stacked answer+reasoning when both keys exist
    const sample = tokenRaw.dataset.data[0] as Record<string, unknown> | undefined;
    if (sample && "answer" in sample && "reasoning" in sample) {
      tokenChart = rawStackedToSpec(tokenRaw, "tokens", 20);
    }
    if (!tokenChart) {
      tokenChart = rawBarToSpec(tokenRaw, "tokens", DENSE_VISIBLE_COUNT, false);
    }
  }
  const tokenSection: ModelGatewayDeepSection = {
    id: "token-use",
    title: "Token Use",
    description:
      "Output tokens consumed per Intelligence Index task — useful for cost and latency estimation.",
    available: Boolean(tokenChart),
    unavailableReason: tokenChart
      ? undefined
      : "output-tokens-per-intelligence-index-task chart not found or had no extractable rows.",
    cards: tokenChart
      ? [
          chartCard(
            "output-tokens-per-task",
            "Output Tokens per Task",
            "Tokens generated per Intelligence Index task (answer + reasoning when stacked).",
            tokenChart,
            "full",
          ),
        ]
      : [
          emptyCard(
            "output-tokens-per-task",
            "Output Tokens per Task",
            "Tokens generated per Intelligence Index task",
            "No output-tokens chart data available in this normalized preview.",
          ),
        ],
  };

  // --- 5. Speed & Latency ---
  const speedDense = metricsToDenseBar(
    metrics,
    (m) => m.speed,
    true,
    "speed",
    DENSE_VISIBLE_COUNT,
  );
  const speedRaw = findChartById(["output-speed", "speed"], entries);
  const speedFromChart = speedRaw
    ? rawBarToSpec(speedRaw, "speed", DENSE_VISIBLE_COUNT, true)
    : null;

  const latencyRaw = findChartById(
    ["latency-time-to-first-answer-token", "time-per-intelligence-index-task"],
    entries,
  );
  let latencyChart: MIChartSpec | null = null;
  if (latencyRaw) {
    if (latencyRaw.id.includes("time-per")) {
      latencyChart = rawBarToSpec(latencyRaw, "latency", DENSE_VISIBLE_COUNT, false);
    } else {
      // latency often has reasoningTime + inputTime — sum for TTFT proxy or stacked
      latencyChart = rawStackedToSpec(latencyRaw, "latency", 18);
      if (!latencyChart) {
        latencyChart = rawBarToSpec(latencyRaw, "latency", DENSE_VISIBLE_COUNT, false);
      }
    }
  }
  // Fallback latency from summary cards
  if (!latencyChart) {
    latencyChart = metricsToDenseBar(
      metrics,
      (m) => m.latency,
      false,
      "latency",
      DENSE_VISIBLE_COUNT,
    );
  }

  const speedCards: ModelGatewayDeepChartCard[] = [];
  const speedSpec = speedDense ?? speedFromChart;
  if (speedSpec) {
    speedCards.push(
      chartCard(
        "output-speed-dense",
        "Output Speed",
        "Tokens per second from normalized Speed summary cards / output-speed charts.",
        speedSpec,
        "full",
      ),
    );
  } else {
    speedCards.push(
      emptyCard(
        "output-speed-dense",
        "Output Speed",
        "Tokens per second",
        "No speed values in summary cards or output-speed charts.",
      ),
    );
  }
  if (latencyChart) {
    const isTimePer = latencyRaw?.id.includes("time-per") ?? false;
    speedCards.push(
      chartCard(
        "latency-or-time-per-task",
        isTimePer ? "Time per Task" : "Latency · Time to First Token",
        isTimePer
          ? "Wall time per Intelligence Index task from comparative charts."
          : "Time-to-first-answer-token components when available.",
        latencyChart,
        "full",
      ),
    );
  } else {
    speedCards.push(
      emptyCard(
        "latency-or-time-per-task",
        "Time per Task / Latency",
        "Latency or time-per-task",
        "No latency or time-per-task chart/summary data available.",
      ),
    );
  }

  const speedSection: ModelGatewayDeepSection = {
    id: "speed-and-latency",
    title: "Speed & Latency",
    description:
      "Throughput and responsiveness signals for low-latency gateway routes.",
    available: speedCards.some((c) => !c.empty),
    unavailableReason: speedCards.some((c) => !c.empty)
      ? undefined
      : "No speed or latency values available.",
    cards: speedCards,
  };

  // --- 6. API Provider Performance ---
  // No dedicated provider-level chart files exist in the normalized corpus.
  // Derive provider aggregates from per-model metrics (documented derivation).
  const providerAggs = buildProviderAggregates(metrics);
  const providersWithSpeed = providerAggs.filter((p) => p.speedN > 0);
  const providersWithPrice = providerAggs.filter((p) => p.priceN > 0);
  const hasProviderDerived =
    providersWithSpeed.length >= 3 || providersWithPrice.length >= 3;

  const providerCards: ModelGatewayDeepChartCard[] = [];
  if (hasProviderDerived) {
    const scatterPts: MIBenchmarkScatterDatum[] = providerAggs
      .filter((p) => p.speedN > 0 && p.priceN > 0)
      .map((p) => ({
        label: p.provider,
        provider: toProviderKey(p.provider, p.provider),
        x: p.priceSum / p.priceN,
        y: p.speedSum / p.speedN,
        highlighted: false,
      }));
    if (scatterPts.length >= 3) {
      const fastest = [...scatterPts].sort((a, b) => b.y - a.y)[0];
      if (fastest) fastest.highlighted = true;
      providerCards.push(
        chartCard(
          "provider-speed-vs-price",
          "Provider Speed vs Price",
          "Mean model output speed vs mean output price by provider (derived from profile cards).",
          {
            type: "scatter",
            data: scatterPts,
            xLabel: "Mean output price ($/1M)",
            yLabel: "Mean output speed (tok/s)",
            xMetricKind: "currency",
            yMetricKind: "speed",
            quadrantLabel: "Fast & affordable",
          },
          "full",
        ),
      );
    } else {
      providerCards.push(
        emptyCard(
          "provider-speed-vs-price",
          "Provider Speed vs Price",
          "Mean speed vs mean price by provider",
          "Fewer than 3 providers have both speed and price aggregates.",
          "half",
        ),
      );
    }

    if (providersWithPrice.length >= 2) {
      const priceData = providersWithPrice
        .map((p) =>
          toBarDatum(p.provider, p.priceSum / p.priceN, p.provider, false),
        )
        .sort((a, b) => a.value - b.value);
      if (priceData[0]) priceData[0] = { ...priceData[0], highlighted: true };
      providerCards.push(
        chartCard(
          "provider-pricing",
          "Provider Pricing",
          "Mean output token price by provider from normalized model cards.",
          {
            type: "dense_bar",
            data: priceData,
            metricKind: "currency",
            visibleCount: Math.min(DENSE_VISIBLE_COUNT, priceData.length),
          },
          "half",
        ),
      );
    }

    if (providersWithSpeed.length >= 2) {
      const speedData = providersWithSpeed
        .map((p) =>
          toBarDatum(p.provider, p.speedSum / p.speedN, p.provider, false),
        )
        .sort((a, b) => b.value - a.value);
      if (speedData[0]) speedData[0] = { ...speedData[0], highlighted: true };
      providerCards.push(
        chartCard(
          "provider-output-speed",
          "Provider Output Speed",
          "Mean output tokens/sec by provider from normalized model cards.",
          {
            type: "dense_bar",
            data: speedData,
            metricKind: "speed",
            visibleCount: Math.min(DENSE_VISIBLE_COUNT, speedData.length),
          },
          "half",
        ),
      );
    }
  }

  const providerSection: ModelGatewayDeepSection = {
    id: "api-provider-performance",
    title: "API Provider Performance",
    description: hasProviderDerived
      ? "Provider-level signals derived by averaging normalized per-model speed and price cards. Dedicated provider benchmark chart files are not present in this corpus."
      : "Provider benchmark chart data unavailable in this preview.",
    available: hasProviderDerived,
    unavailableReason: hasProviderDerived
      ? undefined
      : "No provider-level chart files and insufficient per-model speed/price data to derive provider aggregates.",
    cards: hasProviderDerived
      ? providerCards
      : [
          emptyCard(
            "provider-benchmark-unavailable",
            "API Provider Performance",
            "Provider speed, pricing, and scatter views",
            "Provider benchmark data unavailable in this preview. No provider-level chart files exist in the normalized corpus.",
          ),
        ],
  };

  return [
    intelligenceSection,
    intelligenceBreakdownSection,
    priceAndCostSection,
    tokenSection,
    speedSection,
    providerSection,
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the Ethen Model Gateway overview spec from normalized model data.
 * Safe to call during static generation (`dynamic = "force-static"`).
 */
export function buildModelGatewayOverviewSpec(): ModelGatewayOverviewSpec {
  const entries = getAllModelEntries();
  const metrics = loadAllMetrics(entries);

  let costCorpus = new Map<
    string,
    { value: number; label: string; provider: string }
  >();
  try {
    costCorpus = buildCostPerTaskCorpus(entries);
  } catch {
    costCorpus = new Map();
  }

  // Merge corpus cost into directory when self-extract failed
  for (const m of metrics) {
    if (m.costPerTask === null && costCorpus.has(m.entry.slug)) {
      const hit = costCorpus.get(m.entry.slug)!;
      m.costPerTask = hit.value;
      m.costPerTaskDisplay = `$${hit.value < 0.01 ? hit.value.toFixed(4) : hit.value.toFixed(3)}`;
    }
  }

  const providers = new Set(entries.map((e) => e.provider).filter(Boolean));

  const bestIntel = pickTop(metrics, (m) => m.intelligence, true);
  const fastest = pickTop(metrics, (m) => m.speed, true);
  const lowestCost =
    costCorpus.size > 0
      ? (() => {
          const [slug, info] = Array.from(costCorpus.entries()).sort(
            (a, b) => a[1].value - b[1].value,
          )[0]!;
          const m = metrics.find((x) => x.entry.slug === slug);
          if (m) return m;
          // Synthetic metrics shell if slug appeared only in peer charts
          return {
            entry: {
              slug,
              name: info.label,
              provider: info.provider,
              model_type: "",
              release_date: "",
              chart_count: 0,
              faq_count: 0,
              summary_card_count: 0,
              quality_flags: [],
            },
            intelligence: null,
            intelligenceDisplay: null,
            speed: null,
            speedDisplay: null,
            latency: null,
            latencyDisplay: null,
            inputPrice: null,
            inputPriceDisplay: null,
            outputPrice: null,
            outputPriceDisplay: null,
            contextWindow: null,
            contextWindowDisplay: null,
            costPerTask: info.value,
            costPerTaskDisplay: `$${info.value < 0.01 ? info.value.toFixed(4) : info.value.toFixed(3)}`,
            fallbackValue: null,
            isOpenWeight: false,
          } satisfies ModelMetrics;
        })()
      : pickTop(metrics, (m) => m.outputPrice, false);
  const bestFallback = pickTop(metrics, (m) => m.fallbackValue, true);

  const decisionCards: ModelGatewayDecisionCard[] = [
    buildDecisionCard(
      "best-intelligence",
      "Best intelligence",
      "Highest Intelligence Index score in the normalized corpus.",
      "intelligence",
      bestIntel,
      (m) => m.intelligenceDisplay,
      (m) => m.intelligence,
    ),
    buildDecisionCard(
      "fastest-output",
      "Fastest output",
      "Highest output speed (tokens/sec) from summary cards.",
      "speed",
      fastest,
      (m) => m.speedDisplay,
      (m) => m.speed,
    ),
    buildDecisionCard(
      "lowest-cost-per-task",
      "Lowest cost per task",
      costCorpus.size > 0
        ? "Lowest observed cost per Intelligence Index task from comparative charts."
        : "Lowest output token price (cost-per-task chart observations unavailable).",
      costCorpus.size > 0 ? "cost-per-task" : "output-price",
      lowestCost,
      (m) =>
        m.costPerTaskDisplay ??
        m.outputPriceDisplay,
      (m) => m.costPerTask ?? m.outputPrice,
    ),
    buildDecisionCard(
      "best-fallback-value",
      "Best fallback value",
      "Highest intelligence per dollar of output price (intelligence / outputPrice).",
      "fallback-value",
      bestFallback,
      (m) =>
        m.fallbackValue !== null
          ? `${m.fallbackValue.toFixed(2)} score/$`
          : null,
      (m) => m.fallbackValue,
    ),
  ];

  const highlightCharts: ModelGatewayHighlightChart[] = [
    buildHighlightFromMetrics(
      "ethen-intelligence-index",
      "Ethen Intelligence Index",
      "Top models by Intelligence Index summary score.",
      "score",
      metrics,
      (m) => m.intelligence,
      true,
      "Values from normalized profile summary cards (label: Intelligence).",
    ),
    buildHighlightFromMetrics(
      "output-speed",
      "Output Speed",
      "Top models by output tokens per second.",
      "speed",
      metrics,
      (m) => m.speed,
      true,
      "Values from normalized profile summary cards (label: Speed). Fewer models publish speed cards than intelligence.",
    ),
    buildCostPerTaskHighlight(costCorpus, entries),
  ];

  const deepSections = buildDeepSections(entries, metrics, costCorpus);

  const derivations = [
    "Intelligence, speed, latency, input price, and output price come from profile summary_cards labels (same matching as leaderboardHelpers).",
    "Context window comes from technical_specs key context_window; k/M suffixes expand to tokens.",
    "Per-model costPerTask uses self-row match on cost-per-task or cost-per-intelligence-index-task charts when the subject appears; otherwise falls back to the min observed corpus cost for that slug.",
    "Cost-per-task corpus is the union of peer rows across model cost charts, keyed by detailsUrl slug, keeping the lowest cost.",
    "Fallback value = intelligence / outputPrice when both are present and outputPrice > 0.",
    "Open-weight detection uses model_type containing 'open' or technical_specs open_source/model_type signals.",
    "Routing matrix picks are ordered lists of available metrics only — empty slots stay null when data is missing.",
    "Deep report dense bars (24–28) use summary-card rankings; peer evaluation charts are loaded from the highest-chart-count models that publish each chart id.",
    "Intelligence Breakdown preferred benchmarks (GDPval, Terminal-Bench, …) render unavailable when no matching chart id exists in the normalized corpus.",
    "API Provider Performance uses provider-level means of model speed/price cards — dedicated provider chart files are not in the corpus.",
    "Intelligence vs Cost scatter uses intelligence (y) vs costPerTask or outputPrice (x) when both exist.",
  ];

  return {
    hero: {
      eyebrow: "Model Intelligence",
      title: "Ethen Model Gateway",
      subtitle:
        "Compare normalized model intelligence, speed, cost, and context — then route workloads to the right primary and fallback models.",
      modelCount: entries.length,
      providerCount: providers.size,
      primaryCta: {
        label: "Browse leaderboards",
        href: "/model-intelligence/leaderboards",
        variant: "primary",
      },
      secondaryCta: {
        label: "View providers",
        href: "/model-intelligence/providers",
        variant: "secondary",
      },
    },
    stats: buildStats(entries, metrics),
    decisionCards,
    highlightCharts,
    routingMatrix: buildRoutingMatrix(metrics),
    directoryRows: buildDirectoryRows(metrics),
    sections: SECTIONS,
    deepSections,
    groups: buildGroups(metrics, costCorpus),
    derivations,
  };
}

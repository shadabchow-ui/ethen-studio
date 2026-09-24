/**
 * lib/model-intelligence/normalizedToModelIntelligenceSpec.ts
 * Convert normalized model/page/chart data into the template-compatible spec.
 *
 * This is the single translation layer between raw normalized JSON and the
 * Model Intelligence template components. It handles:
 *   - Provider-colored chart bars (inferred from model labels)
 *   - Derived decision sections (verdict, fit matrix, cost pressure)
 *   - Trust chips, accordion rows, tabs
 *   - Summary cards with rank/class-average where available
 *   - Debug metadata for development
 */

import type { ModelIntelligencePageSpec, MIChartSpec, MIChartCardSpec, MISectionSpec, MITrustChipSpec, MIVerdictSpec, MIModelFitRowSpec, MICostPressureSpec, MISummaryCardSpec, MIProviderKey, MIHighlightSpec, MIAction, MIAccordionRowSpec, MIMethodologySpec, MIRailItem } from "./modelIntelligenceTypes";
import type { NormalizedModelBundle, RawChartSpec } from "./loadNormalizedModelProfile";
import { getProviderFromModelLabel } from "../charts/providerColors";
import { buildMITopNavSpec } from "./navigation/buildMITopNavSpec";
import { chartProvenance } from "./provenance";

/** Result of the conversion. Wraps ModelIntelligencePageSpec — no extra debug metadata. */
export type ConvertedSpec = ModelIntelligencePageSpec;

// ---------------------------------------------------------------------------
// Provider inference helpers
// ---------------------------------------------------------------------------

function toProviderKey(label: string): MIProviderKey {
  return getProviderFromModelLabel(label);
}

// ---------------------------------------------------------------------------
// Metric kind inference
// ---------------------------------------------------------------------------

function guessMetricKind(key: string): "score" | "percent" | "currency" | "tokens" | "context" | "latency" | "speed" | "count" | "size" {
  const k = key.toLowerCase();
  if (k.includes("intelligence") || k.includes("index") || k.includes("omniscience")) return "score";
  if (k.includes("speed") || k.includes("token-per-sec") || k.includes("outputspeed")) return "speed";
  if (k.includes("latency") || k.includes("ttft") || k.includes("time")) return "latency";
  if (k.includes("cost") || k.includes("price") || k.includes("pricing")) return "currency";
  if (k.includes("context") || k.includes("window")) return "context";
  if (k.includes("parameter") || k.includes("size") || k.includes("model-size")) return "size";
  if (k.includes("percent") || k.includes("rate") || k.includes("accuracy")) return "percent";
  return "score";
}

function safeNumber(val: unknown): number | null {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function parsePriceValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIdentity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// ---------------------------------------------------------------------------
// Chart data extraction with provider inference
// ---------------------------------------------------------------------------

function extractBarData(chart: RawChartSpec): Array<{ label: string; value: number; provider: MIProviderKey; highlighted: boolean }> {
  const dataset = chart.dataset;
  if (!dataset?.data?.length) return [];

  const keys = Object.keys(dataset.data[0]).filter(
    (k) => k !== "label" && k !== "detailsUrl" && k !== "@type"
  );
  const valueKey = keys[0] ?? null;
  if (!valueKey) return [];

  const normalizedSlug = normalizeIdentity(chart.model_slug);

  return dataset.data.flatMap((item: Record<string, unknown>) => {
    const label = String(item.label ?? "");
    const value = safeNumber(item[valueKey]);
    if (!label || value === null) return [];
    const normalizedLabel = normalizeIdentity(label);
    return [{
      label,
      value,
      provider: toProviderKey(label),
      highlighted: normalizedLabel.includes(normalizedSlug) || normalizedSlug.includes(normalizedLabel),
    }];
  });
}

function extractStackedBarData(
  chart: RawChartSpec,
): Array<{ label: string; segments: Array<{ key: string; value: number; color?: string }>; provider: MIProviderKey; highlighted: boolean }> {
  const dataset = chart.dataset;
  if (!dataset?.data?.length) return [];

  const colors = ["#7eb8da", "#d4a574", "#a8d8a8", "#d8a8c8"];
  const normalizedSlug = normalizeIdentity(chart.model_slug);

  return dataset.data.map((item: Record<string, unknown>) => {
    const label = String(item.label ?? "");
    const normalizedLabel = normalizeIdentity(label);
    const pricing = item.pricing as Array<Record<string, unknown>> | undefined;
    const segments: Array<{ key: string; value: number; color?: string }> = [];

    if (Array.isArray(pricing)) {
      pricing.forEach((p: Record<string, unknown>, i: number) => {
        const name = String(p.name ?? `segment-${i}`);
        const value = safeNumber(p.value);
        if (value === null) return;
        const segLabel = name
          .replace("Price", "")
          .replace("price", "")
          .replace(/([A-Z])/g, " $1")
          .trim() || name;
        segments.push({ key: segLabel || name, value, color: colors[i % colors.length] });
      });
    }

    // Fallback: try numeric sub-keys
    if (segments.length === 0) {
      for (const key of Object.keys(item)) {
        if (key !== "label" && key !== "detailsUrl" && key !== "@type" && !key.startsWith("pricing")) {
          const val = (item as Record<string, unknown>)[key];
          const num = safeNumber(val);
          if (num !== null) {
            const segLabel = key.replace(/([A-Z])/g, " $1").trim();
            segments.push({ key: segLabel || key, value: num, color: colors[segments.length % colors.length] });
          }
        }
      }
    }

    return {
      label,
      provider: toProviderKey(label),
      segments,
      highlighted: normalizedLabel.includes(normalizedSlug) || normalizedSlug.includes(normalizedLabel),
    };
  }).filter((d) => d.segments.length > 0 && d.segments.some((s) => s.value > 0));
}

function adaptChartToSpec(chart: RawChartSpec): {
  chartSpec: MIChartSpec | null;
  skipped: boolean;
  skippedType?: string;
} {
  const type = chart.chart_type;

  if (type === "bar") {
    const data = extractBarData(chart);
    if (data.length === 0) return { chartSpec: null, skipped: true, skippedType: "bar" };
    const metricKind = guessMetricKind(chart.id);
    return {
      chartSpec: {
        type: "dense_bar",
        data: data.map((d) => ({
          label: d.label,
          value: d.value,
          provider: d.provider,
          highlighted: d.highlighted,
        })),
        metricKind,
        visibleCount: data.length,
        allowNegative: data.some((d) => d.value < 0),
      },
      skipped: false,
    };
  }

  if (type === "stacked_bar") {
    const data = extractStackedBarData(chart);
    if (data.length === 0) return { chartSpec: null, skipped: true, skippedType: "stacked_bar" };
    return {
      chartSpec: {
        type: "stacked_bar",
        data: data.map((d) => ({
          label: d.label,
          provider: d.provider,
          highlighted: d.highlighted,
          segments: d.segments.map((s) => ({
            key: s.key,
            value: s.value,
            color: s.color ?? "#888",
          })),
        })),
        visibleCount: data.length,
      },
      skipped: false,
    };
  }

  // scatter and unknown types -> unsupported
  return { chartSpec: null, skipped: true, skippedType: type || "unknown" };
}

// ---------------------------------------------------------------------------
// Chart section mapping
// ---------------------------------------------------------------------------

const CHART_SECTION_MAP: Record<string, { sectionIndex: number; tabLabel?: string }> = {
  "intelligence": { sectionIndex: 0, tabLabel: "Intelligence" },
  "artificial-analysis-intelligence-index": { sectionIndex: 0 },
  "artificial-analysis-intelligence-index-by-open-weights-proprietary": { sectionIndex: 0 },
  "aa-omniscience-index": { sectionIndex: 0, tabLabel: "Omniscience" },
  "artificial-analysis-openness-index-score": { sectionIndex: 0, tabLabel: "Openness" },
  "output-speed": { sectionIndex: 1, tabLabel: "Speed" },
  "speed": { sectionIndex: 1 },
  "latency-time-to-first-answer-token": { sectionIndex: 2, tabLabel: "Latency" },
  "end-to-end-response-time": { sectionIndex: 2, tabLabel: "Response Time" },
  "context-window": { sectionIndex: 3, tabLabel: "Context" },
  "cost-per-task": { sectionIndex: 3, tabLabel: "Cost" },
  "cost-per-intelligence-index-task": { sectionIndex: 3 },
  "cost-to-run-artificial-analysis-intelligence-index": { sectionIndex: 3 },
  "time-per-intelligence-index-task": { sectionIndex: 3 },
  "pricing-cache-hit-input-and-output": { sectionIndex: 3, tabLabel: "Pricing" },
  "model-size-total-and-active-parameters": { sectionIndex: 4, tabLabel: "Model Size" },
};

const CHART_SECTIONS = [
  { id: "intelligence", title: "Intelligence & Quality", description: "Benchmark scores and quality indices measuring model capability." },
  { id: "speed", title: "Speed & Throughput", description: "Output tokens per second and generation throughput." },
  { id: "latency", title: "Latency & Response Time", description: "Time to first token and end-to-end response latency." },
  { id: "context-cost", title: "Context, Cost & Pricing", description: "Context window size, cost per task, and token pricing." },
  { id: "architecture", title: "Architecture & Scale", description: "Model size, parameters, and architectural details." },
];

type HighlightTarget = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  title: string;
  chartIds: string[];
  metricKinds: MIHighlightSpec["metricKind"][];
};

const HIGHLIGHT_TARGETS: HighlightTarget[] = [
  {
    id: "intelligence",
    sectionId: "intelligence",
    sectionTitle: "Intelligence",
    title: "Intelligence position",
    chartIds: [
      "intelligence",
      "artificial-analysis-intelligence-index",
      "artificial-analysis-intelligence-index-by-open-weights-proprietary",
      "aa-omniscience-index",
    ],
    metricKinds: ["score"],
  },
  {
    id: "speed",
    sectionId: "speed",
    sectionTitle: "Speed",
    title: "Speed position",
    chartIds: ["output-speed", "speed"],
    metricKinds: ["speed"],
  },
  {
    id: "price-value",
    sectionId: "context-cost",
    sectionTitle: "Context, Cost & Pricing",
    title: "Price/value position",
    chartIds: [
      "cost-per-task",
      "cost-per-intelligence-index-task",
      "pricing-cache-hit-input-and-output",
      "cost-to-run-artificial-analysis-intelligence-index",
    ],
    metricKinds: ["currency"],
  },
];

function summarizeComparisonText(
  bundle: NormalizedModelBundle,
  target: HighlightTarget,
  costPressure?: MICostPressureSpec,
) {
  const profile = bundle.profile;
  const summaryByLabel = new Map(profile.summary_cards.map((card) => [card.label, card]));

  if (target.id === "intelligence") {
    const card = summaryByLabel.get("Intelligence");
    return card?.hint || profile.comparison_summary || "Higher scores indicate stronger capability.";
  }

  if (target.id === "speed") {
    const card = summaryByLabel.get("Speed") ?? summaryByLabel.get("Latency");
    return card?.hint || "Higher throughput supports faster interactive use.";
  }

  if (target.id === "price-value") {
    const inputPrice = summaryByLabel.get("Input Price")?.hint;
    const outputPrice = summaryByLabel.get("Output Price")?.hint;
    return costPressure?.summary || inputPrice || outputPrice || "Lower prices improve routing flexibility and value at scale.";
  }

  return profile.comparison_summary || "";
}

function findHighlightCard(section: MISectionSpec | undefined, target: HighlightTarget): MIChartCardSpec | undefined {
  if (!section) return undefined;

  for (const chartId of target.chartIds) {
    const exact = section.chartCards.find((card) => card.id === chartId && card.chart.type === "dense_bar");
    if (exact) return exact;
  }

  return section.chartCards.find((card) => card.chart.type === "dense_bar" && target.metricKinds.includes(card.chart.metricKind));
}

// ---------------------------------------------------------------------------
// Section-level chart accordion rows (derived from chart metadata)
// ---------------------------------------------------------------------------

function deriveAccordionRows(chartId: string, chartTitle: string): Array<{ label: string; detail: string }> {
  const rows: Array<{ label: string; detail: string }> = [];

  if (chartId.includes("intelligence") || chartTitle.toLowerCase().includes("intelligence")) {
    rows.push({
      label: "Benchmark interpretation",
      detail: "Higher values indicate stronger overall capability. Bars show how models compare on composite intelligence metrics.",
    });
  }
  if (chartId.includes("speed") || chartTitle.toLowerCase().includes("speed")) {
    rows.push({
      label: "Output speed context",
      detail: "Speed should be read together with latency and cost; fast output does not always mean better user-perceived performance.",
    });
  }
  if (chartId.includes("latency") || chartTitle.toLowerCase().includes("latency")) {
    rows.push({
      label: "Latency considerations",
      detail: "Latency includes thinking / reasoning time when applicable. Lower is better for interactive use cases.",
    });
  }
  if (chartId.includes("cost") || chartId.includes("price") || chartTitle.toLowerCase().includes("cost")) {
    rows.push({
      label: "Cost pressure",
      detail: "Ethen Gateway should route away from this model when the task is simple, repetitive, or likely to generate many output tokens.",
    });
  }
  if (chartId.includes("context") || chartTitle.toLowerCase().includes("context")) {
    rows.push({
      label: "Context window sizing",
      detail: "Larger context windows enable complex multi-turn tasks but may increase latency and cost for long inputs.",
    });
  }
  if (chartId.includes("model-size") || chartTitle.toLowerCase().includes("parameter")) {
    rows.push({
      label: "Architecture scale",
      detail: "Larger models generally perform better but cost more to serve. Active parameter count matters for inference efficiency.",
    });
  }

  // Fallback generic row
  if (rows.length === 0) {
    rows.push({
      label: "Chart interpretation",
      detail: "Bars intentionally show many models at once so the page feels like a benchmark report rather than a dashboard.",
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Derived decision sections
// ---------------------------------------------------------------------------

/**
 * Derive a verdict section from available profile data.
 * Uses summary cards, comparison text, model type, provider, and flags —
 * never fabricates precise benchmark facts.
 */
function deriveVerdict(bundle: NormalizedModelBundle): MIVerdictSpec | undefined {
  const { profile } = bundle;
  const cards: Record<string, string> = {};
  for (const c of profile.summary_cards) {
    cards[c.label] = c.value;
  }

  const intelScore = cards["Intelligence"];
  const speedScore = cards["Speed"];
  const latencyScore = cards["Latency"];
  const inputPrice = cards["Input Price"];
  const outputPrice = cards["Output Price"];

  // Determine recommended role based on intelligence score and pricing signals.
  let recommendedRole = "General purpose assistant";
  let routingRole = "Route complex or high-value tasks here when the extra capability justifies the cost.";
  const bestFor: string[] = [];
  const avoidFor: string[] = [];

  if (intelScore) {
    const score = parseFloat(intelScore);
    if (!isNaN(score)) {
      if (score >= 30) {
        recommendedRole = "Frontier research / complex reasoning";
        routingRole = "Reserve this model for the hardest requests; simpler or repetitive work should stay on cheaper routes.";
        bestFor.push("Complex reasoning", "Research synthesis", "Hard coding tasks", "Multi-step agentic workflows");
        avoidFor.push("High-volume chat", "Simple classification", "Cost-sensitive pipelines");
      } else if (score >= 20) {
        recommendedRole = "Strong general-purpose model";
        routingRole = "Suitable for most production tasks, but high-volume or repetitive work should still be compared against cheaper routes.";
        bestFor.push("Code generation", "Content analysis", "Structured extraction", "Customer-facing chat");
        avoidFor.push("Extremely long-context tasks", "Ultra-low-latency requirements");
      } else if (score >= 10) {
        recommendedRole = "Capable everyday model";
        routingRole = "Good for routine tasks; route complex reasoning and premium workloads to stronger models.";
        bestFor.push("Routine Q&A", "Content summarization", "Classification", "Light coding");
        avoidFor.push("Complex reasoning", "Agentic workflows", "Research-grade analysis");
      } else {
        recommendedRole = "Budget-friendly / task-specific model";
        routingRole = "Best for high-volume, simple, or domain-specific tasks where cost or speed matters more than deep reasoning.";
        bestFor.push("Simple Q&A", "High-throughput chat", "Classification", "Extraction");
        avoidFor.push("Complex reasoning", "Creative writing", "Multi-step tasks");
      }
    }
  }

  if (speedScore) {
    const speed = parseFloat(speedScore);
    if (!Number.isNaN(speed) && speed > 100) {
      bestFor.push("Low-latency chat");
    }
  }

  if (latencyScore) {
    const latency = parseFloat(latencyScore);
    if (!Number.isNaN(latency) && latency < 1.5) {
      bestFor.push("Interactive turn-taking");
    }
  }

  const inVal = parsePriceValue(inputPrice);
  const outVal = parsePriceValue(outputPrice);
  const priceSignals = [inVal, outVal].filter((value): value is number => Number.isFinite(value));
  const highestPrice = priceSignals.length > 0 ? Math.max(...priceSignals) : null;

  if (highestPrice !== null) {
    if (highestPrice > 5.0 || (Number.isFinite(inVal ?? NaN) && (inVal ?? 0) > 1.0) || (Number.isFinite(outVal ?? NaN) && (outVal ?? 0) > 5.0)) {
      bestFor.push("High-value tasks where quality outweighs cost");
      avoidFor.push("Routine high-volume generation", "Simple extraction or labeling");
    } else if (highestPrice > 1.0 || (Number.isFinite(inVal ?? NaN) && (inVal ?? 0) > 0.5) || (Number.isFinite(outVal ?? NaN) && (outVal ?? 0) > 2.0)) {
      avoidFor.push("Predictable high-volume throughput");
    }
  }

  // Suggested fallbacks
  const suggestedFallbacks: string[] = [];
  if (highestPrice !== null) {
    if (highestPrice > 5.0) {
      suggestedFallbacks.push("Lower-cost models for repetitive or high-volume work");
      suggestedFallbacks.push("Cache-backed reuse for repeated prompts");
    } else if (highestPrice > 1.0) {
      suggestedFallbacks.push("Cheaper routes for predictable extraction, labeling, or summarization");
      suggestedFallbacks.push("Cache-backed reuse for repeated prompts");
    } else {
      suggestedFallbacks.push("Use the fit matrix to compare against cheaper routes when volume rises");
    }
  }

  if (suggestedFallbacks.length === 0 && profile.quality_flags.length > 0) {
    suggestedFallbacks.push("Review quality flags before production deployment");
  }

  return {
    recommendedRole,
    bestFor,
    avoidFor: avoidFor.length > 0 ? avoidFor : ["See model-fit matrix below"],
    routingRole,
    suggestedFallbacks: suggestedFallbacks.length > 0 ? suggestedFallbacks : ["See alternatives in charts"],
    costWarning: highestPrice !== null
      ? (() => {
          const inputText = Number.isFinite(inVal ?? NaN) ? `$${(inVal ?? 0).toFixed(2)} / M input` : null;
          const outputText = Number.isFinite(outVal ?? NaN) ? `$${(outVal ?? 0).toFixed(2)} / M output` : null;
          const priceText = [inputText, outputText].filter(Boolean).join(", ");

          if (highestPrice > 5.0 || (Number.isFinite(inVal ?? NaN) && (inVal ?? 0) > 1.0) || (Number.isFinite(outVal ?? NaN) && (outVal ?? 0) > 5.0)) {
            return `Premium pricing${priceText ? ` — ${priceText}` : ""}. Use cheaper routes for repetitive or low-risk work.`;
          }
          if (highestPrice > 1.0 || (Number.isFinite(inVal ?? NaN) && (inVal ?? 0) > 0.5) || (Number.isFinite(outVal ?? NaN) && (outVal ?? 0) > 2.0)) {
            return `Moderate pricing${priceText ? ` — ${priceText}` : ""}. Costs are manageable, but volume should still be reviewed.`;
          }
          return `Competitive pricing${priceText ? ` — ${priceText}` : ""}. Cost pressure is low enough for sustained production use.`;
        })()
      : "Pricing data not available for automated cost analysis.",
  };
}

/** Derive a model-fit matrix from available summary cards and profile data */
function deriveFitMatrix(bundle: NormalizedModelBundle): MIModelFitRowSpec[] | undefined {
  const { profile } = bundle;
  const cards: Record<string, string> = {};
  for (const c of profile.summary_cards) {
    cards[c.label] = c.value;
  }

  const intelStr = cards["Intelligence"];
  const speedStr = cards["Speed"];
  const latencyStr = cards["Latency"];
  const outputPriceStr = cards["Output Price"];

  const rows: MIModelFitRowSpec[] = [];

  // 1. Complex reasoning / agentic tasks
  if (intelStr) {
    const intel = parseFloat(intelStr);
    if (!isNaN(intel)) {
      if (intel >= 30) {
        rows.push({
          useCase: "Complex reasoning & agentic workflows",
          fit: "Excellent",
          reason: `Intelligence score ${intelStr} places this model among top performers. Suitable for multi-step analysis and agentic loops.`,
          routingNote: "Route complex tasks here; reserve simpler queries for cheaper models.",
        });
      } else if (intel >= 20) {
        rows.push({
          useCase: "Complex reasoning & agentic workflows",
          fit: "Strong",
          reason: `Intelligence score ${intelStr} supports capable reasoning, but very hard tasks may benefit from higher-tier models.`,
          routingNote: "Good for most complex tasks; consider a frontier model for the hardest 10%.",
        });
      } else if (intel >= 10) {
        rows.push({
          useCase: "Complex reasoning & agentic workflows",
          fit: "Moderate",
          reason: `Intelligence score ${intelStr} handles routine reasoning but may struggle with open-ended agentic tasks.`,
          routingNote: "Route simpler sub-tasks here; keep hard reasoning on a stronger model.",
        });
      } else {
        rows.push({
          useCase: "Complex reasoning & agentic workflows",
          fit: "Weak",
          reason: `Intelligence score ${intelStr} is better suited for straightforward tasks than multi-step reasoning.`,
          routingNote: "Avoid routing complex agentic tasks to this model.",
        });
      }
    }
  }

  // 2. High-volume chat / customer-facing
  if (speedStr && intelStr) {
    const speed = parseFloat(speedStr);
    const intel = parseFloat(intelStr);
    if (!isNaN(speed) && !isNaN(intel)) {
      if (speed > 100 && intel >= 10) {
        rows.push({
          useCase: "High-volume chat & customer-facing",
          fit: "Excellent",
          reason: `Output speed ${speedStr} tokens/sec and capable intelligence make this suitable for real-time chat at scale.`,
          routingNote: "Ideal for interactive chat; enable caching for repeated queries.",
        });
      } else if (speed > 50) {
        rows.push({
          useCase: "High-volume chat & customer-facing",
          fit: "Strong",
          reason: `Output speed ${speedStr} tokens/sec is adequate for chat.`,
          routingNote: "Suitable for chat; monitor latency under concurrent load.",
        });
      } else {
        rows.push({
          useCase: "High-volume chat & customer-facing",
          fit: "Moderate",
          reason: "Output speed may be a bottleneck for real-time chat at scale.",
          routingNote: "Consider a faster model for latency-sensitive chat.",
        });
      }
    } else {
      rows.push({
        useCase: "High-volume chat & customer-facing",
        fit: "Moderate",
        reason: "Speed data not available. Test with your workload before committing to production chat routing.",
        routingNote: "Evaluate throughput under production load before routing live traffic.",
      });
    }
  }

  // 3. Latency-sensitive applications
  if (latencyStr) {
    const lat = parseFloat(latencyStr);
    if (!isNaN(lat)) {
      if (lat < 1.0) {
        rows.push({
          useCase: "Latency-sensitive applications",
          fit: "Excellent",
          reason: `TTFT ${latencyStr} — among the lowest latencies, suitable for interactive latency-critical use cases.`,
          routingNote: "Good first choice for real-time applications.",
        });
      } else if (lat < 2.5) {
        rows.push({
          useCase: "Latency-sensitive applications",
          fit: "Strong",
          reason: `TTFT ${latencyStr} — adequate latency for most interactive use cases.`,
          routingNote: "Suitable for real-time; test with your specific workload.",
        });
      } else {
        rows.push({
          useCase: "Latency-sensitive applications",
          fit: "Moderate",
          reason: `TTFT ${latencyStr} — latency may be noticeable in interactive use.`,
          routingNote: "Consider routing latency-critical paths to faster models.",
        });
      }
    }
  }

  // 4. Cost-sensitive / high-throughput
  if (outputPriceStr) {
    const outPrice = parsePriceValue(outputPriceStr);
    if (outPrice !== null) {
      if (outPrice < 0.5) {
        rows.push({
          useCase: "Cost-sensitive pipelines",
          fit: "Excellent",
          reason: `Output pricing at ${outputPriceStr} is very competitive for high-volume workloads.`,
          routingNote: "Excellent for budget-constrained pipelines; enable caching to reduce costs further.",
        });
      } else if (outPrice < 2.0) {
        rows.push({
          useCase: "Cost-sensitive pipelines",
          fit: "Strong",
          reason: `Output pricing at ${outputPriceStr} is reasonable for moderate volume.`,
          routingNote: "Suitable for production; review costs as volume grows.",
        });
      } else {
        rows.push({
          useCase: "Cost-sensitive pipelines",
          fit: "Moderate",
          reason: `Output pricing at ${outputPriceStr} is premium. Route high-volume simple tasks to cheaper alternatives.`,
          routingNote: "Use only for high-value tasks; route simple queries to budget models.",
        });
      }
    }
  }

  return rows.length > 0 ? rows : undefined;
}

/** Derive cost pressure signal from pricing data */
function deriveCostPressure(bundle: NormalizedModelBundle): MICostPressureSpec | undefined {
  const { profile } = bundle;
  const cards: Record<string, string> = {};
  for (const c of profile.summary_cards) {
    cards[c.label] = c.value;
  }

  const inputPriceStr = cards["Input Price"];
  const outputPriceStr = cards["Output Price"];

  if (!inputPriceStr && !outputPriceStr) return undefined;

  const inVal = parsePriceValue(inputPriceStr);
  const outVal = parsePriceValue(outputPriceStr);
  const priceSignals = [inVal, outVal].filter((value): value is number => Number.isFinite(value));
  const highestPrice = priceSignals.length > 0 ? Math.max(...priceSignals) : null;

  let level: "Low" | "Medium" | "High" = "Medium";
  let summary = "";
  const cheaperSubstitutes: string[] = [];
  const routeAwayWhen: string[] = [];

  if (highestPrice !== null) {
    if (highestPrice > 5.0 || (Number.isFinite(inVal ?? NaN) && (inVal ?? 0) > 1.0) || (Number.isFinite(outVal ?? NaN) && (outVal ?? 0) > 5.0)) {
      level = "High";
      summary = `Pricing is premium${inputPriceStr || outputPriceStr ? ` — ${[inputPriceStr ? `input ${inputPriceStr}` : null, outputPriceStr ? `output ${outputPriceStr}` : null].filter(Boolean).join(", ")}` : ""}. This model is expensive for high-volume or output-heavy workloads.`;
      routeAwayWhen.push("Output-heavy tasks", "High-frequency chat at scale", "Simple queries that cheaper models handle well");
      cheaperSubstitutes.push("Lower-cost models for repetitive or high-volume work");
      cheaperSubstitutes.push("Cache-backed reuse for repeated prompts");
    } else if (highestPrice > 1.0 || (Number.isFinite(inVal ?? NaN) && (inVal ?? 0) > 0.5) || (Number.isFinite(outVal ?? NaN) && (outVal ?? 0) > 2.0)) {
      level = "Medium";
      summary = `Pricing is moderate${inputPriceStr || outputPriceStr ? ` — ${[inputPriceStr ? `input ${inputPriceStr}` : null, outputPriceStr ? `output ${outputPriceStr}` : null].filter(Boolean).join(", ")}` : ""}. Costs accumulate at volume but are manageable for valuable tasks.`;
      routeAwayWhen.push("Predictable high-volume throughput", "Non-critical classification and extraction");
      cheaperSubstitutes.push("Cheaper routes for predictable extraction, labeling, or summarization");
    } else {
      level = "Low";
      summary = `Pricing is competitive${inputPriceStr || outputPriceStr ? ` — ${[inputPriceStr ? `input ${inputPriceStr}` : null, outputPriceStr ? `output ${outputPriceStr}` : null].filter(Boolean).join(", ")}` : ""}. Suitable for sustained production use.`;
      routeAwayWhen.push("Extreme scale where even low costs matter");
    }
  }

  return { level, summary, cheaperSubstitutes, routeAwayWhen };
}

// ---------------------------------------------------------------------------
// Summary cards — bring closer to the 5-card template
// ---------------------------------------------------------------------------

function serializeRank(rank: unknown): string | undefined {
  if (typeof rank === "string") return rank || undefined;
  if (rank && typeof rank === "object") {
    const r = rank as { position?: number; total?: number };
    if (typeof r.position === "number") {
      return `#${r.position}${typeof r.total === "number" ? `/${r.total}` : ""}`;
    }
  }
  return undefined;
}

function buildSummaryCards(bundle: NormalizedModelBundle): MISummaryCardSpec[] {
  const { profile } = bundle;
  const cards: MISummaryCardSpec[] = [];

  // Preferred order: Intelligence, Speed, Latency, Input Price, Output Price.
  // Missing values remain visible as "not provided" so the five-card rhythm is
  // stable without inventing a metric value.
  const preferredOrder = ["Intelligence", "Speed", "Latency", "Input Price", "Output Price"];
  const chartIdsByLabel: Record<string, string[]> = {
    Intelligence: ["intelligence", "artificial-analysis-intelligence-index", "aa-omniscience-index"],
    Speed: ["output-speed", "speed"],
    Latency: ["latency-time-to-first-answer-token", "end-to-end-response-time"],
    "Input Price": ["pricing-cache-hit-input-and-output", "cost-per-task"],
    "Output Price": ["pricing-cache-hit-input-and-output", "cost-per-task"],
  };

  const rawCards: Record<string, (typeof profile.summary_cards)[number]> = {};
  for (const c of profile.summary_cards) {
    rawCards[c.label] = c;
  }

  for (const label of preferredOrder) {
    const raw = rawCards[label];
    if (!raw) continue;

    // Build a compact hint from comparison_summary
    const hint = truncateHint(raw.hint, 100);
    let classAverage: string | undefined;

    // Derive class average from comparison summary if we can
    if (label === "Intelligence" && profile.comparison_summary) {
      const match = profile.comparison_summary.match(/median:\s*(\d+)/i);
      if (match) {
        classAverage = match[1];
      }
    }

    const displayRank = serializeRank(raw.rank as unknown);
    const backingChart = bundle.charts.find((chart) => chartIdsByLabel[label]?.includes(chart.id));
    const provenance = chartProvenance({
      canonicalUrl: backingChart?.source.canonical_url,
      retrievedAt: profile.source.normalized_at,
      sourceType: backingChart?.source.source_type,
      methodology: backingChart?.dataset.measurementTechnique,
      description: backingChart?.dataset.description,
    });
    const isKnown = provenance.confidence !== "unknown" && Boolean(provenance.sourceUrl && provenance.retrievedAt && provenance.methodology);

    cards.push({
      label: raw.label,
      value: isKnown ? raw.value : "Unknown",
      unit: raw.unit,
      rank: isKnown ? displayRank : undefined,
      hint: isKnown ? hint || undefined : "No complete backing benchmark record is committed for this value.",
      classAverage: isKnown ? classAverage : undefined,
      tone: "neutral",
      provenance,
    });
  }

  for (const label of preferredOrder) {
    if (cards.some((card) => card.label === label)) continue;
    cards.push({
      label,
      value: "Unknown",
      hint: "This profile does not provide this metric.",
      tone: "neutral",
    });
  }

  // If we still have fewer than 5 cards, fill remaining from unused raw cards
  if (cards.length < 5) {
    for (const c of profile.summary_cards) {
      if (cards.length >= 5) break;
      if (cards.some((c2) => c2.label === c.label)) continue;
      cards.push({
        label: c.label,
        value: c.value,
        unit: c.unit,
        rank: serializeRank(c.rank as unknown),
        hint: truncateHint(c.hint, 100) || undefined,
      });
    }
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Trust chips
// ---------------------------------------------------------------------------

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function pickUsefulLink(
  usefulLinks: NormalizedModelBundle["profile"]["useful_links"],
  matchers: Array<(label: string, url: string) => boolean>,
): string | undefined {
  for (const link of usefulLinks) {
    if (!link.url) continue;
    const label = normalizeLabel(link.label ?? "");
    const url = link.url.toLowerCase();
    if (matchers.some((matcher) => matcher(label, url))) {
      return link.url;
    }
  }
  return undefined;
}

function deriveSubtitle(pageTitle: string | undefined, modelName: string): string {
  const fallback = "Intelligence, Performance & Price Analysis";
  if (!pageTitle) return fallback;

  const title = pageTitle.trim();
  const model = modelName.trim();
  if (!title) return fallback;

  if (model && title.toLowerCase().startsWith(model.toLowerCase())) {
    const remainder = title.slice(model.length).trim();
    const stripped = remainder.replace(/^[\s\-–—:|]+/, "").trim();
    return stripped || fallback;
  }

  if (title.includes(fallback)) {
    return fallback;
  }

  return title;
}

function buildHeroActions(bundle: NormalizedModelBundle): MIAction[] | undefined {
  const { profile, page } = bundle;
  const actions = page.hero.actions ?? [];
  if (actions.length === 0) return undefined;

  const compareHref = pickUsefulLink(profile.useful_links, [
    (label) => label === "model comparison",
    (label) => label.includes("comparison") && !label.includes("provider"),
    (label) => label.includes("compare") && label.includes("model"),
  ]);

  const providerBenchmarksHref = pickUsefulLink(profile.useful_links, [
    (label) => label === "api provider benchmarks",
    (label) => label.includes("compare provider"),
    (label) => label.includes("provider benchmark"),
    (label) => label.includes("compare api providers"),
  ]);

  const resolved: MIAction[] = [];
  for (const action of actions) {
    if (action.action === "compare" && compareHref) {
      resolved.push({
        label: action.label,
        href: compareHref,
        variant: "secondary",
        icon: "⇄",
      });
      continue;
    }

    if (action.action === "api_provider_benchmarks" && providerBenchmarksHref) {
      resolved.push({
        label: action.label,
        href: providerBenchmarksHref,
        variant: "secondary",
        icon: "↗",
      });
    }
  }

  return resolved.length > 0 ? resolved : undefined;
}

function buildTrustChips(bundle: NormalizedModelBundle): MITrustChipSpec[] {
  const { profile } = bundle;
  const chips: MITrustChipSpec[] = [];

  if (profile.source.source_name) {
    chips.push({
      label: "Source",
      value: profile.source.source_name,
      tone: "neutral",
    });
  }

  if (profile.model_type) {
    chips.push({
      label: "Type",
      value: profile.model_type,
      tone: "neutral",
    });
  }

  return chips;
}

// ---------------------------------------------------------------------------
// Section-level tabs (where chart_tab_labels exist)
// ---------------------------------------------------------------------------

function deriveChartTabs(chartId: string, tabLabels?: Record<string, string> | null): Array<{ id: string; label: string }> | undefined {
  if (tabLabels && tabLabels[chartId]) {
    return [{ id: "overview", label: tabLabels[chartId] }];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Build chart sections
// ---------------------------------------------------------------------------

function buildSections(charts: RawChartSpec[], profile: NormalizedModelBundle["profile"]): {
  sections: MISectionSpec[];
  adapted: number;
  skipped: number;
  skippedChartTypes: string[];
} {
  const sectionMap = new Map<number, MISectionSpec>();
  for (let i = 0; i < CHART_SECTIONS.length; i++) {
    sectionMap.set(i, {
      id: CHART_SECTIONS[i].id,
      title: CHART_SECTIONS[i].title,
      description: CHART_SECTIONS[i].description,
      chartCards: [],
    });
  }

  let adapted = 0;
  let skipped = 0;
  const skippedChartTypes = new Set<string>();

  for (const chart of charts) {
    const mapping = CHART_SECTION_MAP[chart.id];
    const sectionIndex = mapping?.sectionIndex ?? 5;

    if (!sectionMap.has(sectionIndex)) {
      sectionMap.set(sectionIndex, {
        id: `chart-${sectionIndex}`,
        title: "Additional Benchmarks",
        description: "Further benchmark and comparison data.",
        chartCards: [],
      });
    }

    const { chartSpec, skipped: isSkipped, skippedType } = adaptChartToSpec(chart);
    if (isSkipped || !chartSpec) {
      skipped++;
      if (skippedType) skippedChartTypes.add(skippedType);
      continue;
    }
    adapted++;

    const section = sectionMap.get(sectionIndex)!;

    // Build accordion rows and tabs per chart
    const accordionRows = deriveAccordionRows(chart.id, chart.title);
    const tabs = deriveChartTabs(chart.id, profile.chart_tab_labels);

    section.chartCards.push({
      id: chart.id,
      title: chart.title,
      subtitle: chart.description,
      tabs,
      footer: "Chart source and provenance are listed in Methodology & sources below.",
      provenance: chartProvenance({
        canonicalUrl: chart.source.canonical_url,
        retrievedAt: profile.source.normalized_at,
        sourceType: chart.source.source_type,
        methodology: chart.dataset.measurementTechnique,
        description: chart.dataset.description,
      }),
      accordionRows,
      chart: chartSpec,
    });
  }

  return {
    sections: Array.from(sectionMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, spec]) => spec)
      .filter((s) => s.chartCards.length > 0),
    adapted,
    skipped,
    skippedChartTypes: Array.from(skippedChartTypes).sort(),
  };
}

// ---------------------------------------------------------------------------
// Highlights — pick up to 3 charts by actual section/chart identity
// ---------------------------------------------------------------------------

function buildHighlights(
  bundle: NormalizedModelBundle,
  sections: MISectionSpec[],
  costPressure?: MICostPressureSpec,
): ModelIntelligencePageSpec["highlights"] {
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const highlights: MIHighlightSpec[] = [];

  for (const target of HIGHLIGHT_TARGETS) {
    const section = sectionById.get(target.sectionId);
    const card = findHighlightCard(section, target);
    if (!section || !card || card.chart.type !== "dense_bar") continue;

    highlights.push({
      id: `${target.id}:${section.id}:${card.id}`,
      sectionId: section.id,
      sectionTitle: target.sectionTitle,
      chartId: card.id ?? target.id,
      chartTitle: card.title,
      title: target.title,
      subtitle: card.subtitle,
      comparison: summarizeComparisonText(bundle, target, costPressure),
      metricKind: card.chart.metricKind,
      data: card.chart.data.map((d) => ({
        label: d.label,
        value: d.value,
        provider: d.provider,
        highlighted: d.highlighted ?? false,
      })),
      anchor: `#${section.id}`,
      visibleCount: 12,
    });
  }

  return highlights.length > 0 ? highlights : undefined;
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function buildHero(bundle: NormalizedModelBundle): ModelIntelligencePageSpec["hero"] {
  const { profile, page } = bundle;

  // Eyebrow items: provider, model type/openness, release date
  const eyebrowItems: Array<{ label: string; icon?: string }> = [];
  if (profile.provider) {
    eyebrowItems.push({ label: profile.provider });
  }
  if (profile.model_type) {
    eyebrowItems.push({ label: profile.model_type });
  }
  if (profile.release_date) {
    eyebrowItems.push({ label: profile.release_date });
  }

  return {
    eyebrow: page.hero.eyebrow,
    eyebrowItems,
    title: profile.name,
    subtitle: deriveSubtitle(page.hero.title, profile.name),
    actions: buildHeroActions(bundle),
    trustChips: buildTrustChips(bundle),
  };
}

// ---------------------------------------------------------------------------
// Footer lines
// ---------------------------------------------------------------------------

function buildFooter(bundle: NormalizedModelBundle, adapted: number, skipped: number): string[] {
  const { profile, charts } = bundle;
  return [
    `Source: ${profile.source.source_name}`,
    `Normalized: ${profile.source.normalized_at} · ${adapted} charts adapted, ${skipped} skipped · ${charts.length} total chart specs`,
    `Canonical: ${profile.source.canonical_url}`,
  ];
}

function buildMethodology(bundle: NormalizedModelBundle): MIMethodologySpec | undefined {
  const { profile } = bundle;
  const summary = [
    `This page is rendered from the normalized profile and page JSON for ${profile.name}.`,
    "Benchmark values are preserved as normalized; only layout, disclosure ordering, and typography are adjusted for readability.",
  ];

  const rows: MIAccordionRowSpec[] = [];

  if (profile.source.source_name || profile.source.source_file || profile.source.canonical_url) {
    rows.push({
      label: "Source record",
      value: profile.source.source_name || "Normalized source",
      detail: [
        profile.source.source_file ? `Source file: ${profile.source.source_file}` : null,
        profile.source.canonical_url ? `Canonical URL: ${profile.source.canonical_url}` : null,
      ].filter(Boolean).join(" · "),
    });
  }

  if (profile.source.normalized_by || profile.source.normalized_at) {
    rows.push({
      label: "Normalization",
      value: profile.source.normalized_by || "Normalized dataset",
      detail: [
        profile.source.normalized_at ? `Normalized at: ${profile.source.normalized_at}` : null,
        "Technical specs, comparison summary, and FAQs are passed through from the normalized data without rewriting.",
      ].filter(Boolean).join(" "),
    });
  }

  if (profile.summary_cards.some((card) => card.rank)) {
    rows.push({
      label: "Ranks",
      value: "Shown where available",
      detail: "Ranks shown on summary cards come directly from the normalized profile. No rank or class display is synthesized in the renderer.",
    });
  }

  rows.push({
    label: "FAQ parity",
    value: profile.faqs.length > 0 ? `${profile.faqs.length} questions` : "No FAQs",
    detail: profile.faqs.length > 0
      ? "Visible FAQ answers and FAQ JSON-LD are emitted from the same normalized FAQ array, so structured data stays aligned with the rendered accordion."
      : "This profile does not include FAQ content, so both the visible FAQ section and FAQ JSON-LD are omitted.",
  });

  if (profile.quality_flags.length > 0) {
    rows.push({
      label: "Quality flags",
      value: `${profile.quality_flags.length} flags`,
      detail: profile.quality_flags.join(" · "),
    });
  }

  const chartSources = Array.from(new Map(
    bundle.charts
      .filter((chart) => chart.source?.canonical_url)
      .map((chart) => [chart.source.canonical_url, chart.title]),
  ).entries());
  if (chartSources.length > 0) {
    rows.push({
      label: "Benchmark sources",
      value: `${chartSources.length} source${chartSources.length === 1 ? "" : "s"}`,
      detail: chartSources.map(([url, title]) => `${title}: ${url}`).join(" · "),
    });
  }

  return summary.length > 0 || rows.length > 0
    ? {
        title: "Methodology & Provenance",
        summary,
        rows,
      }
    : undefined;
}

// ---------------------------------------------------------------------------
// Truncate helper
// ---------------------------------------------------------------------------

function truncateHint(hint: string, maxLen = 120): string {
  if (!hint || hint.length <= maxLen) return hint;
  const truncated = hint.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  const lastPeriod = truncated.lastIndexOf(".");
  const cutoff = lastPeriod > maxLen * 0.6 ? lastPeriod + 1 : (lastSpace > 30 ? lastSpace : maxLen);
  return hint.slice(0, cutoff) + " …";
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function normalizedToModelIntelligenceSpec(
  bundle: NormalizedModelBundle,
): ConvertedSpec {
  const { profile, charts } = bundle;

  // Build chart sections
  const { sections, adapted, skipped } = buildSections(charts, profile);

  // Build summary cards
  const summaryCards = buildSummaryCards(bundle);

  // Build decision sections
  const verdict = deriveVerdict(bundle);
  const fitMatrix = deriveFitMatrix(bundle);
  const costPressure = deriveCostPressure(bundle);

  // Build ordered highlights from actual section/chart identity
  const highlights = buildHighlights(bundle, sections, costPressure);

  // Build methodology / provenance disclosure
  const methodology = buildMethodology(bundle);

  // Build technical specs
  const hasComparisonSummary = Boolean(profile.comparison_summary && profile.comparison_summary.trim().length > 0);
  const hasTechnicalSpecs = profile.technical_specs.length > 0;
  const specs = hasTechnicalSpecs || hasComparisonSummary
    ? {
        comparisonTitle: "Technical Specifications",
        comparisonBody: profile.comparison_summary
          ? [profile.comparison_summary]
          : [],
        specsTitle: `${profile.name}`,
        specs: profile.technical_specs.map((spec) => ({
          label: spec.label,
          value: spec.value,
        })),
      }
    : undefined;

  /*
   * D17 — the rail is derived from what this model's page actually renders.
   *
   * It used to be a fixed list of eight anchors on every model page:
   * overview, intelligence, speed, latency, context-cost, architecture,
   * methodology, faq. But the sections are conditional — a model only gets an
   * `#intelligence` section if the normalized bundle carries intelligence
   * charts — so on most of the 550 model pages the rail pointed at anchors
   * that were not on the page. The exhaustive D17 link crawl found 490 such
   * dead anchors; a sampled crawl had found none of them.
   *
   * Two of the fixed entries were wrong on EVERY page: `architecture` is
   * rendered with `id="specifications"`, and `faq` only exists when the model
   * has FAQ entries.
   *
   * Deriving the rail from the same conditions the renderer uses means a
   * model that gains a section gains its rail entry, and one that has no
   * latency data no longer offers a link to nowhere.
   */
  const rail: MIRailItem[] = [
    { id: "overview", label: "Summary" },
    ...sections.map((section) => ({ id: section.id, label: section.title })),
  ];
  if (highlights && highlights.length > 0) {
    rail.splice(1, 0, { id: "highlights", label: "Highlights" });
  }
  // Mirrors ModelIntelligencePageRenderer's `hasSpecs`.
  if (specs && (specs.comparisonBody.length > 0 || specs.specs.length > 0)) {
    rail.push({ id: "specifications", label: "Specifications" });
  }
  if (methodology) rail.push({ id: "methodology", label: "Methodology" });
  if (profile.faqs && profile.faqs.length > 0) rail.push({ id: "faq", label: "FAQ" });

  return {
    kind: "model_profile",
    topNav: buildMITopNavSpec("/model-intelligence/models"),
    rail,
    hero: buildHero(bundle),
    summaryCards,
    verdict,
    fitMatrix,
    costPressure,
    highlights,
    specs,
    methodology,
    sections,
    footer: buildFooter(bundle, adapted, skipped),
  };
}

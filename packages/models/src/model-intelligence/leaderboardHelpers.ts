/**
 * lib/model-intelligence/leaderboardHelpers.ts
 * Server-only leaderboard and benchmark data helpers for Model Intelligence.
 * Iterates normalized model profiles to produce ranked lists.
 * Safe for use in server components and page.tsx files only.
 */
import "server-only";

import { getAllModelEntries } from "./getAllModelSlugs";
import { loadNormalizedModelProfile } from "./loadNormalizedModelProfile";
import {
  type LeaderboardMetricMeta,
  LEADERBOARD_METRICS,
  getMetricMeta,
  getMetricKeys,
  type LeaderboardEntry,
  formatContextValue,
  formatMetricValue,
} from "./leaderboardClientTypes";
import { chartProvenance, createEvidenceState } from "./provenance";
import { getProviderCertification } from "../registry";
import { BENCHMARK_REGISTRY, getLeaderboard } from "./evaluation";

// Re-export client-safe types and helpers so server pages can import
// everything from this single module.
export type { LeaderboardMetricMeta, LeaderboardEntry };
export {
  LEADERBOARD_METRICS,
  getMetricMeta,
  getMetricKeys,
  formatMetricValue,
};

// ---------------------------------------------------------------------------
// Benchmark definitions
// ---------------------------------------------------------------------------

export interface BenchmarkMeta {
  key: string;
  title: string;
  explanation: string;
  metricKey: string;
  higherIsBetter: boolean;
}

export const BENCHMARKS: BenchmarkMeta[] = [
  {
    key: "intelligence",
    title: "Intelligence Benchmark",
    explanation:
      "The Intelligence Benchmark measures overall model capability using a composite of evaluations across reasoning, coding, agentic tasks, instruction following, and multimodal understanding. Scores are derived from normalized evaluations on the Ethen Intelligence Index. Higher scores indicate stronger general-purpose capability.",
    metricKey: "intelligence",
    higherIsBetter: true,
  },
  {
    key: "speed",
    title: "Speed Benchmark",
    explanation:
      "The Speed Benchmark measures output token generation throughput in tokens per second. Speed is measured under standard conditions and reflects the model's raw generation efficiency. Higher throughput generally means faster responses for chat and generation-heavy workloads.",
    metricKey: "speed",
    higherIsBetter: true,
  },
  {
    key: "latency",
    title: "Latency Benchmark",
    explanation:
      "The Latency Benchmark measures time to first answer token (TTFT), representing how quickly a model begins generating after receiving a prompt. Lower latency is critical for interactive and real-time applications. Measured values include reasoning prep time where applicable.",
    metricKey: "latency",
    higherIsBetter: false,
  },
  {
    key: "price",
    title: "Pricing Benchmark",
    explanation:
      "The Pricing Benchmark compares model input and output token prices. Input price is the cost per million tokens sent to the model; output price is the cost per million tokens generated. Lower prices mean more cost-effective operation at scale.",
    metricKey: "output-price",
    higherIsBetter: false,
  },
  {
    key: "cost",
    title: "Cost Efficiency Benchmark",
    explanation:
      "The Cost Efficiency Benchmark evaluates models on combined input and output pricing. This is not a single numerical score but a comparative view across both pricing dimensions, helping identify models that offer the best value for different workload profiles.",
    metricKey: "input-price",
    higherIsBetter: false,
  },
  {
    key: "context",
    title: "Context Window Benchmark",
    explanation:
      "The Context Window Benchmark compares the maximum context length each model supports. A larger context window allows the model to process longer documents, maintain extended conversation history, and handle complex multi-turn tasks without truncation.",
    metricKey: "context-window",
    higherIsBetter: true,
  },
];

const BENCHMARK_MAP = new Map<string, BenchmarkMeta>(
  BENCHMARKS.map((b) => [b.key, b]),
);

export function getBenchmarkMeta(key: string): BenchmarkMeta | undefined {
  return BENCHMARK_MAP.get(key);
}

export function getBenchmarkKeys(): string[] {
  return BENCHMARKS.map((b) => b.key);
}

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------

function parseSummaryValue(value: string): number | null {
  const cleaned = value.replace(/^[$]\s*/, "").replace(/s$/, "").trim();
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
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

const METRIC_CHART_IDS: Record<string, string[]> = {
  intelligence: ["intelligence", "artificial-analysis-intelligence-index", "artificial-analysis-intelligence-index-by-open-weights-proprietary", "aa-omniscience-index"],
  speed: ["output-speed", "speed"],
  latency: ["latency-time-to-first-answer-token", "end-to-end-response-time"],
  "input-price": ["pricing-cache-hit-input-and-output", "cost-per-task", "cost-per-intelligence-index-task"],
  "output-price": ["pricing-cache-hit-input-and-output", "cost-per-task", "cost-per-intelligence-index-task"],
  "context-window": ["context-window"],
};

function providerId(provider: string): string {
  const normalized = provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (normalized.includes("openai")) return "openai";
  if (normalized.includes("anthropic")) return "anthropic";
  if (normalized.includes("deepseek")) return "deepseek";
  if (normalized.includes("google")) return "gemini";
  return normalized;
}

// ---------------------------------------------------------------------------
// Leaderboard builder (server-only — reads filesystem)
// ---------------------------------------------------------------------------

export function buildLeaderboard(metricKey: string): LeaderboardEntry[] {
  const meta = getMetricMeta(metricKey);
  if (!meta) return [];

  // MI-R4 owns semantic ranking. Until an evidence-backed canonical result
  // source exists, every legacy metric renders an honest empty leaderboard;
  // summary cards/charts may not be promoted into ranking truth here.
  const benchmark = metricKey === "intelligence"
    ? BENCHMARK_REGISTRY.find((item) => item.id === "artificial-analysis-intelligence-index")
    : undefined;
  if (!benchmark) return [];
  void getLeaderboard(benchmark.id, []);
  return [];
}

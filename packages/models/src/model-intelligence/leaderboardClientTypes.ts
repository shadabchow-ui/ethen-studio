/**
 * lib/model-intelligence/leaderboardClientTypes.ts
 * Client-safe types and pure helpers for the leaderboard UI.
 * No server-only imports — safe to use in "use client" components.
 */

// ---------------------------------------------------------------------------
// Metric definitions (pure data — no fs)
// ---------------------------------------------------------------------------

export interface LeaderboardMetricMeta {
  key: string;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  description: string;
}

export const LEADERBOARD_METRICS: LeaderboardMetricMeta[] = [
  {
    key: "intelligence",
    label: "Intelligence",
    unit: "score",
    higherIsBetter: true,
    description:
      "Composite benchmark score on the Ethen Intelligence Index. Higher scores indicate stronger overall model capability across reasoning, coding, and agentic tasks.",
  },
  {
    key: "speed",
    label: "Speed",
    unit: "tok/s",
    higherIsBetter: true,
    description:
      "Measured output tokens per second. Higher values mean faster generation throughput.",
  },
  {
    key: "latency",
    label: "Latency",
    unit: "s TTFT",
    higherIsBetter: false,
    description:
      "Time to first answer token (TTFT). Lower values mean quicker initial response.",
  },
  {
    key: "input-price",
    label: "Input Price",
    unit: "$/1M tokens",
    higherIsBetter: false,
    description:
      "Price per million input tokens. Lower values are more cost-effective for prompt-heavy workloads.",
  },
  {
    key: "output-price",
    label: "Output Price",
    unit: "$/1M tokens",
    higherIsBetter: false,
    description:
      "Price per million output tokens. Lower values are more cost-effective for generation-heavy workloads.",
  },
  {
    key: "context-window",
    label: "Context Window",
    unit: "tokens",
    higherIsBetter: true,
    description:
      "Maximum context window size. Larger windows enable processing of longer documents and conversations.",
  },
];

const METRIC_MAP = new Map<string, LeaderboardMetricMeta>(
  LEADERBOARD_METRICS.map((m) => [m.key, m]),
);

export function getMetricMeta(key: string): LeaderboardMetricMeta | undefined {
  return METRIC_MAP.get(key);
}

export function getMetricKeys(): string[] {
  return LEADERBOARD_METRICS.map((m) => m.key);
}

// ---------------------------------------------------------------------------
// Leaderboard entry (serializable — passed as props to client table)
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  rank: number;
  slug: string;
  name: string;
  provider: string;
  model_type: string;
  /** Parsed numeric value for the metric */
  value: number | null;
  /** Human-readable display value */
  displayValue: string;
  chart_count: number;
  faq_count: number;
  evidenceState: "known" | "unknown";
  provenance: {
    sourceUrl: string | null;
    sourceLabel: string;
    retrievedAt: string | null;
    methodology: string | null;
    confidence: "high" | "medium" | "low" | "unknown";
  };
  certificationState: string;
  certificationReason: string;
}

// ---------------------------------------------------------------------------
// Pure formatting helpers (no fs, safe in client components)
// ---------------------------------------------------------------------------

function formatContextValue(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(tokens % 1_000 === 0 ? 0 : 1)}k`;
  }
  return String(tokens);
}

export function formatMetricValue(
  metricKey: string,
  value: number | null,
  rawDisplay: string,
): string {
  if (value === null) return rawDisplay;
  const meta = getMetricMeta(metricKey);
  if (!meta) return String(value);

  if (metricKey === "latency") {
    return `${value.toFixed(2)}s`;
  }
  if (metricKey === "input-price" || metricKey === "output-price") {
    return `$${value.toFixed(2)}`;
  }
  return rawDisplay;
}

// Exported for server-side use in leaderboardHelpers
export { formatContextValue };

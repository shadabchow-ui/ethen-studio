// ── Ethen Gateway — GW-R6 — Live Gateway telemetry ──────────────────────
// Process-local sliding-window telemetry fed by the Gateway's real
// execution outcomes (latency, TTFT, success/failure, error class, tokens,
// cost, fallback, stream completion). The router reads this store to
// deprioritize/exclude unhealthy candidates; the chat route writes to it
// after every request. Like the circuit breaker, this is in-memory and
// resets on process restart — it is operational evidence, not billing.

import type {
  GatewayOutcomeEvent,
  TelemetryKey,
  TelemetryStats,
} from "./types";

const MAX_SAMPLES_PER_KEY = 100;

interface Sample {
  succeeded: boolean;
  latencyMs?: number;
  ttftMs?: number;
  errorClass?: string;
  estimatedCostUsd?: number;
  fallbackUsed?: boolean;
  streamCompleted?: boolean;
  timestamp: number;
}

const samplesByKey = new Map<string, Sample[]>();

function keyOf(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

function pushSample(key: string, sample: Sample): void {
  const list = samplesByKey.get(key) ?? [];
  list.push(sample);
  if (list.length > MAX_SAMPLES_PER_KEY) {
    list.splice(0, list.length - MAX_SAMPLES_PER_KEY);
  }
  samplesByKey.set(key, list);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function buildStats(providerId: string, modelId: string, samples: Sample[]): TelemetryStats {
  const total = samples.length;
  const succeeded = samples.filter((s) => s.succeeded).length;
  const latencies = samples
    .map((s) => s.latencyMs)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  const ttfts = samples
    .map((s) => s.ttftMs)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const costs = samples
    .map((s) => s.estimatedCostUsd)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const rate = (predicate: (s: Sample) => boolean): number =>
    total === 0 ? 0 : samples.filter(predicate).length / total;

  // With fewer than 5 latency samples the "p95" is the mean — an honest
  // label for a small sample rather than a fabricated tail figure.
  const p50 = latencies.length >= 5 ? percentile(latencies, 50) : mean(latencies);
  const p95 = latencies.length >= 5 ? percentile(latencies, 95) : mean(latencies);

  return {
    providerId,
    modelId,
    samples: total,
    successRate: total === 0 ? 0 : succeeded / total,
    p50LatencyMs: Math.round(p50),
    p95LatencyMs: Math.round(p95),
    avgTtftMs: Math.round(mean(ttfts)),
    timeoutRate: rate((s) => s.errorClass === "timeout"),
    rateLimitRate: rate((s) => s.errorClass === "rate_limited"),
    streamInterruptionRate: rate((s) => s.errorClass === "stream_interrupted"),
    avgCostUsd: mean(costs),
    fallbackRate: rate((s) => s.fallbackUsed === true),
    // MI-P0-05: the latest sample's wall-clock time — the freshness authority.
    observedAt:
      samples.length === 0
        ? null
        : new Date(Math.max(...samples.map((s) => s.timestamp))).toISOString(),
  };
}

/**
 * Record a real Gateway execution outcome. Called by the chat completions
 * route on success, failure, and stream completion paths.
 */
export function recordGatewayTelemetry(event: GatewayOutcomeEvent): void {
  const key = keyOf(event.providerId, event.modelId);
  pushSample(key, {
    succeeded: event.succeeded,
    latencyMs: event.latencyMs,
    ttftMs: event.ttftMs,
    errorClass: event.errorClass,
    estimatedCostUsd: event.estimatedCostUsd,
    fallbackUsed: event.fallbackUsed,
    streamCompleted: event.streamCompleted,
    timestamp: event.timestamp ?? Date.now(),
  });
}

/** Telemetry for a single provider/model pair, or null when cold. */
export function getTelemetryStats(providerId: string, modelId: string): TelemetryStats | null {
  const samples = samplesByKey.get(keyOf(providerId, modelId));
  if (!samples || samples.length === 0) return null;
  return buildStats(providerId, modelId, samples);
}

/**
 * Full snapshot of every observed provider/model pair. Deterministic at a
 * point in time; used by the router for reliability scoring.
 */
export function getTelemetrySnapshot(): TelemetryStats[] {
  const stats: TelemetryStats[] = [];
  for (const [key, samples] of samplesByKey.entries()) {
    if (samples.length === 0) continue;
    const [providerId, modelId] = key.split("::");
    stats.push(buildStats(providerId, modelId, samples));
  }
  stats.sort((a, b) =>
    `${a.providerId}:${a.modelId}`.localeCompare(`${b.providerId}:${b.modelId}`),
  );
  return stats;
}

/** Test/dev utility — clears all telemetry state. */
export function resetGatewayTelemetry(): void {
  samplesByKey.clear();
}

/** Test/dev utility — seed synthetic outcomes (used by the test suite). */
export function seedGatewayTelemetry(events: GatewayOutcomeEvent[]): void {
  for (const event of events) {
    recordGatewayTelemetry(event);
  }
}

export type { TelemetryKey };

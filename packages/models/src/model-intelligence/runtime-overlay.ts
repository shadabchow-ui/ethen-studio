import { resolveCanonicalModelReference } from "./registry-api";
import { getTelemetrySnapshot } from "../gateway/smart-routing/telemetry";
import type { TelemetryStats } from "../gateway/smart-routing/types";

export const MI_RUNTIME_HEALTH_POLICY_VERSION = "mi-runtime-health-r6.0";

/** MI-P0-05: a runtime snapshot is "fresh" only while its most recent sample
 * is within this window. Stale or undated snapshots are never right-now
 * eligible. */
export const RUNTIME_FRESHNESS_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export type RuntimeFreshness = "fresh" | "stale" | "unknown" | "unavailable";

export interface RuntimeState {
  gatewayModelId: string;
  providerId: string;
  canonicalModelId: string | null;
  freshness: RuntimeFreshness;
  health: "healthy" | "degraded" | "unknown";
  sampleCount: number;
  observedAt: string | null;
  metrics: Pick<
    TelemetryStats,
    | "successRate"
    | "p50LatencyMs"
    | "p95LatencyMs"
    | "avgTtftMs"
    | "timeoutRate"
    | "rateLimitRate"
    | "streamInterruptionRate"
    | "avgCostUsd"
  >;
}

/**
 * MI-P0-05 — runtime freshness contract.
 *
 * Freshness is derived from the wall-clock time of the most recent telemetry
 * sample (`observedAt`), never assumed. A snapshot with no samples or no
 * `observedAt` is "unknown"; one whose latest sample is older than the max
 * age is "stale". Only a snapshot with a recent observed sample is "fresh".
 */
export function freshnessOf(
  observedAt: string | null,
  sampleCount: number,
  now = Date.now(),
): RuntimeFreshness {
  if (sampleCount < 1) return "unknown";
  if (!observedAt) return "unknown";
  const observed = new Date(observedAt).getTime();
  if (Number.isNaN(observed)) return "unknown";
  if (now - observed > RUNTIME_FRESHNESS_MAX_AGE_MS) return "stale";
  return "fresh";
}

export function projectRuntimeState(
  stats: TelemetryStats | null,
  now = Date.now(),
): RuntimeState | null {
  if (!stats) return null;
  const mapped = resolveCanonicalModelReference(stats.modelId, stats.providerId);
  const health =
    stats.samples < 1
      ? "unknown"
      : stats.successRate < 0.99 ||
          stats.timeoutRate > 0 ||
          stats.rateLimitRate > 0 ||
          stats.streamInterruptionRate > 0
        ? "degraded"
        : "healthy";
  return {
    gatewayModelId: stats.modelId,
    providerId: stats.providerId,
    canonicalModelId: mapped.status === "mapped" ? mapped.canonicalModel.profile.identity.id : null,
    freshness: freshnessOf(stats.observedAt, stats.samples, now),
    health,
    sampleCount: stats.samples,
    observedAt: stats.observedAt,
    metrics: {
      successRate: stats.successRate,
      p50LatencyMs: stats.p50LatencyMs,
      p95LatencyMs: stats.p95LatencyMs,
      avgTtftMs: stats.avgTtftMs,
      timeoutRate: stats.timeoutRate,
      rateLimitRate: stats.rateLimitRate,
      streamInterruptionRate: stats.streamInterruptionRate,
      avgCostUsd: stats.avgCostUsd,
    },
  };
}

export function listRuntimeStates(now = Date.now()): RuntimeState[] {
  return getTelemetrySnapshot()
    .map((stats) => projectRuntimeState(stats, now))
    .filter((x): x is RuntimeState => x !== null);
}

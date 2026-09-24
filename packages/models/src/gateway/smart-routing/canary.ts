// ── Ethen Gateway — GW-R6 — Canary routing ──────────────────────────────
// Bounded, deterministic rollout of a new provider/model for an alias:
//   0% → 1% → 5% → 20% → 50% → 100%.
// Bucketing is deterministic per (alias, candidate, requestId). Promotion
// is controlled by measurable acceptance criteria evaluated from live
// telemetry; the measured values are attached to the routing receipt.

import { createHash } from "node:crypto";
import type {
  CanaryGateResult,
  CanaryTarget,
  SmartRoutingCandidate,
  SmartRoutingDecision,
  TelemetryStats,
} from "./types";

export const CANARY_ROLLOUT_STEPS = [0, 1, 5, 20, 50, 100] as const;

/**
 * Operator-controlled canary configuration. Empty by default — no canary is
 * active until a target is declared. Config changes are deployment-time
 * policy decisions; the acceptance criteria are measured, never assumed.
 */
export const DEFAULT_CANARY_CONFIG: readonly CanaryTarget[] = [];

let canaryConfig: readonly CanaryTarget[] = DEFAULT_CANARY_CONFIG;

/** Test/operator utility — replace the active canary configuration. */
export function setCanaryConfig(targets: readonly CanaryTarget[]): void {
  canaryConfig = [...targets];
}

export function getCanaryConfig(): readonly CanaryTarget[] {
  return [...canaryConfig];
}

export function resetCanaryConfig(): void {
  canaryConfig = DEFAULT_CANARY_CONFIG;
}

/** Deterministic bucket 0..99 for (alias, candidate, requestId). */
export function canaryBucket(
  aliasId: string,
  providerId: string,
  modelId: string,
  requestId: string,
): number {
  const digest = createHash("sha256")
    .update(`${aliasId}|${providerId}|${modelId}|${requestId}`)
    .digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % 100;
}

function findTarget(aliasId: string, candidate: SmartRoutingCandidate): CanaryTarget | null {
  return (
    canaryConfig.find(
      (target) =>
        target.aliasId === aliasId &&
        target.providerId === candidate.providerId &&
        target.modelId === candidate.modelId,
    ) ?? null
  );
}

/**
 * Apply the canary gate to a ranked decision. When the selected candidate
 * has an active canary target and the request buckets into the rollout
 * percent, the canary candidate is promoted to rank 1. Acceptance criteria
 * are measured from telemetry and reported, never silently waived.
 */
export function applyCanaryGate(
  decision: SmartRoutingDecision,
  requestId: string,
  telemetryByKey?: Map<string, TelemetryStats>,
): { decision: SmartRoutingDecision; canary: CanaryGateResult | null } {
  if (!decision.selected || decision.ranked.length === 0) {
    return { decision, canary: null };
  }

  const target = findTarget(decision.aliasId, decision.selected);
  if (!target || target.rolloutPercent <= 0) {
    return { decision, canary: null };
  }

  const bucket = canaryBucket(
    decision.aliasId,
    decision.selected.providerId,
    decision.selected.modelId,
    requestId,
  );
  const bucketHit = bucket < target.rolloutPercent;

  const telemetry = telemetryByKey?.get(
    `${decision.selected.providerId}:${decision.selected.modelId}`,
  );
  const measurable = telemetry != null && telemetry.samples >= target.minSamples;
  const successRate = telemetry?.successRate ?? null;
  const meetsCriteria = measurable ? (successRate ?? 0) >= target.minSuccessRate : null;

  // When the bucket hits, promote the canary candidate to rank 1 (the
  // incumbent falls to rank 2 and remains the capability-safe fallback).
  let updatedDecision = decision;
  if (bucketHit) {
    const ranked = [...decision.ranked];
    const index = ranked.findIndex(
      (c) =>
        c.providerId === decision.selected!.providerId &&
        c.modelId === decision.selected!.modelId,
    );
    if (index > 0) {
      const [canaryCandidate] = ranked.splice(index, 1);
      ranked.unshift(canaryCandidate);
      updatedDecision = { ...decision, ranked };
    }
  }

  const result: CanaryGateResult = {
    target,
    bucketHit,
    bucket,
    acceptance: {
      measurable,
      successRate,
      samples: telemetry?.samples ?? 0,
      meetsCriteria,
    },
    promoted: bucketHit,
  };

  return { decision: updatedDecision, canary: result };
}

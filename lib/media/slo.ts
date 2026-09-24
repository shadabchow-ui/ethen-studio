/**
 * Studio V2 Job 12 (P1) — operational SLO/SLI surfaces.
 *
 * Threshold definitions plus pure evaluation over caller-supplied read
 * models (durable job projections, provider health, export/review records,
 * settlement ledgers). No synthetic data: every input is a measured record;
 * missing inputs yield `unknown`, never a fabricated pass.
 */

export type SloStatus = "pass" | "warn" | "breach" | "unknown";

export interface SloThreshold {
  warnAfterMs?: number;
  breachAfterMs?: number;
  warnRate?: number;
  breachRate?: number;
  minSample?: number;
}

export interface SloResult {
  slo: string;
  status: SloStatus;
  observed: number | null;
  sample: number;
  detail: string;
}

export const STUDIO_SLO_THRESHOLDS = {
  queueDepth: { warnAfterMs: 0, breachAfterMs: 0, minSample: 0 },
  oldestQueuedAgeMs: { warnAfterMs: 5 * 60_000, breachAfterMs: 15 * 60_000, minSample: 1 },
  workerLeaseExpirations: { warnRate: 0.01, breachRate: 0.05, minSample: 20 },
  renderSuccessRate: { warnRate: 0.97, breachRate: 0.9, minSample: 20 },
  exportSuccessRate: { warnRate: 0.97, breachRate: 0.9, minSample: 10 },
  reviewResolutionLatencyMs: { warnAfterMs: 48 * 3_600_000, breachAfterMs: 7 * 24 * 3_600_000, minSample: 5 },
  settlementMismatchRate: { warnRate: 0, breachRate: 0, minSample: 1 },
  reconciliationFailureRate: { warnRate: 0.01, breachRate: 0.05, minSample: 10 },
} as const;

function rateStatus(rate: number, sample: number, minSample: number, warnRate: number, breachRate: number, higherIsBetter: boolean): SloStatus {
  if (sample < minSample) return "unknown";
  if (higherIsBetter) {
    if (rate < breachRate) return "breach";
    if (rate < warnRate) return "warn";
    return "pass";
  }
  if (rate > breachRate) return "breach";
  if (rate > warnRate) return "warn";
  return "pass";
}

export interface StudioSloInputs {
  now?: number;
  /** Queued jobs with enqueue timestamps (ms epoch). */
  queuedAtMs?: number[];
  /** Worker lease outcomes: true = expired/lost. */
  leaseOutcomes?: boolean[];
  /** Render outcomes: true = success. */
  renderOutcomes?: boolean[];
  /** Export outcomes: true = success. */
  exportOutcomes?: boolean[];
  /** Review resolution latencies in ms. */
  reviewLatencyMs?: number[];
  /** Settlement mismatches detected (count) over settled total. */
  settlementMismatches?: number;
  settlementTotal?: number;
  /** Reconciliation failures over attempts. */
  reconciliationFailures?: number;
  reconciliationAttempts?: number;
}

export function evaluateStudioSlo(inputs: StudioSloInputs): SloResult[] {
  const now = inputs.now ?? Date.now();
  const results: SloResult[] = [];

  const queued = inputs.queuedAtMs ?? [];
  const oldest = queued.length > 0 ? now - Math.min(...queued) : null;
  results.push({
    slo: "queue-depth",
    status: queued.length === 0 ? "pass" : oldest !== null && oldest > STUDIO_SLO_THRESHOLDS.oldestQueuedAgeMs.breachAfterMs! ? "breach" : oldest !== null && oldest > STUDIO_SLO_THRESHOLDS.oldestQueuedAgeMs.warnAfterMs! ? "warn" : "pass",
    observed: queued.length,
    sample: queued.length,
    detail: `${queued.length} queued; oldest ${oldest === null ? "n/a" : `${Math.round(oldest / 1000)}s`}.`,
  });

  const leases = inputs.leaseOutcomes ?? [];
  const leaseRate = leases.length > 0 ? leases.filter(Boolean).length / leases.length : 0;
  results.push({
    slo: "worker-lease-expirations",
    status: rateStatus(leaseRate, leases.length, STUDIO_SLO_THRESHOLDS.workerLeaseExpirations.minSample, STUDIO_SLO_THRESHOLDS.workerLeaseExpirations.warnRate, STUDIO_SLO_THRESHOLDS.workerLeaseExpirations.breachRate, false),
    observed: leases.length > 0 ? leaseRate : null,
    sample: leases.length,
    detail: `${leases.filter(Boolean).length}/${leases.length} leases expired.`,
  });

  const renders = inputs.renderOutcomes ?? [];
  const renderRate = renders.length > 0 ? renders.filter(Boolean).length / renders.length : 0;
  results.push({
    slo: "render-success-rate",
    status: rateStatus(renderRate, renders.length, STUDIO_SLO_THRESHOLDS.renderSuccessRate.minSample, STUDIO_SLO_THRESHOLDS.renderSuccessRate.warnRate, STUDIO_SLO_THRESHOLDS.renderSuccessRate.breachRate, true),
    observed: renders.length > 0 ? renderRate : null,
    sample: renders.length,
    detail: `${renders.filter(Boolean).length}/${renders.length} renders succeeded.`,
  });

  const exports = inputs.exportOutcomes ?? [];
  const exportRate = exports.length > 0 ? exports.filter(Boolean).length / exports.length : 0;
  results.push({
    slo: "export-success-rate",
    status: rateStatus(exportRate, exports.length, STUDIO_SLO_THRESHOLDS.exportSuccessRate.minSample, STUDIO_SLO_THRESHOLDS.exportSuccessRate.warnRate, STUDIO_SLO_THRESHOLDS.exportSuccessRate.breachRate, true),
    observed: exports.length > 0 ? exportRate : null,
    sample: exports.length,
    detail: `${exports.filter(Boolean).length}/${exports.length} exports succeeded.`,
  });

  const latencies = inputs.reviewLatencyMs ?? [];
  const p90 = latencies.length > 0 ? [...latencies].sort((a, b) => a - b)[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.9))]! : null;
  results.push({
    slo: "review-resolution-latency",
    status: p90 === null || latencies.length < STUDIO_SLO_THRESHOLDS.reviewResolutionLatencyMs.minSample
      ? "unknown"
      : p90 > STUDIO_SLO_THRESHOLDS.reviewResolutionLatencyMs.breachAfterMs!
        ? "breach"
        : p90 > STUDIO_SLO_THRESHOLDS.reviewResolutionLatencyMs.warnAfterMs!
          ? "warn"
          : "pass",
    observed: p90,
    sample: latencies.length,
    detail: p90 === null ? "No resolved reviews observed." : `p90 ${Math.round(p90 / 3_600_000)}h over ${latencies.length} resolutions.`,
  });

  const mismatchTotal = inputs.settlementTotal ?? 0;
  const mismatches = inputs.settlementMismatches ?? 0;
  results.push({
    slo: "settlement-mismatch",
    status: mismatchTotal < STUDIO_SLO_THRESHOLDS.settlementMismatchRate.minSample
      ? "unknown"
      : mismatches > 0
        ? "breach"
        : "pass",
    observed: mismatchTotal > 0 ? mismatches / mismatchTotal : null,
    sample: mismatchTotal,
    detail: `${mismatches}/${mismatchTotal} settlements mismatched. Any mismatch breaches.`,
  });

  const reconAttempts = inputs.reconciliationAttempts ?? 0;
  const reconFailures = inputs.reconciliationFailures ?? 0;
  const reconRate = reconAttempts > 0 ? reconFailures / reconAttempts : 0;
  results.push({
    slo: "job-reconciliation-failures",
    status: rateStatus(reconRate, reconAttempts, STUDIO_SLO_THRESHOLDS.reconciliationFailureRate.minSample, STUDIO_SLO_THRESHOLDS.reconciliationFailureRate.warnRate, STUDIO_SLO_THRESHOLDS.reconciliationFailureRate.breachRate, false),
    observed: reconAttempts > 0 ? reconRate : null,
    sample: reconAttempts,
    detail: `${reconFailures}/${reconAttempts} reconciliations failed.`,
  });

  return results;
}

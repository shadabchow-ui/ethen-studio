// ── Cortex Ultra Deterministic Scorer ──────────────────────────────────────
// Scores each benchmark comparison using only deterministic checks.
// No LLM-as-judge. No external scoring services.
// All scores are derived from the fixture's scoring config vs actual run output.

import type { BenchmarkComparisonResult } from "./runner";
import type { UltraBenchmarkFixture } from "./fixtures";
import type { CortexUltraVerifierReport } from "../../cortex-ultra/types";

// ── Single fixture score ───────────────────────────────────────────────────
export interface FixtureScore {
  fixtureId: string;
  category: string;

  // Baseline scores
  baselineCompleted: boolean;
  baselineEvidenceCount: number;

  // Ultra scores
  ultraCompleted: boolean;
  ultraVerifierPassed: boolean;
  ultraReceiptAvailable: boolean;
  ultraEvidenceCount: number;
  ultraWorkerCount: number;
  ultraLimitations: string[];
  ultraVerifierVerdict: string;
  ultraSynthesisStatus: string;

  // Signal checks (per scoring config)
  planTopologyMatch: boolean | "unchecked";
  completionMatch: boolean | "unchecked";
  verifierPassedMatch: boolean | "unchecked";
  receiptAvailableMatch: boolean | "unchecked";
  evidenceCountMinMatch: boolean | "unchecked";
  workerCountMinMatch: boolean | "unchecked";
  limitationsEmptyMatch: boolean | "unchecked";

  // Aggregate
  signalChecksPassed: number;
  signalChecksTotal: number;
  qualityScore: number; // 0–1 based on signal checks
}

// ── Aggregate summary ──────────────────────────────────────────────────────
export interface BenchmarkScoreSummary {
  fixtureScores: FixtureScore[];
  totalFixtures: number;

  // Baseline aggregate
  baselineCompletionRate: number; // 0–1
  baselineTotalEvidence: number;

  // Ultra aggregate
  ultraCompletionRate: number;
  ultraVerifierPassRate: number;
  ultraReceiptAvailabilityRate: number;
  ultraTotalEvidence: number;
  ultraTotalWorkers: number;
  ultraTotalLimitations: number;

  // Delta
  evidenceDelta: number;
  completionDelta: number; // positive = Ultra better

  // Quality
  averageQualityScore: number; // 0–1
  signalChecksPassed: number;
  signalChecksTotal: number;

  // Cost/latency status
  costStatus: "unavailable" | "estimated";
  latencyStatus: "measured" | "estimated";

  // Claim safety
  claimSafetyLabel: string;
}

// ── Score a single comparison ─────────────────────────────────────────────
export function scoreFixture(
  comparison: BenchmarkComparisonResult,
  fixture: UltraBenchmarkFixture
): FixtureScore {
  const { baseline, ultra } = comparison;
  const sc = fixture.scoring;

  const baselineCompleted = baseline.status === "complete";
  const ultraCompleted = ultra.status === "complete";
  const ultraVerifierPassed =
    ultra.verifierVerdict === "pass" || ultra.verifierVerdict === "pass_with_warnings";

  // Compute signal checks
  const planTopologyMatch = sc.expectPlanTopology !== undefined
    ? ultra.ultraResult.run.plan?.includes(sc.expectPlanTopology) ??
      (ultra.ultraResult.receipt.toolsUsed.length > 0) // fallback: if tools used, topology was active
    : "unchecked";

  // Better topology check: look at the receipt worker count
  const actualTopologyCheck = sc.expectPlanTopology !== undefined
    ? (ultra.workerCount >= (sc.expectPlanTopology === "parallel_primary_and_critic" ? 2 : 1))
    : "unchecked";

  const completionMatch = sc.expectComplete !== undefined
    ? ultraCompleted === sc.expectComplete
    : "unchecked";

  const verifierPassedMatch = sc.expectVerifierPassed !== undefined
    ? ultraVerifierPassed === sc.expectVerifierPassed
    : "unchecked";

  const receiptAvailableMatch = sc.expectReceiptAvailable !== undefined
    ? ultra.receiptAvailable === sc.expectReceiptAvailable
    : "unchecked";

  const evidenceCountMinMatch = sc.expectEvidenceCountMin !== undefined
    ? ultra.evidenceCount >= sc.expectEvidenceCountMin
    : "unchecked";

  const workerCountMinMatch = sc.expectWorkerCountMin !== undefined
    ? ultra.workerCount >= sc.expectWorkerCountMin
    : "unchecked";

  const limitationsEmptyMatch = sc.expectLimitationsEmpty !== undefined
    ? (ultra.limitations.length === 0) === sc.expectLimitationsEmpty
    : "unchecked";

  // Count passed signal checks
  const checks: (boolean | "unchecked")[] = [
    actualTopologyCheck,
    completionMatch,
    verifierPassedMatch,
    receiptAvailableMatch,
    evidenceCountMinMatch,
    workerCountMinMatch,
    limitationsEmptyMatch,
  ];
  const signalChecksTotal = checks.filter((c) => c !== "unchecked").length;
  const signalChecksPassed = checks.filter((c) => c === true).length;
  const qualityScore = signalChecksTotal > 0 ? signalChecksPassed / signalChecksTotal : 0;

  return {
    fixtureId: comparison.fixtureId,
    category: comparison.category,

    baselineCompleted,
    baselineEvidenceCount: baseline.evidenceCount,

    ultraCompleted,
    ultraVerifierPassed,
    ultraReceiptAvailable: ultra.receiptAvailable,
    ultraEvidenceCount: ultra.evidenceCount,
    ultraWorkerCount: ultra.workerCount,
    ultraLimitations: ultra.limitations,
    ultraVerifierVerdict: ultra.verifierVerdict,
    ultraSynthesisStatus: ultra.synthesisStatus,

    planTopologyMatch: actualTopologyCheck,
    completionMatch,
    verifierPassedMatch,
    receiptAvailableMatch,
    evidenceCountMinMatch,
    workerCountMinMatch,
    limitationsEmptyMatch,

    signalChecksPassed,
    signalChecksTotal,
    qualityScore,
  };
}

// ── Score all comparisons ────────────────────────────────────────────────
export function scoreAll(
  comparisons: BenchmarkComparisonResult[],
  fixtures: UltraBenchmarkFixture[]
): BenchmarkScoreSummary {
  const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));
  const scores = comparisons.map((c) => {
    const fixture = fixtureMap.get(c.fixtureId);
    if (!fixture) {
      throw new Error(`Fixture not found for comparison: ${c.fixtureId}`);
    }
    return scoreFixture(c, fixture);
  });

  const totalFixtures = scores.length;

  const baselineCompletionRate = scores.filter((s) => s.baselineCompleted).length / Math.max(totalFixtures, 1);
  const baselineTotalEvidence = scores.reduce((sum, s) => sum + s.baselineEvidenceCount, 0);

  const ultraCompletionRate = scores.filter((s) => s.ultraCompleted).length / Math.max(totalFixtures, 1);
  const ultraVerifierPassRate = scores.filter((s) => s.ultraVerifierPassed).length / Math.max(totalFixtures, 1);
  const ultraReceiptAvailabilityRate = scores.filter((s) => s.ultraReceiptAvailable).length / Math.max(totalFixtures, 1);
  const ultraTotalEvidence = scores.reduce((sum, s) => sum + s.ultraEvidenceCount, 0);
  const ultraTotalWorkers = scores.reduce((sum, s) => sum + s.ultraWorkerCount, 0);
  const ultraTotalLimitations = scores.reduce((sum, s) => sum + s.ultraLimitations.length, 0);

  const evidenceDelta = ultraTotalEvidence - baselineTotalEvidence;
  const completionDelta = ultraCompletionRate - baselineCompletionRate;

  const averageQualityScore = scores.reduce((sum, s) => sum + s.qualityScore, 0) / Math.max(totalFixtures, 1);
  const signalChecksPassed = scores.reduce((sum, s) => sum + s.signalChecksPassed, 0);
  const signalChecksTotal = scores.reduce((sum, s) => sum + s.signalChecksTotal, 0);

  return {
    fixtureScores: scores,
    totalFixtures,

    baselineCompletionRate,
    baselineTotalEvidence,

    ultraCompletionRate,
    ultraVerifierPassRate,
    ultraReceiptAvailabilityRate,
    ultraTotalEvidence,
    ultraTotalWorkers,
    ultraTotalLimitations,

    evidenceDelta,
    completionDelta,

    averageQualityScore,
    signalChecksPassed,
    signalChecksTotal,

    costStatus: "unavailable",
    latencyStatus: "measured",

    claimSafetyLabel: "Internal offline fixture eval — not externally verified",
  };
}

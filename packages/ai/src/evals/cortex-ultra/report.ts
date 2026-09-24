// ── Cortex Ultra Benchmark Report Generator ───────────────────────────────
// Produces a structured report object and a formatted CLI report string.
// All results are deterministic offline fixture comparisons.
// No live model comparisons. No external benchmark claims.

import type { BenchmarkComparisonResult } from "./runner";
import type { BenchmarkScoreSummary, FixtureScore } from "./scorer";
import { scoreAll } from "./scorer";
import type { UltraBenchmarkFixture } from "./fixtures";
import { ULTRA_BENCHMARK_FIXTURES } from "./fixtures";
import { runComparison } from "./runner";

// ── Full report ────────────────────────────────────────────────────────────
export interface UltraBenchmarkReport {
  generatedAt: string;
  harnessVersion: string;
  source: "offline_deterministic_fixtures";
  claimSafetyLabel: string;
  summary: BenchmarkScoreSummary;
  comparisons: BenchmarkComparisonResult[];
  fixtures: UltraBenchmarkFixture[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Benchmark timed out after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

// ── Run all benchmarks ────────────────────────────────────────────────────
export async function runAllBenchmarks(
  options?: { timeoutMs?: number }
): Promise<UltraBenchmarkReport> {
  const timeoutMs = options?.timeoutMs ?? 30_000;

  const comparisons = await withTimeout(
    Promise.all(
      ULTRA_BENCHMARK_FIXTURES.map((f) => runComparison(f))
    ),
    timeoutMs,
    "runAllComparisons"
  );

  const summary = scoreAll(comparisons, ULTRA_BENCHMARK_FIXTURES);

  return {
    generatedAt: new Date().toISOString(),
    harnessVersion: "1.0.0-offline",
    source: "offline_deterministic_fixtures",
    claimSafetyLabel: summary.claimSafetyLabel,
    summary,
    comparisons,
    fixtures: ULTRA_BENCHMARK_FIXTURES,
  };
}

// ── Format report for CLI output ──────────────────────────────────────────
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatBenchmarkReport(report: UltraBenchmarkReport): string {
  const { summary } = report;
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════╗");
  lines.push("║   Cortex Ultra Benchmark Report (Offline Fixtures)      ║");
  lines.push("╚══════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Harness: ${report.harnessVersion}`);
  lines.push(`Source: ${report.source}`);
  lines.push(`Label: ${report.claimSafetyLabel}`);
  lines.push("");

  lines.push("── Aggregate Summary ──");
  lines.push(`Fixtures: ${summary.totalFixtures}`);
  lines.push("");

  lines.push("Baseline (single-model mock):");
  lines.push(`  Completion rate: ${formatPercent(summary.baselineCompletionRate)}`);
  lines.push(`  Evidence items: ${summary.baselineTotalEvidence}`);
  lines.push("");

  lines.push("Cortex Ultra (orchestration):");
  lines.push(`  Completion rate: ${formatPercent(summary.ultraCompletionRate)}`);
  lines.push(`  Verifier pass rate: ${formatPercent(summary.ultraVerifierPassRate)}`);
  lines.push(`  Receipt availability: ${formatPercent(summary.ultraReceiptAvailabilityRate)}`);
  lines.push(`  Evidence items: ${summary.ultraTotalEvidence}`);
  lines.push(`  Workers dispatched: ${summary.ultraTotalWorkers}`);
  lines.push(`  Limitations logged: ${summary.ultraTotalLimitations}`);
  lines.push("");

  lines.push("Delta (Ultra vs Baseline):");
  lines.push(`  Completion delta: ${(summary.completionDelta >= 0 ? "+" : "")}${formatPercent(summary.completionDelta)}`);
  lines.push(`  Evidence delta: ${(summary.evidenceDelta >= 0 ? "+" : "")}${summary.evidenceDelta}`);
  lines.push("");

  lines.push("Quality:");
  lines.push(`  Average score: ${formatPercent(summary.averageQualityScore)}`);
  lines.push(`  Signal checks: ${summary.signalChecksPassed}/${summary.signalChecksTotal}`);
  lines.push("");

  lines.push("Cost/Latency:");
  lines.push(`  Cost: ${summary.costStatus}`);
  lines.push(`  Latency: ${summary.latencyStatus}`);
  lines.push("");

  lines.push("── Per-Fixture Results ──");
  for (const score of summary.fixtureScores) {
    lines.push("");
    lines.push(`[${score.fixtureId}] (${score.category})`);
    lines.push(`  Ultra completed: ${score.ultraCompleted}`);
    lines.push(`  Verifier: ${score.ultraVerifierVerdict}`);
    lines.push(`  Synthesis: ${score.ultraSynthesisStatus}`);
    lines.push(`  Receipt: ${score.ultraReceiptAvailable ? "yes" : "no"}`);
    lines.push(`  Evidence: ${score.ultraEvidenceCount} items`);
    lines.push(`  Workers: ${score.ultraWorkerCount}`);
    lines.push(`  Signal checks: ${score.signalChecksPassed}/${score.signalChecksTotal} (${formatPercent(score.qualityScore)})`);
    if (score.ultraLimitations.length > 0) {
      lines.push(`  Limitations: ${score.ultraLimitations.join(", ")}`);
    }
  }

  lines.push("");
  lines.push(`Total: ${summary.signalChecksPassed}/${summary.signalChecksTotal} signal checks passed`);

  return lines.join("\n");
}

// ── Format checks for individual fixture ──────────────────────────────────
export function formatFixtureChecks(score: FixtureScore): string {
  const lines: string[] = [];
  lines.push(`Fixture: ${score.fixtureId} (${score.category})`);

  const checks: Array<{ label: string; value: boolean | "unchecked" }> = [
    { label: "Plan topology match", value: score.planTopologyMatch },
    { label: "Completion match", value: score.completionMatch },
    { label: "Verifier passed match", value: score.verifierPassedMatch },
    { label: "Receipt available match", value: score.receiptAvailableMatch },
    { label: "Evidence count min match", value: score.evidenceCountMinMatch },
    { label: "Worker count min match", value: score.workerCountMinMatch },
    { label: "Limitations empty match", value: score.limitationsEmptyMatch },
  ];

  for (const check of checks) {
    const status = check.value === "unchecked" ? "—" : check.value ? "PASS" : "FAIL";
    lines.push(`  ${status}: ${check.label}`);
  }

  return lines.join("\n");
}

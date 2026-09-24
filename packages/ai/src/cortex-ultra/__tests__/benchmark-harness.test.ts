// ── Cortex Ultra Benchmark Harness Tests ───────────────────────────────────
// Runs deterministic benchmark assertions. No live provider calls.
// Usage: npx tsx lib/cortex-ultra/__tests__/benchmark-harness.test.ts

import { runAllBenchmarks } from "../../evals/cortex-ultra/report";
import {
  assertDistinctBenchmarkArms,
  createFixtureExecutor,
  runBaseline,
  runUltra,
  runComparison,
} from "../../evals/cortex-ultra/runner";
import { scoreFixture, scoreAll } from "../../evals/cortex-ultra/scorer";
import { ULTRA_BENCHMARK_FIXTURES } from "../../evals/cortex-ultra/fixtures";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  FAIL: ${label}`);
  }
}

async function run() {
  // 1. Fixtures exist
  assert(ULTRA_BENCHMARK_FIXTURES.length >= 5, "at least 5 benchmark fixtures exist");
  assert(ULTRA_BENCHMARK_FIXTURES.length <= 10, "fixture count is manageable (≤10)");

  // Check fixture structure
  for (const f of ULTRA_BENCHMARK_FIXTURES) {
    assert(!!f.id, `fixture ${f.id} has id`);
    assert(!!f.category, `fixture ${f.id} has category`);
    assert(!!f.prompt, `fixture ${f.id} has prompt`);
    assert(!!f.scoring, `fixture ${f.id} has scoring config`);
    assert(Array.isArray(f.injectedWorkerOutputs), `fixture ${f.id} has worker outputs`);
    assert(f.injectedWorkerOutputs.length > 0, `fixture ${f.id} has at least 1 worker output`);
  }

  // 2. Run baseline on first fixture
  const firstFixture = ULTRA_BENCHMARK_FIXTURES[0];
  const baseline = await runBaseline(firstFixture);
  assert(baseline.source === "offline_mocked_baseline", "baseline is labeled as offline mocked");
  assert(baseline.receiptAvailable === false, "baseline has no receipt available");
  assert(baseline.latencyMs >= 0, "baseline has latency measurement");

  // 3. Run Ultra on first fixture
  const ultra = await runUltra(firstFixture);
  assert(ultra.source === "offline_fixture_ultra", "ultra is labeled as offline fixture");
  assert(ultra.ultraResult.receipt !== undefined, "ultra produces a receipt");
  assert(ultra.ultraResult.verifierReports.length > 0, "ultra has verifier reports");
  assert(ultra.latencyMs >= 0, "ultra has latency measurement");

  // 4. Run comparison on first fixture
  const comparison = await runComparison(firstFixture);
  assert(comparison.arms.baseline !== (comparison.arms.ultra as string), "benchmark execution arms are distinct");
  assert(comparison.baseline.source === "offline_mocked_baseline", "comparison baseline labeled correctly");
  assert(comparison.ultra.source === "offline_fixture_ultra", "comparison ultra labeled correctly");
  assert(comparison.ultra.evidenceCount === 0, "fixture claim IDs do not fabricate evidence observations");
  assert(comparison.baseline.evidenceCount === 0, "baseline fixture refs do not count as observed evidence");
  let rejectedSameArms = false;
  try {
    assertDistinctBenchmarkArms({ baseline: "same_executor", ultra: "same_executor" });
  } catch {
    rejectedSameArms = true;
  }
  assert(rejectedSameArms, "benchmark output is refused when execution arms are not distinct");

  const sequentialFixture = ULTRA_BENCHMARK_FIXTURES.find((fixture) => fixture.injectedWorkerOutputs.length > 1);
  if (sequentialFixture) {
    const executor = createFixtureExecutor(sequentialFixture.injectedWorkerOutputs);
    const contract = {
      workerId: "sequence-test",
      role: "worker" as const,
      specialistRole: "analyst" as const,
      assignedTask: sequentialFixture.prompt,
      expectedOutputContract: ["summary"],
      requiredTools: [],
      toolPolicy: { allowedTools: [], mode: "optional" as const },
      evidenceRequirements: [],
      verifierChecklistLink: [],
      maxToolCalls: 1,
      timeoutMs: 1_000,
    };
    const first = await executor(contract);
    const second = await executor(contract);
    assert(first.outputText !== second.outputText, "fixture executor advances across worker outputs");
  }

  // 5. Score a single fixture
  const score = scoreFixture(comparison, firstFixture);
  assert(score.signalChecksTotal > 0, "fixture has signal checks defined");
  assert(score.qualityScore >= 0 && score.qualityScore <= 1, "quality score is between 0 and 1");
  assert(score.fixtureId === firstFixture.id, "score references correct fixture");

  // 6. Run full benchmark
  const report = await runAllBenchmarks();
  assert(report.source === "offline_deterministic_fixtures", "report labeled as offline deterministic");
  assert(report.claimSafetyLabel.includes("not externally verified"), "claim safety label present");
  assert(report.summary.totalFixtures === ULTRA_BENCHMARK_FIXTURES.length, "all fixtures included");
  assert(report.comparisons.length === ULTRA_BENCHMARK_FIXTURES.length, "comparisons match fixture count");
  assert(report.summary.costStatus === "unavailable", "cost status is unavailable (offline)");
  assert(report.summary.latencyStatus === "measured", "latency status is measured");

  // 7. Verify aggregate summary structure
  assert(typeof report.summary.baselineCompletionRate === "number", "baseline completion rate is numeric");
  assert(typeof report.summary.ultraCompletionRate === "number", "ultra completion rate is numeric");
  assert(typeof report.summary.ultraVerifierPassRate === "number", "verifier pass rate is numeric");
  assert(typeof report.summary.ultraReceiptAvailabilityRate === "number", "receipt availability rate is numeric");
  assert(typeof report.summary.averageQualityScore === "number", "quality score is numeric");
  assert(typeof report.summary.signalChecksPassed === "number", "signal checks passed is numeric");
  assert(typeof report.summary.signalChecksTotal === "number", "signal checks total is numeric");

  // 8. Check that all key metrics are present
  assert(report.summary.fixtureScores.length === ULTRA_BENCHMARK_FIXTURES.length, "all fixtures scored");
  for (const fs of report.summary.fixtureScores) {
    assert(typeof fs.ultraCompleted === "boolean", `fixture ${fs.fixtureId} has ultra completed status`);
    assert(typeof fs.ultraReceiptAvailable === "boolean", `fixture ${fs.fixtureId} has receipt status`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});

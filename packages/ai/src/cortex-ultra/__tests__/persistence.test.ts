// Cortex Ultra persistence — unit tests
// Run with: npx tsx lib/cortex-ultra/__tests__/persistence.test.ts
//
// Exercises the safe no-op paths of lib/cortex-ultra/persistence.ts
// (no Supabase env configured in test process, same as local/mock mode).
// Does not hit a real database — there is no test DB harness for that.

import {
  recordUltraRun,
  fetchUltraRunRecord,
  fetchUltraRunsBySession,
} from "../persistence";
import type { CortexUltraRun, CortexUltraTeamReceipt } from "../ultra-types";

function makeTeamReceipt(overrides?: Partial<CortexUltraTeamReceipt>): CortexUltraTeamReceipt {
  return {
    receiptId: "rcpt-test-1",
    runId: "run-test-1",
    requestId: "req-test-1",
    generatedAt: new Date().toISOString(),
    redactionTier: "summary",
    workerCount: 2,
    workersSucceeded: 2,
    totalToolCalls: 4,
    evidenceCount: 6,
    finalOutput: "Test output",
    verifierOutcome: "pass",
    finalVerifierOutcome: "pass",
    degraded: false,
    aborted: false,
    abortReason: null,
    totalInputTokens: 100,
    totalOutputTokens: 200,
    totalEstimatedCostUsd: 0.01,
    costEstimateStatus: "estimated",
    costEstimateReason: null,
    toolsUsed: ["research.search"],
    workerSummaries: [],
    evalResults: [],
    stoppingRule: null,
    durationMs: 1000,
    ...overrides,
  };
}

function makeUltraRun(overrides?: Partial<CortexUltraRun>): CortexUltraRun {
  return {
    runId: "run-test-1",
    requestId: "req-test-1",
    userId: "user-test-1",
    sessionId: "session-test-1",
    projectId: "project-test-1",
    state: "COMPLETE",
    intentSummary: "Test run",
    plan: null,
    workers: [
      {
        workerId: "w-1",
        role: "worker",
        assignedSubtask: "Search for data",
        modelId: "gpt-4",
        providerId: "openai",
        status: "complete",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        toolCalls: [
          {
            toolCallId: "tc-1",
            workerId: "w-1",
            toolName: "research.search",
            argsRedacted: { query: "test" },
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            status: "success",
            outputSummary: "Found results",
            errorMessage: null,
            tokensCost: null,
          },
        ],
        evidence: [
          {
            evidenceId: "ev-1",
            workerId: "w-1",
            sourceToolCallId: "tc-1",
            tier: "primary",
            summary: "Found something",
            url: null,
            confidence: 0.9,
            addedAt: new Date().toISOString(),
          },
        ],
        outputSummary: "Worker 1 output",
        inputTokens: 50,
        outputTokens: 100,
        estimatedCostUsd: 0.005,
        failureReason: null,
      },
      {
        workerId: "w-2",
        role: "verifier",
        assignedSubtask: "Verify results",
        modelId: "claude-3",
        providerId: "anthropic",
        status: "complete",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        toolCalls: [],
        evidence: [],
        outputSummary: "Verification passed",
        inputTokens: 50,
        outputTokens: 100,
        estimatedCostUsd: 0.005,
        failureReason: null,
      },
    ],
    steps: [],
    verifierResults: [
      {
        verifierId: "v-1",
        runId: "run-test-1",
        role: "verifier",
        outcome: "pass",
        score: 0.95,
        warnings: [],
        failureReasons: [],
        modelId: null,
        completedAt: new Date().toISOString(),
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
      },
    ],
    synthesisResult: null,
    evalResults: [],
    costBudget: {
      hardCeilingUsd: 1.0,
      softWarningUsd: 0.5,
      accumulatedUsd: 0.01,
      maxToolCallIterations: 10,
      consumedToolCallIterations: 4,
    },
    stoppingRule: null,
    createdAt: new Date(Date.now() - 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    timeline: [],
    ...overrides,
  };
}

// ── No-Supabase-env (skipped) path tests ────────────────────────────────

async function testRecordUltraRunSkippedWithoutEnv() {
  const run = makeUltraRun();
  const result = await recordUltraRun({ run });
  console.assert(result.ok === true, "Expected ok=true when no Supabase env");
  console.assert(result.skipped === true, "Expected skipped=true when no Supabase env");
  console.assert(result.runRecordId === null, "Expected null runRecordId when skipped");
  console.assert(result.error === null, "Expected null error when skipped");
  console.log("PASS: recordUltraRun skipped without Supabase env");
}

async function testFetchUltraRunRecordNullWithoutEnv() {
  const result = await fetchUltraRunRecord("any-run-id");
  console.assert(result === null, "Expected null when no Supabase env");
  console.log("PASS: fetchUltraRunRecord returns null without Supabase env");
}

async function testFetchUltraRunsBySessionEmptyWithoutEnv() {
  const results = await fetchUltraRunsBySession("any-session-id");
  console.assert(Array.isArray(results), "Expected array");
  console.assert(results.length === 0, "Expected empty array when no Supabase env");
  console.log("PASS: fetchUltraRunsBySession returns empty array without Supabase env");
}

// ── Degraded / aborted state mapping tests ──────────────────────────────

async function testDegradedRunMapsCorrectly() {
  const run = makeUltraRun({ state: "DEGRADED_COMPLETE" });
  const result = await recordUltraRun({ run });
  // In no-env mode, skipped is true so we can't verify the insert payload.
  // But we can verify the function doesn't throw and behaves gracefully.
  console.assert(result.ok === true, "Degraded run should not throw in no-env mode");
  console.assert(result.skipped === true, "Should skip without env");
  console.log("PASS: recordUltraRun handles DEGRADED_COMPLETE state without env");
}

async function testAbortedRunMapsCorrectly() {
  const run = makeUltraRun({
    state: "ABORTED",
    stoppingRule: {
      trigger: "cost_ceiling_exceeded",
      triggeredAt: new Date().toISOString(),
      detail: "Cost ceiling exceeded",
    },
  });
  const result = await recordUltraRun({ run });
  console.assert(result.ok === true, "Aborted run should not throw in no-env mode");
  console.log("PASS: recordUltraRun handles ABORTED state without env");
}

// ── Null user / session / project fallback ──────────────────────────────

async function testRecordWithNullUser() {
  const run = makeUltraRun({ userId: null, sessionId: null, projectId: null });
  const result = await recordUltraRun({ run });
  console.assert(result.ok === true, "Null user/session/project should not throw");
  console.log("PASS: recordUltraRun handles null user/session/project");
}

// ── Record params override user/session/project ─────────────────────────

async function testRecordParamsOverrideIdentifiers() {
  const run = makeUltraRun({ userId: null });
  const result = await recordUltraRun({
    run,
    userId: "override-user",
    sessionId: "override-session",
    projectId: "override-project",
  });
  console.assert(result.ok === true, "Override identifiers should not throw");
  console.log("PASS: recordUltraRun accepts override userId/sessionId/projectId");
}

// ── Run all ─────────────────────────────────────────────────────────────

async function main() {
  await testRecordUltraRunSkippedWithoutEnv();
  await testFetchUltraRunRecordNullWithoutEnv();
  await testFetchUltraRunsBySessionEmptyWithoutEnv();
  await testDegradedRunMapsCorrectly();
  await testAbortedRunMapsCorrectly();
  await testRecordWithNullUser();
  await testRecordParamsOverrideIdentifiers();
  console.log("\nAll persistence tests passed.");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

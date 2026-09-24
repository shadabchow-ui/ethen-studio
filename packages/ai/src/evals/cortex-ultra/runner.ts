// ── Cortex Ultra Benchmark Runner ─────────────────────────────────────────
// Runs each fixture through two paths:
//   1. Single-model baseline (offline mocked single-worker)
//   2. Cortex Ultra (runUltraChat with deterministic injected executor)
//
// No live provider calls. No external API keys required.
// All results are flagged as offline/mocked fixtures.

import type { WorkerExecutor, WorkerExecutorOutput } from "../../cortex-ultra/worker-runtime";
import { runUltraChat } from "../../cortex-ultra/run-ultra-chat";
import type { RunUltraChatResult } from "../../cortex-ultra/run-ultra-chat";
import type { ToolExecutor } from "../../cortex-ultra/tool-loop-runtime";
import type { UltraBenchmarkFixture } from "./fixtures";

// ── Baseline run result ────────────────────────────────────────────────────
export interface BaselineRunResult {
  fixtureId: string;
  outputText: string;
  latencyMs: number;
  status: "complete" | "partial" | "failed";
  evidenceCount: number;
  receiptAvailable: false;
  limitations: string[];
  source: "offline_mocked_baseline";
}

// ── Ultra run result ──────────────────────────────────────────────────────
export interface UltraRunResult {
  fixtureId: string;
  ultraResult: RunUltraChatResult;
  latencyMs: number;
  status: "complete" | "degraded" | "failed";
  evidenceCount: number;
  receiptAvailable: boolean;
  limitations: string[];
  workerCount: number;
  verifierVerdict: string;
  synthesisStatus: string;
  source: "offline_fixture_ultra";
}

// ── Benchmark comparison result ────────────────────────────────────────────
export interface BenchmarkComparisonResult {
  fixtureId: string;
  category: string;
  arms: {
    baseline: "single_worker_baseline";
    ultra: "multi_worker_orchestration";
  };
  baseline: BaselineRunResult;
  ultra: UltraRunResult;
}

const BENCHMARK_ARMS = {
  baseline: "single_worker_baseline",
  ultra: "multi_worker_orchestration",
} as const;

export function assertDistinctBenchmarkArms(arms: {
  baseline: string;
  ultra: string;
}): void {
  if (!arms.baseline || !arms.ultra || arms.baseline === arms.ultra) {
    throw new Error("Benchmark comparison refused: execution arms are not distinct.");
  }
}

const OFFLINE_PREVIEW_TOOL_EXECUTOR: ToolExecutor = async (request) => ({
  toolName: request.toolName,
  toolClass: request.toolClass,
  success: true,
  summary: "Offline benchmark has no recorded tool observation. No evidence collected.",
  sourceUrls: [],
  grounded: false,
  deferred: false,
});

// ── Baseline runner (deterministic single-worker mock) ─────────────────────
export function createFixtureExecutor(
  outputs: WorkerExecutorOutput[]
): WorkerExecutor {
  let callIndex = 0;
  return async () => {
    const output = outputs[callIndex++];
    if (!output) {
      return {
        outputText: "No output configured for this worker.",
        claims: [],
      };
    }
    return output;
  };
}

export async function runBaseline(
  fixture: UltraBenchmarkFixture
): Promise<BaselineRunResult> {
  const start = performance.now();

  const executor = createFixtureExecutor(fixture.injectedWorkerOutputs);
  const contract = {
    workerId: "baseline-w1",
    role: "worker" as const,
    specialistRole: "analyst" as const,
    assignedTask: fixture.prompt,
    expectedOutputContract: ["summary"],
    requiredTools: [],
    toolPolicy: { allowedTools: [], mode: "optional" as const },
    evidenceRequirements: [],
    verifierChecklistLink: [],
    maxToolCalls: 3,
    timeoutMs: fixture.timeLimitMs ?? 30_000,
  };

  let outputText = "";
  let status: BaselineRunResult["status"] = "failed";
  let evidenceCount = 0;

  try {
    const { runWorker } = await import("../../cortex-ultra/worker-runtime");
    const result = await runWorker(contract, executor);
    outputText = result.workerResult.outputText;
    // Fixture references are claims about evidence, not recorded observations.
    evidenceCount = 0;
    status = result.status === "complete"
      ? "complete"
      : result.status === "partial"
      ? "partial"
      : "failed";
  } catch {
    outputText = "Baseline worker execution failed.";
    status = "failed";
  }

  const latencyMs = Math.round(performance.now() - start);

  return {
    fixtureId: fixture.id,
    outputText,
    latencyMs,
    status,
    evidenceCount,
    receiptAvailable: false,
    limitations: ["offline_mocked_baseline", "no_receipt_available", "fixture_evidence_refs_unobserved"],
    source: "offline_mocked_baseline",
  };
}

// ── Ultra runner (runUltraChat with deterministic injected executor) ───────
export async function runUltra(
  fixture: UltraBenchmarkFixture
): Promise<UltraRunResult> {
  const start = performance.now();

  const executor = createFixtureExecutor(fixture.injectedWorkerOutputs);
  let ultraResult: RunUltraChatResult;
  let status: UltraRunResult["status"] = "failed";

  try {
    ultraResult = await runUltraChat({
      task: fixture.prompt,
      maxWorkers: fixture.maxWorkers,
      costLimitUsd: fixture.costLimitUsd,
      timeLimitMs: fixture.timeLimitMs,
      workerExecutor: executor,
      toolExecutor: OFFLINE_PREVIEW_TOOL_EXECUTOR,
      verifierOptions: {
        evidenceIndex: {},
      },
    });

    const hasOutput = ultraResult.answer.length > 0;
    const hasAccepted = ultraResult.verifierReports.some(
      (r) => r.verdict === "pass" || r.verdict === "pass_with_warnings"
    );
    const isDegraded = ultraResult.synthesisResult?.status === "degraded";

    if (hasOutput && hasAccepted && !isDegraded) {
      status = "complete";
    } else if (hasOutput) {
      status = "degraded";
    }
  } catch {
    ultraResult = {
      answer: "Ultra run failed.",
        receipt: {
          receiptId: "err-rcpt",
          runId: "err-run",
          requestId: "err-req",
          generatedAt: new Date().toISOString(),
          redactionTier: "summary",
          workerCount: 0,
          workersSucceeded: 0,
          totalToolCalls: 0,
          evidenceCount: 0,
          finalOutput: null,
          verifierOutcome: "fail_terminal",
          finalVerifierOutcome: null,
          degraded: true,
          aborted: false,
          abortReason: null,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalEstimatedCostUsd: 0,
          costEstimateStatus: "unavailable",
          costEstimateReason: "Ultra run failed; no cost data available.",
          toolsUsed: [],
          workerSummaries: [],
          evalResults: [],
          stoppingRule: null,
          durationMs: null,
        },
        run: {
          runId: "err-run",
          requestId: "err-req",
          userId: null,
          sessionId: null,
          projectId: null,
          state: "ABORTED",
          intentSummary: null,
          plan: null,
          workers: [],
          steps: [],
          verifierResults: [],
          synthesisResult: null,
          evalResults: [],
          costBudget: {
            hardCeilingUsd: 0,
            softWarningUsd: 0,
            accumulatedUsd: 0,
            maxToolCallIterations: 0,
            consumedToolCallIterations: 0,
          },
          stoppingRule: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: null,
          timeline: [],
        },
        timeline: [],
        evidence: { total: 0 },
        evidenceSummary: null,
        workerResults: [],
        verifierReports: [],
        synthesisResult: null,
        limitations: ["ultra_run_exception"],
    };
    status = "failed";
  }

  const latencyMs = Math.round(performance.now() - start);
  const receiptAvailable =
    ultraResult.receipt.receiptId !== "err-rcpt" && ultraResult.receipt.workerCount > 0;

  return {
    fixtureId: fixture.id,
    ultraResult,
    latencyMs,
    status,
    evidenceCount: ultraResult.evidence.total,
    receiptAvailable,
    limitations: ultraResult.limitations,
    workerCount: ultraResult.workerResults.length,
    verifierVerdict: ultraResult.verifierReports[0]?.verdict ?? "none",
    synthesisStatus: ultraResult.synthesisResult?.status ?? "none",
    source: "offline_fixture_ultra",
  };
}

// ── Run comparison for a single fixture ───────────────────────────────────
export async function runComparison(
  fixture: UltraBenchmarkFixture
): Promise<BenchmarkComparisonResult> {
  assertDistinctBenchmarkArms(BENCHMARK_ARMS);
  const [baseline, ultra] = await Promise.all([
    runBaseline(fixture),
    runUltra(fixture),
  ]);

  return {
    fixtureId: fixture.id,
    category: fixture.category,
    arms: BENCHMARK_ARMS,
    baseline,
    ultra,
  };
}

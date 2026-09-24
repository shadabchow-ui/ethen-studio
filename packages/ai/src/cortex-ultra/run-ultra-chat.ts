// ── Cortex Ultra Chat Orchestrator ────────────────────────────────────────
// Library-level orchestrator. No live provider calls.
// Uses injectable worker executor for tests.
// Evidence ledger collects read-only tool results throughout the pipeline.

import { createUltraRun, transitionState, appendTimelineEvent } from "./execution-state";
import { planUltraTask } from "./ultra-planner";
import { assembleTeam } from "./team-assembler";
import { runParallelWorkers } from "./parallel-executor";
import type { WorkerExecutor } from "./worker-runtime";
import { runUltraVerifier } from "./verifier-runtime";
import { runUltraSynthesizer } from "./synthesizer-runtime";
import { buildTeamReceipt } from "./team-receipt";
import { EvidenceLedger, type EvidenceLedgerSummary } from "./evidence-ledger";
import type { ToolExecutor } from "./tool-loop-runtime";
import type { ReadOnlyToolResult } from "./read-only-tool-adapter";
import { createUltraRunBudget, remainingRunTimeMs, recordObservedUsage } from "./cost-controller";

import type {
  CortexUltraWorkerResult,
  CortexUltraVerifierReport,
  CortexUltraSynthesizerOutput,
  CortexUltraVerifierOptions,
  CortexUltraSynthesizerInput,
  CortexUltraFinalVerificationHelper,
} from "./types";

import type {
  CortexUltraRun,
  CortexUltraTeamReceipt,
  CortexUltraWorker,
  CortexUltraSynthesisResult,
  UltraPlanInput,
} from "./ultra-types";

export interface RunUltraChatInput {
  task: string;
  maxWorkers?: number;
  costLimitUsd?: number;
  timeLimitMs?: number;
  workerExecutor?: WorkerExecutor;
  /** Test/benchmark seam. Live callers omit this and use the grounded executor. */
  toolExecutor?: ToolExecutor;
  verifierOptions?: Partial<CortexUltraVerifierOptions>;
  finalVerification?: CortexUltraFinalVerificationHelper;
}

export interface RunUltraChatResult {
  answer: string;
  receipt: CortexUltraTeamReceipt;
  run: CortexUltraRun;
  timeline: CortexUltraRun["timeline"];
  evidence: { total: number };
  evidenceSummary: EvidenceLedgerSummary | null;
  workerResults: CortexUltraWorkerResult[];
  verifierReports: CortexUltraVerifierReport[];
  synthesisResult: CortexUltraSynthesizerOutput | null;
  limitations: string[];
}

export async function runUltraChat(
  input: RunUltraChatInput
): Promise<RunUltraChatResult> {
  const task = input.task.trim();
  if (!task) {
    throw new Error("runUltraChat requires a non-empty task");
  }

  const evidenceLedger = new EvidenceLedger();
  const runBudget = createUltraRunBudget({
    timeLimitMs: input.timeLimitMs,
    maxTools: input.maxWorkers ? input.maxWorkers * 5 : 10,
    maxCostUsd: input.costLimitUsd,
  });

  // 1. Create initial run state
  let run = createUltraRun({
    intentSummary: task,
    hardCeilingUsd: input.costLimitUsd,
    maxToolCallIterations: input.maxWorkers ? input.maxWorkers * 5 : 10,
  });
  run = transitionState(run, "PLANNING", "starting ultra chat pipeline");

  // 2. Plan
  const planInput: UltraPlanInput = {
    task,
    maxWorkers: input.maxWorkers,
    costLimitUsd: input.costLimitUsd,
    timeLimitMs: input.timeLimitMs,
  };
  const plan = planUltraTask(planInput);
  run = transitionState(run, "PLAN_VALIDATION", "plan created");
  run = appendTimelineEvent(run, "plan_created", plan.topology);

  // 3. Assemble team
  const team = assembleTeam(plan);
  run = transitionState(run, "TEAM_ASSEMBLY", `team assembled: ${team.members.length} members`);
  run = appendTimelineEvent(run, "team_assembled", `${team.members.filter((m) => m.role === "worker").length} workers`);

  // Map workers from team to run workers
  const workerMembers = team.members.filter((m) => m.role === "worker");
  const runWorkers: CortexUltraWorker[] = workerMembers.map((m) => ({
    workerId: m.memberId,
    role: m.role,
    assignedSubtask: m.assignedTasks[0] ?? task,
    modelId: null,
    providerId: null,
    status: "pending",
    startedAt: null,
    completedAt: null,
    toolCalls: [],
    evidence: [],
    outputSummary: null,
    inputTokens: null,
    outputTokens: null,
    estimatedCostUsd: null,
    failureReason: null,
  }));
  run = { ...run, workers: runWorkers };

  // 4. Dispatch workers
  run = transitionState(run, "WORKER_DISPATCH");
  const workerContracts = plan.workers.map((wc) => ({
    ...wc,
    workerId: workerMembers.find((m) => m.assignedTasks[0] === wc.assignedTask)?.memberId ?? wc.workerId,
  }));

  // Run tool loop before workers to collect evidence.
  run = transitionState(run, "TOOL_LOOP_RUNNING", "collecting read-only evidence");
  const toolRequests = plan.toolRequirements.map((toolName, i) => ({
    requestId: `treq-${run.runId}-${i}`,
    toolName,
    toolClass: (toolName.startsWith("search") ? "search" : toolName.startsWith("retrieval") ? "retrieval" : toolName.startsWith("repo") ? "repo" : "file") as import("../cortex/types").ToolClass,
    args: { query: task },
    proposedAt: new Date().toISOString(),
  }));

  // The runtime defaults to the real grounded executor. Offline tests may inject
  // an explicitly labelled preview executor through the typed seam above.
  const { runCortexToolLoop } = await import("./tool-loop-runtime");
  const toolTurns = await runCortexToolLoop(toolRequests, {
    allowedToolClasses: ["search", "retrieval", "repo", "file"],
    evidenceLedger,
    maxTools: runBudget.maxTools ?? undefined,
    budgetState: runBudget,
  }, input.toolExecutor);

  // Transfer evidence refs from tool loop to worker contracts for cross-referencing.
  const evidenceIds = evidenceLedger.all().map((e) => e.id);
  const evidenceContext = evidenceLedger.all().slice(0, 8).map((e) => ({
    id: e.id,
    summary: e.finding.slice(0, 400),
    toolClass: e.toolClass,
  }));
  const remainingMs = remainingRunTimeMs(runBudget);
  const contractsWithEvidence = workerContracts.map((wc) => ({
    ...wc,
    timeoutMs: remainingMs == null ? wc.timeoutMs : Math.min(wc.timeoutMs, remainingMs),
    originalGoal: task,
    evidenceRequirements: [...new Set([...wc.evidenceRequirements, ...evidenceIds])],
    evidenceContext,
  }));

  const executorResult = await runParallelWorkers(contractsWithEvidence, input.workerExecutor);
  for (const worker of executorResult.workerResults) {
    recordObservedUsage(runBudget, worker.inputTokens, worker.outputTokens, worker.estimatedCostUsd);
  }
  run = transitionState(run, "WORKER_INTEGRATION", `parallel executor: ${executorResult.status}`);

  // Update run workers with results
  const resultsMap = new Map<string, CortexUltraWorkerResult>();
  for (const wr of executorResult.workerResults) {
    resultsMap.set(wr.workerId, wr);
  }
  run = {
    ...run,
    workers: run.workers.map((w) => {
      const result = resultsMap.get(w.workerId);
      if (result) {
        return {
          ...w,
          status: result.claims.length > 0 ? "complete" : "failed",
          outputSummary: result.summary,
          modelId: result.modelId ?? w.modelId,
          providerId: result.providerId ?? w.providerId,
          failureReason: result.failureReason ?? w.failureReason,
          inputTokens: result.inputTokens ?? null,
          outputTokens: result.outputTokens ?? null,
          estimatedCostUsd: result.estimatedCostUsd ?? null,
          completedAt: new Date().toISOString(),
        };
      }
      return { ...w, status: "failed", failureReason: "no_result", completedAt: new Date().toISOString() };
    }),
  };

  // 5. Verify
  run = transitionState(run, "VERIFICATION");
  const evidenceItems = evidenceLedger.all();
  const evidenceIndex = evidenceLedger.index();

  const verifierOptions: CortexUltraVerifierOptions = {
    evidenceIndex,
    ...input.verifierOptions,
  };

  const verifierReport = await runUltraVerifier(
    task,
    executorResult.workerResults,
    verifierOptions
  );

  run = appendTimelineEvent(run, "verification_complete", verifierReport.verdict);

  // Add verifier result to run
  run = {
    ...run,
    verifierResults: [
      ...run.verifierResults,
      {
        verifierId: `v-${run.runId}`,
        runId: run.runId,
        role: "verifier",
        outcome: verifierReport.verdict === "pass"
          ? "pass"
          : verifierReport.verdict === "pass_with_warnings"
          ? "pass_with_warnings"
          : verifierReport.verdict === "needs_human_review"
          ? "fail_repairable"
          : "fail_terminal",
        score: verifierReport.acceptedClaims.length / Math.max(verifierReport.acceptedClaims.length + verifierReport.rejectedClaims.length, 1),
        warnings: verifierReport.warnings,
        failureReasons: verifierReport.rejectedClaims.map((c) => c.reasons.join(", ")),
        modelId: null,
        completedAt: new Date().toISOString(),
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
      },
    ],
  };

  // 6. Synthesize
  run = transitionState(run, "SYNTHESIS");
  const synthesizerInput: CortexUltraSynthesizerInput = {
    task,
    workerResults: executorResult.workerResults,
    verifierReports: [verifierReport],
    evidenceIndex,
  };
  const synthesisResult = await runUltraSynthesizer(synthesizerInput, input.finalVerification);

  run = {
    ...run,
    synthesisResult: {
      synthesisId: `synth-${run.runId}`,
      runId: run.runId,
      modelId: null,
      output: synthesisResult.output,
      workerIdsIncluded: executorResult.workerResults.map((wr) => wr.workerId),
      evidenceIdsIncluded: synthesisResult.evidenceUsed,
      completedAt: new Date().toISOString(),
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
    },
  };

  // 7. Finalize
  run = transitionState(run, "FINAL_VERIFICATION", "synthesis complete");
  run = transitionState(
    run,
    synthesisResult.status === "degraded" ? "DEGRADED_COMPLETE" : "COMPLETE",
    "pipeline finished"
  );

  // 8. Build receipt
  const receipt = buildTeamReceipt(run, "summary");

  const limitations: string[] = [];
  if (executorResult.status !== "all_complete") {
    limitations.push(`executor_status:${executorResult.status}`);
  }
  if (verifierReport.verdict !== "pass") {
    limitations.push(`verifier:${verifierReport.verdict}`);
  }
  for (const l of synthesisResult.limitations) {
    limitations.push(`synthesis:${l}`);
  }
  for (const e of executorResult.errors) {
    limitations.push(`worker_error:${e.workerId}:${e.error}`);
  }
  for (const turn of toolTurns) {
    const adapterResult = turn.result?.rawOutput as Partial<ReadOnlyToolResult> | undefined;
    if (adapterResult?.grounded === false) {
      limitations.push(`tool_preview_setup_required:${turn.request.toolClass}`);
    }
  }

  return {
    answer: synthesisResult.output,
    receipt,
    run,
    timeline: run.timeline,
    evidence: { total: evidenceItems.length },
    evidenceSummary: evidenceLedger.summary(),
    workerResults: executorResult.workerResults,
    verifierReports: [verifierReport],
    synthesisResult,
    limitations,
  };
}

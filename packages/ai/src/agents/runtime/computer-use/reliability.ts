import type { ComputerAction, ComputerUseStep, PolicyDecision } from "./types";
import {
  getComputerUseRun,
  getComputerUseSteps,
  getComputerUseEvents,
  getComputerUseApprovals,
  resetComputerUseStore,
  createRun,
  addComputerUseStep,
  updateStepStatus,
  setComputerUseRunStatus,
} from "./store";

export interface ReliabilityMetrics {
  runId: string;
  taskCompletion: boolean;
  totalSteps: number;
  executedSteps: number;
  failedSteps: number;
  blockedSteps: number;
  approvedSteps: number;
  deniedSteps: number;
  verificationPassCount: number;
  verificationFailCount: number;
  recoveryCount: number;
  approvalCount: number;
  blockedCount: number;
  stepCount: number;
  durationMs: number | null;
  task: string;
  mode: string;
  status: string;
}

export function computeReliabilityMetrics(runId: string): ReliabilityMetrics {
  const run = getComputerUseRun(runId);
  const steps = getComputerUseSteps(runId);
  const events = getComputerUseEvents(runId);
  const approvals = getComputerUseApprovals(runId);

  const totalSteps = steps.length;
  const executedSteps = steps.filter((s) => s.status === "executed" || s.status === "verified").length;
  const failedSteps = steps.filter((s) => s.status === "failed").length;
  const blockedSteps = steps.filter((s) => s.status === "blocked").length;
  const approvedSteps = steps.filter((s) => s.status === "approved").length;
  const deniedSteps = approvals.filter((a) => a.decision === "denied").length;

  const verificationPassCount = events.filter((e) => e.type === "verification.passed").length;
  const verificationFailCount = events.filter((e) => e.type === "verification.failed").length;
  const recoveryCount = events.filter((e) => e.type === "recovery.started").length;
  const approvalCount = approvals.length;
  const blockedCount = blockedSteps;

  const taskCompletion =
    run?.status === "complete" || run?.resultStatus === "success";

  const durationMs = run?.startedAt && run?.completedAt
    ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
    : null;

  return {
    runId,
    taskCompletion,
    totalSteps,
    executedSteps,
    failedSteps,
    blockedSteps,
    approvedSteps,
    deniedSteps,
    verificationPassCount,
    verificationFailCount,
    recoveryCount,
    approvalCount,
    blockedCount,
    stepCount: totalSteps,
    durationMs,
    task: run?.task ?? "not provided",
    mode: run?.mode ?? "not provided",
    status: run?.status ?? "not provided",
  };
}

export interface ReliabilityScenarioStep {
  action: ComputerAction;
  expectedStatus: ComputerUseStep["status"];
  policyOutcome?: PolicyDecision["outcome"];
}

export interface ReliabilityScenario {
  task: string;
  steps: ReliabilityScenarioStep[];
  mode?: "browser" | "desktop";
}

export function runReliabilityScenario(scenario: ReliabilityScenario): ReliabilityMetrics {
  resetComputerUseStore();

  const run = createRun({
    userId: "reliability-test",
    title: scenario.task,
    task: scenario.task,
    mode: scenario.mode ?? "browser",
    provider: "playwright",
  });

  for (let i = 0; i < scenario.steps.length; i++) {
    const stepDef = scenario.steps[i];
    const step = addComputerUseStep(run.id, {
      runId: run.id,
      index: i,
      status: "proposed" as const,
      action: stepDef.action,
      startedAt: new Date().toISOString(),
    });

    if (stepDef.policyOutcome === "block") {
      updateStepStatus(step.id, "blocked", {
        policyDecision: { outcome: "block", reason: "Scenario policy block", riskLevel: "high" },
      });
    } else if (stepDef.expectedStatus === "approved") {
      updateStepStatus(step.id, "approved", {
        policyDecision: { outcome: "approval_required", reason: "Scenario approval required", riskLevel: "medium" },
      });
    } else if (stepDef.expectedStatus === "failed") {
      updateStepStatus(step.id, "failed", {
        result: { success: false, error: "Scenario simulated failure" },
      });
    } else {
      updateStepStatus(step.id, "verified", {
        result: { success: true },
      });
    }
  }

  const hasFailed = scenario.steps.some((s) => s.expectedStatus === "failed");
  const hasBlocked = scenario.steps.some((s) => s.policyOutcome === "block");
  if (hasBlocked) {
    setComputerUseRunStatus(run.id, "blocked");
  } else if (hasFailed) {
    setComputerUseRunStatus(run.id, "failed");
  } else {
    setComputerUseRunStatus(run.id, "complete");
  }

  return computeReliabilityMetrics(run.id);
}

export interface ReliabilityEvalResult {
  name: string;
  passed: boolean;
  detail: string;
}

export function runReliabilityEvals(): {
  passed: number;
  failed: number;
  results: ReliabilityEvalResult[];
} {
  const results: ReliabilityEvalResult[] = [];
  let passed = 0;
  let failed = 0;

  function evalCheck(name: string, condition: boolean, detail: string): void {
    results.push({ name, passed: condition, detail });
    if (condition) passed += 1;
    else failed += 1;
  }

  // ── Eval 1: Empty run produces zero metrics ─────────────────────────
  resetComputerUseStore();
  const emptyRun = createRun({
    userId: "reliability-test",
    title: "Empty Run",
    task: "No steps executed",
    mode: "browser",
    provider: "playwright",
  });
  const emptyMetrics = computeReliabilityMetrics(emptyRun.id);
  evalCheck(
    "empty_run_zero_metrics",
    emptyMetrics.totalSteps === 0 && emptyMetrics.stepCount === 0 && !emptyMetrics.taskCompletion,
    `Empty run has 0 steps, stepCount=0, taskCompletion=false`
  );

  // ── Eval 2: All-success scenario has high verification ratio ───────
  const allSuccess = runReliabilityScenario({
    task: "All success scenario",
    steps: [
      { action: { type: "navigate", url: "https://localhost:3000" }, expectedStatus: "verified" },
      { action: { type: "click", x: 100, y: 200 }, expectedStatus: "verified" },
      { action: { type: "screenshot" }, expectedStatus: "verified" },
    ],
  });
  evalCheck(
    "all_success_total_steps",
    allSuccess.totalSteps === 3,
    `All-success scenario has 3 total steps (got ${allSuccess.totalSteps})`
  );
  evalCheck(
    "all_success_executed",
    allSuccess.executedSteps === 3,
    `All-success scenario has 3 executed steps (got ${allSuccess.executedSteps})`
  );
  evalCheck(
    "all_success_task_completion",
    allSuccess.taskCompletion === true,
    `All-success scenario taskCompletion is true`
  );
  evalCheck(
    "all_success_no_failures",
    allSuccess.failedSteps === 0 && allSuccess.blockedSteps === 0,
    `All-success scenario has 0 failed and 0 blocked steps`
  );

  // ── Eval 3: Mixed success/failure reports correct counts ───────────
  const mixed = runReliabilityScenario({
    task: "Mixed success/failure scenario",
    steps: [
      { action: { type: "navigate", url: "https://localhost:3000" }, expectedStatus: "verified" },
      { action: { type: "click", x: 100, y: 200 }, expectedStatus: "failed" },
      { action: { type: "navigate", url: "https://localhost:3000/dashboard" }, expectedStatus: "verified" },
    ],
  });
  evalCheck(
    "mixed_executed_count",
    mixed.executedSteps === 2,
    `Mixed scenario has 2 executed steps (got ${mixed.executedSteps})`
  );
  evalCheck(
    "mixed_failed_count",
    mixed.failedSteps === 1,
    `Mixed scenario has 1 failed step (got ${mixed.failedSteps})`
  );
  evalCheck(
    "mixed_task_completion_false",
    mixed.taskCompletion === false,
    `Mixed scenario taskCompletion is false (run is failed)`
  );
  evalCheck(
    "mixed_status_failed",
    mixed.status === "failed",
    `Mixed scenario status is "failed" (got "${mixed.status}")`
  );

  // ── Eval 4: Policy-blocked scenario reports blocked counts ────────
  const blocked = runReliabilityScenario({
    task: "Policy-blocked scenario",
    steps: [
      { action: { type: "navigate", url: "https://localhost:3000" }, expectedStatus: "verified" },
      { action: { type: "navigate", url: "https://evil.com" }, expectedStatus: "blocked", policyOutcome: "block" },
    ],
  });
  evalCheck(
    "blocked_scenario_count",
    blocked.blockedCount === 1,
    `Policy-blocked scenario has blockedCount=1 (got ${blocked.blockedCount})`
  );
  evalCheck(
    "blocked_scenario_total",
    blocked.totalSteps === 2,
    `Policy-blocked scenario has 2 total steps (got ${blocked.totalSteps})`
  );
  evalCheck(
    "blocked_scenario_status",
    blocked.status === "blocked",
    `Policy-blocked scenario status is "blocked" (got "${blocked.status}")`
  );

  // ── Eval 5: Approval scenario reports approval counts ─────────────
  const approval = runReliabilityScenario({
    task: "Approval scenario",
    steps: [
      { action: { type: "navigate", url: "https://localhost:3000" }, expectedStatus: "verified" },
      { action: { type: "click", x: 400, y: 300, targetLabel: "Submit" }, expectedStatus: "approved" },
    ],
  });
  evalCheck(
    "approval_approved_count",
    approval.approvedSteps === 1,
    `Approval scenario has 1 approved step (got ${approval.approvedSteps})`
  );
  evalCheck(
    "approval_executed_count",
    approval.executedSteps === 1,
    `Approval scenario has 1 executed step (got ${approval.executedSteps})`
  );

  // ── Eval 6: Metrics fields are all present and typed correctly ─────
  const metrics = computeReliabilityMetrics(allSuccess.runId);
  evalCheck(
    "metrics_has_task",
    typeof metrics.task === "string" && metrics.task.length > 0,
    `Metrics.task is "${metrics.task}"`
  );
  evalCheck(
    "metrics_has_mode",
    typeof metrics.mode === "string" && metrics.mode.length > 0,
    `Metrics.mode is "${metrics.mode}"`
  );
  evalCheck(
    "metrics_has_status",
    typeof metrics.status === "string" && metrics.status.length > 0,
    `Metrics.status is "${metrics.status}"`
  );
  evalCheck(
    "metrics_duration_is_null_or_number",
    metrics.durationMs === null || typeof metrics.durationMs === "number",
    `Metrics.durationMs is ${metrics.durationMs === null ? "null" : typeof metrics.durationMs}`
  );
  evalCheck(
    "metrics_runId_present",
    typeof metrics.runId === "string" && metrics.runId.length > 0,
    `Metrics.runId is "${metrics.runId}"`
  );

  return { passed, failed, results };
}

export function printReliabilityEvalResults(results: ReliabilityEvalResult[]): void {
  for (const r of results) {
    if (r.passed) {
      console.log(`  PASS: ${r.name} — ${r.detail}`);
    } else {
      console.error(`  FAIL: ${r.name} — ${r.detail}`);
    }
  }
}

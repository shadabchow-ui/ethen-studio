import type { ComputerAction, ComputerUseRunStatus } from "./types";
import {
  getComputerUseRun,
  addComputerUseStep,
  addComputerUseEvent,
  setComputerUseRunStatus,
  getComputerUseSteps,
  getComputerUseScreenshots,
  getComputerUseEvents,
  getNowIso,
  requestApproval,
  updateStepStatus,
} from "./store";
import { createMockBrowserSession } from "./actions";
import type { BrowserSession } from "./actions";
import { evaluateComputerUseAction } from "./policy";
import { executeComputerAction } from "./actions";
import { detectStuckLoop, resetActionAttempt, incrementActionAttempt } from "./agent-loop/stuck-detector";
import { executeRecoveryStep } from "./agent-loop/recovery";
import { createRecoveryState, type RecoveryState } from "./agent-loop/types";

export interface DeterministicLoopResult {
  stepsExecuted: number;
  completed: boolean;
  status: string;
  recoveryAttempts?: number;
  recoveryExhausted?: boolean;
}

type StepExecutionOutcome =
  | "executed"
  | "failed"
  | "approval_needed"
  | "blocked";

interface StepExecutionResult {
  outcome: StepExecutionOutcome;
  success: boolean;
}

const NON_STARTABLE_LOOP_STATUSES: Set<ComputerUseRunStatus> = new Set([
  "paused",
  "approval_needed",
  "takeover",
  "blocked",
  "failed",
  "complete",
  "cancelled",
  "timed_out",
]);

const NON_COMPLETABLE_LOOP_STATUSES: Set<ComputerUseRunStatus> = new Set([
  "paused",
  "approval_needed",
  "takeover",
  "blocked",
  "failed",
  "complete",
  "cancelled",
  "timed_out",
]);

export const DETERMINISTIC_STEPS: ComputerAction[] = [
  { type: "screenshot" },
  { type: "navigate", url: "http://localhost:3000" },
  { type: "screenshot" },
  { type: "click", x: 400, y: 300, targetLabel: "Explore" },
  { type: "screenshot" },
  { type: "scroll", direction: "down", amount: 200 },
  { type: "screenshot" },
  { type: "inspectDom" },
  { type: "wait", ms: 500 },
  { type: "screenshot" },
];

export function shouldContinue(
  stepIndex: number,
  maxSteps: number,
  runStatus: string,
  policyOutcome?: string,
): boolean {
  if (stepIndex >= maxSteps) return false;

  const terminalStatuses = new Set([
    "complete",
    "failed",
    "cancelled",
    "timed_out",
    "blocked",
    "paused",
    "takeover",
    "approval_needed",
  ]);
  if (terminalStatuses.has(runStatus)) return false;

  if (policyOutcome === "block") return false;

  return true;
}

async function executeStep(
  session: BrowserSession,
  runId: string,
  step: ComputerAction,
  stepIndex: number,
): Promise<StepExecutionResult> {
  const run = getComputerUseRun(runId);
  if (!run) {
    return { outcome: "failed", success: false };
  }

  const storedStep = addComputerUseStep(runId, {
    runId,
    index: stepIndex,
    status: "proposed",
    action: step,
    startedAt: getNowIso(),
  });

  addComputerUseEvent(runId, {
    runId,
    type: "action.proposed",
    timestamp: getNowIso(),
    actor: "agent",
    stepId: storedStep.id,
    action: step,
    metadata: {
      phase: "loop.started",
      source: "deterministic_loop",
      stepIndex,
    },
  });

  const policyEval = evaluateComputerUseAction(step, run);

  if (policyEval.decision.outcome === "block") {
    updateStepStatus(storedStep.id, "blocked", {
      policyDecision: policyEval.decision,
    });
    setComputerUseRunStatus(runId, "blocked");

    addComputerUseEvent(runId, {
      runId,
      type: policyEval.eventType,
      timestamp: getNowIso(),
      actor: "policy",
      stepId: storedStep.id,
      action: step,
      policyDecision: policyEval.decision,
      metadata: { reason: policyEval.decision.reason, stepIndex },
    });

    return { outcome: "blocked", success: false };
  }

  if (policyEval.eventType === "policy.approval_required") {
    addComputerUseEvent(runId, {
      runId,
      type: "policy.approval_required",
      timestamp: getNowIso(),
      actor: "runtime",
      stepId: storedStep.id,
      action: step,
      metadata: { reason: policyEval.decision.reason, stepIndex },
    });

    requestApproval({
      runId,
      stepId: storedStep.id,
      action: step,
      riskLevel: policyEval.decision.riskLevel,
      reason: policyEval.decision.reason,
    });

    addComputerUseEvent(runId, {
      runId,
      type: "user.paused",
      timestamp: getNowIso(),
      actor: "runtime",
      metadata: { reason: "approval_required during deterministic loop" },
    });

    return { outcome: "approval_needed", success: false };
  }

  addComputerUseEvent(runId, {
    runId,
    type: "policy.allowed",
    timestamp: getNowIso(),
    actor: "policy",
    stepId: storedStep.id,
    action: step,
    metadata: { reason: policyEval.decision.reason },
  });

  try {
    const result = await executeComputerAction({
      action: step,
      runId,
      session,
    });

    addComputerUseEvent(runId, {
      runId,
      type: "action.executed",
      timestamp: getNowIso(),
      actor: "runtime",
      stepId: storedStep.id,
      action: step,
      result: result.actionResult,
      metadata: { stepIndex },
    });

      return {
        outcome: result.success ? "executed" : "failed",
        success: result.success,
      };
  } catch (err) {
    addComputerUseEvent(runId, {
      runId,
      type: "action.failed",
      timestamp: getNowIso(),
      actor: "runtime",
      stepId: storedStep.id,
      action: step,
      metadata: { error: err instanceof Error ? err.message : "Unknown error" },
    });

    return { outcome: "failed", success: false };
  }
}

export interface RunDeterministicLoopOptions {
  maxSteps?: number;
  maxRecoveryAttempts?: number;
  maxRetriesPerAction?: number;
}

export async function runDeterministicLoop(
  runId: string,
  maxSteps: number,
  options?: RunDeterministicLoopOptions,
): Promise<DeterministicLoopResult> {
  const run = getComputerUseRun(runId);
  if (!run) {
    return { stepsExecuted: 0, completed: false, status: "failed" };
  }

  if (NON_STARTABLE_LOOP_STATUSES.has(run.status)) {
    return {
      stepsExecuted: 0,
      completed: run.status === "complete",
      status: run.status,
      recoveryAttempts: 0,
      recoveryExhausted: false,
    };
  }

  const maxRecoveryAttempts = options?.maxRecoveryAttempts ?? 5;
  const maxRetriesPerAction = options?.maxRetriesPerAction ?? 3;

  setComputerUseRunStatus(runId, "running");

  addComputerUseEvent(runId, {
    runId,
    type: "run.started",
    timestamp: getNowIso(),
    actor: "system",
    metadata: {
      phase: "loop.started",
      source: "deterministic_loop",
      maxSteps,
      maxRecoveryAttempts,
      maxRetriesPerAction,
    },
  });

  const session = createMockBrowserSession(runId, "http://localhost:3000");
  let stepsExecuted = 0;
  let recoveryState = createRecoveryState(maxRecoveryAttempts, maxRetriesPerAction);
  let recoveryExhausted = false;
  let encounteredFailure = false;
  let encounteredPolicyBlock = false;

  let planIndex = 0;

  while (planIndex < DETERMINISTIC_STEPS.length && stepsExecuted < maxSteps) {
    const currentRun = getComputerUseRun(runId);
    if (!shouldContinue(stepsExecuted, maxSteps, currentRun?.status ?? "running")) {
      break;
    }

    // ── Stuck-loop detection before each action ──────────────────────
    const allSteps = getComputerUseSteps(runId);
    const screenshots = getComputerUseScreenshots(runId);
    const events = getComputerUseEvents(runId);

    const budgetExhausted = stepsExecuted >= maxSteps;
    const blockedByPolicy = currentRun?.status === "blocked";

    const detectionResult = detectStuckLoop({
      steps: allSteps,
      screenshots,
      events,
      recoveryState,
      budgetExhausted,
      blockedByPolicy,
      approvalNeeded: false,
    });

    if (detectionResult.isStuck) {
      const recoveryCtx = {
        runId,
        recoveryState,
        detectionResult,
        lastAction: allSteps.length > 0 ? allSteps[allSteps.length - 1].action : null,
      };

      const recoveryResult = executeRecoveryStep(recoveryCtx);
      recoveryState = recoveryResult.updatedRecoveryState;

      // Pause if recovery asks to
      if (recoveryResult.shouldPause) {
        setComputerUseRunStatus(runId, "paused");
        addComputerUseEvent(runId, {
          runId,
          type: "user.paused",
          timestamp: getNowIso(),
          actor: "runtime",
          metadata: {
            reason: recoveryResult.pauseReason,
            recoveryAttempt: recoveryState.recoveryAttempts,
            source: "recovery.ask_user",
          },
        });
        break;
      }

      // Fail if recovery exhausted
      if (recoveryResult.exhaustionReason) {
        setComputerUseRunStatus(runId, "failed");
        addComputerUseEvent(runId, {
          runId,
          type: "run.failed",
          timestamp: getNowIso(),
          actor: "runtime",
          metadata: {
            recoveryAttempts: recoveryState.recoveryAttempts,
            exhaustionReason: recoveryResult.exhaustionReason,
            source: "recovery.exhausted",
          },
        });
        recoveryExhausted = true;
        break;
      }

      // Execute recovery action if available
      if (recoveryResult.recoveryAction) {
        setComputerUseRunStatus(runId, "recovering");

        const recAction = recoveryResult.recoveryAction;
        addComputerUseEvent(runId, {
          runId,
          type: "action.proposed",
          timestamp: getNowIso(),
          actor: "agent",
          action: recAction,
          metadata: {
            stepIndex: stepsExecuted,
            source: "recovery",
            recoveryStep: recoveryResult.recoveryStep,
          },
        });

        const recoveryStepResult = await executeStep(session, runId, recAction, stepsExecuted);

        if (recoveryStepResult.outcome === "executed") {
          stepsExecuted++;
          setComputerUseRunStatus(runId, "running");
          continue; // check stuck detection again before moving on
        }

        if (recoveryStepResult.outcome === "blocked") {
          encounteredPolicyBlock = true;
          break;
        }

        if (recoveryStepResult.outcome === "approval_needed") {
          break;
        }

        encounteredFailure = true;
        setComputerUseRunStatus(runId, "failed");
        addComputerUseEvent(runId, {
          runId,
          type: "run.failed",
          timestamp: getNowIso(),
          actor: "runtime",
          metadata: {
            source: "recovery.action_failed",
            recoveryStep: recoveryResult.recoveryStep,
          },
        });
        break;

      }

      // No specific recovery action — continue loop
      continue;
    }

    // ── Normal step execution ────────────────────────────────────────
    const step = DETERMINISTIC_STEPS[planIndex];
    const stepResult = await executeStep(session, runId, step, stepsExecuted);

    // Track action attempts for stuck detection
    if (stepResult.success) {
      recoveryState = resetActionAttempt(recoveryState);
    } else {
      recoveryState = incrementActionAttempt(recoveryState);
    }

    if (stepResult.outcome === "executed") {
      stepsExecuted++;
      planIndex++;
    } else if (stepResult.outcome === "approval_needed") {
      break;
    } else if (stepResult.outcome === "blocked") {
      encounteredPolicyBlock = true;
      break;
    } else {
      encounteredFailure = true;
      setComputerUseRunStatus(runId, "failed");
      addComputerUseEvent(runId, {
        runId,
        type: "run.failed",
        timestamp: getNowIso(),
        actor: "runtime",
          metadata: {
            source: "deterministic_loop",
            failedAction: step.type,
            stepIndex: stepsExecuted,
          },
        });
        break;
      }

    const updatedRun = getComputerUseRun(runId);
    if (updatedRun?.status === "approval_needed") {
      break;
    }
  }

  const finalRun = getComputerUseRun(runId);
  const finalStatus = finalRun?.status ?? "failed";
  const planCompleted = planIndex >= DETERMINISTIC_STEPS.length;
  const completed = planCompleted
    && !recoveryExhausted
    && !encounteredFailure
    && !encounteredPolicyBlock
    && !NON_COMPLETABLE_LOOP_STATUSES.has(finalStatus);

  if (completed) {
    setComputerUseRunStatus(runId, "complete");

    addComputerUseEvent(runId, {
      runId,
      type: "run.completed",
      timestamp: getNowIso(),
      actor: "runtime",
      metadata: {
        stepsExecuted,
        maxSteps,
        recoveryAttempts: recoveryState.recoveryAttempts,
        source: "deterministic_loop",
      },
    });
  }

  return {
    stepsExecuted,
    completed,
    status: completed ? "complete" : finalStatus,
    recoveryAttempts: recoveryState.recoveryAttempts,
    recoveryExhausted,
  };
}

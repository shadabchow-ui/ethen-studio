import type {
  ComputerAction,
  ComputerUseRun,
} from "../types";
import {
  addComputerUseEvent,
  getNowIso,
} from "../store";
import type {
  RecoveryStep,
  RecoveryState,
  StuckDetectionResult,
  RECOVERY_STEP_LABELS,
} from "./types";
import { RECOVERY_STEP_LABELS as labels } from "./types";

export interface RecoveryContext {
  runId: string;
  recoveryState: RecoveryState;
  detectionResult: StuckDetectionResult;
  lastAction: ComputerAction | null;
}

export interface RecoveryExecutionResult {
  success: boolean;
  recoveryAction: ComputerAction | null;
  recoveryDescription: string;
  recoveryStep: RecoveryStep;
  updatedRecoveryState: RecoveryState;
  shouldPause: boolean;
  pauseReason: string | null;
  exhaustionReason: string | null;
}

function emitRecoveryEvent(
  runId: string,
  recoveryState: RecoveryState,
  step: RecoveryStep,
  reason: string,
): void {
  addComputerUseEvent(runId, {
    runId,
    type: "recovery.started",
    timestamp: getNowIso(),
    actor: "runtime",
    metadata: {
      recoveryStep: step,
      recoveryLabel: labels[step],
      reason,
      recoveryAttempt: recoveryState.recoveryAttempts + 1,
      maxRecoveryAttempts: recoveryState.maxRecoveryAttempts,
    },
  });
}

export function executeRecoveryStep(ctx: RecoveryContext): RecoveryExecutionResult {
  const { runId, recoveryState, detectionResult, lastAction } = ctx;
  const step = detectionResult.recoverySuggested;

  const addToHistory = (s: RecoveryStep, reason: string): RecoveryState => ({
    ...recoveryState,
    recoveryAttempts: recoveryState.recoveryAttempts + 1,
    lastRecoveryStep: s,
    ladderHistory: [
      ...recoveryState.ladderHistory,
      { step: s, timestamp: getNowIso(), reason },
    ],
  });

  const baseSuccess = (s: RecoveryStep, reason: string): RecoveryState => {
    emitRecoveryEvent(runId, recoveryState, s, reason);
    return addToHistory(s, reason);
  };

  // 1. observe_again
  if (step === "observe_again") {
    const state = baseSuccess(step, "Re-observing current page state");
    return {
      success: true,
      recoveryAction: { type: "screenshot" },
      recoveryDescription: labels[step],
      recoveryStep: step,
      updatedRecoveryState: state,
      shouldPause: false,
      pauseReason: null,
      exhaustionReason: null,
    };
  }

  // 2. wait_for_stability
  if (step === "wait_for_stability") {
    const state = baseSuccess(step, "Waiting for page stability before re-observing");
    return {
      success: true,
      recoveryAction: { type: "wait", ms: 2000 },
      recoveryDescription: labels[step],
      recoveryStep: step,
      updatedRecoveryState: state,
      shouldPause: false,
      pauseReason: null,
      exhaustionReason: null,
    };
  }

  // 3. inspect_dom
  if (step === "inspect_dom") {
    const reason = "DOM/accessibility inspection not available in current environment — escalating";
    const state = baseSuccess(step, reason);
    return {
      success: true,
      recoveryAction: { type: "inspectDom" },
      recoveryDescription: `${labels[step]} (limited — DOM snapshots not available)`,
      recoveryStep: step,
      updatedRecoveryState: state,
      shouldPause: false,
      pauseReason: null,
      exhaustionReason: null,
    };
  }

  // 4. try_alternate_action
  if (step === "try_alternate_action") {
    const alternate = deriveAlternateAction(lastAction);
    const state = baseSuccess(step, alternate
      ? `Trying alternate action: ${alternate.type}`
      : "No viable alternate action available — escalating");
    return {
      success: true,
      recoveryAction: alternate,
      recoveryDescription: alternate
        ? `${labels[step]}: ${alternate.type}${alternate.targetLabel ? ` on "${alternate.targetLabel}"` : ""}`
        : `${labels[step]} — no alternate available, will replan`,
      recoveryStep: step,
      updatedRecoveryState: state,
      shouldPause: false,
      pauseReason: null,
      exhaustionReason: null,
    };
  }

  // 5. retry_with_adjustment
  if (step === "retry_with_adjustment") {
    const adjusted = deriveAdjustedRetry(lastAction);
    const state = baseSuccess(step, adjusted
      ? `Retrying with adjusted action: ${describeAdjustment(adjusted, lastAction)}`
      : "No adjustment possible — escalating");
    return {
      success: true,
      recoveryAction: adjusted ?? lastAction,
      recoveryDescription: adjusted
        ? `${labels[step]}: ${describeAdjustment(adjusted, lastAction)}`
        : `${labels[step]}: retry same action`,
      recoveryStep: step,
      updatedRecoveryState: {
        ...state,
        currentActionAttempts: recoveryState.currentActionAttempts + 1,
      },
      shouldPause: false,
      pauseReason: null,
      exhaustionReason: null,
    };
  }

  // 6. replan
  if (step === "replan") {
    const state = baseSuccess(step, "Re-planning step using deterministic alternate");
    const replanned = deriveReplannedAction(lastAction);
    return {
      success: true,
      recoveryAction: replanned,
      recoveryDescription: replanned
        ? `${labels[step]}: trying ${replanned.type} instead`
        : `${labels[step]} — no plan available, will ask user`,
      recoveryStep: step,
      updatedRecoveryState: state,
      shouldPause: false,
      pauseReason: null,
      exhaustionReason: null,
    };
  }

  // 7. ask_user
  if (step === "ask_user") {
    const reason = `Pausing run for user intervention: ${detectionResult.reason}`;
    const state = baseSuccess(step, reason);
    return {
      success: true,
      recoveryAction: null,
      recoveryDescription: labels[step],
      recoveryStep: step,
      updatedRecoveryState: state,
      shouldPause: true,
      pauseReason: detectionResult.reason,
      exhaustionReason: null,
    };
  }

  // 8. fail_with_report
  if (step === "fail_with_report") {
    const reason = recoveryState.exhaustionReason ?? detectionResult.reason;
    const state = baseSuccess(step, `Recovery exhausted: ${reason}`);
    return {
      success: false,
      recoveryAction: { type: "fail", reason: `Recovery exhausted after ${recoveryState.recoveryAttempts + 1} attempts: ${reason}` },
      recoveryDescription: `${labels[step]}: ${reason}`,
      recoveryStep: step,
      updatedRecoveryState: {
        ...state,
        exhaustionReason: reason,
      },
      shouldPause: false,
      pauseReason: null,
      exhaustionReason: reason,
    };
  }

  return {
    success: false,
    recoveryAction: null,
    recoveryDescription: `Unknown recovery step: ${step}`,
    recoveryStep: step,
    updatedRecoveryState: recoveryState,
    shouldPause: false,
    pauseReason: null,
    exhaustionReason: null,
  };
}

// ── Alternate / Adjusted / Replanned action derivation ───────────────────

function deriveAlternateAction(lastAction: ComputerAction | null): ComputerAction | null {
  if (!lastAction) return null;
  switch (lastAction.type) {
    case "click": case "dom_click": case "double_click":
      return { type: "inspectDom" };
    case "scroll":
      return { type: "scroll", direction: lastAction.direction === "down" ? "up" : "down", amount: lastAction.amount ?? 300 };
    case "type": case "dom_type":
      return { type: "screenshot" };
    case "navigate":
      return { type: "wait", ms: 3000 };
    case "pressKey": case "key":
      return { type: "screenshot" };
    case "wait":
      return { type: "screenshot" };
    case "screenshot":
      return { type: "inspectDom" };
    case "inspectDom":
      return { type: "screenshot" };
    default:
      return { type: "screenshot" };
  }
}

function deriveAdjustedRetry(lastAction: ComputerAction | null): ComputerAction | null {
  if (!lastAction) return null;
  switch (lastAction.type) {
    case "click": case "dom_click":
      if (lastAction.x !== undefined && lastAction.y !== undefined) {
        return { type: "click", x: lastAction.x + 10, y: lastAction.y + 5, button: lastAction.button ?? "left", targetLabel: lastAction.targetLabel };
      }
      return null;
    case "scroll":
      return { type: "scroll", direction: lastAction.direction ?? "down", amount: (lastAction.amount ?? 300) + 100 };
    default:
      return null;
  }
}

function describeAdjustment(adjusted: ComputerAction, original: ComputerAction | null): string {
  if (!original) return `New action: ${adjusted.type}`;
  switch (adjusted.type) {
    case "click":
      return `Click adjusted to (${adjusted.x},${adjusted.y}) from (${original.x},${original.y})`;
    case "scroll":
      return `Scroll increased to ${adjusted.amount}px from ${original.amount ?? 300}px`;
    default:
      return `Switched from ${original.type} to ${adjusted.type}`;
  }
}

function deriveReplannedAction(lastAction: ComputerAction | null): ComputerAction | null {
  if (!lastAction) return null;
  switch (lastAction.type) {
    case "click": case "dom_click": case "double_click":
    case "scroll":
    case "type": case "dom_type":
    case "navigate":
      return { type: "screenshot" };
    case "screenshot":
      return { type: "inspectDom" };
    case "inspectDom":
      return { type: "wait", ms: 3000 };
    case "wait":
      return { type: "inspectDom" };
    default:
      return { type: "screenshot" };
  }
}

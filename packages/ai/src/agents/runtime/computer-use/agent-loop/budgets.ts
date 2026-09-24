import type { AgentLoopBudget } from "./types";
import type { ComputerAction } from "../types";

export interface BudgetStatus {
  withinBudget: boolean;
  reason?: string;
  stepsUsed: number;
  stepsMax: number;
  failuresCount: number;
  repeatedActionCount: number;
  elapsedMs: number;
  maxDurationMs: number;
}

export interface BudgetTracker {
  stepsUsed: number;
  failuresCount: number;
  recentActions: string[];
  startedAt: number;
}

export function createBudgetTracker(): BudgetTracker {
  return {
    stepsUsed: 0,
    failuresCount: 0,
    recentActions: [],
    startedAt: Date.now(),
  };
}

export function recordAction(tracker: BudgetTracker, action: ComputerAction): void {
  tracker.stepsUsed += 1;
  tracker.recentActions.push(JSON.stringify({ type: action.type, url: action.url }));
  if (tracker.recentActions.length > 20) {
    tracker.recentActions = tracker.recentActions.slice(-20);
  }
}

export function recordFailure(tracker: BudgetTracker): void {
  tracker.failuresCount += 1;
}

export function countRepeatedSameAction(tracker: BudgetTracker): number {
  if (tracker.recentActions.length < 2) return 0;

  const last = tracker.recentActions[tracker.recentActions.length - 1];
  let count = 0;
  for (let i = tracker.recentActions.length - 1; i >= 0; i--) {
    if (tracker.recentActions[i] === last) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export function validateBudget(
  tracker: BudgetTracker,
  budget: AgentLoopBudget,
): BudgetStatus {
  const elapsedMs = Date.now() - tracker.startedAt;
  const repeatedActionCount = countRepeatedSameAction(tracker);

  if (tracker.stepsUsed >= budget.maxSteps) {
    return {
      withinBudget: false,
      reason: `Step budget exhausted: ${tracker.stepsUsed}/${budget.maxSteps} steps used`,
      stepsUsed: tracker.stepsUsed,
      stepsMax: budget.maxSteps,
      failuresCount: tracker.failuresCount,
      repeatedActionCount,
      elapsedMs,
      maxDurationMs: budget.maxDurationMs,
    };
  }

  if (elapsedMs >= budget.maxDurationMs) {
    return {
      withinBudget: false,
      reason: `Duration budget exhausted: ${elapsedMs}ms elapsed (limit ${budget.maxDurationMs}ms)`,
      stepsUsed: tracker.stepsUsed,
      stepsMax: budget.maxSteps,
      failuresCount: tracker.failuresCount,
      repeatedActionCount,
      elapsedMs,
      maxDurationMs: budget.maxDurationMs,
    };
  }

  if (tracker.failuresCount >= budget.maxRepeatedFailures) {
    return {
      withinBudget: false,
      reason: `Repeated failure budget exhausted: ${tracker.failuresCount} failures (limit ${budget.maxRepeatedFailures})`,
      stepsUsed: tracker.stepsUsed,
      stepsMax: budget.maxSteps,
      failuresCount: tracker.failuresCount,
      repeatedActionCount,
      elapsedMs,
      maxDurationMs: budget.maxDurationMs,
    };
  }

  if (repeatedActionCount >= budget.maxRepeatedSameAction) {
    return {
      withinBudget: false,
      reason: `Repeated same action budget exhausted: ${repeatedActionCount} repetitions (limit ${budget.maxRepeatedSameAction})`,
      stepsUsed: tracker.stepsUsed,
      stepsMax: budget.maxSteps,
      failuresCount: tracker.failuresCount,
      repeatedActionCount,
      elapsedMs,
      maxDurationMs: budget.maxDurationMs,
    };
  }

  return {
    withinBudget: true,
    stepsUsed: tracker.stepsUsed,
    stepsMax: budget.maxSteps,
    failuresCount: tracker.failuresCount,
    repeatedActionCount,
    elapsedMs,
    maxDurationMs: budget.maxDurationMs,
  };
}

export function isBudgetExceeded(status: BudgetStatus): boolean {
  return !status.withinBudget;
}

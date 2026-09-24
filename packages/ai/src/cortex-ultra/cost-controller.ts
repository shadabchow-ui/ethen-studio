/** Run-owned budget controls. This module intentionally has no mutable singleton state. */
export type CostEnforcementStatus = "enforced" | "unknown" | "not_available";

export interface UltraRunBudget {
  readonly startedAtMs: number;
  readonly deadlineAtMs: number | null;
  readonly maxTools: number | null;
  readonly maxTokens: number | null;
  readonly maxCostUsd: number | null;
  toolsUsed: number;
  inputTokens: number;
  outputTokens: number;
  observedCostUsd: number | null;
  costStatus: CostEnforcementStatus;
  stoppedReason: string | null;
}

export function createUltraRunBudget(options: { timeLimitMs?: number; maxTools?: number; maxTokens?: number; maxCostUsd?: number; nowMs?: number } = {}): UltraRunBudget {
  const startedAtMs = options.nowMs ?? Date.now();
  return { startedAtMs, deadlineAtMs: options.timeLimitMs && options.timeLimitMs > 0 ? startedAtMs + options.timeLimitMs : null, maxTools: options.maxTools ?? null, maxTokens: options.maxTokens ?? null, maxCostUsd: options.maxCostUsd ?? null, toolsUsed: 0, inputTokens: 0, outputTokens: 0, observedCostUsd: null, costStatus: options.maxCostUsd == null ? "not_available" : "unknown", stoppedReason: null };
}

export function remainingRunTimeMs(budget: UltraRunBudget, nowMs = Date.now()): number | null {
  return budget.deadlineAtMs == null ? null : Math.max(0, budget.deadlineAtMs - nowMs);
}

export function canContinueRun(budget: UltraRunBudget, nowMs = Date.now()): boolean {
  if (budget.stoppedReason) return false;
  if (remainingRunTimeMs(budget, nowMs) === 0) budget.stoppedReason = "Run deadline reached.";
  else if (budget.maxTools != null && budget.toolsUsed >= budget.maxTools) budget.stoppedReason = "Tool-call limit reached.";
  else if (budget.maxTokens != null && budget.inputTokens + budget.outputTokens >= budget.maxTokens) budget.stoppedReason = "Observed token budget reached.";
  else if (budget.maxCostUsd != null && budget.costStatus === "enforced" && (budget.observedCostUsd ?? 0) >= budget.maxCostUsd) budget.stoppedReason = "Observed cost ceiling reached.";
  return budget.stoppedReason == null;
}

export function recordToolUse(budget: UltraRunBudget): void { budget.toolsUsed += 1; }
export function recordObservedUsage(budget: UltraRunBudget, input?: number | null, output?: number | null, cost?: number | null): void {
  budget.inputTokens += input ?? 0; budget.outputTokens += output ?? 0;
  if (cost == null) { if (budget.maxCostUsd != null) budget.costStatus = "unknown"; return; }
  budget.observedCostUsd = (budget.observedCostUsd ?? 0) + cost; budget.costStatus = "enforced";
}

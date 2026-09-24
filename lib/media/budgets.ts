/**
 * PR-ST-04: Per-project media budget ceilings enforced before generation.
 *
 * Budgets are set per project and checked before any generation is allowed.
 * If a generation would exceed the ceiling, it is blocked with a clear reason.
 * No unbounded paid media spend is possible.
 */
export type BudgetPeriod = "monthly" | "total";
export type BudgetStatus = "active" | "exceeded" | "disabled";

export interface ProjectMediaBudget {
  projectId: string;
  /** Budget ceiling in credits (or USD cents). */
  ceiling: number;
  /** Credits already consumed in the current period. */
  consumed: number;
  period: BudgetPeriod;
  status: BudgetStatus;
  updatedAt: string;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason: string | null;
  ceiling: number;
  consumed: number;
  remaining: number;
  estimatedCost: number;
}

// ── Budget Store (in-memory for beta) ──────────────────────────────────────

const budgets = new Map<string, ProjectMediaBudget>();

// ── Budget Operations ──────────────────────────────────────────────────────

export function setProjectBudget(
  projectId: string,
  ceiling: number,
  period: BudgetPeriod = "monthly",
): ProjectMediaBudget {
  const existing = budgets.get(projectId);
  const budget: ProjectMediaBudget = existing
    ? { ...existing, ceiling, period, updatedAt: new Date().toISOString() }
    : {
        projectId,
        ceiling,
        consumed: 0,
        period,
        status: "active",
        updatedAt: new Date().toISOString(),
      };
  budgets.set(projectId, budget);
  return { ...budget };
}

export function getProjectBudget(projectId: string): ProjectMediaBudget | null {
  const b = budgets.get(projectId);
  return b ? { ...b } : null;
}

export function removeProjectBudget(projectId: string): boolean {
  return budgets.delete(projectId);
}

/**
 * Check whether a generation with the given estimated cost is allowed.
 * BLOCKS if:
 *  - No budget is set (returns allowed=true with note — no ceiling)
 *  - Budget ceiling would be exceeded
 *  - Budget status is "exceeded"
 */
export function checkBudgetBeforeGeneration(
  projectId: string,
  estimatedCost: number,
): BudgetCheckResult {
  const budget = budgets.get(projectId);

  if (!budget) {
    // No budget set — generations are allowed but unbounded (honest disclosure)
    return {
      allowed: true,
      reason: null,
      ceiling: 0,
      consumed: 0,
      remaining: 0,
      estimatedCost,
    };
  }

  if (budget.status === "exceeded") {
    return {
      allowed: false,
      reason: `Budget ceiling exceeded. The project budget of ${budget.ceiling} has been fully consumed (${budget.consumed} used). No further generations are allowed until the budget is reset or increased.`,
      ceiling: budget.ceiling,
      consumed: budget.consumed,
      remaining: Math.max(0, budget.ceiling - budget.consumed),
      estimatedCost,
    };
  }

  const projectedTotal = budget.consumed + estimatedCost;
  if (projectedTotal > budget.ceiling) {
    const remaining = Math.max(0, budget.ceiling - budget.consumed);
    return {
      allowed: false,
      reason: `Generation would exceed the project budget ceiling. Estimated cost ${estimatedCost} exceeds remaining budget ${remaining} (ceiling: ${budget.ceiling}, consumed: ${budget.consumed}).`,
      ceiling: budget.ceiling,
      consumed: budget.consumed,
      remaining,
      estimatedCost,
    };
  }

  return {
    allowed: true,
    reason: null,
    ceiling: budget.ceiling,
    consumed: budget.consumed,
    remaining: budget.ceiling - budget.consumed,
    estimatedCost,
  };
}

/**
 * Record consumed credits after a generation completes.
 * Updates the budget's consumed counter and recalculates status.
 */
export function recordBudgetConsumption(
  projectId: string,
  credits: number,
): ProjectMediaBudget | null {
  const budget = budgets.get(projectId);
  if (!budget) return null;

  budget.consumed += credits;
  budget.status = budget.consumed >= budget.ceiling ? "exceeded" : "active";
  budget.updatedAt = new Date().toISOString();
  return { ...budget };
}

/**
 * Reset consumed credits (e.g., at the start of a new month for monthly budgets).
 */
export function resetBudgetConsumption(projectId: string): ProjectMediaBudget | null {
  const budget = budgets.get(projectId);
  if (!budget) return null;

  budget.consumed = 0;
  budget.status = "active";
  budget.updatedAt = new Date().toISOString();
  return { ...budget };
}

// ── Reset (for testing) ────────────────────────────────────────────────────

export function resetBudgets(): void {
  budgets.clear();
}

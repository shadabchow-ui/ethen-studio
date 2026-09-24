/**
 * SP-10 — Budget enforcement with per-project ceilings.
 *
 * Prevents unauthorized or excessive execution when a project reaches its ceiling.
 */

import { getUnifiedLedgerSummary } from "./ledger";

export interface ProjectBudgetCeiling {
  projectId: string;
  maxCostUsd: number;
  period: "daily" | "monthly";
  enforced: boolean;
}

// Default project budget ceilings (can be overridden per project)
const projectBudgetsStore = new Map<string, ProjectBudgetCeiling>();

/** Set a budget ceiling for a specific project. */
export function setProjectBudgetCeiling(ceiling: ProjectBudgetCeiling): void {
  projectBudgetsStore.set(ceiling.projectId, ceiling);
}

/** Clear budget ceiling stores (for tests). */
export function clearProjectBudgets(): void {
  projectBudgetsStore.clear();
}

/** Get configured budget ceiling for a project. */
export function getProjectBudgetCeiling(projectId: string): ProjectBudgetCeiling | undefined {
  return projectBudgetsStore.get(projectId);
}

export interface BudgetEnforcementResult {
  allowed: boolean;
  code?: "BUDGET_CEILING_EXCEEDED" | "OK";
  error?: string;
  details?: {
    projectId: string;
    maxCostUsd: number;
    currentSpendUsd: number;
    proposedCostUsd: number;
    exceededByUsd: number;
  };
}

/**
 * Enforce project budget ceiling before executing a request or job.
 * Blocks execution if project total spend + proposed cost exceeds maxCostUsd ceiling.
 */
export function enforceProjectBudget(
  projectId: string,
  proposedCostUsd: number,
  overrideCurrentSpendUsd?: number,
): BudgetEnforcementResult {
  const budget = getProjectBudgetCeiling(projectId);

  // If no ceiling is configured or ceiling is not enforced, allow execution
  if (!budget || !budget.enforced) {
    return { allowed: true, code: "OK" };
  }

  // Determine current spend from unified ledger or override
  const currentSpendUsd =
    overrideCurrentSpendUsd ?? getUnifiedLedgerSummary({ projectId }).totalSpendUsd;

  const totalProjectedSpend = currentSpendUsd + proposedCostUsd;

  if (totalProjectedSpend > budget.maxCostUsd) {
    const exceededByUsd = totalProjectedSpend - budget.maxCostUsd;
    return {
      allowed: false,
      code: "BUDGET_CEILING_EXCEEDED",
      error: `Project '${projectId}' budget ceiling exceeded. Current: $${currentSpendUsd.toFixed(4)}, Proposed: $${proposedCostUsd.toFixed(4)}, Ceiling: $${budget.maxCostUsd.toFixed(4)}. Exceeded by $${exceededByUsd.toFixed(4)}.`,
      details: {
        projectId,
        maxCostUsd: budget.maxCostUsd,
        currentSpendUsd,
        proposedCostUsd,
        exceededByUsd,
      },
    };
  }

  return { allowed: true, code: "OK" };
}

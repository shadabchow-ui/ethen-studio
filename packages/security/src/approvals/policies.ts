import type { ToolId, PolicyDecision } from "@ethen/contracts/tools/types";
import { APPROVAL_RISK_TIER_LABELS } from "@ethen/contracts/tools/types";
import { resolveFailClosedPolicy, type FailClosedPolicyContext } from "@ethen/tools/approval-policy";
import type { EmployeeProfile } from "../employees/types";
import { isEmployeeReady } from "../employees/profiles";
import type { ApprovalRequest, CreateApprovalRequestInput } from "@ethen/contracts/approvals/types";
import { createApprovalRequest } from "./service";

export { resolveFailClosedPolicy };
export type { FailClosedPolicyContext, PolicyDecision };

/**
 * Build a fail-closed policy context from an employee profile and optional
 * budget / connected-app / credential state.
 */
export function buildPolicyContext(
  employee: EmployeeProfile,
  overrides?: {
    budgetExceeded?: boolean | null;
    connectedAppConfigured?: boolean | null;
    credentialsPresent?: boolean | null;
  },
): FailClosedPolicyContext {
  return {
    autonomyLevel: employee.autonomyLevel,
    employeeActive: employee.status === "active",
    profileComplete: isEmployeeReady(employee),
    budgetExceeded: overrides?.budgetExceeded ?? null,
    connectedAppConfigured: overrides?.connectedAppConfigured ?? null,
    credentialsPresent: overrides?.credentialsPresent ?? null,
  };
}

/**
 * Evaluate whether an employee can invoke a specific tool. This is the
 * primary fail-closed gate used before any tool execution.
 */
export function evaluateEmployeeToolAccess(
  employee: EmployeeProfile,
  toolId: ToolId,
  overrides?: {
    budgetExceeded?: boolean | null;
    connectedAppConfigured?: boolean | null;
    credentialsPresent?: boolean | null;
  },
): PolicyDecision {
  const context = buildPolicyContext(employee, overrides);
  return resolveFailClosedPolicy(toolId, context);
}

/**
 * Create an approval request for a blocked-by-tier action when an
 * escalation path exists.
 */
export function createEscalatedApprovalRequest(
  toolId: ToolId,
  employee: EmployeeProfile,
  decision: PolicyDecision,
  sessionId?: string | null,
  userId?: string | null,
): ApprovalRequest | null {
  if (decision.outcome !== "approval_required") return null;

  const tierLabel = APPROVAL_RISK_TIER_LABELS[decision.riskTier];

  const input: CreateApprovalRequestInput = {
    title: `Approval required: ${toolId}`,
    description: `Employee "${employee.name}" (${employee.role}, autonomy ${employee.autonomyLevel}) requests tool "${toolId}". Risk tier: ${tierLabel} (${decision.riskTier}).`,
    riskLevel: (() => {
      // Map risk tier back to ToolRiskLevel for the approval request
      switch (decision.riskTier) {
        case 0:
        case 1:
          return "read_only";
        case 2:
          return "writes_user_content";
        case 3:
          return "external_side_effect";
        case 4:
          return "destructive";
        case 5:
          return "privileged";
      }
    })(),
    proposedAction: toolId,
    affectedEntities: [employee.id, employee.businessProfileId],
    rationale: decision.reason,
    expectedEffect: `Execute tool "${toolId}" at risk tier ${decision.riskTier}.`,
    rollbackPath: null,
    sessionId: sessionId ?? null,
    userId: userId ?? employee.ownerUserId,
  };

  return createApprovalRequest(input);
}

/**
 * Determine if a given policy outcome is terminal (will never change
 * without external human or config intervention).
 */
export function isTerminalOutcome(outcome: PolicyDecision["outcome"]): boolean {
  return outcome === "block" || outcome === "over_budget" || outcome === "not_provided";
}

/**
 * Determine if a policy outcome is recoverable through setup changes.
 */
export function requiresSetup(outcome: PolicyDecision["outcome"]): boolean {
  return outcome === "setup_required";
}

/**
 * Determine if a policy outcome requires human approval.
 */
export function requiresHumanApproval(outcome: PolicyDecision["outcome"]): boolean {
  return outcome === "approval_required";
}

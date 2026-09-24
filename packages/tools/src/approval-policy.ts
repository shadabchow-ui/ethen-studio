import type {
  ApprovalRequirement,
  ApprovalRiskTier,
  ToolRiskLevel,
  ToolApprovalState,
  ToolDefinition,
  ToolId,
  PolicyOutcome,
  PolicyDecision,
} from "@ethen/contracts/tools/types";
import { toolRiskLevelToRiskTier } from "@ethen/contracts/tools/types";
import type { ApprovalProposal } from "@ethen/contracts/approvals/types";
import { getToolDefinition } from "./registry";
import { approvalRequirementForRiskLevel } from "@ethen/security/policies/risk-classification";

// ─── Default policy: risk level → approval requirement ────────────────────────
// APPROVAL-AUTHORITY-MERGE-01: the canonical classification is owned by
// lib/platform/policies/risk-classification.ts; getApprovalRequirement
// delegates to it so the dispatch gate and platform policy share one source
// of truth. Unknown risk levels are not in the map and resolve to "blocked".
const RISK_LEVEL_POLICY: Record<ToolRiskLevel, ApprovalRequirement> = {
  read_only: "no_approval",
  write: "confirm_once",         // legacy alias
  writes_user_content: "confirm_once",
  external_side_effect: "confirm_every_time",
  destructive: "confirm_every_time",
  privileged: "blocked",
};

/**
 * Return the approval requirement for a given risk level.
 * Defaults to "blocked" for any unrecognised level (fail-safe).
 * Delegates to the platform canonical classification.
 */
export function getApprovalRequirement(riskLevel: ToolRiskLevel): ApprovalRequirement {
  const platformRequirement = approvalRequirementForRiskLevel(riskLevel);
  // The tool-level map and the platform classification must agree; assert
  // alignment at runtime in dev so drift is caught immediately.
  const local = RISK_LEVEL_POLICY[riskLevel];
  return local === platformRequirement ? local : ("blocked" as ApprovalRequirement);
}

export interface ToolRunDecision {
  allowed: boolean;
  requiresApproval: boolean;
  blocked: boolean;
  approvalRequirement: ApprovalRequirement;
}

/**
 * Decide whether a tool can run, requires user approval, or must be blocked.
 * If the tool is disabled or its executionState is not "available", it is blocked.
 */
export function evaluateTool(tool: Pick<ToolDefinition, "riskLevel" | "executionState" | "approvalRequirement">): ToolRunDecision {
  if (tool.executionState !== "available") {
    return { allowed: false, requiresApproval: false, blocked: true, approvalRequirement: "blocked" };
  }

  const req = tool.approvalRequirement;

  switch (req) {
    case "no_approval":
      return { allowed: true, requiresApproval: false, blocked: false, approvalRequirement: req };
    case "confirm_once":
    case "confirm_every_time":
      return { allowed: false, requiresApproval: true, blocked: false, approvalRequirement: req };
    case "blocked":
      return { allowed: false, requiresApproval: false, blocked: true, approvalRequirement: req };
    default: {
      // Exhaustiveness guard — unknown requirement is fail-safe blocked.
      const _: never = req;
      void _;
      return { allowed: false, requiresApproval: false, blocked: true, approvalRequirement: "blocked" };
    }
  }
}

/**
 * Build a ToolApprovalState for storing in messages.metadata or usage_events.metadata.
 */
export function buildApprovalState(
  riskLevel: ToolRiskLevel,
  approved?: boolean,
  proposalId?: string | null,
): ToolApprovalState {
  return {
    riskLevel,
    approvalRequirement: getApprovalRequirement(riskLevel),
    approved,
    decidedAt: approved !== undefined ? new Date().toISOString() : undefined,
    proposalId: proposalId ?? null,
  };
}

// ─── Dispatcher gate ─────────────────────────────────────────────────────

/** Risk levels that must never execute without explicit user approval. */
const WRITE_RISK_LEVELS: Set<ToolRiskLevel> = new Set([
  "write",
  "writes_user_content",
  "external_side_effect",
  "destructive",
  "privileged",
]);

/**
 * Guard: returns true only when the tool may be safely invoked without
 * first obtaining an approved proposal. Write/destructive/privileged
 * tools always return false — they must go through the approval flow.
 */
export function canExecuteWithoutProposal(toolId: ToolId): boolean {
  const tool = getToolDefinition(toolId);
  if (!tool) return false;
  if (tool.executionState !== "available") return false;
  return !WRITE_RISK_LEVELS.has(tool.riskLevel);
}

/**
 * Guard: returns true only when the tool requires a proposal and the
 * proposal has been approved. This is the final execution check.
 */
export function canExecuteWithProposal(
  toolId: ToolId,
  proposal: ApprovalProposal | null,
): boolean {
  if (!proposal) return false;
  if (proposal.toolId !== toolId) return false;
  if (proposal.status !== "approved") return false;

  const tool = getToolDefinition(toolId);
  if (!tool) return false;
  if (tool.executionState !== "available") return false;

  return true;
}

/**
 * Determine whether execution should be blocked for a given tool and
 * optional proposal. Read-only tools are allowed; write tools are allowed
 * only with an approved proposal; privileged tools are always blocked.
 */
export function resolveExecutionGate(
  toolId: ToolId,
  proposal?: ApprovalProposal | null,
): { allowed: boolean; reason: string } {
  const tool = getToolDefinition(toolId);

  if (!tool) {
    return { allowed: false, reason: "Tool not found in registry." };
  }

  if (tool.executionState !== "available") {
    return {
      allowed: false,
      reason: `Tool execution state is "${tool.executionState}" — not available.`,
    };
  }

  const isWrite = WRITE_RISK_LEVELS.has(tool.riskLevel);

  if (!isWrite) {
    return { allowed: true, reason: "Read-only tool — no approval required." };
  }

  if (!proposal) {
    return {
      allowed: false,
      reason: `Tool "${toolId}" requires an approved proposal before execution. No proposal found.`,
    };
  }

  if (proposal.toolId !== toolId) {
    return {
      allowed: false,
      reason: `Proposal tool ID "${proposal.toolId}" does not match requested tool "${toolId}".`,
    };
  }

  if (proposal.status !== "approved") {
    return {
      allowed: false,
      reason: `Proposal status is "${proposal.status}" — must be "approved" to execute.`,
    };
  }

  return { allowed: true, reason: "Approved." };
}

// ─── Fail-Closed Policy Resolver ────────────────────────────────────────
// Integrates tool risk tiers, employee autonomy levels, tool execution
// state, and budget context into a deterministic policy decision.
// Unknown tools/actions/risks always block (fail-closed).

/** Context passed to the fail-closed policy resolver. */
export interface FailClosedPolicyContext {
  /** The employee's autonomy level (0-4). */
  autonomyLevel: number;
  /** Whether the employee is in an active status. */
  employeeActive: boolean;
  /** Whether the employee has a complete business profile. */
  profileComplete: boolean;
  /** Whether the budget has been exceeded. Null = no budget tracking. */
  budgetExceeded?: boolean | null;
  /** Whether the required connected app is configured. null = not applicable. */
  connectedAppConfigured?: boolean | null;
  /** Whether required credentials are present. null = not applicable. */
  credentialsPresent?: boolean | null;
}

/**
 * Fail-closed risk tier → policy outcome mapping for a given autonomy level.
 *
 * Tier 0 (informational): always allow at level 0+
 * Tier 1 (read_only): always allow at level 1+
 * Tier 2 (internal_write): allow at level 2+; approval required at level 1; block at level 0
 * Tier 3 (external_action): approval required at level 3+; block at level <=2
 * Tier 4 (sensitive/destructive): approval required at level 4 only; block below
 * Tier 5 (forbidden): always block
 */
function riskTierPolicyByAutonomy(
  tier: ApprovalRiskTier,
  autonomyLevel: number,
): { outcome: "allow" | "approval_required" | "block"; reason: string } {
  switch (tier) {
    case 0:
      return { outcome: "allow", reason: "Informational actions are always safe." };
    case 1:
      if (autonomyLevel >= 1) {
        return { outcome: "allow", reason: "Read-only actions allowed at autonomy level 1+." };
      }
      return {
        outcome: "block",
        reason: `Read-only actions require autonomy level 1+. Current level: ${autonomyLevel}.`,
      };
    case 2:
      if (autonomyLevel >= 2) {
        return { outcome: "allow", reason: "Internal writes allowed at autonomy level 2+." };
      }
      if (autonomyLevel === 1) {
        return {
          outcome: "approval_required",
          reason: "Internal writes require approval at autonomy level 1.",
        };
      }
      return {
        outcome: "block",
        reason: `Internal writes require autonomy level 1+. Current level: ${autonomyLevel}.`,
      };
    case 3:
      if (autonomyLevel >= 3) {
        return {
          outcome: "approval_required",
          reason: "External actions always require approval in MVP.",
        };
      }
      return {
        outcome: "block",
        reason: `External actions require autonomy level 3+. Current level: ${autonomyLevel}.`,
      };
    case 4:
      if (autonomyLevel >= 4) {
        return {
          outcome: "approval_required",
          reason: "Sensitive/destructive actions require explicit approval.",
        };
      }
      return {
        outcome: "block",
        reason: `Sensitive/destructive actions require autonomy level 4+. Current level: ${autonomyLevel}.`,
      };
    case 5:
      return { outcome: "block", reason: "Forbidden actions are always blocked." };
  }
}

/**
 * Map a policy outcome to the corresponding ApprovalRequirement for the
 * approval flow. When the outcome is "approval_required", the requirement
 * depends on the risk tier.
 */
function outcomeToApprovalRequirement(
  outcome: "allow" | "approval_required" | "block",
  tier: ApprovalRiskTier,
): ApprovalRequirement {
  if (outcome === "allow") return "no_approval";
  if (outcome === "block") return "blocked";
  if (tier >= 4) return "confirm_every_time";
  return "confirm_once";
}

/**
 * Resolve a fail-closed policy decision for a tool/action given the
 * employee and system context.
 *
 * Evaluation order:
 * 1. Tool exists in registry → else "not_provided" / block
 * 2. Tool execution state is available → else "setup_required" / block
 * 3. Employee is active → else "setup_required" / block
 * 4. Business profile is complete → else "setup_required" / block
 * 5. Connected app is configured (if required) → else "setup_required" / block
 * 6. Credentials are present (if required) → else "setup_required" / block
 * 7. Budget is within limits → else "over_budget" / block
 * 8. Autonomy level vs risk tier → allow / approval_required / block
 *
 * Unknown risk tiers and forbidden actions always block.
 */
export function resolveFailClosedPolicy(
  toolId: ToolId,
  context: FailClosedPolicyContext,
): PolicyDecision {
  const tool = getToolDefinition(toolId);

  if (!tool) {
    return {
      outcome: "not_provided",
      riskTier: 5,
      reason: `Tool "${toolId}" not found in registry.`,
      approvalRequirement: "blocked",
      allowed: false,
      blocked: true,
      requiresApproval: false,
    };
  }

  const tier = toolRiskLevelToRiskTier(tool.riskLevel);

  // Execution state check
  if (tool.executionState !== "available") {
    const stateLabel =
      tool.executionState === "contract_only" ? "contract only" : tool.executionState;
    return {
      outcome: "setup_required",
      riskTier: tier,
      reason: `Tool "${toolId}" is in "${stateLabel}" state — not available for execution.`,
      approvalRequirement: "blocked",
      allowed: false,
      blocked: true,
      requiresApproval: false,
    };
  }

  // Employee active check
  if (!context.employeeActive) {
    return {
      outcome: "setup_required",
      riskTier: tier,
      reason: "Employee is not in active status.",
      approvalRequirement: "blocked",
      allowed: false,
      blocked: true,
      requiresApproval: false,
    };
  }

  // Profile completeness check
  if (!context.profileComplete) {
    return {
      outcome: "setup_required",
      riskTier: tier,
      reason: "Business profile is incomplete.",
      approvalRequirement: "blocked",
      allowed: false,
      blocked: true,
      requiresApproval: false,
    };
  }

  // Connected app check
  if (context.connectedAppConfigured === false) {
    return {
      outcome: "setup_required",
      riskTier: tier,
      reason: "Required connected app is not configured.",
      approvalRequirement: "blocked",
      allowed: false,
      blocked: true,
      requiresApproval: false,
    };
  }

  // Credential check
  if (context.credentialsPresent === false) {
    return {
      outcome: "setup_required",
      riskTier: tier,
      reason: "Required credentials are not present.",
      approvalRequirement: "blocked",
      allowed: false,
      blocked: true,
      requiresApproval: false,
    };
  }

  // Budget check
  if (context.budgetExceeded === true) {
    return {
      outcome: "over_budget",
      riskTier: tier,
      reason: "Budget has been exceeded.",
      approvalRequirement: "blocked",
      allowed: false,
      blocked: true,
      requiresApproval: false,
    };
  }

  // Risk tier vs autonomy level check
  const { outcome, reason } = riskTierPolicyByAutonomy(tier, context.autonomyLevel);

  const blocked = outcome === "block";
  const requiresApproval = outcome === "approval_required";
  const allowed = outcome === "allow";
  const approvalRequirement = outcomeToApprovalRequirement(outcome, tier);

  const policyOutcome: PolicyOutcome = outcome;

  return {
    outcome: policyOutcome,
    riskTier: tier,
    reason,
    approvalRequirement,
    allowed,
    blocked,
    requiresApproval,
  };
}

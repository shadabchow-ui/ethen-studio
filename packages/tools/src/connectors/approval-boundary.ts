import type { ProposedAction, ConnectorActionMode } from "./mock-connector";
import {
  createApprovalRequest,
  getApprovalRequest,
  isApprovalRequired,
} from "@ethen/security/approvals/service";
import type { ToolRiskLevel } from "@ethen/contracts/tools/types";
import { recordAuditEvent } from "@ethen/security/audit/service";

const connectorRiskToToolRisk: Record<string, ToolRiskLevel> = {
  low: "read_only",
  medium: "writes_user_content",
  high: "external_side_effect",
  critical: "privileged",
};

export interface ConnectorApprovalCheckResult {
  approvalSatisfied: boolean;
  blockReason: string | null;
  approvalRequired: boolean;
  approvalRequestId: string | null;
}

export function isConnectorExecutionApprovalSatisfied(
  approvalRequestId: string | null,
): ConnectorApprovalCheckResult {
  if (!approvalRequestId) {
    return {
      approvalSatisfied: false,
      blockReason: "No approval request associated with this action.",
      approvalRequired: true,
      approvalRequestId: null,
    };
  }

  const request = getApprovalRequest(approvalRequestId);

  if (!request) {
    return {
      approvalSatisfied: false,
      blockReason: `Approval request "${approvalRequestId}" not found.`,
      approvalRequired: true,
      approvalRequestId,
    };
  }

  if (request.status === "approved") {
    return {
      approvalSatisfied: true,
      blockReason: null,
      approvalRequired: false,
      approvalRequestId: request.id,
    };
  }

  if (request.status === "blocked") {
    return {
      approvalSatisfied: false,
      blockReason: `Action is blocked by policy: ${request.riskLevel} risk.`,
      approvalRequired: false,
      approvalRequestId: request.id,
    };
  }

  if (request.status === "rejected" || request.status === "cancelled" || request.status === "expired") {
    return {
      approvalSatisfied: false,
      blockReason: `Approval request is in terminal status: ${request.status}.`,
      approvalRequired: true,
      approvalRequestId: request.id,
    };
  }

  return {
    approvalSatisfied: false,
    blockReason: `Approval request is "${request.status}" — not yet approved.`,
    approvalRequired: true,
    approvalRequestId: request.id,
  };
}

export interface ConnectorExecutionBlockReason {
  blocked: boolean;
  reason: string | null;
  code: string | null;
}

export function getConnectorExecutionBlockReason(
  actionMode: ConnectorActionMode,
  approvalRequestId: string | null,
  proposedActionRisk?: ProposedAction["riskLevel"],
): ConnectorExecutionBlockReason {
  if (actionMode !== "execute") {
    return { blocked: false, reason: null, code: null };
  }

  if (!approvalRequestId) {
    const toolRisk = proposedActionRisk
      ? connectorRiskToToolRisk[proposedActionRisk] ?? "privileged"
      : "privileged";

    const needsApproval = isApprovalRequired(toolRisk);

    return {
      blocked: true,
      reason: needsApproval
        ? "Execute mode requires an approved proposal. Create an approval request first."
        : "Execute mode is globally blocked in mock/demo environment.",
      code: "approval_required",
    };
  }

  const check = isConnectorExecutionApprovalSatisfied(approvalRequestId);

  if (!check.approvalSatisfied) {
    return {
      blocked: true,
      reason: check.blockReason,
      code: check.approvalRequired ? "approval_required" : "blocked_not_implemented",
    };
  }

  return {
    blocked: true,
    reason: "Execute mode is globally blocked even after approval. Real external execution is not yet implemented.",
    code: "blocked_not_implemented",
  };
}

export interface CreateConnectorApprovalRequestResult {
  success: boolean;
  approvalRequestId: string | null;
  error: string | null;
}

export function createConnectorApprovalRequest(
  proposedAction: ProposedAction,
  connectorId: string,
  options?: {
    sessionId?: string | null;
    userId?: string | null;
  },
): CreateConnectorApprovalRequestResult {
  if (!proposedAction.requiresApproval) {
    return {
      success: false,
      approvalRequestId: null,
      error: "Proposed action does not require approval.",
    };
  }

  const toolRisk: ToolRiskLevel =
    connectorRiskToToolRisk[proposedAction.riskLevel] ?? "privileged";

  const request = createApprovalRequest({
    title: proposedAction.title,
    description: proposedAction.description,
    riskLevel: toolRisk,
    proposedAction: proposedAction.title,
    affectedEntities: proposedAction.affectedEntities,
    rationale: `Connector action from ${connectorId}`,
    expectedEffect: proposedAction.expectedEffect,
    evidenceItems: [
      {
        id: `${proposedAction.id}-input-ev`,
        label: "Proposed Input",
        contentUrl: null,
        summary: JSON.stringify(proposedAction.proposedInput).slice(0, 200),
        confidence: "medium",
        sourceName: connectorId,
        freshness: null,
        verified: false,
      },
    ],
    sessionId: options?.sessionId ?? null,
    userId: options?.userId ?? null,
    proposalId: proposedAction.id,
  });

  recordAuditEvent(
    "action_approval_requested",
    "agent.runtime",
    options?.sessionId ?? null,
    {
      approvalRequestId: request.id,
      connectorId,
      capabilityId: proposedAction.id,
      riskLevel: proposedAction.riskLevel,
    },
  );

  return { success: true, approvalRequestId: request.id, error: null };
}

export function recordConnectorBlockedAudit(
  connectorId: string,
  capabilityId: string,
  actionMode: ConnectorActionMode,
  reason: string,
  sessionId?: string | null,
): void {
  recordAuditEvent(
    "action_blocked",
    "agent.runtime",
    sessionId ?? null,
    {
      connectorId,
      capabilityId,
      actionMode,
      reason,
      blockedAt: new Date().toISOString(),
    },
  );
}

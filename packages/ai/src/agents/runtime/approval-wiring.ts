import type {
  FunctionalAgentProposedAction,
  FunctionalAgentActionRiskLevel,
  FunctionalAgentApprovalBoundary,
} from "./types";
import type { ToolRiskLevel } from "@ethen/contracts/tools/types";
import {
  createApprovalRequest,
  submitApprovalDecision,
  getApprovalRequest,
  isApprovalRequired as isToolApprovalRequired,
} from "@ethen/security/approvals/service";
import type {
  ApprovalRequest,
  ApprovalDecisionType,
  ApprovalActor,
  CreateApprovalRequestInput,
} from "@ethen/contracts/approvals/types";
import { recordAuditEvent } from "@ethen/security/audit/service";

function functionalRiskToToolRisk(risk: FunctionalAgentActionRiskLevel): ToolRiskLevel {
  switch (risk) {
    case "low":
      return "read_only";
    case "medium":
      return "writes_user_content";
    case "high":
      return "external_side_effect";
    case "critical":
      return "privileged";
  }
}

function toolRiskToFunctionalRisk(risk: ToolRiskLevel): FunctionalAgentActionRiskLevel {
  switch (risk) {
    case "read_only":
      return "low";
    case "write":
    case "writes_user_content":
      return "medium";
    case "external_side_effect":
      return "high";
    case "destructive":
    case "privileged":
      return "critical";
  }
}

export interface CreateApprovalRequestForProposedActionResult {
  success: boolean;
  approvalRequest: ApprovalRequest | null;
  error: string | null;
}

export function createApprovalRequestForProposedAction(
  action: FunctionalAgentProposedAction,
  boundary: FunctionalAgentApprovalBoundary,
  options?: {
    sessionId?: string | null;
    userId?: string | null;
    agentSlug?: string | null;
  },
): CreateApprovalRequestForProposedActionResult {
  const toolRisk = functionalRiskToToolRisk(action.riskLevel);

  if (!isProposedActionApprovalRequired(action, boundary)) {
    return {
      success: false,
      approvalRequest: null,
      error: `Action "${action.title}" with risk "${action.riskLevel}" does not require approval under current boundary.`,
    };
  }

  const input: CreateApprovalRequestInput = {
    title: action.title,
    description: action.description,
    riskLevel: toolRisk,
    proposedAction: action.title,
    affectedEntities: action.affectedEntities,
    rationale: action.rationale,
    expectedEffect: action.expectedEffect,
    rollbackPath: action.rollbackPath,
    evidenceItems: action.evidenceRefs.map((ref, i) => ({
      id: `${action.id}-ev-${i}`,
      label: `Evidence ref ${ref}`,
      contentUrl: null,
      summary: `Evidence referenced by action ${action.title}`,
      confidence: "medium" as const,
      sourceName: ref,
      freshness: null,
      verified: false,
    })),
    sessionId: options?.sessionId ?? null,
    userId: options?.userId ?? null,
    proposalId: action.id,
  };

  const request = createApprovalRequest(input);

  recordAuditEvent(
    "action_approval_requested",
    "agent.runtime",
    options?.sessionId ?? null,
    {
      approvalRequestId: request.id,
      actionId: action.id,
      agentSlug: options?.agentSlug ?? boundary.agentSlug,
      riskLevel: action.riskLevel,
    },
  );

  return { success: true, approvalRequest: request, error: null };
}

export function isProposedActionApprovalRequired(
  action: Pick<FunctionalAgentProposedAction, "riskLevel" | "status">,
  boundary?: Pick<FunctionalAgentApprovalBoundary, "requireApprovalFor" | "autoExecuteRiskLevels" | "blockActions">,
): boolean {
  if (action.status === "approved" || action.status === "executed") {
    return false;
  }

  const risk = action.riskLevel;

  if (boundary) {
    if (boundary.blockActions.includes(risk)) return true;
    if (boundary.requireApprovalFor.includes(risk)) return true;
    if (boundary.autoExecuteRiskLevels.includes(risk)) return false;
    return risk === "high" || risk === "critical";
  }

  return risk === "high" || risk === "critical";
}

export interface ProposedActionApprovalStatus {
  approvalRequired: boolean;
  currentStatus: string;
  approvalRequestId: string | null;
  approvalRequestStatus: string | null;
  decisions: Array<{ type: string; actor: string; at: string; comment: string | null }>;
  blockReason: string | null;
}

export function getProposedActionApprovalStatus(
  approvalRequestId: string | null,
): ProposedActionApprovalStatus {
  if (!approvalRequestId) {
    return {
      approvalRequired: false,
      currentStatus: "no_request",
      approvalRequestId: null,
      approvalRequestStatus: null,
      decisions: [],
      blockReason: null,
    };
  }

  const request = getApprovalRequest(approvalRequestId);

  if (!request) {
    return {
      approvalRequired: true,
      currentStatus: "request_not_found",
      approvalRequestId,
      approvalRequestStatus: "unknown",
      decisions: [],
      blockReason: "Approval request not found in store.",
    };
  }

  return {
    approvalRequired: true,
    currentStatus: request.status,
    approvalRequestId: request.id,
    approvalRequestStatus: request.status,
    decisions: request.decisions.map((d) => ({
      type: d.decisionType,
      actor: d.actor.name,
      at: d.decidedAt,
      comment: d.comment,
    })),
    blockReason: request.status === "blocked" ? "Action is blocked by policy." : null,
  };
}

export interface ApplyApprovalDecisionResult {
  success: boolean;
  action: FunctionalAgentProposedAction;
  approvalRequest: ApprovalRequest | null;
  error: string | null;
}

export function applyApprovalDecisionToProposedAction(
  action: FunctionalAgentProposedAction,
  approvalRequestId: string,
  decisionType: ApprovalDecisionType,
  actor: ApprovalActor,
  comment?: string | null,
): ApplyApprovalDecisionResult {
  const updated = submitApprovalDecision(approvalRequestId, decisionType, actor, comment);

  if (!updated) {
    return {
      success: false,
      action,
      approvalRequest: null,
      error: `Failed to submit decision "${decisionType}" for approval request "${approvalRequestId}".`,
    };
  }

  let newStatus = action.status;
  let resolvedBy: string | null = null;
  let resolvedAt: string | null = null;
  const now = new Date().toISOString();

  switch (decisionType) {
    case "approve":
      newStatus = "approved";
      resolvedBy = actor.id;
      resolvedAt = now;
      break;
    case "reject":
      newStatus = "rejected";
      resolvedBy = actor.id;
      resolvedAt = now;
      break;
    case "escalate":
    case "defer":
      break;
  }

  const updatedAction: FunctionalAgentProposedAction = {
    ...action,
    status: newStatus,
    resolvedBy: action.resolvedBy ?? resolvedBy,
    resolvedAt: action.resolvedAt ?? resolvedAt,
  };

  recordAuditEvent(
    decisionType === "approve" ? "action_approved" : "action_rejected",
    "agent.runtime",
    updated.sessionId ?? null,
    {
      approvalRequestId,
      actionId: action.id,
      decisionType,
      actorId: actor.id,
    },
  );

  return { success: true, action: updatedAction, approvalRequest: updated, error: null };
}

export { toolRiskToFunctionalRisk, functionalRiskToToolRisk };

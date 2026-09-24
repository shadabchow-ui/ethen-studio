import type { ToolId, ToolRiskLevel } from "../tools/types";

/** Lifecycle status of an approval proposal. */
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "canceled"
  | "executed"
  | "failed"
  | "stale";

/**
 * Canonical mutation families. Existing specialised approval adapters retain
 * their own payload validation, but every shared approval proposal identifies
 * the family it authorizes so a decision cannot be reused across categories.
 */
export type ApprovalActionCategory =
  | "plan"
  | "file_write"
  | "terminal_command"
  | "local_model_pull"
  | "github"
  | "ci"
  | "external_tool";

export type ApprovalOutcome = "approved" | "rejected" | "executed" | "failed" | "stale" | "canceled";

/** Risk label for user-facing display, derived from ToolRiskLevel. */
export type ApprovalRiskLabel =
  | "safe_read"
  | "writes_data"
  | "external_effect"
  | "destructive"
  | "privileged";

/** Map policy risk level to a user-facing label. */
export function toRiskLabel(riskLevel: ToolRiskLevel): ApprovalRiskLabel {
  switch (riskLevel) {
    case "read_only":
      return "safe_read";
    case "write":
    case "writes_user_content":
      return "writes_data";
    case "external_side_effect":
      return "external_effect";
    case "destructive":
      return "destructive";
    case "privileged":
      return "privileged";
  }
}

export const RISK_LABEL_TEXT: Record<ApprovalRiskLabel, string> = {
  safe_read: "Read Only",
  writes_data: "Writes Data",
  external_effect: "External Effect",
  destructive: "Destructive",
  privileged: "Privileged",
};

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  canceled: "Canceled",
  executed: "Executed",
  failed: "Failed",
  stale: "Stale",
};

export const TERMINAL_STATUSES: ApprovalStatus[] = [
  "rejected",
  "canceled",
  "executed",
  "failed",
  "stale",
];

export const REJECTABLE_STATUSES: ApprovalStatus[] = [
  "pending",
  "approved",
];

export const EXECUTABLE_STATUS: ApprovalStatus = "approved";

/**
 * An approval proposal created when a state-changing connector action is
 * requested. The action must not execute until status transitions to "approved".
 */
export interface ApprovalProposal {
  /** Unique proposal identifier. */
  id: string;
  /** The tool/action being proposed. */
  toolId: ToolId;
  /** Provider backing this tool (e.g. "rentcast", "twelve-data"). */
  providerId: string | null;
  /** Policy-derived risk level. */
  riskLevel: ToolRiskLevel;
  /** User-facing risk label. */
  riskLabel: ApprovalRiskLabel;
  /** Summarised input the user is about to submit. */
  proposedInput: Record<string, unknown>;
  /** Human-readable description of what the tool will do. */
  humanReadableSummary: string;
  /** Expected external effect (plain English). */
  expectedEffect: string;
  /** Current lifecycle status. */
  status: ApprovalStatus;
  /** SHA-256 hash of the approved payload for stale detection. */
  payloadHash: string | null;
  /** Immutable digest of the exact action payload. Alias of payloadHash for V2 consumers. */
  actionDigest: string;
  /** Mutation family bound to this decision. */
  category: ApprovalActionCategory;
  /** Human-readable boundary for the action (repository, session, or provider). */
  scope: string | null;
  /** Actor that requested the action when known. */
  requestedBy: string | null;
  /** Actor that made the decision when known. */
  decidedBy: string | null;
  /** Decision timestamp. */
  decidedAt: string | null;
  /** One-time consumption timestamp. */
  consumedAt: string | null;
  /** Terminal outcome; historical records may leave this null. */
  outcome: ApprovalOutcome | null;
  /** References to evidence without embedding sensitive payloads. */
  evidenceRefs: string[];
  /** The session that triggered this proposal. */
  sessionId: string | null;
  /** Authenticated user who must approve (null when auth unavailable). */
  userId: string | null;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of last status change. */
  updatedAt: string;
  /** ISO timestamp when this approval expires (null = no expiry). */
  expiresAt: string | null;
}

/** Input required to create a proposal. */
export interface CreateApprovalProposalInput {
  toolId: ToolId;
  providerId?: string | null;
  riskLevel: ToolRiskLevel;
  proposedInput: Record<string, unknown>;
  humanReadableSummary: string;
  expectedEffect: string;
  payloadHash?: string | null;
  expiresAt?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  category?: ApprovalActionCategory;
  scope?: string | null;
  evidenceRefs?: string[];
}

/** Sanitised proposal fields safe to send to the client. */
export interface ClientApprovalProposal {
  id: string;
  toolId: ToolId;
  providerId: string | null;
  riskLevel: ToolRiskLevel;
  riskLabel: ApprovalRiskLabel;
  proposedInput: Record<string, unknown>;
  humanReadableSummary: string;
  expectedEffect: string;
  status: ApprovalStatus;
  payloadHash: string | null;
  actionDigest: string;
  category: ApprovalActionCategory;
  scope: string | null;
  decidedAt: string | null;
  consumedAt: string | null;
  outcome: ApprovalOutcome | null;
  evidenceRefs: string[];
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toClientProposal(
  p: ApprovalProposal,
): ClientApprovalProposal {
  return {
    id: p.id,
    toolId: p.toolId,
    providerId: p.providerId,
    riskLevel: p.riskLevel,
    riskLabel: p.riskLabel,
    proposedInput: p.proposedInput,
    humanReadableSummary: p.humanReadableSummary,
    expectedEffect: p.expectedEffect,
    status: p.status,
    payloadHash: p.payloadHash,
    actionDigest: p.actionDigest,
    category: p.category,
    scope: p.scope,
    decidedAt: p.decidedAt,
    consumedAt: p.consumedAt,
    outcome: p.outcome,
    evidenceRefs: [...p.evidenceRefs],
    expiresAt: p.expiresAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ── HITL Framework Types ────────────────────────────────────────────────────────

/** Extended approval lifecycle statuses including pre-proposal states. */
export type ApprovalRequestStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "blocked"
  | "stale";

export const APPROVAL_REQUEST_STATUS_LABELS: Record<ApprovalRequestStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
  blocked: "Blocked",
  stale: "Stale",
};

/** Type of decision a human can submit on an approval request. */
export type ApprovalDecisionType =
  | "approve"
  | "reject"
  | "escalate"
  | "defer";

/** Identity of the human or system that made a decision. */
export interface ApprovalActor {
  id: string;
  name: string;
  role: string;
}

/** A single human decision recorded against an approval request. */
export interface ApprovalDecision {
  id: string;
  approvalRequestId: string;
  decisionType: ApprovalDecisionType;
  actor: ApprovalActor;
  comment: string | null;
  decidedAt: string;
}

/** Policy rules governing when approval is required. */
export interface ApprovalPolicy {
  id: string;
  name: string;
  description: string;
  riskThreshold: ToolRiskLevel;
  requireApprovalFor: ToolRiskLevel[];
  blockActions: ToolRiskLevel[];
  autoExecuteRiskLevels: ToolRiskLevel[];
  maxAutoExecuteCount: number;
  requireJustification: boolean;
  escalationContact: string | null;
}

/** Boundary configuration describing an agent's permitted autonomy level. */
export interface ApprovalBoundary {
  agentSlug: string;
  autonomyLevel: number;
  draftModeOnly: boolean;
  policy: ApprovalPolicy;
}

/** Audit record linking an approval lifecycle to evidence. */
export interface ApprovalAuditRecord {
  id: string;
  approvalRequestId: string;
  event: "created" | "submitted" | "decided" | "escalated" | "expired" | "cancelled";
  actor: ApprovalActor | null;
  detail: string;
  evidenceRefs: string[];
  createdAt: string;
}

/** Bundle of evidence items supporting an approval request. */
export interface EvidencePackage {
  id: string;
  approvalRequestId: string;
  items: Array<{
    id: string;
    label: string;
    contentUrl: string | null;
    summary: string;
    confidence: "high" | "medium" | "low";
    sourceName: string;
    freshness: string | null;
    verified: boolean;
  }>;
  createdAt: string;
}

/** High-level approval request that wraps proposal fields with HITL metadata. */
export interface ApprovalRequest {
  id: string;
  title: string;
  description: string;
  status: ApprovalRequestStatus;
  riskLevel: ToolRiskLevel;
  riskLabel: ApprovalRiskLabel;
  proposedAction: string;
  affectedEntities: string[];
  rationale: string;
  expectedEffect: string;
  rollbackPath: string | null;
  evidencePackage: EvidencePackage | null;
  decisions: ApprovalDecision[];
  auditRecords: ApprovalAuditRecord[];
  policy: ApprovalPolicy | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  expiryAt: string | null;
  /** SHA-256 hash of the approved payload. Used to detect stale approvals. */
  payloadHash: string | null;
  proposalId: string | null;
  sessionId: string | null;
  userId: string | null;
}

/** Input for creating a new approval request. */
export interface CreateApprovalRequestInput {
  title: string;
  description: string;
  riskLevel: ToolRiskLevel;
  proposedAction: string;
  affectedEntities: string[];
  rationale: string;
  expectedEffect: string;
  rollbackPath?: string | null;
  evidenceItems?: EvidencePackage["items"];
  policy?: ApprovalPolicy | null;
  expiryAt?: string | null;
  /** SHA-256 hash of the payload to bind approval to exact content. */
  payloadHash?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  proposalId?: string | null;
}

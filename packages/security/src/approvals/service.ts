import type { ToolDefinition, ToolId, ToolRiskLevel } from "@ethen/contracts/tools/types";
import { getToolDefinition } from "@ethen/tools/registry";
import { evaluateTool, getApprovalRequirement } from "@ethen/tools/approval-policy";
import type {
  ApprovalProposal,
  CreateApprovalProposalInput,
  ApprovalRequest,
  ApprovalRequestStatus,
  ApprovalDecision,
  ApprovalDecisionType,
  ApprovalActor,
  ApprovalAuditRecord,
  EvidencePackage,
  CreateApprovalRequestInput,
} from "@ethen/contracts/approvals/types";
import { toRiskLabel } from "@ethen/contracts/approvals/types";
import {
  createProposal,
  approveProposal,
  rejectProposal,
  cancelProposal,
  markExecuted,
  markFailed,
  getProposal,
  getPendingProposalsForSession,
  isExecutable,
} from "./store";
import {
  recordAuditEvent,
} from "../audit/service";
import type { FunctionalAgentApprovalBoundary } from "@ethen/ai/agents/runtime/types";
import { computePayloadHash } from "../policies/payload-hash";
import {
  signSignedApprovalToken,
  validateSignedApprovalToken,
  type SignedApprovalTokenFailureCode,
} from "../policies/signed-approval-token";

// ── Public API ──────────────────────────────────────────────────────────

export interface ProposeResult {
  /** True when the proposal was created (blocked actions return false). */
  proposalCreated: boolean;
  /** The created proposal, or null when action is safe or blocked. */
  proposal: ApprovalProposal | null;
  /** Classification of the action. */
  decision: "auto_execute" | "proposal_required" | "blocked";
  /** Tool metadata — null when tool not found. */
  tool: ToolDefinition | null;
}

/**
 * Evaluate a tool invocation request and either auto-execute (read-only),
 * create an approval proposal (write/destructive), or block (privileged/unavailable).
 *
 * This is the sole entry point for all tool dispatch decisions. No write
 * action may bypass this gate.
 */
export function proposeToolAction(
  toolId: ToolId,
  proposedInput: Record<string, unknown>,
  context?: { sessionId?: string | null; userId?: string | null },
): ProposeResult {
  const tool = getToolDefinition(toolId);

  if (!tool) {
    recordAuditEvent("action_blocked", toolId, null, {
      reason: "tool_not_found",
      input: proposedInput,
    });
    return {
      proposalCreated: false,
      proposal: null,
      decision: "blocked",
      tool: null,
    };
  }

  const decision = evaluateTool(tool);

  if (decision.blocked) {
    recordAuditEvent("action_blocked", toolId, context?.sessionId ?? null, {
      reason: "policy_blocked",
      riskLevel: tool.riskLevel,
      approvalRequirement: decision.approvalRequirement,
    });
    return {
      proposalCreated: false,
      proposal: null,
      decision: "blocked",
      tool,
    };
  }

  if (!decision.requiresApproval) {
    recordAuditEvent("action_executed", toolId, context?.sessionId ?? null, {
      autoApproved: true,
      riskLevel: tool.riskLevel,
      input: proposedInput,
    });
    return {
      proposalCreated: false,
      proposal: null,
      decision: "auto_execute",
      tool,
    };
  }

  const proposalInput: CreateApprovalProposalInput = {
    toolId: tool.id,
    providerId: tool.providerId ?? null,
    riskLevel: tool.riskLevel,
    proposedInput,
    humanReadableSummary: tool.inputSummary,
    expectedEffect: tool.outputSummary,
    payloadHash: computePayloadHash(proposedInput),
    sessionId: context?.sessionId ?? null,
    userId: context?.userId ?? null,
  };

  const proposal = createProposal(proposalInput);

  recordAuditEvent("action_approval_requested", toolId, proposal.sessionId, {
    proposalId: proposal.id,
    riskLevel: tool.riskLevel,
    riskLabel: proposal.riskLabel,
    input: proposedInput,
  });

  return {
    proposalCreated: true,
    proposal,
    decision: "proposal_required",
    tool,
  };
}

export interface ApproveResult {
  success: boolean;
  proposal: ApprovalProposal | null;
  approvalToken?: string;
  error?: string;
}

/**
 * Approve a pending proposal. After approval, the caller must separately
 * call executeApprovedAction to dispatch the action.
 */
export function approveProposalAction(
  proposalId: string,
  options?: { secret?: string; actorId?: string | null },
): ApproveResult {
  const existing = getProposal(proposalId);
  if (!existing) {
    return { success: false, proposal: null, error: "Proposal not found or already terminal." };
  }

  const payloadHash = existing.payloadHash ?? computePayloadHash(existing.proposedInput);
  const expiresAt = existing.expiresAt;
  if (!expiresAt) {
    recordAuditEvent("action_blocked", existing.toolId, existing.sessionId, {
      proposalId: existing.id,
      reason: "approval_expiry_missing",
    });
    return { success: false, proposal: existing, error: "Proposal expiry is required before approval." };
  }
  const signedToken = signSignedApprovalToken({
    proposalId: existing.id,
    toolId: existing.toolId,
    payloadHash,
    sessionId: existing.sessionId,
    userId: existing.userId,
    expiresAt,
    secret: options?.secret,
  });

  if (!signedToken.ok) {
    recordAuditEvent("action_blocked", existing.toolId, existing.sessionId, {
      proposalId: existing.id,
      reason: "approval_signing_failed",
      approvalFailureCode: toAuditSafeApprovalFailureCode(signedToken.failure.code),
    });
    return { success: false, proposal: existing, error: signedToken.failure.message };
  }

  const proposal = approveProposal(proposalId, options?.actorId);

  if (!proposal) {
    return { success: false, proposal: null, error: "Proposal not found or already terminal." };
  }

  recordAuditEvent("action_approved", proposal.toolId, proposal.sessionId, {
    proposalId: proposal.id,
    riskLevel: proposal.riskLevel,
    payloadHash,
    expiresAt,
  });

  return { success: true, proposal, approvalToken: signedToken.token };
}

export interface RejectResult {
  success: boolean;
  proposal: ApprovalProposal | null;
  error?: string;
}

/** Reject a proposal. Can be called on pending or approved proposals. */
export function rejectProposalAction(proposalId: string): RejectResult {
  const proposal = rejectProposal(proposalId);

  if (!proposal) {
    return { success: false, proposal: null, error: "Proposal not found or not rejectable." };
  }

  recordAuditEvent("action_rejected", proposal.toolId, proposal.sessionId, {
    proposalId: proposal.id,
    riskLevel: proposal.riskLevel,
  });

  return { success: true, proposal };
}

export interface CancelResult {
  success: boolean;
  proposal: ApprovalProposal | null;
  error?: string;
}

/** Cancel a pending proposal. */
export function cancelProposalAction(proposalId: string): CancelResult {
  const proposal = cancelProposal(proposalId);

  if (!proposal) {
    return { success: false, proposal: null, error: "Proposal not found or already terminal." };
  }

  recordAuditEvent("action_canceled", proposal.toolId, proposal.sessionId, {
    proposalId: proposal.id,
    riskLevel: proposal.riskLevel,
  });

  return { success: true, proposal };
}

export interface ExecuteApprovedResult {
  success: boolean;
  proposal: ApprovalProposal | null;
  error?: string;
}

export interface ExecuteApprovedActionOptions {
  approvalToken?: string | null;
  payload?: Record<string, unknown> | null;
  toolId?: ToolId;
  sessionId?: string | null;
  userId?: string | null;
  secret?: string;
  now?: Date;
}

function toAuditSafeApprovalFailureCode(
  reason: SignedApprovalTokenFailureCode,
): string {
  switch (reason) {
    case "missing_token":
      return "missing_signature";
    case "malformed_token":
      return "malformed_signature";
    case "unsigned_token":
      return "unsigned_signature";
    case "invalid_signature":
      return "invalid_signature";
    case "unsupported_version":
      return "unsupported_version";
    case "secret_unavailable":
      return "secret_unavailable";
    case "expired_token":
      return "expired_approval";
    case "proposal_id_mismatch":
      return "proposal_mismatch";
    case "tool_id_mismatch":
      return "tool_mismatch";
    case "payload_hash_mismatch":
      return "payload_mismatch";
    case "session_id_mismatch":
      return "session_mismatch";
    case "user_id_mismatch":
      return "user_mismatch";
    case "expires_at_mismatch":
      return "expiry_mismatch";
  }
}

function buildTokenBlockedMetadata(
  proposal: ApprovalProposal,
  reason: SignedApprovalTokenFailureCode,
): Record<string, unknown> {
  return {
    proposalId: proposal.id,
    reason: "approval_validation_failed",
    approvalFailureCode: toAuditSafeApprovalFailureCode(reason),
    toolId: proposal.toolId,
  };
}

/**
 * Execute an approved proposal through the tool dispatcher.
 * Only proposals with status "approved" are eligible.
 * The actual execution delegates to the existing tool executor for local
 * repo tools; for external connector actions, execution goes through the
 * relevant API route.
 */
export async function executeApprovedAction(
  proposalId: string,
  options?: ExecuteApprovedActionOptions,
): Promise<ExecuteApprovedResult> {
  const proposal = getProposal(proposalId);

  if (!proposal) {
    return { success: false, proposal: null, error: "Proposal not found." };
  }

  if (!isExecutable(proposalId)) {
    return {
      success: false,
      proposal,
      error: `Proposal status is "${proposal.status}" — must be "approved" to execute.`,
    };
  }

  if (proposal.expiresAt && new Date(proposal.expiresAt) < new Date()) {
    markFailed(proposalId);
    recordAuditEvent("action_failed", proposal.toolId, proposal.sessionId, {
      proposalId: proposal.id,
      error: "Approval expired before execution.",
      expiryAt: proposal.expiresAt,
    });
    return {
      success: false,
      proposal: { ...proposal, status: "failed" },
      error: `Approval expired at ${proposal.expiresAt}.`,
    };
  }

  const executionPayloadHash = computePayloadHash(
    options?.payload ?? proposal.proposedInput,
  );
  const tokenValidation = validateSignedApprovalToken({
    token: options?.approvalToken,
    secret: options?.secret,
    now: options?.now,
    expected: {
      proposalId: proposal.id,
      toolId: options?.toolId ?? proposal.toolId,
      payloadHash: executionPayloadHash,
      sessionId: proposal.sessionId !== null
        ? (options?.sessionId ?? null)
        : null,
      userId: proposal.userId !== null
        ? (options?.userId ?? null)
        : null,
      expiresAt: proposal.expiresAt ?? "",
    },
  });

  if (!tokenValidation.ok) {
    if (tokenValidation.failure.code === "expired_token") {
      markFailed(proposalId);
    }

    recordAuditEvent(
      "action_blocked",
      proposal.toolId,
      proposal.sessionId,
      buildTokenBlockedMetadata(proposal, tokenValidation.failure.code),
    );

    return {
      success: false,
      proposal: getProposal(proposalId) ?? proposal,
      error: tokenValidation.failure.message,
    };
  }

  recordAuditEvent("action_executing", proposal.toolId, proposal.sessionId, {
    proposalId: proposal.id,
    riskLevel: proposal.riskLevel,
    payloadHash: executionPayloadHash,
  });

  try {
    const tool = getToolDefinition(proposal.toolId);

    if (!tool) {
      markFailed(proposalId);
      recordAuditEvent("action_failed", proposal.toolId, proposal.sessionId, {
        proposalId: proposal.id,
        error: "Tool definition not found at execution time.",
      });
      return { success: false, proposal: { ...proposal, status: "failed" }, error: "Tool not found." };
    }

    if (tool.executionState !== "available") {
      markFailed(proposalId);
      recordAuditEvent("action_failed", proposal.toolId, proposal.sessionId, {
        proposalId: proposal.id,
        error: `Tool execution state is "${tool.executionState}" — not available.`,
      });
      return {
        success: false,
        proposal: { ...proposal, status: "failed" },
        error: `Tool "${proposal.toolId}" is not available for execution (state: ${tool.executionState}).`,
      };
    }

    markExecuted(proposalId);

    recordAuditEvent("action_executed", proposal.toolId, proposal.sessionId, {
      proposalId: proposal.id,
      riskLevel: proposal.riskLevel,
      input: proposal.proposedInput,
    });

    return { success: true, proposal: { ...proposal, status: "executed" } };
  } catch (err) {
    markFailed(proposalId);
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    recordAuditEvent("action_failed", proposal.toolId, proposal.sessionId, {
      proposalId: proposal.id,
      error: errorMsg,
    });

    return { success: false, proposal: { ...proposal, status: "failed" }, error: errorMsg };
  }
}

export function getPendingProposals(
  sessionId: string,
): ApprovalProposal[] {
  return getPendingProposalsForSession(sessionId);
}

export function getProposalById(id: string): ApprovalProposal | null {
  return getProposal(id);
}

// ── HITL Framework Service Functions ─────────────────────────────────────────────

let approvalRequestCounter = 0;
const approvalRequests = new Map<string, ApprovalRequest>();
const approvalDecisions = new Map<string, ApprovalDecision>();
const approvalAuditRecords = new Map<string, ApprovalAuditRecord>();
const evidencePackages = new Map<string, EvidencePackage>();

function nextApprovalId(): string {
  approvalRequestCounter += 1;
  return `approval-req-${approvalRequestCounter}`;
}

function nextDecisionId(): string {
  return `decision-${approvalRequestCounter}-${Date.now()}`;
}

function nextAuditRecordId(): string {
  return `audit-rec-${approvalRequestCounter}-${Date.now()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createApprovalRequest(input: CreateApprovalRequestInput): ApprovalRequest {
  const id = nextApprovalId();
  const now = nowIso();
  const riskLabel = toRiskLabel(input.riskLevel);

  const evidencePackage: EvidencePackage = {
    id: `evpkg-${id}`,
    approvalRequestId: id,
    items: input.evidenceItems ?? [],
    createdAt: now,
  };
  evidencePackages.set(evidencePackage.id, evidencePackage);

  const request: ApprovalRequest = {
    id,
    title: input.title,
    description: input.description,
    status: "draft",
    riskLevel: input.riskLevel,
    riskLabel,
    proposedAction: input.proposedAction,
    affectedEntities: input.affectedEntities,
    rationale: input.rationale,
    expectedEffect: input.expectedEffect,
    rollbackPath: input.rollbackPath ?? null,
    evidencePackage,
    decisions: [],
    auditRecords: [],
    policy: input.policy ?? null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    expiryAt: input.expiryAt ?? null,
    payloadHash: input.payloadHash ?? null,
    proposalId: input.proposalId ?? null,
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
  };

  approvalRequests.set(request.id, request);

  const auditRecord: ApprovalAuditRecord = {
    id: nextAuditRecordId(),
    approvalRequestId: id,
    event: "created",
    actor: null,
    detail: "Approval request created.",
    evidenceRefs: [],
    createdAt: now,
  };
  approvalAuditRecords.set(auditRecord.id, auditRecord);
  request.auditRecords.push(auditRecord);

  recordAuditEvent("action_approval_requested", input.riskLevel as unknown as ToolId, input.sessionId ?? null, {
    approvalRequestId: id,
    title: input.title,
    riskLevel: input.riskLevel,
  });

  return request;
}

export function submitApprovalDecision(
  approvalRequestId: string,
  decisionType: ApprovalDecisionType,
  actor: ApprovalActor,
  comment?: string | null,
): ApprovalRequest | null {
  const request = approvalRequests.get(approvalRequestId);
  if (!request) return null;
  if (request.status === "approved" || request.status === "rejected" || request.status === "cancelled" || request.status === "expired" || request.status === "stale" || request.status === "blocked") {
    return null;
  }

  const decision: ApprovalDecision = {
    id: nextDecisionId(),
    approvalRequestId,
    decisionType,
    actor,
    comment: comment ?? null,
    decidedAt: nowIso(),
  };
  approvalDecisions.set(decision.id, decision);
  request.decisions.push(decision);

  let newStatus: ApprovalRequestStatus;
  switch (decisionType) {
    case "approve":
      newStatus = "approved";
      break;
    case "reject":
      newStatus = "rejected";
      break;
    case "escalate":
      newStatus = "pending";
      break;
    case "defer":
      newStatus = "pending";
      break;
  }

  request.status = newStatus;
  request.updatedAt = nowIso();
  request.resolvedAt = newStatus === "approved" || newStatus === "rejected" ? nowIso() : null;
  request.resolvedBy = newStatus === "approved" || newStatus === "rejected" ? actor.id : null;

  const auditEvent: ApprovalAuditRecord = {
    id: nextAuditRecordId(),
    approvalRequestId,
    event: "decided",
    actor,
    detail: `Decision: ${decisionType}${comment ? ` — ${comment}` : ""}`,
    evidenceRefs: [],
    createdAt: nowIso(),
  };
  approvalAuditRecords.set(auditEvent.id, auditEvent);
  request.auditRecords.push(auditEvent);

  recordAuditEvent(
    decisionType === "approve" ? "action_approved" : "action_rejected",
    request.riskLevel as unknown as ToolId,
    request.sessionId ?? null,
    {
      approvalRequestId,
      decisionType,
      actorId: actor.id,
    },
  );

  return request;
}

export function getApprovalRequest(id: string): ApprovalRequest | null {
  return approvalRequests.get(id) ?? null;
}

export function listApprovalRequests(options?: {
  status?: ApprovalRequestStatus;
  sessionId?: string;
  userId?: string;
}): ApprovalRequest[] {
  let result = Array.from(approvalRequests.values());

  if (options?.status) {
    result = result.filter((r) => r.status === options.status);
  }
  if (options?.sessionId) {
    result = result.filter((r) => r.sessionId === options.sessionId);
  }
  if (options?.userId) {
    result = result.filter((r) => r.userId === options.userId);
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function isApprovalRequired(
  riskLevel: ToolRiskLevel,
  boundary?: Pick<FunctionalAgentApprovalBoundary, "requireApprovalFor" | "autoExecuteRiskLevels" | "blockActions">,
): boolean {
  if (boundary) {
    if (boundary.blockActions.includes(riskLevel as never)) return true;
    if (boundary.requireApprovalFor.includes(riskLevel as never)) return true;
    if (boundary.autoExecuteRiskLevels.includes(riskLevel as never)) return false;
    return true;
  }
  const requirement = getApprovalRequirement(riskLevel);
  return requirement === "confirm_once" || requirement === "confirm_every_time" || requirement === "blocked";
}

export function createApprovalAuditRecord(
  approvalRequestId: string,
  event: ApprovalAuditRecord["event"],
  actor: ApprovalActor | null,
  detail: string,
  evidenceRefs?: string[],
): ApprovalAuditRecord | null {
  const request = approvalRequests.get(approvalRequestId);
  if (!request) return null;

  const record: ApprovalAuditRecord = {
    id: nextAuditRecordId(),
    approvalRequestId,
    event,
    actor,
    detail,
    evidenceRefs: evidenceRefs ?? [],
    createdAt: nowIso(),
  };

  approvalAuditRecords.set(record.id, record);
  request.auditRecords.push(record);
  request.updatedAt = nowIso();

  return record;
}

// ── Stale Approval Prevention ─────────────────────────────────────────────────

/**
 * Verify that the current execution payload matches the hash that was
 * approved. If the payload has changed since approval, the approval
 * is stale and must not be used for execution.
 */
export function validateApprovalPayload(
  approvalRequestId: string,
  currentPayloadHash: string,
): { valid: boolean; request: ApprovalRequest | null; reason: string } {
  const request = approvalRequests.get(approvalRequestId);
  if (!request) {
    return { valid: false, request: null, reason: "Approval request not found." };
  }

  if (request.status !== "approved") {
    return {
      valid: false,
      request,
      reason: `Approval request status is "${request.status}" — must be "approved".`,
    };
  }

  if (request.expiryAt && new Date(request.expiryAt) < new Date()) {
    request.status = "expired";
    request.updatedAt = nowIso();
    recordAuditEvent("action_failed", request.riskLevel as unknown as ToolId, request.sessionId ?? null, {
      approvalRequestId,
      reason: "Approval expired before execution.",
      expiryAt: request.expiryAt,
    });
    return {
      valid: false,
      request,
      reason: `Approval expired at ${request.expiryAt}.`,
    };
  }

  if (request.payloadHash && request.payloadHash !== currentPayloadHash) {
    request.status = "stale";
    request.updatedAt = nowIso();
    recordAuditEvent("action_blocked", request.riskLevel as unknown as ToolId, request.sessionId ?? null, {
      approvalRequestId,
      reason: "Payload changed since approval — approval is stale.",
      expectedHash: request.payloadHash.slice(0, 16),
      actualHash: currentPayloadHash.slice(0, 16),
    });
    return {
      valid: false,
      request,
      reason: `Payload has changed since approval. Expected hash ${request.payloadHash.slice(0, 8)}..., got ${currentPayloadHash.slice(0, 8)}...`,
    };
  }

  return { valid: true, request, reason: "Payload validated." };
}

/**
 * Check whether an approval request is stale without applying any
 * persistent state changes.
 */
export function isApprovalRequestStale(
  approvalRequestId: string,
  currentPayloadHash?: string | null,
): { stale: boolean; reason: string } {
  const request = approvalRequests.get(approvalRequestId);
  if (!request) {
    return { stale: false, reason: "Request not found." };
  }

  if (request.expiryAt && new Date(request.expiryAt) < new Date()) {
    return { stale: true, reason: "Approval has expired." };
  }

  if (currentPayloadHash && request.payloadHash && request.payloadHash !== currentPayloadHash) {
    return { stale: true, reason: "Payload has changed since approval." };
  }

  return { stale: false, reason: "Approval is fresh." };
}

/**
 * Mark an approval request as stale and record an audit event.
 */
export function markApprovalStale(
  approvalRequestId: string,
  reason?: string,
): ApprovalRequest | null {
  const request = approvalRequests.get(approvalRequestId);
  if (!request) return null;

  if (request.status === "approved") {
    request.status = "stale";
    request.updatedAt = nowIso();

    recordAuditEvent(
      "action_blocked",
      request.riskLevel as unknown as ToolId,
      request.sessionId ?? null,
      {
        approvalRequestId,
        reason: reason ?? "Payload changed — approval marked stale.",
      },
    );
  }

  return request;
}

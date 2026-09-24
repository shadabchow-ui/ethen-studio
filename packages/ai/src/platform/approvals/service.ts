import { randomUUID } from "node:crypto";
import type {
  ApprovalAccessScope,
  ApprovalAuditEvent,
  ApprovalAuditEventType,
  ApprovalAuthorizationInput,
  ApprovalAuthorizationResult,
  ApprovalEnvelope,
  CanonicalApproval,
  CanonicalApprovalStatus,
  RequestApprovalInput,
} from "./contract";
import { ApprovalContractError } from "./errors";
import { hashCanonicalBinding, hashExactActionBytes } from "./hash";
import type { ApprovalRepository } from "./repository";

interface Dependencies {
  repository: ApprovalRepository;
  now?: () => string;
  newId?: () => string;
}

function requireText(value: string, field: string): void {
  if (!value.trim()) {
    throw new ApprovalContractError("INVALID_INPUT", `${field} is required.`);
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      freeze(nested);
    }
  }
  return value;
}

export class CanonicalApprovalService {
  private readonly repository: ApprovalRepository;
  private readonly now: () => string;
  private readonly newId: () => string;

  constructor(dependencies: Dependencies) {
    this.repository = dependencies.repository;
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.newId = dependencies.newId ?? randomUUID;
  }

  async requestApproval(input: RequestApprovalInput): Promise<ApprovalEnvelope> {
    for (const [field, value] of Object.entries({
      organizationId: input.organizationId,
      projectId: input.projectId,
      requesterId: input.requesterId,
      policyId: input.policy.snapshot.id,
      policyVersion: input.policy.snapshot.version,
      policyHash: input.policy.snapshot.hash,
      scopeKind: input.scope.kind,
    })) {
      requireText(value, field);
    }
    if (input.actionBytes.byteLength === 0) {
      throw new ApprovalContractError(
        "INVALID_INPUT",
        "actionBytes must contain the exact action to authorize.",
      );
    }
    const now = this.now();
    if (new Date(input.expiresAt).getTime() <= new Date(now).getTime()) {
      throw new ApprovalContractError(
        "INVALID_INPUT",
        "Approval expiry must be in the future.",
      );
    }

    const actionHash = hashExactActionBytes(input.actionBytes);
    const policyHash = hashCanonicalBinding(input.policy);
    const scopeHash = hashCanonicalBinding(input.scope);
    const approval: CanonicalApproval = {
      id: this.newId(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      runId: input.runId ?? null,
      requesterId: input.requesterId,
      approverId: null,
      status: "pending",
      actionHash,
      actionByteLength: input.actionBytes.byteLength,
      hashAlgorithm: "sha256",
      policy: structuredClone(input.policy),
      policyHash,
      scope: structuredClone(input.scope),
      scopeHash,
      expiresAt: input.expiresAt,
      decisionReasonRedacted: null,
      decidedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
      sample: false,
      executionClaimedAt: null,
    };
    const event = this.event(
      approval,
      input.requesterId,
      "requested",
      "approval_requested",
      now,
    );
    await this.repository.insertApproval(approval, event);
    return this.load(approval);
  }

  async getApproval(
    scope: ApprovalAccessScope,
    approvalId: string,
  ): Promise<ApprovalEnvelope | null> {
    const approval = await this.repository.findApproval(
      scope.projectId,
      approvalId,
    );
    return approval ? this.load(approval) : null;
  }

  async approve(
    scope: ApprovalAccessScope,
    approvalId: string,
    reasonRedacted: string,
  ): Promise<ApprovalEnvelope> {
    const approval = await this.requireApproval(scope, approvalId);
    const now = this.now();
    if (new Date(approval.expiresAt).getTime() <= new Date(now).getTime()) {
      await this.repository.decide({
        projectId: scope.projectId,
        approvalId,
        expectedStatus: "pending",
        status: "expired",
        actorId: scope.actorId,
        reasonRedacted: "approval_expired",
        decidedAt: now,
      });
      throw new ApprovalContractError(
        "INVALID_DECISION",
        "An expired approval request cannot be approved.",
      );
    }
    if (
      approval.policy.requireDifferentApprover &&
      approval.requesterId === scope.actorId
    ) {
      throw new ApprovalContractError(
        "SEPARATION_OF_DUTIES",
        "Policy requires an approver distinct from the requester.",
      );
    }
    return this.decide(scope, approval, "approved", reasonRedacted);
  }

  async reject(
    scope: ApprovalAccessScope,
    approvalId: string,
    reasonRedacted: string,
  ): Promise<ApprovalEnvelope> {
    return this.decide(
      scope,
      await this.requireApproval(scope, approvalId),
      "rejected",
      reasonRedacted,
    );
  }

  async revoke(
    scope: ApprovalAccessScope,
    approvalId: string,
    reasonRedacted: string,
  ): Promise<ApprovalEnvelope> {
    const approval = await this.requireApproval(scope, approvalId);
    if (approval.status !== "approved") {
      throw new ApprovalContractError(
        "INVALID_DECISION",
        "Only an approved authorization may be revoked.",
      );
    }
    return this.decide(scope, approval, "revoked", reasonRedacted);
  }

  async authorize(
    scope: ApprovalAccessScope,
    approvalId: string,
    input: ApprovalAuthorizationInput,
  ): Promise<ApprovalAuthorizationResult> {
    const approval = await this.repository.findApproval(
      scope.projectId,
      approvalId,
    );
    if (!approval) {
      return { allowed: false, code: "not_found", approval: null };
    }
    const now = this.now();
    if (new Date(approval.expiresAt).getTime() <= new Date(now).getTime()) {
      if (approval.status === "pending" || approval.status === "approved") {
        const expired = await this.repository.decide({
          projectId: scope.projectId,
          approvalId,
          expectedStatus: approval.status,
          status: "expired",
          actorId: scope.actorId,
          reasonRedacted: "approval_expired",
          decidedAt: now,
        });
        return { allowed: false, code: "expired", approval: await this.load(expired) };
      }
      return {
        allowed: false,
        code: approval.status === "revoked" ? "revoked" : "expired",
        approval: await this.load(approval),
      };
    }
    if (approval.status === "revoked") {
      return this.deny(scope, approval, "revoked", "approval_revoked", now);
    }
    if (approval.sample) {
      return this.deny(scope, approval, "not_approved", "sample_approval_cannot_authorize", now);
    }
    if (approval.status !== "approved") {
      return this.deny(scope, approval, "not_approved", "approval_not_approved", now);
    }
    if (hashExactActionBytes(input.actionBytes) !== approval.actionHash) {
      return this.deny(scope, approval, "action_mismatch", "action_hash_mismatch", now);
    }
    if (hashCanonicalBinding(input.policy) !== approval.policyHash) {
      return this.deny(scope, approval, "policy_mismatch", "policy_hash_mismatch", now);
    }
    if (hashCanonicalBinding(input.scope) !== approval.scopeHash) {
      return this.deny(scope, approval, "scope_mismatch", "scope_hash_mismatch", now);
    }
    if ((input.runId ?? null) !== approval.runId) {
      return this.deny(scope, approval, "run_mismatch", "run_binding_mismatch", now);
    }

    if (!(await this.repository.claimExecution({ projectId: scope.projectId, approvalId, claimedAt: now }))) {
      return this.deny(scope, approval, "not_approved", "execution_already_claimed", now);
    }

    await this.repository.appendAuditEvent(
      this.event(
        approval,
        scope.actorId,
        "authorization_allowed",
        "binding_verified",
        now,
      ),
    );
    return { allowed: true, approval: await this.load(approval) };
  }

  /**
   * Worker-facing re-verification of an execution claim, immediately before a
   * protected destructive dispatch (GPU-P0-04 / APPROVAL-AUTHORITY-MERGE-01).
   *
   * The full `authorize()` (with policy/scope binding + one-shot claim) runs at
   * request time; the worker cannot re-supply the requester's policy snapshot.
   * This verifies the durable record: existence in the project, expiry,
   * revocation, sample/placeholder rejection, exact-action binding against the
   * job's own action bytes, and that the claim was actually established by a
   * prior authorize(). A sentinel/placeholder/unrelated approval id fails
   * closed with the same denial codes as `authorize()`.
   */
  async verifyExecutionClaim(
    scope: ApprovalAccessScope,
    approvalId: string,
    actionBytes: Uint8Array,
  ): Promise<ApprovalAuthorizationResult> {
    const approval = await this.repository.findApproval(
      scope.projectId,
      approvalId,
    );
    if (!approval) {
      return { allowed: false, code: "not_found", approval: null };
    }
    const now = this.now();
    if (new Date(approval.expiresAt).getTime() <= new Date(now).getTime()) {
      return {
        allowed: false,
        code: approval.status === "revoked" ? "revoked" : "expired",
        approval: await this.load(approval),
      };
    }
    if (approval.status === "revoked") {
      return this.deny(scope, approval, "revoked", "approval_revoked", now);
    }
    if (approval.sample) {
      return this.deny(scope, approval, "not_approved", "sample_approval_cannot_authorize", now);
    }
    if (approval.status !== "approved") {
      return this.deny(scope, approval, "not_approved", "approval_not_approved", now);
    }
    if (hashExactActionBytes(actionBytes) !== approval.actionHash) {
      return this.deny(scope, approval, "action_mismatch", "action_hash_mismatch", now);
    }
    if (!approval.executionClaimedAt) {
      // Never authorized by a full authorize() — no claim was ever established.
      return this.deny(scope, approval, "not_approved", "execution_claim_missing", now);
    }
    await this.repository.appendAuditEvent(
      this.event(
        approval,
        scope.actorId,
        "authorization_allowed",
        "execution_claim_reverified",
        now,
      ),
    );
    return { allowed: true, approval: await this.load(approval) };
  }

  private async deny(
    scope: ApprovalAccessScope,
    approval: CanonicalApproval,
    code: Exclude<ApprovalAuthorizationResult, { allowed: true }>["code"],
    reasonCode: string,
    now: string,
  ): Promise<ApprovalAuthorizationResult> {
    await this.repository.appendAuditEvent(
      this.event(
        approval,
        scope.actorId,
        "authorization_denied",
        reasonCode,
        now,
      ),
    );
    return { allowed: false, code, approval: await this.load(approval) };
  }

  private async decide(
    scope: ApprovalAccessScope,
    approval: CanonicalApproval,
    status: Extract<CanonicalApprovalStatus, "approved" | "rejected" | "revoked">,
    reasonRedacted: string,
  ): Promise<ApprovalEnvelope> {
    requireText(reasonRedacted, "reasonRedacted");
    const expectedStatus = status === "revoked" ? "approved" : "pending";
    if (approval.status !== expectedStatus) {
      throw new ApprovalContractError(
        "INVALID_DECISION",
        `Cannot transition approval ${approval.status} -> ${status}.`,
      );
    }
    const updated = await this.repository.decide({
      projectId: scope.projectId,
      approvalId: approval.id,
      expectedStatus,
      status,
      actorId: scope.actorId,
      reasonRedacted,
      decidedAt: this.now(),
    });
    return this.load(updated);
  }

  private async requireApproval(
    scope: ApprovalAccessScope,
    approvalId: string,
  ): Promise<CanonicalApproval> {
    const approval = await this.repository.findApproval(
      scope.projectId,
      approvalId,
    );
    if (!approval) {
      throw new ApprovalContractError(
        "APPROVAL_NOT_FOUND",
        "Approval not found in the authorized project.",
      );
    }
    return approval;
  }

  private event(
    approval: CanonicalApproval,
    actorId: string,
    eventType: ApprovalAuditEventType,
    reasonCode: string,
    createdAt: string,
  ): ApprovalAuditEvent {
    return {
      id: this.newId(),
      schemaVersion: 1,
      approvalId: approval.id,
      projectId: approval.projectId,
      actorId,
      eventType,
      actionHash: approval.actionHash,
      policyHash: approval.policyHash,
      scopeHash: approval.scopeHash,
      reasonCode,
      metadata: {},
      createdAt,
    };
  }

  private async load(approval: CanonicalApproval): Promise<ApprovalEnvelope> {
    const auditEvents = await this.repository.listAuditEvents(
      approval.projectId,
      approval.id,
    );
    return freeze({ ...approval, auditEvents: [...auditEvents] });
  }
}

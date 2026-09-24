import "server-only";

import { randomUUID } from "node:crypto";
import type {
  ApprovalAuditEvent,
  ApprovalPolicyBinding,
  ApprovalScope,
  CanonicalApproval,
  CanonicalApprovalStatus,
} from "./contract";
import { ApprovalPersistenceError } from "./errors";
import type { ApprovalRepository } from "./repository";

/**
 * In-memory repository implementing ApprovalRepository.
 * Used as fallback when Supabase is not configured.
 * Data is ephemeral (process lifetime only).
 */
export class MemoryApprovalRepository implements ApprovalRepository {
  private readonly approvals = new Map<string, CanonicalApproval>();
  private readonly auditEvents = new Map<string, ApprovalAuditEvent[]>();

  async insertApproval(
    approval: CanonicalApproval,
    requestedEvent: ApprovalAuditEvent,
  ): Promise<void> {
    if (this.approvals.has(approval.id)) {
      throw new ApprovalPersistenceError(
        "insert_approval",
        "Approval already exists.",
      );
    }
    this.approvals.set(approval.id, { ...approval });
    this.appendAuditEvent(requestedEvent);
  }

  async findApproval(
    projectId: string,
    approvalId: string,
  ): Promise<CanonicalApproval | null> {
    const approval = this.approvals.get(approvalId);
    if (!approval || approval.projectId !== projectId) return null;
    return { ...approval };
  }

  async decide(input: {
    projectId: string;
    approvalId: string;
    expectedStatus: CanonicalApprovalStatus;
    status: CanonicalApprovalStatus;
    actorId: string;
    reasonRedacted: string;
    decidedAt: string;
  }): Promise<CanonicalApproval> {
    const approval = this.approvals.get(input.approvalId);
    if (!approval || approval.projectId !== input.projectId) {
      throw new ApprovalPersistenceError(
        "decide_approval",
        "Approval not found.",
      );
    }
    if (approval.status !== input.expectedStatus) {
      throw new ApprovalPersistenceError(
        "decide_approval",
        `status compare-and-set conflict: expected ${input.expectedStatus}, got ${approval.status}`,
      );
    }
    const updated: CanonicalApproval = {
      ...approval,
      status: input.status,
      approverId:
        input.status === "approved" || input.status === "rejected"
          ? input.actorId
          : approval.approverId,
      decisionReasonRedacted: input.reasonRedacted,
      decidedAt: input.decidedAt,
      revokedAt: input.status === "revoked" ? input.decidedAt : null,
      updatedAt: input.decidedAt,
    };
    this.approvals.set(input.approvalId, updated);
    return { ...updated };
  }

  async appendAuditEvent(event: ApprovalAuditEvent): Promise<void> {
    const existing = this.auditEvents.get(event.approvalId) ?? [];
    existing.push(event);
    this.auditEvents.set(event.approvalId, existing);
  }

  async claimExecution(input: { projectId: string; approvalId: string; claimedAt: string }): Promise<boolean> {
    const approval = this.approvals.get(input.approvalId);
    if (!approval || approval.projectId !== input.projectId || approval.executionClaimedAt) return false;
    this.approvals.set(input.approvalId, { ...approval, executionClaimedAt: input.claimedAt, updatedAt: input.claimedAt });
    return true;
  }

  async listAuditEvents(
    projectId: string,
    approvalId: string,
  ): Promise<readonly ApprovalAuditEvent[]> {
    const events = this.auditEvents.get(approvalId) ?? [];
    return events
      .filter((e) => e.projectId === projectId)
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      );
  }

  /** Seed the repository with sample approvals for explicit demo/test setup only. */
  seedSampleApprovals(): void {
    const now = new Date("2026-07-27T12:00:00.000Z").toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const projectId = "proj_demo";
    const orgId = "org_demo";

    const sampleData: Array<{
      id: string;
      requesterId: string;
      status: CanonicalApprovalStatus;
      actionHash: string;
      policy: Record<string, unknown>;
      scope: Record<string, unknown>;
      expiresAt: string;
      reasonRedacted: string | null;
      decidedAt: string | null;
    }> = [
      {
        id: "apr_demo_pending_1",
        requesterId: "user_workflow",
        status: "pending",
        actionHash:
          "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
        policy: {
          id: "policy_default_safe",
          version: "1.0",
          hash: "policy_hash_demo",
        },
        scope: {
          kind: "workflow_step",
          resourceId: "step_sheets_append",
          permissions: ["write:google_sheets"],
          constraints: { maxRows: 100 },
        },
        expiresAt: tomorrow,
        reasonRedacted: null,
        decidedAt: null,
      },
      {
        id: "apr_demo_approved_1",
        requesterId: "user_workflow",
        status: "approved",
        actionHash:
          "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1",
        policy: {
          id: "policy_standard",
          version: "1.0",
          hash: "policy_hash_standard",
        },
        scope: {
          kind: "workflow_step",
          resourceId: "step_linear_create",
          permissions: ["write:linear"],
          constraints: {},
        },
        expiresAt: tomorrow,
        reasonRedacted: "Approved by project owner.",
        decidedAt: now,
      },
      {
        id: "apr_demo_rejected_1",
        requesterId: "user_workflow",
        status: "rejected",
        actionHash:
          "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        policy: {
          id: "policy_strict",
          version: "1.0",
          hash: "policy_hash_strict",
        },
        scope: {
          kind: "workflow_step",
          resourceId: "step_slack_send",
          permissions: ["external:slack"],
          constraints: {},
        },
        expiresAt: tomorrow,
        reasonRedacted: "External communication requires manager approval.",
        decidedAt: now,
      },
    ];

    for (const data of sampleData) {
      const approval: CanonicalApproval = {
        id: data.id,
        organizationId: orgId,
        projectId,
        runId: `run_demo_${data.id}`,
        requesterId: data.requesterId,
        approverId:
          data.status === "approved" || data.status === "rejected"
            ? "user_sha"
            : null,
        status: data.status,
        actionHash: data.actionHash,
        actionByteLength: 128,
        hashAlgorithm: "sha256",
        policy: data.policy as unknown as ApprovalPolicyBinding,
        policyHash: "policy_binding_hash_demo",
        scope: data.scope as unknown as ApprovalScope,
        scopeHash: "scope_binding_hash_demo",
        expiresAt: data.expiresAt,
        decisionReasonRedacted: data.reasonRedacted,
        decidedAt: data.decidedAt,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
        sample: true,
        executionClaimedAt: null,
      };

      const event: ApprovalAuditEvent = {
        id: randomUUID(),
        schemaVersion: 1,
        approvalId: approval.id,
        projectId,
        actorId: data.requesterId,
        eventType: "requested",
        actionHash: approval.actionHash,
        policyHash: approval.policyHash,
        scopeHash: approval.scopeHash,
        reasonCode: "approval_requested",
        metadata: {},
        createdAt: now,
      };

      this.approvals.set(approval.id, { ...approval });
      this.auditEvents.set(approval.id, [{ ...event }]);
    }
  }
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApprovalAuditEvent,
  CanonicalApproval,
  CanonicalApprovalStatus,
} from "./contract";
import { ApprovalPersistenceError } from "./errors";
import type { ApprovalRepository } from "./repository";

type Row = Record<string, unknown>;

function detail(error: unknown): string {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : String(error);
}

function approvalFromRow(row: Row): CanonicalApproval {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    projectId: String(row.project_id),
    runId: (row.run_id as string | null) ?? null,
    requesterId: String(row.requester_id),
    approverId: (row.approver_id as string | null) ?? null,
    status: row.status as CanonicalApprovalStatus,
    actionHash: String(row.action_hash),
    actionByteLength: Number(row.action_byte_length),
    hashAlgorithm: "sha256",
    policy: row.policy_binding as CanonicalApproval["policy"],
    policyHash: String(row.policy_hash),
    scope: row.approval_scope as CanonicalApproval["scope"],
    scopeHash: String(row.scope_hash),
    expiresAt: String(row.expires_at),
    decisionReasonRedacted:
      (row.decision_reason_redacted as string | null) ?? null,
    decidedAt: (row.decided_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    sample: Boolean(row.sample),
    executionClaimedAt: (row.execution_claimed_at as string | null) ?? null,
  };
}

function approvalToRow(approval: CanonicalApproval): Row {
  return {
    id: approval.id,
    organization_id: approval.organizationId,
    project_id: approval.projectId,
    run_id: approval.runId,
    requester_id: approval.requesterId,
    approver_id: approval.approverId,
    status: approval.status,
    action_hash: approval.actionHash,
    action_byte_length: approval.actionByteLength,
    hash_algorithm: approval.hashAlgorithm,
    policy_binding: approval.policy,
    policy_hash: approval.policyHash,
    approval_scope: approval.scope,
    scope_hash: approval.scopeHash,
    expires_at: approval.expiresAt,
    decision_reason_redacted: approval.decisionReasonRedacted,
    decided_at: approval.decidedAt,
    revoked_at: approval.revokedAt,
    created_at: approval.createdAt,
    updated_at: approval.updatedAt,
    sample: approval.sample,
    execution_claimed_at: approval.executionClaimedAt,
  };
}

function eventFromRow(row: Row): ApprovalAuditEvent {
  return {
    id: String(row.id),
    schemaVersion: 1,
    approvalId: String(row.approval_id),
    projectId: String(row.project_id),
    actorId: String(row.actor_id),
    eventType: row.event_type as ApprovalAuditEvent["eventType"],
    actionHash: String(row.action_hash),
    policyHash: String(row.policy_hash),
    scopeHash: String(row.scope_hash),
    reasonCode: String(row.reason_code),
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: String(row.created_at),
  };
}

function eventToRow(event: ApprovalAuditEvent): Row {
  return {
    id: event.id,
    schema_version: event.schemaVersion,
    approval_id: event.approvalId,
    project_id: event.projectId,
    actor_id: event.actorId,
    event_type: event.eventType,
    action_hash: event.actionHash,
    policy_hash: event.policyHash,
    scope_hash: event.scopeHash,
    reason_code: event.reasonCode,
    metadata: event.metadata,
    created_at: event.createdAt,
  };
}

export class SupabaseApprovalRepository implements ApprovalRepository {
  constructor(private readonly client: SupabaseClient) {}

  async insertApproval(
    approval: CanonicalApproval,
    requestedEvent: ApprovalAuditEvent,
  ): Promise<void> {
    const { error } = await this.client
      .from("canonical_approvals")
      .insert(approvalToRow(approval));
    if (error) {
      throw new ApprovalPersistenceError("insert_approval", detail(error));
    }
    await this.appendAuditEvent(requestedEvent);
  }

  async findApproval(
    projectId: string,
    approvalId: string,
  ): Promise<CanonicalApproval | null> {
    const { data, error } = await this.client
      .from("canonical_approvals")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", approvalId)
      .maybeSingle();
    if (error) {
      throw new ApprovalPersistenceError("find_approval", detail(error));
    }
    return data ? approvalFromRow(data as Row) : null;
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
    const { data, error } = await this.client
      .from("canonical_approvals")
      .update({
        status: input.status,
        approver_id:
          input.status === "approved" || input.status === "rejected"
            ? input.actorId
            : undefined,
        last_decision_actor_id: input.actorId,
        decision_reason_redacted: input.reasonRedacted,
        decided_at: input.decidedAt,
        revoked_at: input.status === "revoked" ? input.decidedAt : null,
        updated_at: input.decidedAt,
      })
      .eq("project_id", input.projectId)
      .eq("id", input.approvalId)
      .eq("status", input.expectedStatus)
      .select("*")
      .maybeSingle();
    if (error) {
      throw new ApprovalPersistenceError("decide_approval", detail(error));
    }
    if (!data) {
      throw new ApprovalPersistenceError(
        "decide_approval",
        "status compare-and-set conflict",
      );
    }
    return approvalFromRow(data as Row);
  }

  async appendAuditEvent(event: ApprovalAuditEvent): Promise<void> {
    const { error } = await this.client
      .from("canonical_approval_audit_events")
      .insert(eventToRow(event));
    if (error) {
      throw new ApprovalPersistenceError("append_approval_audit", detail(error));
    }
  }

  async claimExecution(input: { projectId: string; approvalId: string; claimedAt: string }): Promise<boolean> {
    const { data, error } = await this.client.from("canonical_approvals")
      .update({ execution_claimed_at: input.claimedAt, updated_at: input.claimedAt })
      .eq("project_id", input.projectId).eq("id", input.approvalId).is("execution_claimed_at", null)
      .select("id").maybeSingle();
    if (error) throw new ApprovalPersistenceError("claim_execution", detail(error));
    return Boolean(data);
  }

  async listAuditEvents(
    projectId: string,
    approvalId: string,
  ): Promise<readonly ApprovalAuditEvent[]> {
    const { data, error } = await this.client
      .from("canonical_approval_audit_events")
      .select("*")
      .eq("project_id", projectId)
      .eq("approval_id", approvalId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      throw new ApprovalPersistenceError("list_approval_audit", detail(error));
    }
    return (data ?? []).map((row) => eventFromRow(row as Row));
  }
}

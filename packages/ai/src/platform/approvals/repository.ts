import type {
  ApprovalAuditEvent,
  CanonicalApproval,
  CanonicalApprovalStatus,
} from "./contract";

export interface ApprovalRepository {
  insertApproval(
    approval: CanonicalApproval,
    requestedEvent: ApprovalAuditEvent,
  ): Promise<void>;
  findApproval(
    projectId: string,
    approvalId: string,
  ): Promise<CanonicalApproval | null>;
  decide(input: {
    projectId: string;
    approvalId: string;
    expectedStatus: CanonicalApprovalStatus;
    status: CanonicalApprovalStatus;
    actorId: string;
    reasonRedacted: string;
    decidedAt: string;
  }): Promise<CanonicalApproval>;
  appendAuditEvent(event: ApprovalAuditEvent): Promise<void>;
  claimExecution(input: { projectId: string; approvalId: string; claimedAt: string }): Promise<boolean>;
  listAuditEvents(
    projectId: string,
    approvalId: string,
  ): Promise<readonly ApprovalAuditEvent[]>;
}

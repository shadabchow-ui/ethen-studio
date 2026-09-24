import type { RunPolicySnapshot } from "../runs";

export const CANONICAL_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "revoked",
  "expired",
] as const;

export type CanonicalApprovalStatus =
  (typeof CANONICAL_APPROVAL_STATUSES)[number];

export const APPROVAL_AUDIT_EVENT_TYPES = [
  "requested",
  "approved",
  "rejected",
  "revoked",
  "expired",
  "authorization_allowed",
  "authorization_denied",
] as const;

export type ApprovalAuditEventType =
  (typeof APPROVAL_AUDIT_EVENT_TYPES)[number];

export interface ApprovalScope {
  kind: string;
  resourceId: string | null;
  permissions: readonly string[];
  constraints: Readonly<Record<string, unknown>>;
}

export interface ApprovalPolicyBinding {
  snapshot: RunPolicySnapshot;
  requireDifferentApprover: boolean;
}

export interface CanonicalApproval {
  id: string;
  organizationId: string;
  projectId: string;
  runId: string | null;
  requesterId: string;
  approverId: string | null;
  status: CanonicalApprovalStatus;
  actionHash: string;
  actionByteLength: number;
  hashAlgorithm: "sha256";
  policy: ApprovalPolicyBinding;
  policyHash: string;
  scope: ApprovalScope;
  scopeHash: string;
  expiresAt: string;
  decisionReasonRedacted: string | null;
  decidedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Demo/test evidence is never eligible for production authorization. */
  sample: boolean;
  executionClaimedAt: string | null;
}

export interface ApprovalAuditEvent {
  id: string;
  schemaVersion: 1;
  approvalId: string;
  projectId: string;
  actorId: string;
  eventType: ApprovalAuditEventType;
  actionHash: string;
  policyHash: string;
  scopeHash: string;
  reasonCode: string;
  metadata: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export interface ApprovalEnvelope extends CanonicalApproval {
  auditEvents: readonly ApprovalAuditEvent[];
}

export interface ApprovalAccessScope {
  projectId: string;
  actorId: string;
}

export interface RequestApprovalInput {
  organizationId: string;
  projectId: string;
  runId?: string | null;
  requesterId: string;
  actionBytes: Uint8Array;
  policy: ApprovalPolicyBinding;
  scope: ApprovalScope;
  expiresAt: string;
}

export interface ApprovalAuthorizationInput {
  actionBytes: Uint8Array;
  policy: ApprovalPolicyBinding;
  scope: ApprovalScope;
  runId?: string | null;
}

export type ApprovalDenialCode =
  | "not_found"
  | "not_approved"
  | "expired"
  | "revoked"
  | "action_mismatch"
  | "policy_mismatch"
  | "scope_mismatch"
  | "run_mismatch";

export type ApprovalAuthorizationResult =
  | { allowed: true; approval: ApprovalEnvelope }
  | {
      allowed: false;
      code: ApprovalDenialCode;
      approval: ApprovalEnvelope | null;
    };

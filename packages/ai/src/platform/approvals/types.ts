// lib/platform/approvals/types.ts
//
// Bridge types for the platform approval queue surface (/approvals). These
// wrap the existing lib/approvals ApprovalProposal type with the extra
// surface fields needed by the platform spine (workflow/run/step context,
// risk tiers, cross-links). No duplicate persistence logic.

import type { ApprovalProposal, ApprovalRiskLabel, ApprovalStatus } from "@ethen/contracts/approvals/types";

/** Risk tier surfaced in the platform approval UI. */
export type ApprovalRiskTier =
  | "safe_read"
  | "writes_data"
  | "external_effect"
  | "destructive"
  | "privileged";

/** Extended lifecycle status used by the queue surface. */
export type ApprovalQueueStatus =
  | ApprovalStatus
  | "expired";

export const APPROVAL_QUEUE_STATUS_LABELS: Record<ApprovalQueueStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  canceled: "Canceled",
  executed: "Executed",
  failed: "Failed",
  stale: "Stale",
  expired: "Expired",
};

/** A platform approval queue entry — wraps an ApprovalProposal with context. */
export interface PlatformApprovalEntry {
  id: string;
  /** Underlying ApprovalProposal, when it exists. */
  proposal: ApprovalProposal | null;
  /** Workflow this approval belongs to, if known. */
  workflowId: string | null;
  workflowName: string | null;
  /** Run this approval belongs to, if known. */
  runId: string | null;
  /** Step this approval binds to, if known. */
  stepId: string | null;
  stepName: string | null;
  /** Tool/app being approved. */
  toolId: string;
  appId: string | null;
  /** Risk tier + label. */
  riskTier: ApprovalRiskTier;
  riskLabel: ApprovalRiskLabel;
  /** Exact parameters requested, redacted of secrets. */
  parameters: Record<string, unknown>;
  /** Human-readable action summary. */
  actionRequested: string;
  /** Side effects described in plain English. */
  sideEffects: string;
  /** Lifecycle status. */
  status: ApprovalQueueStatus;
  /** Approver identity, when known. */
  approver: { id: string | null; label: string } | null;
  /** Approve/reject can be persisted safely today. Honest: scaffolded. */
  decisionPersistable: boolean;
  /** Whether this record is sample/fixture data. */
  sample: boolean;
  createdAt: string;
  updatedAt: string;
}
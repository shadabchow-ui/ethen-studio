// lib/platform/audit/types.ts
//
// Audit log surface types for /audit-log. These wrap lib/audit AuditEvent
// with platform-context fields (project/trace). Audit log values must never
// expose secrets — fixtures redact known secret patterns.

export type AuditEventType =
  | "workflow_created"
  | "workflow_run_started"
  | "workflow_step_completed"
  | "workflow_step_failed"
  | "workflow_step_blocked"
  | "approval_requested"
  | "approval_approved"
  | "approval_rejected"
  | "approval_expired"
  | "policy_decision"
  | "policy_updated"
  | "action_executed"
  | "action_blocked";

export const AUDIT_EVENT_TYPE_LABELS: Record<AuditEventType, string> = {
  workflow_created: "Workflow created",
  workflow_run_started: "Workflow run started",
  workflow_step_completed: "Workflow step completed",
  workflow_step_failed: "Workflow step failed",
  workflow_step_blocked: "Workflow step blocked",
  approval_requested: "Approval requested",
  approval_approved: "Approval approved",
  approval_rejected: "Approval rejected",
  approval_expired: "Approval expired",
  policy_decision: "Policy decision",
  policy_updated: "Policy updated",
  action_executed: "Action executed",
  action_blocked: "Action blocked",
};

/**
 * P10 execution correlation carried inside audit `metadata` (fixed DB
 * columns are unchanged). Canonical namespace: `metadata.correlation`.
 * All fields nullable; absent on historical entries. Correlation only —
 * correlation identifiers are never authorization.
 */
export interface AuditExecutionCorrelation {
  runId?: string | null;
  attemptId?: string | null;
  jobId?: string | null;
  receiptId?: string | null;
  evidenceId?: string | null;
}

export const AUDIT_CORRELATION_KEY = "correlation";

export function buildAuditCorrelation(
  correlation: AuditExecutionCorrelation,
): Record<string, AuditExecutionCorrelation> {
  const scrubbed: AuditExecutionCorrelation = {};
  for (const [key, value] of Object.entries(correlation)) {
    if (typeof value === "string" && value.length > 0) {
      (scrubbed as Record<string, string>)[key] = value;
    }
  }
  return { [AUDIT_CORRELATION_KEY]: scrubbed };
}

export function readAuditCorrelation(
  metadata: Record<string, unknown> | null | undefined,
): AuditExecutionCorrelation {
  const raw = metadata?.[AUDIT_CORRELATION_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: AuditExecutionCorrelation = {};
  for (const key of ["runId", "attemptId", "jobId", "receiptId", "evidenceId"] as const) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}

export interface AuditLogEntry {
  id: string;
  eventType: AuditEventType;
  actor: { id: string | null; label: string };
  projectId: string | null;
  /** Target object the event applies to. */
  target: { kind: string; id: string; label: string };
  /** Decision/result if any. */
  decision: string | null;
  /** Trace id correlated with workflow runs / policy decisions. */
  traceId: string | null;
  /** Timestamp. */
  timestamp: string;
  /** Whether this record is sample/fixture data. */
  sample: boolean;
  /** Additional redacted metadata. */
  metadata: Record<string, unknown>;
  /** SHA-256 digest of the canonical event and prior digest. */
  previousHash?: string | null;
  entryHash?: string;
}

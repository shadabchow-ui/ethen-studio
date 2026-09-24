import type { ToolId } from "@ethen/contracts/tools/types";
import { recordAuditEvent } from "./service";

// ── Employee lifecycle audit helpers ─────────────────────────────────────

export function auditEmployeeCreated(
  employeeId: string,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "employee.created",
    "agent.runtime",
    null,
    { employeeId, ...(metadata ?? {}) },
  );
}

export function auditEmployeeUpdated(
  employeeId: string,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "employee.updated",
    "agent.runtime",
    null,
    { employeeId, ...(metadata ?? {}) },
  );
}

export function auditEmployeePaused(
  employeeId: string,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "employee.paused",
    "agent.runtime",
    null,
    { employeeId, ...(metadata ?? {}) },
  );
}

export function auditEmployeeResumed(
  employeeId: string,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "employee.resumed",
    "agent.runtime",
    null,
    { employeeId, ...(metadata ?? {}) },
  );
}

// ── Run lifecycle audit helpers ──────────────────────────────────────────

export function auditRunStarted(
  runId: string,
  employeeId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "run.started",
    "agent.runtime",
    runId,
    { runId, employeeId: employeeId ?? null, ...(metadata ?? {}) },
  );
}

export function auditRunCompleted(
  runId: string,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "run.completed",
    "agent.runtime",
    runId,
    { runId, ...(metadata ?? {}) },
  );
}

export function auditRunFailed(
  runId: string,
  error?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "run.failed",
    "agent.runtime",
    runId,
    { runId, error: error ?? null, ...(metadata ?? {}) },
  );
}

export function auditRunBlocked(
  runId: string,
  reason?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "run.blocked",
    "agent.runtime",
    runId,
    { runId, reason: reason ?? "Policy blocked run execution.", ...(metadata ?? {}) },
  );
}

// ── Tool lifecycle audit helpers ─────────────────────────────────────────

export function auditToolProposed(
  toolId: ToolId,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "tool.proposed",
    toolId,
    sessionId ?? null,
    { ...(metadata ?? {}) },
  );
}

export function auditToolAllowed(
  toolId: ToolId,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "tool.allowed",
    toolId,
    sessionId ?? null,
    { ...(metadata ?? {}) },
  );
}

export function auditToolBlocked(
  toolId: ToolId,
  reason?: string | null,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "tool.blocked",
    toolId,
    sessionId ?? null,
    { reason: reason ?? null, ...(metadata ?? {}) },
  );
}

export function auditToolExecuted(
  toolId: ToolId,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "tool.executed",
    toolId,
    sessionId ?? null,
    { ...(metadata ?? {}) },
  );
}

// ── Approval lifecycle audit helpers ─────────────────────────────────────

export function auditApprovalRequested(
  approvalRequestId: string,
  toolId: ToolId,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "approval.requested",
    toolId,
    sessionId ?? null,
    { approvalRequestId, ...(metadata ?? {}) },
  );
}

export function auditApprovalApproved(
  approvalRequestId: string,
  toolId: ToolId,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "approval.approved",
    toolId,
    sessionId ?? null,
    { approvalRequestId, ...(metadata ?? {}) },
  );
}

export function auditApprovalRejected(
  approvalRequestId: string,
  toolId: ToolId,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "approval.rejected",
    toolId,
    sessionId ?? null,
    { approvalRequestId, ...(metadata ?? {}) },
  );
}

// ── Platform lifecycle audit helpers ─────────────────────────────────────

export function auditReportGenerated(
  reportId: string,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "report.generated",
    "agent.runtime",
    null,
    { reportId, ...(metadata ?? {}) },
  );
}

export function auditBudgetThresholdReached(
  budgetPolicyId: string,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "budget.threshold_reached",
    "agent.runtime",
    null,
    { budgetPolicyId, ...(metadata ?? {}) },
  );
}

export function auditConnectedAppChanged(
  connectedAppId: string,
  changeType: string,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "connected_app.changed",
    "agent.runtime",
    null,
    { connectedAppId, changeType, ...(metadata ?? {}) },
  );
}

// ── Run updated lifecycle ───────────────────────────────────────────────

export function auditRunUpdated(
  runId: string,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "run.updated",
    "agent.runtime",
    runId,
    { runId, ...(metadata ?? {}) },
  );
}

// ── Tool call lifecycle ─────────────────────────────────────────────────

export function auditToolCalled(
  toolId: ToolId,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "tool.called",
    toolId,
    sessionId ?? null,
    { ...(metadata ?? {}) },
  );
}

export function auditToolSucceeded(
  toolId: ToolId,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "tool.succeeded",
    toolId,
    sessionId ?? null,
    { ...(metadata ?? {}) },
  );
}

export function auditToolFailed(
  toolId: ToolId,
  reason?: string | null,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "tool.failed",
    toolId,
    sessionId ?? null,
    { reason: reason ?? null, ...(metadata ?? {}) },
  );
}

// ── Artifact / Asset events ─────────────────────────────────────────────

export function auditArtifactCreated(
  artifactId: string,
  runId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "artifact.created",
    "agent.runtime",
    runId ?? null,
    { artifactId, runId: runId ?? null, ...(metadata ?? {}) },
  );
}

export function auditAssetCreated(
  assetId: string,
  runId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "asset.created",
    "agent.runtime",
    runId ?? null,
    { assetId, runId: runId ?? null, ...(metadata ?? {}) },
  );
}

// ── Provider events ─────────────────────────────────────────────────────

export function auditProviderSelected(
  providerId: string,
  toolId?: ToolId | null,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "provider.selected",
    toolId ?? "agent.runtime",
    sessionId ?? null,
    { providerId, ...(metadata ?? {}) },
  );
}

export function auditProviderFailed(
  providerId: string,
  reason?: string | null,
  toolId?: ToolId | null,
  sessionId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "provider.failed",
    toolId ?? "agent.runtime",
    sessionId ?? null,
    { providerId, reason: reason ?? null, ...(metadata ?? {}) },
  );
}

// ── Usage / Evidence events ─────────────────────────────────────────────

export function auditUsageRecorded(
  runId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "usage.recorded",
    "agent.runtime",
    runId ?? null,
    { runId: runId ?? null, ...(metadata ?? {}) },
  );
}

export function auditEvidenceRecorded(
  evidenceId: string,
  runId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "evidence.recorded",
    "agent.runtime",
    runId ?? null,
    { evidenceId, runId: runId ?? null, ...(metadata ?? {}) },
  );
}

// ── Voice consent lifecycle events ───────────────────────────────────────

export function auditConsentCreated(
  consentId: string,
  projectId: string,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "consent.created",
    "voice.consent",
    null,
    { consentId, projectId, ...(metadata ?? {}) },
  );
}

export function auditConsentRevoked(
  consentId: string,
  projectId: string,
  metadata?: Record<string, unknown> | null,
) {
  return recordAuditEvent(
    "consent.revoked",
    "voice.consent",
    null,
    { consentId, projectId, ...(metadata ?? {}) },
  );
}

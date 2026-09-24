import type { ToolId } from "@ethen/contracts/tools/types";

/** All audit event types covering the full action lifecycle and credential operations. */
export type AuditEventType =
  | "action_executed"               // read-only or auto-approved action ran
  | "action_approval_requested"      // write/destructive action proposed; waiting for user
  | "action_approved"                // user approved the proposal
  | "action_rejected"                // user rejected the proposal
  | "action_canceled"                // user canceled the proposal
  | "action_executing"               // approved action is dispatching
  | "action_failed"                  // approved action failed during execution
  | "action_blocked"                 // action was blocked by policy (never proposed)
  | "credential_metadata_registered" // credential metadata was registered in the vault
  | "credential_validation_failed"   // credential metadata failed validation
  | "live_readiness_checked"         // live connector readiness was assessed
  | "plaintext_secret_rejected"      // a plaintext secret was rejected at the vault boundary
  // ── Employee lifecycle events ────────────────────────────────────────
  | "employee.created"
  | "employee.updated"
  | "employee.paused"
  | "employee.resumed"
  // ── Run lifecycle events ─────────────────────────────────────────────
  | "run.started"
  | "run.updated"
  | "run.completed"
  | "run.failed"
  | "run.blocked"
  // ── Tool lifecycle events ────────────────────────────────────────────
  | "tool.proposed"
  | "tool.called"
  | "tool.allowed"
  | "tool.blocked"
  | "tool.executed"
  | "tool.succeeded"
  | "tool.failed"
  // ── Approval lifecycle events ────────────────────────────────────────
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  // ── Artifact / Asset events ──────────────────────────────────────────
  | "artifact.created"
  | "asset.created"
  // ── Provider lifecycle events ────────────────────────────────────────
  | "provider.selected"
  | "provider.failed"
  // ── Usage / Evidence events ──────────────────────────────────────────
  | "usage.recorded"
  | "evidence.recorded"
  // ── Platform lifecycle events ────────────────────────────────────────
  | "report.generated"
  | "budget.threshold_reached"
  | "connected_app.changed"
  // ── Voice consent lifecycle events ───────────────────────────────────
  | "consent.created"
  | "consent.revoked"
  // ── Agent lifecycle events ───────────────────────────────────────────
  | "agent.launch"            // authorized agent launch created a session (not execution)
  | "agent.launch_denied"     // launch rejected (unknown, unauthenticated, frozen)
  | "agent.session_created";  // tenant-owned agent session record created

/** Display label for each event type. */
export const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
  action_executed: "Action Executed",
  action_approval_requested: "Approval Requested",
  action_approved: "Action Approved",
  action_rejected: "Action Rejected",
  action_canceled: "Action Canceled",
  action_executing: "Action Executing",
  action_failed: "Action Failed",
  action_blocked: "Action Blocked",
  credential_metadata_registered: "Credential Registered",
  credential_validation_failed: "Credential Validation Failed",
  live_readiness_checked: "Live Readiness Checked",
  plaintext_secret_rejected: "Plaintext Secret Rejected",
  "employee.created": "Employee Created",
  "employee.updated": "Employee Updated",
  "employee.paused": "Employee Paused",
  "employee.resumed": "Employee Resumed",
  "run.started": "Run Started",
  "run.updated": "Run Updated",
  "run.completed": "Run Completed",
  "run.failed": "Run Failed",
  "run.blocked": "Run Blocked",
  "tool.proposed": "Tool Proposed",
  "tool.called": "Tool Called",
  "tool.allowed": "Tool Allowed",
  "tool.blocked": "Tool Blocked",
  "tool.executed": "Tool Executed",
  "tool.succeeded": "Tool Succeeded",
  "tool.failed": "Tool Failed",
  "approval.requested": "Approval Requested",
  "approval.approved": "Approval Approved",
  "approval.rejected": "Approval Rejected",
  "artifact.created": "Artifact Created",
  "asset.created": "Asset Created",
  "provider.selected": "Provider Selected",
  "provider.failed": "Provider Failed",
  "usage.recorded": "Usage Recorded",
  "evidence.recorded": "Evidence Recorded",
  "report.generated": "Report Generated",
  "budget.threshold_reached": "Budget Threshold Reached",
  "connected_app.changed": "Connected App Changed",
  "consent.created": "Consent Created",
  "consent.revoked": "Consent Revoked",
  "agent.launch": "Agent Launch",
  "agent.launch_denied": "Agent Launch Denied",
  "agent.session_created": "Agent Session Created",
};

/** A single immutable entry in the audit log. */
export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  toolId: ToolId;
  sessionId: string | null;
  /** Arbitrary structured detail — sensitive values must be redacted before write. */
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Sanitised audit event safe to expose to the client. */
export interface ClientAuditEvent {
  id: string;
  eventType: AuditEventType;
  toolId: ToolId;
  sessionId: string | null;
  label: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function toClientAuditEvent(
  event: AuditEvent,
): ClientAuditEvent {
  return {
    id: event.id,
    eventType: event.eventType,
    toolId: event.toolId,
    sessionId: event.sessionId,
    label: AUDIT_EVENT_LABELS[event.eventType],
    metadata: event.metadata,
    createdAt: event.createdAt,
  };
}

/** Bundle of evidence items captured during a run or approval flow. */
export interface EvidencePackage {
  id: string;
  approvalRequestId: string | null;
  runId: string | null;
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

/** Human-readable entry in an audit trail, derived from one or more AuditEvents. */
export interface AuditEntry {
  id: string;
  sessionId: string | null;
  eventType: AuditEventType;
  label: string;
  summary: string;
  actor: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

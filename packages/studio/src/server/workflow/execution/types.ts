/** Studio V5 canvas execution — run/binding/event types (STUDIO_13). Server-only. */
import "server-only";
import type { ProjectScope } from "../../../contracts/scope";
import type { IcuAmount } from "../../../contracts/money";

export const WORKFLOW_RUN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "RECONCILING",
] as const;
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

export function isWorkflowRunStatus(value: string): value is WorkflowRunStatus {
  return (WORKFLOW_RUN_STATUSES as readonly string[]).includes(value);
}

export const NODE_RUN_STATUSES = [
  "PENDING",
  "QUEUED",
  "RUNNING",
  "REUSED",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "SKIPPED",
] as const;
export type NodeRunStatus = (typeof NODE_RUN_STATUSES)[number];

export function isNodeRunStatus(value: string): value is NodeRunStatus {
  return (NODE_RUN_STATUSES as readonly string[]).includes(value);
}

export const TERMINAL_NODE_RUN_STATUSES: readonly NodeRunStatus[] = [
  "REUSED",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "SKIPPED",
] as const;

/**
 * One envelope per run: the run reservation plus every scoped child
 * binding. Retry/cancel/recover all operate on this envelope — never on
 * ad-hoc job handles — so child settlement stays exactly-once.
 */
export interface WorkflowRunEnvelope {
  runId: string;
  scope: ProjectScope;
  graphId: string;
  revision: number;
  dagHash: string;
  /** Parent reservation idempotency key; children bind via parentReservationId. */
  reservationKey: string;
  budgetIcu: IcuAmount;
  createdAt: string;
}

/** node→Job binding: exactly one durable job per executed node per run. */
export interface NodeRunBinding {
  runId: string;
  nodeId: string;
  jobId: string | null;
  status: NodeRunStatus;
  cacheKey: string | null;
  outputHash: string | null;
  settledIcu: IcuAmount | null;
  attempt: number;
  error: string | null;
  updatedAt: string;
}

export interface WorkflowRun {
  runId: string;
  envelope: WorkflowRunEnvelope;
  status: WorkflowRunStatus;
  /** Selected-node partial rerun scope, or null for a full run. */
  selection: readonly string[] | null;
  bindings: Readonly<Record<string, NodeRunBinding>>;
  actualIcu: IcuAmount;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export const RUN_EVENT_TYPES = [
  "run.created",
  "run.started",
  "run.completed",
  "run.failed",
  "run.cancel_requested",
  "run.cancelled",
  "run.recovered",
  "node.queued",
  "node.started",
  "node.reused",
  "node.succeeded",
  "node.failed",
  "node.cancelled",
  "node.retried",
] as const;
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

/** Append-only run event; the UI projection derives from these. */
export interface WorkflowRunEvent {
  runId: string;
  seq: number;
  type: RunEventType;
  nodeId: string | null;
  payload: Readonly<Record<string, unknown>>;
  at: string;
}

export type WorkflowExecutionErrorCode =
  | "INVALID_ENVELOPE"
  | "RAW_GRAPH_REJECTED"
  | "UNKNOWN_NODE"
  | "ADMISSION_FAILED"
  | "BUDGET_EXCEEDED"
  | "INVALID_TRANSITION"
  | "NOT_FOUND"
  | "SETTLEMENT_CONFLICT";

export const WORKFLOW_EXECUTION_ERROR_STATUS: Readonly<Record<WorkflowExecutionErrorCode, number>> = {
  INVALID_ENVELOPE: 400,
  RAW_GRAPH_REJECTED: 400,
  UNKNOWN_NODE: 400,
  ADMISSION_FAILED: 502,
  BUDGET_EXCEEDED: 402,
  INVALID_TRANSITION: 409,
  NOT_FOUND: 404,
  SETTLEMENT_CONFLICT: 409,
};

export class WorkflowExecutionError extends Error {
  readonly code: WorkflowExecutionErrorCode;
  constructor(code: WorkflowExecutionErrorCode, message: string) {
    super(message);
    this.name = "WorkflowExecutionError";
    this.code = code;
  }
}

/** Accessible status labels for run-tray/inspector consumers. */
export function workflowRunStatusLabel(status: WorkflowRunStatus): string {
  const labels: Record<WorkflowRunStatus, string> = {
    QUEUED: "Queued",
    RUNNING: "Running",
    COMPLETED: "Completed",
    FAILED: "Failed",
    CANCEL_REQUESTED: "Cancel requested",
    CANCELLED: "Cancelled",
    RECONCILING: "Reconciling",
  };
  return labels[status];
}

export function nodeRunStatusLabel(status: NodeRunStatus): string {
  const labels: Record<NodeRunStatus, string> = {
    PENDING: "Pending",
    QUEUED: "Queued",
    RUNNING: "Running",
    REUSED: "Reused from cache",
    SUCCEEDED: "Succeeded",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
    SKIPPED: "Skipped",
  };
  return labels[status];
}

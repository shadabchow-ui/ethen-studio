/** Studio V5 runtime — Temporal identity, signals and replay-safe reducer (STUDIO_05). */
import type { JobStatus } from "../../contracts/execution";

/**
 * Temporal workflow TYPE served by the worker bundle. The type derives
 * from the workflow export name (`studioJobWorkflow`), not from the
 * `studio-v5-job:` id convention — the bridge must start exactly this.
 */
export const STUDIO_JOB_WORKFLOW_TYPE = "studioJobWorkflow";
export const STUDIO_JOB_CANCEL_SIGNAL = "studio-v5-job-cancel";
export const STUDIO_JOB_CALLBACK_SIGNAL = "studio-v5-job-callback";
export const STUDIO_JOB_WAKE_SIGNAL = "studio-v5-job-wake";

/** Canonical workflow ID derives from the canonical job ID — never random. */
export function workflowIdForJob(jobId: string): string {
  return `studio-v5-job:${jobId}`;
}

export function jobIdFromWorkflowId(workflowId: string): string | null {
  const prefix = "studio-v5-job:";
  if (!workflowId.startsWith(prefix) || workflowId.length === prefix.length) return null;
  return workflowId.slice(prefix.length);
}

export interface StudioJobWorkflowInput {
  tenantId: string;
  projectId: string;
  jobId: string;
  /** fencing generation the workflow was (re)started under */
  generation: number;
  activityQueue?: string;
  carriedSignals?: readonly string[];
}

export interface StudioJobSignal {
  signalId: string;
  kind: "cancel" | "callback" | "wake";
  generation: number;
  payload: Readonly<Record<string, unknown>>;
}

/**
 * Deterministic workflow-state reducer. Pure: no clock, no randomness, no
 * I/O — the Temporal workflow and the replay test share exactly this logic,
 * so Temporal replay determinism is proven by construction plus test.
 */
export interface StudioWorkflowState {
  status: JobStatus;
  generation: number;
  processedSignalIds: readonly string[];
  ignoredStale: number;
  outcome: "open" | "completed" | "failed" | "cancelled";
}

export function initialWorkflowState(generation: number): StudioWorkflowState {
  return { status: "QUEUED", generation, processedSignalIds: [], ignoredStale: 0, outcome: "open" };
}

export function reduceWorkflowSignal(
  state: StudioWorkflowState,
  signal: StudioJobSignal,
): StudioWorkflowState {
  if (state.processedSignalIds.includes(signal.signalId)) return state;
  if (signal.generation < state.generation) {
    return { ...state, ignoredStale: state.ignoredStale + 1 };
  }
  const processedSignalIds = [...state.processedSignalIds, signal.signalId];
  if (signal.kind === "cancel") {
    return { ...state, processedSignalIds, status: "CANCEL_REQUESTED", outcome: "open" };
  }
  return { ...state, processedSignalIds };
}

export function reduceWorkflowStatus(
  state: StudioWorkflowState,
  status: JobStatus,
): StudioWorkflowState {
  const outcome =
    status === "COMPLETED"
      ? "completed"
      : status === "FAILED"
        ? "failed"
        : status === "CANCELLED"
          ? "cancelled"
          : state.outcome;
  return { ...state, status, outcome };
}

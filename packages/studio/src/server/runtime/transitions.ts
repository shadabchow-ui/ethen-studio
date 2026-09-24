/** Studio V5 runtime — transition guards and retry policy (STUDIO_05). Server-only. */
import "server-only";
import {
  TERMINAL_JOB_STATUSES,
  canTransitionJob,
  type JobStatus,
} from "../../contracts/execution";
import { RuntimeError } from "./types";

export function isTerminalStatus(status: JobStatus): boolean {
  return (TERMINAL_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

/** Worker-legal transitions exclude direct terminal jumps the worker cannot prove. */
export function assertWorkerTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransitionJob(from, to)) {
    throw new RuntimeError("INVALID_TRANSITION", `illegal job transition ${from} -> ${to}.`);
  }
  if (from === "CANCEL_REQUESTED" && to !== "CANCELLED" && to !== "RECONCILING" && to !== "FAILED") {
    throw new RuntimeError("INVALID_TRANSITION", `cancel-requested job cannot move to ${to}.`);
  }
}

export type RetryPlan =
  | { readonly kind: "linked_attempt" }
  | { readonly kind: "new_run"; readonly reason: string }
  | { readonly kind: "forbidden"; readonly reason: string };

/**
 * Retry policy: FAILED jobs get a linked attempt with a fresh eligibility/
 * price/policy check; ambiguous/unknown submits can never auto-retry —
 * reconciliation must resolve first; terminal COMPLETED/CANCELLED/EXPIRED
 * need an explicit new run.
 */
export function planRetry(status: JobStatus, submitAmbiguous: boolean): RetryPlan {
  if (submitAmbiguous) {
    return { kind: "forbidden", reason: "ambiguous provider submit must reconcile before any retry." };
  }
  if (status === "FAILED") return { kind: "linked_attempt" };
  if (status === "RECONCILING") {
    return { kind: "forbidden", reason: "reconciliation in flight; wait for resolution." };
  }
  if (status === "CANCEL_REQUESTED") {
    return { kind: "forbidden", reason: "cancellation in flight; wait for terminal state." };
  }
  if (isTerminalStatus(status)) {
    return { kind: "new_run", reason: `terminal ${status} requires an explicit new run.` };
  }
  return { kind: "forbidden", reason: `active job (${status}) cannot retry.` };
}

const MEASURABLE_STAGES: Readonly<Record<JobStatus, string>> = {
  QUEUED: "queued",
  RUNNING: "provider_running",
  OUTPUT_READY: "output_located",
  INGESTING: "ingesting",
  SETTLING: "settling",
  COMPLETED: "completed",
  CANCEL_REQUESTED: "cancel_requested",
  CANCELLED: "cancelled",
  FAILED: "failed",
  RECONCILING: "reconciling",
  EXPIRED: "expired",
};

export function stageFor(status: JobStatus): string {
  return MEASURABLE_STAGES[status];
}

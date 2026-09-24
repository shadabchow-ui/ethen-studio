/** Studio V5 runtime — typed UI states (STUDIO_05). Server-only. */
import "server-only";
import type { ApiError } from "../../contracts/errors";
import type { LoadState } from "../../contracts/states";
import type { JobStatus } from "../../contracts/execution";
import { stageFor } from "./transitions";
import type { JobProgress, RuntimeJob } from "./types";

function blocked<T>(code: ApiError["code"], message: string, actionLabel: string | null): LoadState<T> {
  return {
    kind: "blocked",
    data: null,
    error: { code, message, retryable: false, requestId: "runtime", details: {} },
    actionLabel,
  };
}

/**
 * Job progress projection. Exposes stage/percent only where measurable:
 * percent is null unless the provider or ingest reported a real fraction.
 * No fake progress, no blanket failed-no-charge.
 */
export function jobProgressState(job: RuntimeJob | null, measuredPercent: number | null): LoadState<JobProgress> {
  if (!job) return blocked("NOT_FOUND", "This job does not exist in this project.", null);
  const progress: JobProgress = {
    jobId: job.jobId,
    status: job.status,
    stage: stageFor(job.status),
    percent: measuredPercent,
    attemptNumber: 0,
    detail: null,
  };
  if (job.status === "FAILED") {
    return {
      kind: "error",
      data: progress,
      error: {
        code: "PROVIDER_ERROR",
        message: "This run failed. Successful charged outputs, if any, are listed on the receipt.",
        retryable: true,
        requestId: job.jobId,
        details: {},
      },
      actionLabel: "View receipt",
    };
  }
  if (job.status === "RECONCILING") {
    return {
      kind: "partial",
      data: progress,
      error: null,
      actionLabel: null,
    };
  }
  return { kind: "ready", data: progress, error: null, actionLabel: null };
}

export function jobStatusLabel(status: JobStatus): string {
  const labels: Readonly<Record<JobStatus, string>> = {
    QUEUED: "Queued",
    RUNNING: "Running",
    OUTPUT_READY: "Output located",
    INGESTING: "Saving to your library",
    SETTLING: "Finalizing charges",
    COMPLETED: "Completed",
    CANCEL_REQUESTED: "Cancelling",
    CANCELLED: "Cancelled",
    FAILED: "Failed",
    RECONCILING: "Checking provider status",
    EXPIRED: "Expired",
  };
  return labels[status];
}

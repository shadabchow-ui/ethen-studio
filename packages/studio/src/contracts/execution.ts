/** Studio V5 kernel — execution: request/quote/job/attempt/generation + states. */
import type { TaskName } from "./tasks";
import type { VersionPins } from "./versions";
import type { IcuAmount } from "./money";
import type { ProjectScope } from "./scope";

export const JOB_STATUSES = [
  "QUEUED",
  "RUNNING",
  "OUTPUT_READY",
  "INGESTING",
  "SETTLING",
  "COMPLETED",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "FAILED",
  "RECONCILING",
  "EXPIRED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

/** JSON-safe enum serialization roundtrip helpers. */
export function serializeJobStatus(status: JobStatus): string {
  return status;
}
export function parseJobStatus(value: unknown): JobStatus {
  if (typeof value === "string" && isJobStatus(value)) return value;
  throw new Error(`invalid JobStatus: ${JSON.stringify(value)}`);
}

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "FAILED",
  "EXPIRED",
] as const;

export const JOB_STATUS_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  QUEUED: ["RUNNING", "CANCEL_REQUESTED", "EXPIRED", "RECONCILING"],
  RUNNING: ["OUTPUT_READY", "FAILED", "CANCEL_REQUESTED", "RECONCILING", "EXPIRED"],
  OUTPUT_READY: ["INGESTING", "FAILED", "CANCEL_REQUESTED", "RECONCILING"],
  INGESTING: ["SETTLING", "FAILED", "CANCEL_REQUESTED", "RECONCILING"],
  SETTLING: ["COMPLETED", "FAILED", "RECONCILING"],
  COMPLETED: [],
  CANCEL_REQUESTED: ["CANCELLED", "RECONCILING", "FAILED"],
  CANCELLED: [],
  FAILED: ["RECONCILING"],
  RECONCILING: ["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"],
  EXPIRED: [],
} as const;

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[from].includes(to);
}

/** Legacy richer states project onto the canonical enum; history untouched. */
export function projectLegacyStatus(legacy: string): JobStatus {
  const upper = legacy.toUpperCase();
  if (isJobStatus(upper)) return upper;
  const map: Readonly<Record<string, JobStatus>> = {
    PENDING: "QUEUED",
    PLANNING: "QUEUED",
    DISPATCHED: "RUNNING",
    POLLING: "RUNNING",
    SUCCEEDED: "COMPLETED",
    SUCCESS: "COMPLETED",
    DONE: "COMPLETED",
    CANCELED: "CANCELLED",
    CANCELLING: "CANCEL_REQUESTED",
    ERROR: "FAILED",
    TIMEOUT: "EXPIRED",
    TIMED_OUT: "EXPIRED",
    UNKNOWN: "RECONCILING",
    AMBIGUOUS: "RECONCILING",
  };
  const projected = map[upper];
  if (!projected) throw new Error(`unmappable legacy job status: ${legacy}`);
  return projected;
}

export interface ExecutionRequest {
  task: TaskName;
  scope: ProjectScope;
  idempotencyKey: string;
  requestHash: string;
  parameters: Readonly<Record<string, unknown>>;
  providerParams: Readonly<Record<string, unknown>>;
  referenceAssetIds: readonly string[];
  identityBindingId: string | null;
  pins: VersionPins;
  endpointId: string | null;
}

export interface Quote {
  quoteId: string;
  task: TaskName;
  scope: ProjectScope;
  pins: VersionPins;
  endpointId: string;
  estimatedCostIcu: IcuAmount;
  capIcu: IcuAmount;
  meterUnit: string;
  meterQuantity: number;
  priceVersion: string;
  expiresAt: string;
}

export interface Job {
  jobId: string;
  task: TaskName;
  scope: ProjectScope;
  status: JobStatus;
  idempotencyKey: string;
  requestHash: string;
  quoteId: string;
  pins: VersionPins;
  endpointId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attempt {
  attemptId: string;
  jobId: string;
  attemptNumber: number;
  dispatchGeneration: number;
  operationKey: string;
  status: JobStatus;
  providerOperationId: string | null;
  createdAt: string;
}

export interface Generation {
  generationId: string;
  jobId: string;
  attemptId: string;
  assetVersionIds: readonly string[];
  createdAt: string;
}

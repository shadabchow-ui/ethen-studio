import type { JobEventName, JobRecord } from "../jobs";
import type { AdmissionResult } from "../governance/admission";

/**
 * JOB 04 — platform worker host types.
 */

/** Raised when the worker is started against a non-durable repository. */
export class WorkerStartRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerStartRefusedError";
  }
}

/** Lease lost mid-execution: another worker reclaimed, or lease expired. */
export class LeaseLostError extends Error {
  constructor(jobId: string) {
    super(`lease lost for job ${jobId}`);
    this.name = "LeaseLostError";
  }
}

/**
 * The worker was aborted (SIGTERM/SIGINT) mid-handler. The host abandons
 * WITHOUT terminalizing: the job stays claimed and becomes reclaimable when
 * its lease expires (crash-recovery contract).
 */
export class WorkerAbortedError extends Error {
  constructor(jobId: string) {
    super(`worker aborted mid-execution for job ${jobId}`);
    this.name = "WorkerAbortedError";
  }
}

/** Provider dispatch happened but the outcome is unknown — INDETERMINATE. */
export class PostDispatchUncertainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostDispatchUncertainError";
  }
}

/** The operation is unsafe to continue — HALT_UNSAFE. */
export class HaltUnsafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HaltUnsafeError";
  }
}

/** A bounded handler exceeded its declared execution deadline. */
export class WorkerTimeoutError extends Error {
  constructor(message: string) { super(message); this.name = "WorkerTimeoutError"; }
}

/**
 * A handler detected a cancellation request mid-execution (after upstream
 * cancellation was attempted truthfully). The host acknowledges the
 * cancellation -> terminal `cancelled`.
 */
export class CancellationRequestedError extends Error {
  constructor(jobId: string) {
    super(`cancellation requested for job ${jobId}`);
    this.name = "CancellationRequestedError";
  }
}

export type HandlerResult =
  | { ok: true; result?: Readonly<Record<string, unknown>> }
  | {
      ok: false;
      retryable: boolean;
      code: string;
      message: string;
    };

/** Context a handler uses to interact with the durable job lifecycle. */
export interface WorkerContext {
  readonly jobId: string;
  readonly workerId: string;
  /** Heartbeat (lease renewal). Throws LeaseLostError when ownership is lost. */
  heartbeat(detail?: Readonly<Record<string, unknown>>): Promise<void>;
  /** Record the stable external/provider dispatch boundary BEFORE the effect. */
  markProviderDispatched(operationKey: string): Promise<void>;
  /** Append a durable lifecycle event. */
  appendEvent(event: JobEventName, detail?: Readonly<Record<string, unknown>> | null): Promise<void>;
  /** True when cancellation has been requested for this job. */
  isCancellationRequested(): Promise<boolean>;
  /** True when the worker is being asked to stop (SIGTERM/SIGINT drain). */
  isAborted(): boolean;
  /** Abort-aware sleep: resolves early when the worker is being stopped. */
  wait(ms: number): Promise<void>;
}

export interface JobHandler {
  readonly kind: string;
  /**
   * When true the worker host refuses dispatch unless a verified canonical
   * approval (exact action binding, project, expiry, one-shot claim) is
   * present — see lib/platform/approvals/service.ts:verifyExecutionClaim.
   * Handlers that perform destructive / external effects must set this.
   */
  readonly requiresApproval?: boolean;
  /**
   * P09: when true (or when requiresApproval is true, which implies it) the
   * handler is consequential and the worker host enforces a fresh
   * authoritative `evaluateAdmission` ALLOW immediately before dispatch.
   * Without a configured admissionGate, a consequential handler halts closed.
   */
  readonly requiresAdmission?: boolean;
  execute(input: { job: JobRecord; ctx: WorkerContext }): Promise<HandlerResult>;
}

/**
 * P09 pre-dispatch admission gate: evaluates a fresh authoritative admission
 * decision for a claimed job immediately before consequential dispatch.
 * Implementations must fail closed (DENY on missing/stale facts).
 */
export interface PreDispatchAdmissionGate {
  evaluateJob(job: JobRecord): Promise<AdmissionResult>;
}

export interface WorkerLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface PlatformWorkerHostOptions {
  service: Pick<
    import("../jobs").DurableJobService,
    | "claimJob"
    | "heartbeat"
    | "markProviderDispatched"
    | "completeJob"
    | "failJob"
    | "markIndeterminate"
    | "markHaltUnsafe"
    | "markTimedOut"
    | "isCancellationRequested"
    | "acknowledgeCancellation"
    | "appendJobEvent"
    | "getJob"
  >;
  handlers: readonly JobHandler[];
  workerId: string;
  /** Org scope: claims/executes jobs for this organization only. */
  organizationId?: string;
  leaseSeconds?: number;
  pollIntervalMs?: number;
  /** Process at most N jobs then return (test seam; default: run forever). */
  maxJobs?: number;
  /** Durability gate. Defaults to the repository-wide durability probe. */
  durabilityProbe?: () => boolean;
  logger?: WorkerLogger;
  /**
   * Canonical approval service for the pre-dispatch hook (Job 12).
   * When supplied, every `requiresApproval` handler is gated by
   * `verifyExecutionClaim` immediately before dispatch — action mismatch,
   * cross-project, expired/revoked/placeholder, and one-shot replay all
   * refuse with HALT_UNSAFE and the provider call is never reached.
   * Test code can inject a Memory-backed service; workers use
   * `createCanonicalApprovalServiceWithClient(supabase)`.
   */
  approvalService?: Pick<
    import("../approvals/service").CanonicalApprovalService,
    "verifyExecutionClaim"
  >;
  /**
   * Derive the exact action bytes the approval must bind to for a given
   * job. Defaults to JSON-stable bytes of the job payload without the
   * `approvalId` wrapper. Handlers that need a different binding can
   * override via this hook.
   */
  deriveActionBytes?: (job: JobRecord) => Uint8Array | null;
  /**
   * P09 pre-dispatch admission gate. Required for consequential handlers
   * (requiresAdmission / requiresApproval): when absent, such handlers halt
   * closed — there is no environment bypass and no test-only path.
   */
  admissionGate?: PreDispatchAdmissionGate;
  /**
   * P13 composed execution-control seam. Optional: when absent, the worker
   * enforces exactly the legacy P09 admission behavior. When present, the
   * rollout mode governs (legacy = identical behavior; shadow = compare +
   * record with zero dispatch change; enforce = composed decision governs
   * with NEW_LOOSER failing closed onto the legacy path).
   */
  executionControl?: WorkerExecutionControlSeam;
}

/**
 * P13 seam hooks. All composition/evaluation failures are treated as
 * non-comparable (shadow) or fail-closed (enforce) — never permissive.
 */
export interface WorkerExecutionControlSeam {
  resolveMode(job: JobRecord): import("../execution-control/rollout").ExecutionControlMode;
  compose(
    job: JobRecord,
    legacyDecision: string,
    reasonCodes: readonly string[],
  ): import("../execution-control/envelope").ExecutionControlEnvelope | null;
  evaluateComposed(
    envelope: import("../execution-control/envelope").ExecutionControlEnvelope,
  ): Promise<string | null>;
}

export interface WorkerHealth {
  drained: boolean;
  jobsProcessed: number;
}

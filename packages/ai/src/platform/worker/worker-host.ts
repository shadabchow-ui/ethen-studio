import type { DurableJobService, JobError, JobEventName, JobRecord } from "../jobs";
import { isPlatformJobRepositoryDurable } from "../jobs";
import {
  CancellationRequestedError,
  HaltUnsafeError,
  LeaseLostError,
  PlatformWorkerHostOptions,
  PostDispatchUncertainError,
  WorkerAbortedError,
  WorkerContext,
  WorkerHealth,
  WorkerLogger,
  WorkerStartRefusedError,
  WorkerTimeoutError,
} from "./types";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_LEASE_SECONDS = 60;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

const noopLogger: WorkerLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * JOB 04 — long-lived worker host draining canonical `durable_jobs`.
 *
 * Loop per job: atomic claim (org-scoped) -> heartbeat/lease ownership ->
 * cancellation check -> typed handler by payload.kind -> dispatch boundary ->
 * canonical terminalization. Unsupported handler kinds fail closed. SIGTERM/
 * abort stops new claims; in-flight work is either finished or left claimed
 * (lease expiry makes it safely reclaimable by another worker).
 */
export class PlatformWorkerHost {
  private readonly service: PlatformWorkerHostOptions["service"];
  private readonly handlers: PlatformWorkerHostOptions["handlers"];
  private readonly workerId: string;
  private readonly organizationId?: string;
  private readonly leaseSeconds: number;
  private readonly pollIntervalMs: number;
  private readonly maxJobs?: number;
  private readonly logger: WorkerLogger;
  private readonly approvalService?: PlatformWorkerHostOptions["approvalService"];
  private readonly deriveActionBytes?: PlatformWorkerHostOptions["deriveActionBytes"];
  private readonly admissionGate?: PlatformWorkerHostOptions["admissionGate"];
  private readonly executionControl?: PlatformWorkerHostOptions["executionControl"];
  private jobsProcessed = 0;

  constructor(options: PlatformWorkerHostOptions) {
    const durable = (options.durabilityProbe ?? isPlatformJobRepositoryDurable)();
    if (!durable) {
      throw new WorkerStartRefusedError(
        "refusing to start: platform job repository is not durable (no Supabase server env); " +
          "an in-memory fallback would silently lose jobs",
      );
    }
    this.service = options.service;
    this.handlers = options.handlers;
    this.workerId = options.workerId;
    this.organizationId = options.organizationId;
    this.leaseSeconds = options.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxJobs = options.maxJobs;
    this.logger = options.logger ?? noopLogger;
    this.approvalService = options.approvalService;
    this.deriveActionBytes = options.deriveActionBytes;
    this.admissionGate = options.admissionGate;
    this.executionControl = options.executionControl;
  }

  /**
   * Job 12 — canonical worker pre-dispatch approval hook.
   *
   * Immediately before any protected / destructive handler dispatch the
   * worker re-verifies the durable execution claim against the job's own
   * action bytes. The full binding + one-shot claim were established at
   * request time by `authorize()`; this is the re-verification (claim
   * presence + exact action hash). Cross-project, stale/expired/revoked,
   * placeholder/sample, action-mismatch and never-authorized approvals all
   * refuse closed and the handler is never invoked.
   */
  private async verifyWorkerApproval(job: JobRecord, handler: { requiresApproval?: boolean }): Promise<void> {
    if (!handler.requiresApproval) return;
    // The job must carry the approval binding the queue-time authorize()
    // established. We support two conventions: explicit `approval` envelope
    // or top-level `approvalId` + `actionBytesBase64`. Missing binding is
    // HALT_UNSAFE — never reach the provider.
    const raw = job.payload as Record<string, unknown>;
    // P09 governed jobs: identity/approval bindings fall back to the
    // canonical execution envelope, and the exact action bytes fall back to
    // the stable intent encoding (the bytes the queue-time authority
    // authorized). Malformed envelopes fail closed below via missing binding.
    let envelopeApprovalId: string | undefined;
    let envelopeActorId: string | undefined;
    let intentBytes: Uint8Array | null = null;
    try {
      const { readExecutionIdentity, readGovernedDispatch, governedActionBytes } =
        await import("../../index");
      const identity = readExecutionIdentity(raw);
      envelopeApprovalId = identity?.approvalId ?? undefined;
      envelopeActorId = identity?.actorId ?? undefined;
      const governed = readGovernedDispatch(raw);
      if (governed) intentBytes = governedActionBytes(governed.intent);
    } catch {
      // Malformed envelope: binding stays missing -> HALT_UNSAFE below.
    }
    const envelope = (raw.approval ?? null) as Record<string, unknown> | null;
    const approvalId =
      (envelope?.approvalId as string | undefined) ??
      (raw.approvalId as string | undefined) ??
      (raw.approval_id as string | undefined) ??
      envelopeApprovalId;
    const actorId =
      (envelope?.actorId as string | undefined) ??
      (raw.actorId as string | undefined) ??
      (raw.approverId as string | undefined) ??
      envelopeActorId ??
      job.claimedBy ??
      "worker";
    let actionBytes: Uint8Array | null = null;
    const b64 =
      (envelope?.actionBytesBase64 as string | undefined) ??
      (raw.actionBytesBase64 as string | undefined) ??
      (raw.actionBytes as string | undefined);
    if (b64) {
      try {
        actionBytes = Buffer.from(b64, "base64") as unknown as Uint8Array;
        if (actionBytes.byteLength === 0) actionBytes = null;
      } catch {
        actionBytes = null;
      }
    }
    if (!actionBytes && this.deriveActionBytes) {
      actionBytes = this.deriveActionBytes(job);
    }
    // P09 governed jobs: exact bytes are the stable intent encoding when no
    // explicit bytes or hook supply them.
    if (!actionBytes) {
      actionBytes = intentBytes;
    }
    if (!actionBytes) {
      // Fallback: stable JSON of payload without the approval wrapper — the
      // queue-time `authorize()` must have used the same derivation.
      const { approval: _a, approvalId: _b, approval_id: _c, actionBytesBase64: _d, actorId: _e, ...rest } = raw;
      void _a; void _b; void _c; void _d; void _e;
      const { hashCanonicalBinding } = await import("../approvals/hash");
      void hashCanonicalBinding;
      actionBytes = new TextEncoder().encode(JSON.stringify(rest));
    }
    if (!approvalId || !actionBytes) {
      throw new HaltUnsafeError(
        `HALT_UNSAFE: protected handler "${String(raw.kind)}" requires a verified canonical approval — missing approvalId or action bytes; dispatch blocked.`,
      );
    }
    if (!this.approvalService) {
      throw new HaltUnsafeError(
        `HALT_UNSAFE: protected handler "${String(raw.kind)}" requires approval verification but no approvalService is configured on the worker host.`,
      );
    }
    const result = await this.approvalService.verifyExecutionClaim(
      { projectId: job.projectId, actorId },
      approvalId,
      actionBytes,
    );
    if (!result.allowed) {
      throw new HaltUnsafeError(
        `HALT_UNSAFE: approval verification failed for protected handler "${String(raw.kind)}" (${result.code}); provider dispatch blocked.`,
      );
    }
    // One-shot semantic is enforced by `verifyExecutionClaim`'s
    // `executionClaimedAt` check — never-authorized and replay are both
    // rejected closed. Reclaim after a crash still verifies because the
    // claim remains present.
  }

  /**
   * P09 — authoritative P08 admission at the real execution boundary.
   *
   * Consequential handlers (`requiresAdmission`, or `requiresApproval` which
   * implies it) must present a fresh `evaluateAdmission => ALLOW` immediately
   * before provider/tool dispatch. Anything else — DENY, REQUIRES_*,
   * BLOCKED, INVALID, missing/stale identity or governance facts, or no
   * gate configured at all — halts closed and the handler is never invoked.
   * No environment bypass, no test-only path.
   */
  private async enforcePreDispatchAdmission(
    job: JobRecord,
    handler: { requiresApproval?: boolean; requiresAdmission?: boolean },
  ): Promise<void> {
    const consequential = handler.requiresApproval === true || handler.requiresAdmission === true;
    if (!consequential) return;
    const kind = String((job.payload as Record<string, unknown>).kind ?? "unknown");
    if (!this.admissionGate) {
      throw new HaltUnsafeError(
        `HALT_UNSAFE: consequential handler "${kind}" has no admission gate configured; dispatch blocked (fail closed, no bypass).`,
      );
    }
    let decision: string;
    let reasonCodes: readonly string[];
    try {
      const result = await this.admissionGate.evaluateJob(job);
      decision = result.decision;
      reasonCodes = result.reasonCodes;
    } catch (error) {
      throw new HaltUnsafeError(
        `HALT_UNSAFE: admission evaluation failed for consequential handler "${kind}" (${error instanceof Error ? error.message : "unknown"}); dispatch blocked.`,
      );
    }
    await this.safeAdmissionEvent(job, decision, reasonCodes);
    // P13 — composed execution-control seam (optional). Absent the seam,
    // behavior is exactly the legacy P09 gate above. Otherwise the rollout
    // mode governs; shadow records without changing dispatch authority.
    if (this.executionControl) {
      await this.evaluateExecutionControl(job, kind, decision, reasonCodes);
      return;
    }
    if (decision !== "ALLOW") {
      throw new HaltUnsafeError(
        `HALT_UNSAFE: admission ${decision} for consequential handler "${kind}" (${reasonCodes.join(",") || "no reason"}); provider dispatch blocked.`,
      );
    }
  }

  private async evaluateExecutionControl(
    job: JobRecord,
    kind: string,
    legacyDecision: string,
    reasonCodes: readonly string[],
  ): Promise<void> {
    const seam = this.executionControl!;
    const { resolveRolloutDecision } = await import("../execution-control/rollout");
    const { recordShadowComparison } = await import("../execution-control/shadow");
    const mode = seam.resolveMode(job);
    let envelope: import("../execution-control/envelope").ExecutionControlEnvelope | null = null;
    let composedDecision: string | null = null;
    try {
      envelope = seam.compose(job, legacyDecision, reasonCodes);
      if (envelope) composedDecision = await seam.evaluateComposed(envelope);
    } catch {
      envelope = null;
      composedDecision = null;
    }
    const identity = this.readExecutionIdentity(job);
    const shadow = recordShadowComparison({
      tenantId: identity?.tenantId ?? "",
      actorId: identity?.actorId ?? "",
      traceId: identity?.traceId ?? `job:${job.id}`,
      executionControlVersion: envelope?.executionControlVersion ?? "p13-v1",
      oldDecision: legacyDecision,
      newDecision: composedDecision,
      reason: envelope ? "composed evaluation" : "composition unavailable",
    });
    try {
      await this.service.appendJobEvent(job.id, this.workerId, "execution_control_shadow", {
        mode,
        oldDecision: shadow.oldDecision,
        newDecision: shadow.newDecision,
        classification: shadow.classification,
      });
    } catch {
      // Event trail failures must not break enforcement.
    }
    const resolved = resolveRolloutDecision({
      mode,
      legacyDecision,
      composedDecision,
      shadow,
    });
    if (resolved.effectiveDecision !== "ALLOW") {
      throw new HaltUnsafeError(
        `HALT_UNSAFE: execution control ${resolved.authority} decision ${resolved.effectiveDecision ?? "unknown"} for consequential handler "${kind}" (shadow: ${shadow.classification}); provider dispatch blocked.`,
      );
    }
  }

  private readExecutionIdentity(job: JobRecord): { tenantId: string; actorId: string; traceId: string } | null {
    const payload = job.payload as Record<string, unknown>;
    const execution = payload.execution as Record<string, unknown> | undefined;
    if (!execution) return null;
    const { tenantId, actorId, traceId } = execution;
    if (typeof tenantId !== "string" || typeof actorId !== "string" || typeof traceId !== "string") return null;
    return { tenantId, actorId, traceId };
  }

  private async safeAdmissionEvent(job: JobRecord, decision: string, reasonCodes: readonly string[]): Promise<void> {
    try {
      await this.service.appendJobEvent(job.id, this.workerId, "admission_checked", {
        decision,
        reasonCodes: [...reasonCodes],
      });
    } catch {
      // Event trail failures must not break admission enforcement.
    }
  }

  async run(signal: AbortSignal): Promise<WorkerHealth> {
    this.logger.info("worker started", { workerId: this.workerId, organizationId: this.organizationId ?? null });
    let drained = false;
    for (;;) {
      if (signal.aborted) {
        drained = true;
        break;
      }
      if (this.maxJobs !== undefined && this.jobsProcessed >= this.maxJobs) {
        drained = true;
        break;
      }
      const job = await this.service.claimJob(this.workerId, this.leaseSeconds, this.organizationId);
      if (!job) {
        await sleep(this.pollIntervalMs, signal);
        continue;
      }
      await this.executeJob(job, signal);
    }
    this.logger.info("worker stopped", { drained, jobsProcessed: this.jobsProcessed });
    return { drained, jobsProcessed: this.jobsProcessed };
  }

  private createContext(job: JobRecord, signal: AbortSignal): WorkerContext {
    // P09 fencing: every authoritative mutation presents the generation from
    // this claim record. If the job was reclaimed meanwhile, the stored
    // generation differs and the mutation is rejected (LeaseLostError).
    const generation = job.leaseGeneration;
    const heartbeat = async (detail?: Readonly<Record<string, unknown>>) => {
      const ok = await this.service.heartbeat(job.id, this.workerId, this.leaseSeconds, generation);
      if (!ok) throw new LeaseLostError(job.id);
      await this.service.appendJobEvent(job.id, this.workerId, "heartbeat", detail ?? null);
    };
    return {
      jobId: job.id,
      workerId: this.workerId,
      heartbeat,
      markProviderDispatched: async (operationKey: string) => {
        const ok = await this.service.markProviderDispatched(job.id, this.workerId, operationKey, generation);
        if (!ok) throw new LeaseLostError(job.id);
        await this.service.appendJobEvent(job.id, this.workerId, "dispatched", { operationKey });
      },
      appendEvent: async (event, detail) => {
        await this.service.appendJobEvent(job.id, this.workerId, event, detail ?? null);
      },
      isCancellationRequested: () => this.service.isCancellationRequested(job.id),
      isAborted: () => signal.aborted,
      wait: (ms) => sleep(ms, signal),
    };
  }

  private async executeJob(job: JobRecord, signal: AbortSignal): Promise<void> {
    this.jobsProcessed += 1;
    const ctx = this.createContext(job, signal);
    const correlationId = typeof job.payload.correlationId === "string" ? job.payload.correlationId : `job:${job.id}`;
    this.logger.info("job claimed", { jobId: job.id, kind: job.payload.kind, attempt: job.attemptCount, correlationId });
    await this.safeEvent(ctx, "claimed", { attempt: job.attemptCount });

    try {
      // Cross-org defensive check: the claim is org-scoped, but if a
      // cross-org job is ever handed to us, abandon WITHOUT executing it.
      // (No state change; the lease expires and a scoped worker reclaims.)
      if (this.organizationId && job.organizationId !== this.organizationId) {
        this.logger.warn("cross-org job claimed; abandoning without execution", {
          jobId: job.id,
          jobOrg: job.organizationId,
          workerOrg: this.organizationId,
        });
        return;
      }

      // Cancellation checkpoint BEFORE any handler work.
      if (await this.service.isCancellationRequested(job.id)) {
        await this.service.acknowledgeCancellation(job.id, this.workerId, job.leaseGeneration);
        await this.safeEvent(ctx, "cancelled", { reason: "pre-dispatch" });
        this.logger.info("job cancelled pre-dispatch", { jobId: job.id });
        return;
      }

      const handler = this.handlers.find((h) => h.kind === job.payload.kind);
      if (!handler) {
        // Unsupported handler kind fails closed — it can never succeed.
        await this.service.failJob(
          job.id,
          this.workerId,
          this.makeError("UNSUPPORTED_HANDLER_KIND", `no handler registered for kind "${String(job.payload.kind)}"`, false),
          false,
          job.leaseGeneration,
        );
        await this.safeEvent(ctx, "failed", { code: "UNSUPPORTED_HANDLER_KIND" });
        this.logger.warn("unsupported handler kind; job failed closed", { jobId: job.id, kind: job.payload.kind });
        return;
      }

      // P09 — pre-dispatch admission gate for consequential handlers.
      // Every consequential real dispatch requires a fresh authoritative
      // ALLOW immediately before side effects; queue-time authorization
      // alone is never sufficient.
      await this.enforcePreDispatchAdmission(job, handler);

      // Job 12 — pre-dispatch approval gate for protected handlers.
      await this.verifyWorkerApproval(job, handler);

      const result = await handler.execute({ job, ctx });
      if (result.ok) {
        await this.service.completeJob(job.id, this.workerId, job.leaseGeneration);
        await this.safeEvent(ctx, "completed", result.result ?? null);
        this.logger.info("job completed", { jobId: job.id, correlationId });
      } else {
        await this.service.failJob(job.id, this.workerId, this.makeError(result.code, result.message, result.retryable), result.retryable, job.leaseGeneration);
        await this.safeEvent(ctx, "failed", { code: result.code, retryable: result.retryable });
        this.logger.warn("job failed", { jobId: job.id, code: result.code, correlationId });
      }
    } catch (error) {
      if (error instanceof WorkerAbortedError) {
        // SIGTERM/SIGINT drain mid-handler: abandon WITHOUT terminalizing.
        // The job stays claimed; lease expiry makes it safely reclaimable.
        this.logger.warn("worker aborted mid-execution; leaving job reclaimable", { jobId: job.id });
        return;
      }
      if (error instanceof CancellationRequestedError) {
        await this.service.acknowledgeCancellation(job.id, this.workerId, job.leaseGeneration);
        await this.safeEvent(ctx, "cancelled", { reason: "handler-detected-cancellation" });
        this.logger.info("job cancelled (handler-detected)", { jobId: job.id });
        return;
      }
      if (error instanceof LeaseLostError) {
        // Lease lost: either cancellation was requested (acknowledge ->
        // terminal cancelled) or another worker reclaimed the lease
        // (abandon; the job stays valid and is safely reclaimable).
        if (await this.service.isCancellationRequested(job.id)) {
          await this.service.acknowledgeCancellation(job.id, this.workerId, job.leaseGeneration);
          await this.safeEvent(ctx, "cancelled", { reason: "lease-lost-during-cancellation" });
          this.logger.info("job cancelled (acknowledged on lease-lost)", { jobId: job.id });
          return;
        }
        this.logger.warn("lease lost mid-execution; abandoning", { jobId: job.id });
        return;
      }
      if (error instanceof HaltUnsafeError) {
        await this.service.markHaltUnsafe(job.id, this.workerId, this.makeError("HALT_UNSAFE", error.message, false), job.leaseGeneration);
        await this.safeEvent(ctx, "halt_unsafe", { message: error.message });
        this.logger.error("job halted unsafe", { jobId: job.id, message: error.message });
        return;
      }
      if (error instanceof WorkerTimeoutError) {
        await this.service.markTimedOut(job.id, this.workerId, this.makeError("TIMED_OUT", error.message, false), job.leaseGeneration);
        await this.safeEvent(ctx, "timed_out", { message: error.message });
        this.logger.error("job timed out", { jobId: job.id, correlationId });
        return;
      }
      if (error instanceof PostDispatchUncertainError) {
        await this.service.markIndeterminate(job.id, this.workerId, this.makeError("INDETERMINATE", error.message, true), job.leaseGeneration);
        await this.safeEvent(ctx, "indeterminate", { message: error.message });
        this.logger.error("job indeterminate (post-dispatch uncertain outcome)", { jobId: job.id });
        return;
      }
      // Unexpected handler error: classify retryable; if dispatch already
      // started, the repository routes it to INDETERMINATE (Job 02 rule).
      const code = error instanceof Error ? error.name.toUpperCase() : "HANDLER_ERROR";
      const message = error instanceof Error ? error.message : "handler error";
      await this.service.failJob(job.id, this.workerId, this.makeError(code, message, true), true, job.leaseGeneration);
      await this.safeEvent(ctx, "failed", { code, unexpected: true });
      this.logger.error("job failed with unexpected error", { jobId: job.id, code, message });
    }
  }

  private makeError(code: string, message: string, retryable: boolean): JobError {
    return {
      code,
      message,
      retryable,
      occurredAt: new Date().toISOString(),
      details: {},
    };
  }

  private async safeEvent(ctx: WorkerContext, event: JobEventName, detail?: Record<string, unknown> | null): Promise<void> {
    try {
      await ctx.appendEvent(event, detail ?? null);
    } catch {
      // Event trail failures must not break job terminalization.
    }
  }
}

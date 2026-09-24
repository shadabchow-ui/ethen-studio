/** Studio V5 runtime — repository contract + memory store (STUDIO_05). Server-only. */
import "server-only";
import { randomUUID } from "node:crypto";
import type { TaskName } from "../../contracts/tasks";
import type { VersionPins } from "../../contracts/versions";
import type { Job, Attempt, Generation, JobStatus } from "../../contracts/execution";
import type { ProjectScope } from "../../contracts/scope";
import type { CasResult, RuntimeRepositoryPort } from "../ports/repositories";
import {
  RuntimeError,
  requireText,
  type DispatchOutboxEvent,
  type JobEvent,
  type OutboxStatus,
  type OutboxTarget,
  type ProviderOperation,
  type ProviderOperationState,
  type RuntimeAttempt,
  type RuntimeGeneration,
  type RuntimeJob,
} from "./types";
import { assertWorkerTransition } from "./transitions";
import { checkFence, isLeaseExpired, operationKeyFor } from "./fencing";

export interface AnchorJobInput {
  scope: ProjectScope;
  task: TaskName;
  idempotencyKey: string;
  requestHash: string;
  quoteId: string;
  pins: VersionPins;
  endpointId: string;
  parameters: Readonly<Record<string, unknown>>;
}

export interface LeaseClaim {
  job: RuntimeJob;
  generation: number;
}

/**
 * Full runtime repository surface. The memory store below implements it for
 * tests/dev; production binds the Supabase adapter (route `_lib`), which the
 * Studio factory requires — production never falls back to memory.
 */
export interface RuntimeRepository {
  anchor(input: AnchorJobInput): Promise<{ job: RuntimeJob; replayed: boolean }>;
  get(jobId: string, scope: ProjectScope): Promise<RuntimeJob | null>;
  getByIdempotency(scope: ProjectScope, key: string): Promise<RuntimeJob | null>;
  bindReservation(jobId: string, scope: ProjectScope, reservationId: string): Promise<RuntimeJob>;
  claimLease(scope: ProjectScope, workerId: string, leaseSeconds: number): Promise<LeaseClaim | null>;
  renewLease(jobId: string, scope: ProjectScope, workerId: string, generation: number, leaseSeconds: number): Promise<boolean>;
  transition(jobId: string, scope: ProjectScope, workerId: string, generation: number, to: JobStatus): Promise<RuntimeJob>;
  forceTransition(jobId: string, scope: ProjectScope, to: JobStatus): Promise<RuntimeJob>;
  startAttempt(jobId: string, scope: ProjectScope, workerId: string, generation: number): Promise<RuntimeAttempt>;
  updateAttempt(attemptId: string, scope: ProjectScope, patch: Partial<RuntimeAttempt>): Promise<RuntimeAttempt>;
  listAttempts(jobId: string, scope: ProjectScope): Promise<readonly RuntimeAttempt[]>;
  markSubmitAmbiguous(attemptId: string, scope: ProjectScope, error: string): Promise<RuntimeAttempt>;
  publishOutbox(input: {
    jobId: string; scope: ProjectScope; target: OutboxTarget;
    dedupeKey: string; payload: Readonly<Record<string, unknown>>;
  }): Promise<DispatchOutboxEvent>;
  claimOutbox(workerId: string, leaseSeconds: number, limit: number): Promise<readonly DispatchOutboxEvent[]>;
  ackOutbox(eventId: string, workerId: string, generation: number): Promise<boolean>;
  deadLetterOutbox(eventId: string, workerId: string, generation: number): Promise<boolean>;
  recordOperation(input: {
    jobId: string; attemptId: string; scope: ProjectScope;
    providerOperationId: string | null; state: ProviderOperationState;
  }): Promise<ProviderOperation>;
  updateOperation(operationId: string, scope: ProjectScope, state: ProviderOperationState, redactedError?: string | null): Promise<ProviderOperation>;
  latestOperation(jobId: string, scope: ProjectScope): Promise<ProviderOperation | null>;
  linkGeneration(input: {
    jobId: string; attemptId: string; scope: ProjectScope;
    assetVersionIds: readonly string[]; quarantined: boolean; quarantineReason: string | null;
  }): Promise<RuntimeGeneration>;
  recordEvent(input: {
    jobId: string; scope: ProjectScope; eventKey: string; type: string;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<boolean>;
  listEvents(jobId: string, scope: ProjectScope): Promise<readonly JobEvent[]>;
  requestCancel(jobId: string, scope: ProjectScope, reason: string): Promise<RuntimeJob>;
  acknowledgeCancel(jobId: string, scope: ProjectScope, workerId: string, generation: number): Promise<boolean>;
  findReconciliationCandidates(projectId: string, limit?: number): Promise<readonly RuntimeJob[]>;
  listJobs(projectId: string, status?: JobStatus, limit?: number): Promise<readonly RuntimeJob[]>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function scopeKey(scope: ProjectScope): string {
  return `${scope.tenantId}:${scope.workspaceId}:${scope.projectId}`;
}

/**
 * Single-process memory store. Mirrors the j05 SQL guards: scoped idempotency
 * anchor with request-hash conflict, fenced lease claim/reclaim with
 * generation bump, fenced transitions, monotonic outbox claim/ack, dedupe
 * event record. Restart retention is proven by the SQL binding; this store
 * never claims durability.
 */
export class MemoryRuntimeStore implements RuntimeRepository {
  private readonly jobs = new Map<string, RuntimeJob>();
  private readonly byKey = new Map<string, string>();
  private readonly attempts = new Map<string, RuntimeAttempt>();
  private readonly outbox = new Map<string, DispatchOutboxEvent>();
  private readonly outboxDedupe = new Map<string, string>();
  private readonly operations = new Map<string, ProviderOperation>();
  private readonly generations: RuntimeGeneration[] = [];
  private readonly events: JobEvent[] = [];
  private readonly eventKeys = new Set<string>();
  private readonly sequences = new Map<string, number>();
  private queue: Promise<void> = Promise.resolve();
  private readonly nowFn: () => string;
  private readonly idFn: () => string;

  constructor(options: { now?: () => string; newId?: () => string } = {}) {
    this.nowFn = options.now ?? (() => new Date().toISOString());
    this.idFn = options.newId ?? randomUUID;
  }

  private now(): string {
    return this.nowFn();
  }

  /** Serialize admissions/transitions per store like the SQL transaction. */
  private async serialize<T>(work: () => Promise<T> | T): Promise<T> {
    const run = this.queue.then(work);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private scoped(job: RuntimeJob, scope: ProjectScope): boolean {
    return scopeKey(job.scope) === scopeKey(scope);
  }

  async anchor(input: AnchorJobInput): Promise<{ job: RuntimeJob; replayed: boolean }> {
    return this.serialize(() => {
      requireText(input.idempotencyKey, "idempotencyKey");
      requireText(input.requestHash, "requestHash");
      requireText(input.quoteId, "quoteId");
      requireText(input.endpointId, "endpointId");
      const key = `${scopeKey(input.scope)}:${input.idempotencyKey}`;
      const existingId = this.byKey.get(key);
      if (existingId) {
        const existing = this.jobs.get(existingId);
        if (existing) {
          if (existing.requestHash !== input.requestHash) {
            throw new RuntimeError("ADMISSION_CONFLICT", "idempotency key replayed with a different payload.");
          }
          return { job: clone(existing), replayed: true };
        }
      }
      const at = this.now();
      const job: RuntimeJob = {
        jobId: this.idFn(),
        scope: clone(input.scope),
        task: input.task,
        status: "QUEUED",
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        quoteId: input.quoteId,
        reservationId: null,
        pins: clone(input.pins),
        endpointId: input.endpointId,
        parameters: clone({ ...input.parameters }),
        dispatchGeneration: 1,
        leaseOwner: null,
        leaseExpiresAt: null,
        cancelReason: null,
        legacyOrigin: null,
        createdAt: at,
        updatedAt: at,
      };
      this.jobs.set(job.jobId, job);
      this.byKey.set(key, job.jobId);
      return { job: clone(job), replayed: false };
    });
  }

  async get(jobId: string, scope: ProjectScope): Promise<RuntimeJob | null> {
    const job = this.jobs.get(jobId);
    if (!job || !this.scoped(job, scope)) return null;
    return clone(job);
  }

  async getByIdempotency(scope: ProjectScope, key: string): Promise<RuntimeJob | null> {
    const id = this.byKey.get(`${scopeKey(scope)}:${key}`);
    if (!id) return null;
    return this.get(id, scope);
  }

  async bindReservation(jobId: string, scope: ProjectScope, reservationId: string): Promise<RuntimeJob> {
    return this.serialize(() => {
      const job = this.require(jobId, scope);
      const next: RuntimeJob = { ...job, reservationId, updatedAt: this.now() };
      this.jobs.set(jobId, next);
      return clone(next);
    });
  }

  async claimLease(scope: ProjectScope, workerId: string, leaseSeconds: number): Promise<LeaseClaim | null> {
    return this.serialize(() => {
      requireText(workerId, "workerId");
      if (leaseSeconds < 1 || leaseSeconds > 3600) {
        throw new RuntimeError("INVALID_INPUT", "leaseSeconds must be between 1 and 3600.");
      }
      const at = this.now();
      const candidate = [...this.jobs.values()]
        .filter(
          (job) =>
            this.scoped(job, scope) &&
            (job.status === "QUEUED" ||
              job.status === "RECONCILING" ||
              (job.leaseExpiresAt !== null &&
                isLeaseExpired(job.leaseExpiresAt, at) &&
                job.status !== "CANCEL_REQUESTED" &&
                job.status !== "COMPLETED" &&
                job.status !== "CANCELLED" &&
                job.status !== "FAILED" &&
                job.status !== "EXPIRED")),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!candidate) return null;
      const next: RuntimeJob = {
        ...candidate,
        status: candidate.status === "QUEUED" ? "RUNNING" : candidate.status,
        dispatchGeneration: candidate.dispatchGeneration + 1,
        leaseOwner: workerId,
        leaseExpiresAt: new Date(Date.parse(at) + leaseSeconds * 1000).toISOString(),
        updatedAt: at,
      };
      this.jobs.set(candidate.jobId, next);
      return { job: clone(next), generation: next.dispatchGeneration };
    });
  }

  async renewLease(
    jobId: string,
    scope: ProjectScope,
    workerId: string,
    generation: number,
    leaseSeconds: number,
  ): Promise<boolean> {
    return this.serialize(() => {
      const job = this.require(jobId, scope);
      try {
        checkFence(job, generation);
      } catch {
        return false;
      }
      if (job.leaseOwner !== workerId) return false;
      const at = this.now();
      const next: RuntimeJob = {
        ...job,
        leaseExpiresAt: new Date(Date.parse(at) + leaseSeconds * 1000).toISOString(),
        updatedAt: at,
      };
      this.jobs.set(jobId, next);
      return true;
    });
  }

  async transition(
    jobId: string,
    scope: ProjectScope,
    workerId: string,
    generation: number,
    to: JobStatus,
  ): Promise<RuntimeJob> {
    return this.serialize(() => {
      const job = this.require(jobId, scope);
      checkFence(job, generation);
      if (job.leaseOwner !== workerId) {
        throw new RuntimeError("LEASE_LOST", "worker does not own the job lease.");
      }
      assertWorkerTransition(job.status, to);
      const terminal = to === "COMPLETED" || to === "CANCELLED" || to === "FAILED" || to === "EXPIRED";
      const next: RuntimeJob = {
        ...job,
        status: to,
        leaseOwner: terminal ? null : job.leaseOwner,
        leaseExpiresAt: terminal ? null : job.leaseExpiresAt,
        updatedAt: this.now(),
      };
      this.jobs.set(jobId, next);
      return clone(next);
    });
  }

  async forceTransition(jobId: string, scope: ProjectScope, to: JobStatus): Promise<RuntimeJob> {
    return this.serialize(() => {
      const job = this.require(jobId, scope);
      assertWorkerTransition(job.status, to);
      const next: RuntimeJob = { ...job, status: to, updatedAt: this.now() };
      this.jobs.set(jobId, next);
      return clone(next);
    });
  }

  async startAttempt(
    jobId: string,
    scope: ProjectScope,
    workerId: string,
    generation: number,
  ): Promise<RuntimeAttempt> {
    return this.serialize(() => {
      const job = this.require(jobId, scope);
      checkFence(job, generation);
      if (job.leaseOwner !== workerId) {
        throw new RuntimeError("LEASE_LOST", "worker does not own the job lease.");
      }
      const prior = [...this.attempts.values()].filter((a) => a.jobId === jobId);
      if (prior.some((a) => a.submitAmbiguous && a.status !== "FAILED" && a.status !== "CANCELLED")) {
        throw new RuntimeError("AMBIGUOUS_SUBMIT", "an ambiguous submit is unresolved; reconcile first.");
      }
      const attemptNumber = prior.length + 1;
      const at = this.now();
      const attempt: RuntimeAttempt = {
        attemptId: this.idFn(),
        jobId,
        scope: clone(scope),
        attemptNumber,
        dispatchGeneration: generation,
        operationKey: operationKeyFor(jobId, attemptNumber),
        phase: "dispatch",
        status: "RUNNING",
        providerOperationId: null,
        submitAmbiguous: false,
        lastError: null,
        createdAt: at,
        updatedAt: at,
      };
      this.attempts.set(attempt.attemptId, attempt);
      return clone(attempt);
    });
  }

  async updateAttempt(attemptId: string, scope: ProjectScope, patch: Partial<RuntimeAttempt>): Promise<RuntimeAttempt> {
    return this.serialize(() => {
      const attempt = this.attempts.get(attemptId);
      if (!attempt || scopeKey(attempt.scope) !== scopeKey(scope)) {
        throw new RuntimeError("NOT_FOUND", "attempt not found in this scope.");
      }
      const next: RuntimeAttempt = { ...attempt, ...patch, attemptId, updatedAt: this.now() };
      this.attempts.set(attemptId, next);
      return clone(next);
    });
  }

  async listAttempts(jobId: string, scope: ProjectScope): Promise<readonly RuntimeAttempt[]> {
    return [...this.attempts.values()]
      .filter((a) => a.jobId === jobId && scopeKey(a.scope) === scopeKey(scope))
      .sort((a, b) => a.attemptNumber - b.attemptNumber)
      .map(clone);
  }

  async markSubmitAmbiguous(attemptId: string, scope: ProjectScope, error: string): Promise<RuntimeAttempt> {
    return this.updateAttempt(attemptId, scope, { submitAmbiguous: true, lastError: error });
  }

  async publishOutbox(input: {
    jobId: string;
    scope: ProjectScope;
    target: OutboxTarget;
    dedupeKey: string;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<DispatchOutboxEvent> {
    return this.serialize(() => {
      requireText(input.dedupeKey, "dedupeKey");
      const dupeId = this.outboxDedupe.get(`${scopeKey(input.scope)}:${input.dedupeKey}`);
      if (dupeId) {
        const existing = this.outbox.get(dupeId);
        if (existing) return clone(existing);
      }
      const at = this.now();
      const event: DispatchOutboxEvent = {
        eventId: this.idFn(),
        jobId: input.jobId,
        scope: clone(input.scope),
        target: input.target,
        dedupeKey: input.dedupeKey,
        payload: clone({ ...input.payload }),
        status: "pending",
        attempts: 0,
        leaseGeneration: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        createdAt: at,
      };
      this.outbox.set(event.eventId, event);
      this.outboxDedupe.set(`${scopeKey(input.scope)}:${input.dedupeKey}`, event.eventId);
      return clone(event);
    });
  }

  async claimOutbox(workerId: string, leaseSeconds: number, limit: number): Promise<readonly DispatchOutboxEvent[]> {
    return this.serialize(() => {
      const at = this.now();
      const claimed: DispatchOutboxEvent[] = [];
      for (const event of [...this.outbox.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (claimed.length >= limit) break;
        if (event.status === "acked" || event.status === "dead") continue;
        if (event.status === "leased" && !isLeaseExpired(event.leaseExpiresAt, at)) continue;
        const next: DispatchOutboxEvent = {
          ...event,
          status: "leased",
          attempts: event.attempts + 1,
          leaseGeneration: event.leaseGeneration + 1,
          leaseOwner: workerId,
          leaseExpiresAt: new Date(Date.parse(at) + leaseSeconds * 1000).toISOString(),
        };
        this.outbox.set(event.eventId, next);
        claimed.push(clone(next));
      }
      return claimed;
    });
  }

  async ackOutbox(eventId: string, workerId: string, generation: number): Promise<boolean> {
    return this.serialize(() => {
      const event = this.outbox.get(eventId);
      if (!event || event.status !== "leased") return false;
      if (event.leaseOwner !== workerId || event.leaseGeneration !== generation) return false;
      this.outbox.set(eventId, { ...event, status: "acked" });
      return true;
    });
  }

  async deadLetterOutbox(eventId: string, workerId: string, generation: number): Promise<boolean> {
    return this.serialize(() => {
      const event = this.outbox.get(eventId);
      if (!event || event.status !== "leased") return false;
      if (event.leaseOwner !== workerId || event.leaseGeneration !== generation) return false;
      this.outbox.set(eventId, { ...event, status: "dead" });
      return true;
    });
  }

  /** Test/dev visibility into outbox state (never a production read model). */
  inspectOutbox(): readonly DispatchOutboxEvent[] {
    return [...this.outbox.values()].map(clone);
  }

  async recordOperation(input: {
    jobId: string;
    attemptId: string;
    scope: ProjectScope;
    providerOperationId: string | null;
    state: ProviderOperationState;
  }): Promise<ProviderOperation> {
    return this.serialize(() => {
      const at = this.now();
      const operation: ProviderOperation = {
        operationId: this.idFn(),
        jobId: input.jobId,
        attemptId: input.attemptId,
        scope: clone(input.scope),
        operationKey: `studio-v5:${input.jobId}:${input.attemptId}`,
        providerOperationId: input.providerOperationId,
        state: input.state,
        redactedError: null,
        createdAt: at,
        updatedAt: at,
      };
      this.operations.set(operation.operationId, operation);
      return clone(operation);
    });
  }

  async updateOperation(
    operationId: string,
    scope: ProjectScope,
    state: ProviderOperationState,
    redactedError: string | null = null,
  ): Promise<ProviderOperation> {
    return this.serialize(() => {
      const operation = this.operations.get(operationId);
      if (!operation || scopeKey(operation.scope) !== scopeKey(scope)) {
        throw new RuntimeError("NOT_FOUND", "provider operation not found in this scope.");
      }
      const next: ProviderOperation = { ...operation, state, redactedError, updatedAt: this.now() };
      this.operations.set(operationId, next);
      return clone(next);
    });
  }

  /** Mirror of studio_v5_latest_operation: newest operation row for the job. */
  async latestOperation(jobId: string, scope: ProjectScope): Promise<ProviderOperation | null> {
    return this.serialize(() => {
      const prefix = scopeKey(scope);
      const rows = [...this.operations.values()]
        .filter((row) => row.jobId === jobId && scopeKey(row.scope) === prefix)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      return rows.length > 0 ? clone(rows[0]!) : null;
    });
  }

  async linkGeneration(input: {
    jobId: string;
    attemptId: string;
    scope: ProjectScope;
    assetVersionIds: readonly string[];
    quarantined: boolean;
    quarantineReason: string | null;
  }): Promise<RuntimeGeneration> {
    return this.serialize(() => {
      const generation: RuntimeGeneration = {
        generationId: this.idFn(),
        jobId: input.jobId,
        attemptId: input.attemptId,
        scope: clone(input.scope),
        assetVersionIds: [...input.assetVersionIds],
        quarantined: input.quarantined,
        quarantineReason: input.quarantineReason,
        createdAt: this.now(),
      };
      this.generations.push(generation);
      return clone(generation);
    });
  }

  listGenerations(jobId: string, scope: ProjectScope): readonly RuntimeGeneration[] {
    return this.generations
      .filter((g) => g.jobId === jobId && scopeKey(g.scope) === scopeKey(scope))
      .map(clone);
  }

  async recordEvent(input: {
    jobId: string;
    scope: ProjectScope;
    eventKey: string;
    type: string;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<boolean> {
    return this.serialize(() => {
      const key = `${scopeKey(input.scope)}:${input.jobId}:${input.eventKey}`;
      if (this.eventKeys.has(key)) return false;
      this.eventKeys.add(key);
      const sequence = (this.sequences.get(input.jobId) ?? 0) + 1;
      this.sequences.set(input.jobId, sequence);
      this.events.push({
        eventId: this.idFn(),
        jobId: input.jobId,
        scope: clone(input.scope),
        eventKey: input.eventKey,
        sequence,
        type: input.type,
        occurredAt: this.now(),
        payload: clone({ ...input.payload }),
      });
      return true;
    });
  }

  async listEvents(jobId: string, scope: ProjectScope): Promise<readonly JobEvent[]> {
    return this.events
      .filter((e) => e.jobId === jobId && scopeKey(e.scope) === scopeKey(scope))
      .sort((a, b) => a.sequence - b.sequence)
      .map(clone);
  }

  async requestCancel(jobId: string, scope: ProjectScope, reason: string): Promise<RuntimeJob> {
    return this.serialize(() => {
      requireText(reason, "reason");
      const job = this.require(jobId, scope);
      if (job.status === "COMPLETED" || job.status === "CANCELLED" || job.status === "FAILED" || job.status === "EXPIRED") {
        return clone(job);
      }
      if (job.status === "SETTLING") {
        return clone(job);
      }
      if (job.status === "RECONCILING") {
        const cancelled: RuntimeJob = {
          ...job,
          status: "CANCELLED",
          cancelReason: reason,
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: this.now(),
        };
        this.jobs.set(jobId, cancelled);
        return clone(cancelled);
      }
      const next: RuntimeJob = {
        ...job,
        status: job.leaseOwner ? "CANCEL_REQUESTED" : "CANCELLED",
        cancelReason: reason,
        leaseOwner: job.leaseOwner ? job.leaseOwner : null,
        leaseExpiresAt: job.leaseOwner ? job.leaseExpiresAt : null,
        updatedAt: this.now(),
      };
      this.jobs.set(jobId, next);
      return clone(next);
    });
  }

  async acknowledgeCancel(jobId: string, scope: ProjectScope, workerId: string, generation: number): Promise<boolean> {
    return this.serialize(() => {
      const job = this.require(jobId, scope);
      try {
        checkFence(job, generation);
      } catch {
        return false;
      }
      if (job.leaseOwner !== workerId || job.status !== "CANCEL_REQUESTED") return false;
      this.jobs.set(jobId, {
        ...job,
        status: "CANCELLED",
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: this.now(),
      });
      return true;
    });
  }

  async findReconciliationCandidates(projectId: string, limit = 50): Promise<readonly RuntimeJob[]> {
    const at = this.now();
    return [...this.jobs.values()]
      .filter(
        (job) =>
          job.scope.projectId === projectId &&
          (job.status === "RECONCILING" ||
            this.submitAmbiguous(job.jobId) ||
            ((job.status === "RUNNING" || job.status === "OUTPUT_READY" || job.status === "INGESTING" || job.status === "SETTLING") &&
              isLeaseExpired(job.leaseExpiresAt, at))),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  async listJobs(projectId: string, status?: JobStatus, limit = 50): Promise<readonly RuntimeJob[]> {
    return [...this.jobs.values()]
      .filter((job) => job.scope.projectId === projectId && (!status || job.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  private submitAmbiguous(jobId: string): boolean {
    return [...this.attempts.values()].some((a) => a.jobId === jobId && a.submitAmbiguous);
  }

  private require(jobId: string, scope: ProjectScope): RuntimeJob {
    const job = this.jobs.get(jobId);
    if (!job || !this.scoped(job, scope)) {
      throw new RuntimeError("NOT_FOUND", "job not found in this scope.");
    }
    return job;
  }
}

export function createMemoryRuntimeStore(options: { now?: () => string; newId?: () => string } = {}): MemoryRuntimeStore {
  return new MemoryRuntimeStore(options);
}

function toJob(job: RuntimeJob): Job {
  return {
    jobId: job.jobId,
    task: job.task,
    scope: job.scope,
    status: job.status,
    idempotencyKey: job.idempotencyKey,
    requestHash: job.requestHash,
    quoteId: job.quoteId,
    pins: job.pins,
    endpointId: job.endpointId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function toAttempt(attempt: RuntimeAttempt): Attempt {
  return {
    attemptId: attempt.attemptId,
    jobId: attempt.jobId,
    attemptNumber: attempt.attemptNumber,
    dispatchGeneration: attempt.dispatchGeneration,
    operationKey: attempt.operationKey,
    status: attempt.status,
    providerOperationId: attempt.providerOperationId,
    createdAt: attempt.createdAt,
  };
}

/** Adapt the runtime store to the kernel RuntimeRepositoryPort. */
export function adaptRuntimeRepositoryPort(store: RuntimeRepository): RuntimeRepositoryPort {
  return {
    async getJob(jobId, scope): Promise<Job | null> {
      const job = await store.get(jobId, scope);
      return job ? toJob(job) : null;
    },
    async updateJobStatus(jobId, scope, from, to): Promise<CasResult<Job>> {
      const job = await store.get(jobId, scope);
      if (!job) return { ok: false, value: null, conflict: false };
      if (job.status !== from) return { ok: false, value: toJob(job), conflict: true };
      try {
        const next = await store.forceTransition(jobId, scope, to);
        return { ok: true, value: toJob(next), conflict: false };
      } catch {
        return { ok: false, value: toJob(job), conflict: true };
      }
    },
    async listAttempts(jobId, scope): Promise<readonly Attempt[]> {
      return (await store.listAttempts(jobId, scope)).map(toAttempt);
    },
    async linkGeneration(generation: Generation, scope): Promise<void> {
      await store.linkGeneration({
        jobId: generation.jobId,
        attemptId: generation.attemptId,
        scope,
        assetVersionIds: generation.assetVersionIds,
        quarantined: false,
        quarantineReason: null,
      });
    },
  };
}

// Re-export status helpers used by recovery/settlement modules.
export type { OutboxStatus };

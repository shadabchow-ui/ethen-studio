import "server-only";

import { randomUUID } from "node:crypto";

export const STUDIO_JOB_STATES = [
  "validating", "estimating", "queued", "submitting", "provider_queued",
  "running", "processing", "finalizing", "moderating", "completed", "failed",
  "cancel_requested", "canceled", "timed_out", "retrying", "dead_lettered",
] as const;

export type StudioJobState = (typeof STUDIO_JOB_STATES)[number];
export type ProviderRunState = "created" | "submitted" | "running" | "completed" | "failed" | "cancel_requested" | "canceled";

const TERMINAL = new Set<StudioJobState>(["completed", "failed", "canceled", "timed_out", "dead_lettered"]);
const ACTIVE = new Set<StudioJobState>(["queued", "submitting", "provider_queued", "running", "processing", "finalizing", "moderating", "retrying", "cancel_requested"]);

export interface StudioJobSubmission {
  organizationId: string;
  projectId: string;
  actorId: string;
  idempotencyKey: string;
  immutableInput: Readonly<Record<string, unknown>>;
  sourceAssetIds: readonly string[];
  policyVersion: string;
  providerId: string;
  adapterVersion: string;
  modelId: string;
  capability: string;
  costEstimate: Readonly<Record<string, unknown>>;
  maxAttempts?: number;
  timeoutAt: string;
}

export interface StudioJob extends StudioJobSubmission {
  id: string;
  state: StudioJobState;
  attemptCount: number;
  maxAttempts: number;
  leaseWorkerId: string | null;
  leaseExpiresAt: string | null;
  cancellationReason: string | null;
  result: Readonly<Record<string, unknown>> | null;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudioJobEvent {
  id: string;
  jobId: string;
  providerRunId: string | null;
  eventKey: string;
  sequence: number;
  type: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface ProviderRun {
  id: string;
  jobId: string;
  providerId: string;
  adapterVersion: string;
  modelId: string;
  providerRunKey: string | null;
  state: ProviderRunState;
  lastSequence: number;
  createdAt: string;
  updatedAt: string;
}

/** Production implementations must persist every method atomically and scope reads by organization and project. */
export interface StudioJobRepository {
  findByIdempotency(projectId: string, key: string): Promise<StudioJob | null>;
  create(job: StudioJob): Promise<StudioJob>;
  get(projectId: string, jobId: string): Promise<StudioJob | null>;
  save(job: StudioJob): Promise<void>;
  claim(workerId: string, leaseSeconds: number, now: string): Promise<StudioJob | null>;
  createProviderRun(run: ProviderRun): Promise<ProviderRun>;
  getProviderRun(jobId: string): Promise<ProviderRun | null>;
  saveProviderRun(run: ProviderRun): Promise<void>;
  recordEvent(event: StudioJobEvent): Promise<boolean>;
  finalizeOnce(jobId: string, result: Readonly<Record<string, unknown>>): Promise<boolean>;
}

function now(): string { return new Date().toISOString(); }
function clone<T>(value: T): T { return structuredClone(value); }
function assertText(value: string, label: string): void { if (!value.trim()) throw new Error(`${label} is required`); }

export class DurableStudioJobOrchestrator {
  constructor(private readonly repository: StudioJobRepository) {}

  async submit(input: StudioJobSubmission): Promise<StudioJob> {
    for (const [label, value] of Object.entries({ organizationId: input.organizationId, projectId: input.projectId, actorId: input.actorId, idempotencyKey: input.idempotencyKey, policyVersion: input.policyVersion, providerId: input.providerId, adapterVersion: input.adapterVersion, modelId: input.modelId, capability: input.capability })) assertText(value, label);
    if (!Number.isFinite(Date.parse(input.timeoutAt))) throw new Error("timeoutAt must be an ISO timestamp");
    const existing = await this.repository.findByIdempotency(input.projectId, input.idempotencyKey);
    if (existing) return existing;
    const createdAt = now();
    return this.repository.create({ ...clone(input), id: randomUUID(), state: "queued", attemptCount: 0, maxAttempts: input.maxAttempts ?? 3, leaseWorkerId: null, leaseExpiresAt: null, cancellationReason: null, result: null, finalizedAt: null, createdAt, updatedAt: createdAt });
  }

  async claim(workerId: string, leaseSeconds = 60, at = now()): Promise<StudioJob | null> {
    assertText(workerId, "workerId");
    if (leaseSeconds < 1 || leaseSeconds > 3600) throw new Error("leaseSeconds must be between 1 and 3600");
    return this.repository.claim(workerId, leaseSeconds, at);
  }

  async heartbeat(projectId: string, jobId: string, workerId: string, leaseSeconds = 60): Promise<boolean> {
    const job = await this.repository.get(projectId, jobId);
    if (!job || job.leaseWorkerId !== workerId || !ACTIVE.has(job.state) || job.state === "cancel_requested") return false;
    job.leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    job.state = job.state === "queued" ? "running" : job.state;
    job.updatedAt = now(); await this.repository.save(job); return true;
  }

  async startProviderRun(projectId: string, jobId: string, workerId: string): Promise<ProviderRun> {
    const job = await this.requireLease(projectId, jobId, workerId);
    const existing = await this.repository.getProviderRun(jobId); if (existing) return existing;
    job.state = "submitting"; job.updatedAt = now(); await this.repository.save(job);
    return this.repository.createProviderRun({ id: randomUUID(), jobId, providerId: job.providerId, adapterVersion: job.adapterVersion, modelId: job.modelId, providerRunKey: null, state: "created", lastSequence: -1, createdAt: now(), updatedAt: now() });
  }

  /** Reconciliation is monotonic: duplicate and out-of-order provider events are stored but never regress state. */
  async reconcileProviderEvent(projectId: string, jobId: string, workerId: string, input: Omit<StudioJobEvent, "id" | "jobId">): Promise<boolean> {
    const job = await this.requireLease(projectId, jobId, workerId);
    const run = await this.repository.getProviderRun(jobId); if (!run) throw new Error("provider run not found");
    const accepted = await this.repository.recordEvent({ ...clone(input), id: randomUUID(), jobId });
    if (!accepted || input.sequence <= run.lastSequence || TERMINAL.has(job.state)) return false;
    run.lastSequence = input.sequence; run.updatedAt = now();
    if (input.type === "queued") { run.state = "submitted"; job.state = "provider_queued"; }
    else if (input.type === "running") { run.state = "running"; job.state = "running"; }
    else if (input.type === "completed") { run.state = "completed"; job.state = "processing"; }
    else if (input.type === "failed") { run.state = "failed"; await this.retryOrDeadLetter(job); }
    else if (input.type === "canceled") { run.state = "canceled"; job.state = "canceled"; }
    await this.repository.saveProviderRun(run); job.updatedAt = now(); await this.repository.save(job); return true;
  }

  async requestCancellation(projectId: string, jobId: string, reason: string): Promise<StudioJob> {
    assertText(reason, "reason"); const job = await this.require(projectId, jobId);
    if (TERMINAL.has(job.state)) return job;
    job.cancellationReason = reason;
    job.state = job.leaseWorkerId ? "cancel_requested" : "canceled";
    job.updatedAt = now(); await this.repository.save(job); return job;
  }

  async acknowledgeCancellation(projectId: string, jobId: string, workerId: string): Promise<boolean> {
    const job = await this.requireLease(projectId, jobId, workerId);
    if (job.state !== "cancel_requested") return false;
    job.state = "canceled"; job.leaseWorkerId = null; job.leaseExpiresAt = null; job.updatedAt = now(); await this.repository.save(job); return true;
  }

  async recoverExpiredLeases(workerId: string, at = now()): Promise<StudioJob | null> { return this.claim(workerId, 60, at); }

  async timeout(projectId: string, jobId: string, at = now()): Promise<boolean> {
    const job = await this.require(projectId, jobId);
    if (TERMINAL.has(job.state) || Date.parse(job.timeoutAt) > Date.parse(at)) return false;
    job.state = "timed_out"; job.leaseWorkerId = null; job.leaseExpiresAt = null; job.updatedAt = at; await this.repository.save(job); return true;
  }

  async finalize(projectId: string, jobId: string, workerId: string, result: Readonly<Record<string, unknown>>): Promise<boolean> {
    const existing = await this.require(projectId, jobId);
    if (TERMINAL.has(existing.state) || existing.finalizedAt) return false;
    const job = await this.requireLease(projectId, jobId, workerId);
    if (job.state === "cancel_requested") return false;
    job.state = "finalizing"; job.updatedAt = now(); await this.repository.save(job);
    const first = await this.repository.finalizeOnce(jobId, clone(result));
    if (!first) return false;
    job.result = clone(result); job.finalizedAt = now(); job.state = "completed"; job.leaseWorkerId = null; job.leaseExpiresAt = null; job.updatedAt = now(); await this.repository.save(job); return true;
  }

  private async retryOrDeadLetter(job: StudioJob): Promise<void> {
    job.leaseWorkerId = null; job.leaseExpiresAt = null;
    job.state = job.attemptCount >= job.maxAttempts ? "dead_lettered" : "retrying";
  }
  private async require(projectId: string, jobId: string): Promise<StudioJob> { const job = await this.repository.get(projectId, jobId); if (!job) throw new Error("job not found"); return job; }
  private async requireLease(projectId: string, jobId: string, workerId: string): Promise<StudioJob> { const job = await this.require(projectId, jobId); if (job.leaseWorkerId !== workerId || !job.leaseExpiresAt || job.leaseExpiresAt <= now()) throw new Error("worker does not own active lease"); return job; }
}

/** Test-only adapter. Production must provide a transactional database-backed repository. */
export class InMemoryStudioJobRepository implements StudioJobRepository {
  private readonly jobs = new Map<string, StudioJob>(); private readonly idempotency = new Map<string, string>(); private readonly runs = new Map<string, ProviderRun>(); private readonly eventKeys = new Set<string>(); private readonly finalized = new Set<string>();
  async findByIdempotency(projectId: string, key: string) { const id = this.idempotency.get(`${projectId}:${key}`); return id ? clone(this.jobs.get(id)!) : null; }
  async create(job: StudioJob) { const found = await this.findByIdempotency(job.projectId, job.idempotencyKey); if (found) return found; this.jobs.set(job.id, clone(job)); this.idempotency.set(`${job.projectId}:${job.idempotencyKey}`, job.id); return clone(job); }
  async get(projectId: string, jobId: string) { const job = this.jobs.get(jobId); return job?.projectId === projectId ? clone(job) : null; }
  async save(job: StudioJob) { this.jobs.set(job.id, clone(job)); }
  async claim(workerId: string, leaseSeconds: number, at: string) { const candidate = [...this.jobs.values()].filter(j => !TERMINAL.has(j.state) && j.state !== "cancel_requested" && (j.state === "queued" || j.state === "retrying" || (j.leaseExpiresAt !== null && j.leaseExpiresAt <= at))).sort((a,b) => a.createdAt.localeCompare(b.createdAt))[0]; if (!candidate) return null; candidate.attemptCount += 1; candidate.state = "running"; candidate.leaseWorkerId = workerId; candidate.leaseExpiresAt = new Date(Date.parse(at) + leaseSeconds * 1000).toISOString(); candidate.updatedAt = at; await this.save(candidate); return clone(candidate); }
  async createProviderRun(run: ProviderRun) { this.runs.set(run.jobId, clone(run)); return clone(run); }
  async getProviderRun(jobId: string) { const run = this.runs.get(jobId); return run ? clone(run) : null; }
  async saveProviderRun(run: ProviderRun) { this.runs.set(run.jobId, clone(run)); }
  async recordEvent(event: StudioJobEvent) { const key = `${event.jobId}:${event.eventKey}`; if (this.eventKeys.has(key)) return false; this.eventKeys.add(key); return true; }
  async finalizeOnce(jobId: string, result: Readonly<Record<string, unknown>>) { void result; if (this.finalized.has(jobId)) return false; this.finalized.add(jobId); return true; }
}

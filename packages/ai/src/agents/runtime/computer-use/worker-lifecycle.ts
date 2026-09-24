import { createHash, randomUUID } from "crypto";
import type { ComputerAction } from "./types";
import { computeCanonicalActionIdentity } from "./store";

/**
 * Durable lifecycle state deliberately lives outside a browser process.
 * A browser session is disposable process state, never a recovery checkpoint.
 */
export type AttemptState = "active" | "lost" | "completed" | "abandoned";
export type ActionExecutionState =
  | "proposed"
  | "approved"
  | "execution_started"
  | "outcome_unknown"
  | "verified_complete";

export interface WorkerLease {
  runId: string;
  tenantId: string;
  workerId: string;
  attemptId: string;
  expiresAt: string;
  heartbeatAt: string;
}

export interface ExecutionAttempt {
  id: string;
  runId: string;
  tenantId: string;
  workerId: string;
  state: AttemptState;
  startedAt: string;
  endedAt?: string;
}

export interface ExecutionCheckpoint {
  runId: string;
  tenantId: string;
  attemptId: string;
  sequence: number;
  state: "safe_to_continue" | "approval_pending" | "manual_adjudication_required";
  nextActionId?: string;
  trustedUrl?: string;
  createdAt: string;
}

export interface ActionLedgerEntry {
  id: string;
  runId: string;
  tenantId: string;
  idempotencyKey: string;
  canonicalIdentity: string;
  action: ComputerAction;
  state: ActionExecutionState;
  createdAt: string;
  updatedAt: string;
}

export interface LifecycleSnapshot {
  attempt: ExecutionAttempt;
  lease: WorkerLease;
}

export interface WorkerLifecycleRepository {
  /** True only when records survive a process restart. */
  readonly durable: boolean;
  getLease(runId: string, tenantId: string): Promise<WorkerLease | null>;
  putLease(lease: WorkerLease): Promise<void>;
  getAttempt(id: string): Promise<ExecutionAttempt | null>;
  putAttempt(attempt: ExecutionAttempt): Promise<void>;
  getCheckpoint(runId: string, tenantId: string): Promise<ExecutionCheckpoint | null>;
  putCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void>;
  getAction(runId: string, tenantId: string, idempotencyKey: string): Promise<ActionLedgerEntry | null>;
  putAction(entry: ActionLedgerEntry): Promise<void>;
  listActions(runId: string, tenantId: string): Promise<ActionLedgerEntry[]>;
}

export class LifecycleConflictError extends Error {}
export class EphemeralRecoveryError extends Error {}

function nowIso(now: Date): string { return now.toISOString(); }
function actionKey(identity: string): string {
  return createHash("sha256").update(identity).digest("hex");
}

export class WorkerLifecycleCoordinator {
  constructor(
    private readonly repository: WorkerLifecycleRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async acquireLease(input: {
    runId: string;
    tenantId: string;
    workerId: string;
    ttlMs: number;
  }): Promise<LifecycleSnapshot> {
    if (input.ttlMs <= 0) throw new LifecycleConflictError("Lease TTL must be positive.");
    const now = this.clock();
    const existing = await this.repository.getLease(input.runId, input.tenantId);
    if (existing && new Date(existing.expiresAt) > now && existing.workerId !== input.workerId) {
      throw new LifecycleConflictError("A non-expired worker lease already owns this run.");
    }
    const attempt: ExecutionAttempt = {
      id: randomUUID(), runId: input.runId, tenantId: input.tenantId,
      workerId: input.workerId, state: "active", startedAt: nowIso(now),
    };
    const lease: WorkerLease = {
      runId: input.runId, tenantId: input.tenantId, workerId: input.workerId,
      attemptId: attempt.id, heartbeatAt: nowIso(now),
      expiresAt: new Date(now.getTime() + input.ttlMs).toISOString(),
    };
    if (existing) {
      const prior = await this.repository.getAttempt(existing.attemptId);
      if (prior?.state === "active") await this.repository.putAttempt({ ...prior, state: "lost", endedAt: nowIso(now) });
    }
    await this.repository.putAttempt(attempt);
    await this.repository.putLease(lease);
    return { attempt, lease };
  }

  async heartbeat(lease: WorkerLease, ttlMs: number): Promise<WorkerLease> {
    const current = await this.repository.getLease(lease.runId, lease.tenantId);
    if (!current || current.attemptId !== lease.attemptId || current.workerId !== lease.workerId) {
      throw new LifecycleConflictError("Worker no longer owns this lease.");
    }
    const now = this.clock();
    if (new Date(current.expiresAt) <= now) throw new LifecycleConflictError("Worker lease has expired.");
    const renewed = { ...current, heartbeatAt: nowIso(now), expiresAt: new Date(now.getTime() + ttlMs).toISOString() };
    await this.repository.putLease(renewed);
    return renewed;
  }

  async checkpoint(input: Omit<ExecutionCheckpoint, "sequence" | "createdAt">): Promise<ExecutionCheckpoint> {
    const existing = await this.repository.getCheckpoint(input.runId, input.tenantId);
    const checkpoint = { ...input, sequence: (existing?.sequence ?? 0) + 1, createdAt: nowIso(this.clock()) };
    await this.repository.putCheckpoint(checkpoint);
    return checkpoint;
  }

  async reserveAction(input: { runId: string; tenantId: string; action: ComputerAction; idempotencyKey?: string }): Promise<ActionLedgerEntry> {
    const canonicalIdentity = computeCanonicalActionIdentity(input.action);
    const idempotencyKey = input.idempotencyKey ?? actionKey(canonicalIdentity);
    const existing = await this.repository.getAction(input.runId, input.tenantId, idempotencyKey);
    if (existing) {
      if (existing.canonicalIdentity !== canonicalIdentity) throw new LifecycleConflictError("Idempotency key is bound to a different action.");
      return existing;
    }
    const timestamp = nowIso(this.clock());
    const entry: ActionLedgerEntry = { id: randomUUID(), runId: input.runId, tenantId: input.tenantId, idempotencyKey, canonicalIdentity, action: input.action, state: "proposed", createdAt: timestamp, updatedAt: timestamp };
    await this.repository.putAction(entry);
    return entry;
  }

  async transitionAction(entry: ActionLedgerEntry, state: ActionExecutionState): Promise<ActionLedgerEntry> {
    const stored = await this.repository.getAction(entry.runId, entry.tenantId, entry.idempotencyKey);
    if (!stored || stored.id !== entry.id) throw new LifecycleConflictError("Action ledger entry is missing.");
    if (stored.state === "verified_complete") return stored;
    const allowed: Record<ActionExecutionState, ActionExecutionState[]> = {
      proposed: ["approved", "execution_started"], approved: ["execution_started"],
      execution_started: ["outcome_unknown", "verified_complete"], outcome_unknown: [], verified_complete: [],
    };
    if (!allowed[stored.state].includes(state)) throw new LifecycleConflictError(`Invalid action transition: ${stored.state} -> ${state}`);
    const updated = { ...stored, state, updatedAt: nowIso(this.clock()) };
    await this.repository.putAction(updated);
    return updated;
  }

  async recover(runId: string, tenantId: string): Promise<ExecutionCheckpoint> {
    if (!this.repository.durable) throw new EphemeralRecoveryError("Computer Use restart recovery requires durable lifecycle storage.");
    const actions = await this.repository.listActions(runId, tenantId);
    const started = actions.filter((entry) => entry.state === "execution_started");
    for (const entry of started) await this.transitionAction(entry, "outcome_unknown");
    const existing = await this.repository.getCheckpoint(runId, tenantId);
    // An action sent to an external browser may have succeeded before a crash.
    // It is never replayed automatically; a human/system verifier must adjudicate it.
    if (started.length > 0) {
      return this.checkpoint({ runId, tenantId, attemptId: existing?.attemptId ?? "recovery", state: "manual_adjudication_required", nextActionId: started[0].id, trustedUrl: existing?.trustedUrl });
    }
    if (!existing) throw new LifecycleConflictError("No durable checkpoint exists for this run.");
    return this.checkpoint({ ...existing, state: existing.state === "approval_pending" ? "approval_pending" : "safe_to_continue" });
  }
}

/** A test/local repository. Its `durable` flag is false by default to prevent false restart claims. */
export function createMemoryLifecycleRepository(durable = false): WorkerLifecycleRepository {
  const leases = new Map<string, WorkerLease>(); const attempts = new Map<string, ExecutionAttempt>();
  const checkpoints = new Map<string, ExecutionCheckpoint>(); const actions = new Map<string, ActionLedgerEntry>();
  const key = (runId: string, tenantId: string) => `${tenantId}:${runId}`;
  return {
    durable,
    async getLease(runId, tenantId) { return leases.get(key(runId, tenantId)) ?? null; },
    async putLease(lease) { leases.set(key(lease.runId, lease.tenantId), lease); },
    async getAttempt(id) { return attempts.get(id) ?? null; },
    async putAttempt(attempt) { attempts.set(attempt.id, attempt); },
    async getCheckpoint(runId, tenantId) { return checkpoints.get(key(runId, tenantId)) ?? null; },
    async putCheckpoint(checkpoint) { checkpoints.set(key(checkpoint.runId, checkpoint.tenantId), checkpoint); },
    async getAction(runId, tenantId, idempotencyKey) { return actions.get(`${key(runId, tenantId)}:${idempotencyKey}`) ?? null; },
    async putAction(entry) { actions.set(`${key(entry.runId, entry.tenantId)}:${entry.idempotencyKey}`, entry); },
    async listActions(runId, tenantId) { return [...actions.values()].filter((entry) => entry.runId === runId && entry.tenantId === tenantId); },
  };
}

import { randomUUID } from "node:crypto";
import {
  canTransitionRun,
  EMPTY_RUN_REFERENCES,
  isSupportedWorkspaceExtension,
  normalizeWorkspaceExtension,
  TERMINAL_RUN_STATUSES,
  type AppendRunEventInput,
  type CreateContinuationInput,
  type CreateRunInput,
  type RunAccessScope,
  type RunAttempt,
  type RunAttemptKind,
  type RunContinuation,
  type RunEnvelope,
  type RunError,
  type RunRecord,
  type RunReferences,
  type RunStatus,
} from "@ethen/contracts/platform/runs/contract";
import { RunContractError } from "./errors";
import type { RunRepository } from "./repository";

interface RunServiceDependencies {
  repository: RunRepository;
  now?: () => string;
  newId?: () => string;
}

function requireText(value: string, field: string): void {
  if (!value.trim()) {
    throw new RunContractError("INVALID_INPUT", `${field} is required.`);
  }
}

function cloneReferences(
  references: Partial<RunReferences> | undefined,
): RunReferences {
  return {
    approvalIds: [...(references?.approvalIds ?? EMPTY_RUN_REFERENCES.approvalIds)],
    evidenceIds: [...(references?.evidenceIds ?? EMPTY_RUN_REFERENCES.evidenceIds)],
    artifactIds: [...(references?.artifactIds ?? EMPTY_RUN_REFERENCES.artifactIds)],
    usageAttemptIds: [
      ...(references?.usageAttemptIds ?? EMPTY_RUN_REFERENCES.usageAttemptIds),
    ],
    auditEventIds: [
      ...(references?.auditEventIds ?? EMPTY_RUN_REFERENCES.auditEventIds),
    ],
    outcomeIds: [...(references?.outcomeIds ?? EMPTY_RUN_REFERENCES.outcomeIds)],
    judgmentIds: [
      ...(references?.judgmentIds ?? EMPTY_RUN_REFERENCES.judgmentIds),
    ],
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

export class UniversalRunService {
  private readonly repository: RunRepository;
  private readonly now: () => string;
  private readonly newId: () => string;

  constructor(dependencies: RunServiceDependencies) {
    this.repository = dependencies.repository;
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.newId = dependencies.newId ?? randomUUID;
  }

  async createRun(input: CreateRunInput): Promise<RunEnvelope> {
    return this.createRunWithAttempt(input, "initial", null);
  }

  async getRun(
    scope: RunAccessScope,
    runId: string,
  ): Promise<RunEnvelope | null> {
    const run = await this.repository.findRun(scope.projectId, runId);
    if (!run) return null;
    return this.loadEnvelope(run);
  }

  async transition(
    scope: RunAccessScope,
    runId: string,
    to: RunStatus,
    error: RunError | null = null,
  ): Promise<RunEnvelope> {
    const current = await this.requireRun(scope, runId);
    if (!canTransitionRun(current.status, to)) {
      throw new RunContractError(
        "INVALID_TRANSITION",
        `Illegal run transition ${current.status} -> ${to}.`,
      );
    }
    if (to === "failed" && !error) {
      throw new RunContractError(
        "INVALID_INPUT",
        "A failed run requires structured error semantics.",
      );
    }

    const updatedAt = this.now();
    const updated = await this.repository.updateRunStatus({
      projectId: scope.projectId,
      runId,
      expectedStatus: current.status,
      status: to,
      error,
      updatedAt,
    });

    const attempts = await this.repository.listAttempts(scope.projectId, runId);
    const activeAttempt = attempts.at(-1);
    if (activeAttempt) {
      await this.repository.updateAttempt({
        ...activeAttempt,
        status: to,
        error: to === "failed" ? error : activeAttempt.error,
        startedAt:
          to === "running" && !activeAttempt.startedAt
            ? updatedAt
            : activeAttempt.startedAt,
        endedAt: TERMINAL_RUN_STATUSES.has(to)
          ? updatedAt
          : activeAttempt.endedAt,
      });
    }

    await this.appendEvent(scope, runId, {
      type: "run.status_changed",
      visibility: "user",
      actorId: scope.actorId,
      attemptId: activeAttempt?.id ?? null,
      data: {
        from: current.status,
        to,
      },
    });
    if (error) {
      await this.appendEvent(scope, runId, {
        type: "run.error_recorded",
        visibility: "user",
        actorId: scope.actorId,
        attemptId: activeAttempt?.id ?? null,
        data: { error },
      });
    }

    return this.loadEnvelope(updated);
  }

  /**
   * P11 — correlate an attempt with the frozen context set it consumed.
   * Project-fenced through the run record: cross-project linkage is
   * refused. Null clears nothing silently — it records that the attempt
   * used no constructed context. Emits a `context.linked` run event so the
   * linkage itself is auditable.
   */
  async setAttemptContext(
    scope: RunAccessScope,
    runId: string,
    attemptId: string,
    contextSetId: string | null,
  ): Promise<RunAttempt> {
    const run = await this.repository.findRun(scope.projectId, runId);
    if (!run) {
      throw new RunContractError(
        "RUN_NOT_FOUND",
        "Run not found in the authorized project.",
      );
    }
    const attempts = await this.repository.listAttempts(scope.projectId, runId);
    const attempt = attempts.find((candidate) => candidate.id === attemptId);
    if (!attempt) {
      throw new RunContractError(
        "RUN_NOT_FOUND",
        "Attempt not found in the authorized project.",
      );
    }
    if (typeof contextSetId === "string" && !contextSetId.trim()) {
      throw new RunContractError(
        "INVALID_INPUT",
        "contextSetId must be a non-empty id or null.",
      );
    }
    const updated: RunAttempt = { ...attempt, contextSetId };
    await this.repository.updateAttempt(updated);
    await this.appendEvent(scope, runId, {
      type: "context.linked",
      visibility: "internal",
      actorId: scope.actorId,
      attemptId: attempt.id,
      data: { contextSetId },
    });
    return updated;
  }

  async appendEvent(
    scope: RunAccessScope,
    runId: string,
    input: AppendRunEventInput,
  ) {
    await this.requireRun(scope, runId);
    const event = await this.repository.appendEvent({
      id: this.newId(),
      schemaVersion: 1,
      runId,
      projectId: scope.projectId,
      type: input.type,
      visibility: input.visibility,
      actorId: input.actorId ?? scope.actorId,
      attemptId: input.attemptId ?? null,
      data: { ...(input.data ?? {}) },
      createdAt: this.now(),
    });
    return deepFreeze(event);
  }

  async retryRun(
    scope: RunAccessScope,
    runId: string,
    error: RunError,
  ): Promise<RunEnvelope> {
    const run = await this.requireRun(scope, runId);
    if (run.status !== "running") {
      throw new RunContractError(
        "INVALID_TRANSITION",
        "A retry may only replace an active running attempt.",
      );
    }
    const attempts = await this.repository.listAttempts(scope.projectId, runId);
    const current = attempts.at(-1);
    if (!current) {
      throw new RunContractError(
        "PERSISTENCE_CONFLICT",
        "The run has no attempt to retry.",
      );
    }
    const endedAt = this.now();
    await this.repository.updateAttempt({
      ...current,
      status: "failed",
      error,
      endedAt,
    });

    const retry: RunAttempt = {
      id: this.newId(),
      runId,
      projectId: scope.projectId,
      number: current.number + 1,
      kind: "retry",
      status: "running",
      retryOfAttemptId: current.id,
      error: null,
      createdAt: endedAt,
      startedAt: endedAt,
      endedAt: null,
      outcomeId: null,
      judgmentId: null,
      humanInterventionId: null,
      contextSetId: null,
    };
    await this.repository.insertAttempt(retry);
    await this.appendEvent(scope, runId, {
      type: "attempt.created",
      visibility: "user",
      actorId: scope.actorId,
      attemptId: retry.id,
      data: {
        kind: retry.kind,
        number: retry.number,
        retryOfAttemptId: current.id,
      },
    });
    return this.loadEnvelope(run);
  }

  async continueRun(
    scope: RunAccessScope,
    priorRunId: string,
    input: CreateContinuationInput,
  ): Promise<RunEnvelope> {
    const prior = await this.requireRun(scope, priorRunId);
    if (!TERMINAL_RUN_STATUSES.has(prior.status)) {
      throw new RunContractError(
        "INVALID_TRANSITION",
        "A continuation requires a terminal prior run.",
      );
    }
    if (input.actorId !== scope.actorId) {
      throw new RunContractError(
        "INVALID_INPUT",
        "Continuation actor must match the authorized scope.",
      );
    }

    const next = await this.createRunWithAttempt(
      {
        organizationId: prior.organizationId,
        projectId: prior.projectId,
        actorId: input.actorId,
        executionMode: input.executionMode ?? prior.executionMode,
        workspace: prior.workspace,
        workspaceExtension: prior.workspaceExtension,
        idempotencyKey: input.idempotencyKey,
        policySnapshot: prior.policySnapshot,
        requestedModel: prior.requestedModel,
        parentRunId: prior.parentRunId,
        references: prior.references,
      },
      "continuation",
      prior.id,
    );

    const priorAttempts = await this.repository.listAttempts(
      scope.projectId,
      priorRunId,
    );
    const continuation: RunContinuation = {
      id: this.newId(),
      projectId: scope.projectId,
      priorRunId,
      nextRunId: next.id,
      fromAttemptId: priorAttempts.at(-1)?.id ?? null,
      reason: input.reason,
      createdBy: scope.actorId,
      createdAt: this.now(),
    };
    await this.repository.insertContinuation(continuation);
    await this.appendEvent(scope, next.id, {
      type: "continuation.created",
      visibility: "user",
      actorId: scope.actorId,
      attemptId: next.attempts[0]?.id ?? null,
      data: { priorRunId, continuationId: continuation.id },
    });
    return (await this.getRun(scope, next.id))!;
  }

  private async createRunWithAttempt(
    input: CreateRunInput,
    attemptKind: RunAttemptKind,
    continuationOfRunId: string | null,
  ): Promise<RunEnvelope> {
    for (const [field, value] of Object.entries({
      organizationId: input.organizationId,
      projectId: input.projectId,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      policySnapshotId: input.policySnapshot.id,
      policySnapshotVersion: input.policySnapshot.version,
      policySnapshotHash: input.policySnapshot.hash,
    })) {
      requireText(value, field);
    }

    const now = this.now();
    if (!isSupportedWorkspaceExtension(input.workspaceExtension)) {
      throw new RunContractError(
        "UNSUPPORTED_WORKSPACE_EXTENSION",
        "Unsupported workspace extension (name/version not admitted by the server allowlist).",
      );
    }
    const run: RunRecord = {
      id: this.newId(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      actorId: input.actorId,
      executionMode: input.executionMode,
      workspace: input.workspace,
      workspaceExtension: normalizeWorkspaceExtension(input.workspaceExtension),
      status: "queued",
      requestedModel: input.requestedModel ?? null,
      resolvedModel: null,
      provider: null,
      traceId: input.traceId ?? this.newId(),
      idempotencyKey: input.idempotencyKey,
      parentRunId: input.parentRunId ?? null,
      continuationOfRunId,
      policySnapshot: { ...input.policySnapshot },
      references: cloneReferences(input.references),
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    const attempt: RunAttempt = {
      id: this.newId(),
      runId: run.id,
      projectId: run.projectId,
      number: 1,
      kind: attemptKind,
      status: "queued",
      retryOfAttemptId: null,
      error: null,
      createdAt: now,
      startedAt: null,
      endedAt: null,
      outcomeId: null,
      judgmentId: null,
      humanInterventionId: null,
      contextSetId: null,
    };

    await this.repository.insertRun(run);
    await this.repository.insertAttempt(attempt);
    await this.appendEvent(
      { projectId: run.projectId, actorId: run.actorId },
      run.id,
      {
        type: "run.created",
        visibility: "user",
        actorId: run.actorId,
        attemptId: attempt.id,
        data: {
          executionMode: run.executionMode,
          workspace: run.workspace,
          status: run.status,
        },
      },
    );
    await this.appendEvent(
      { projectId: run.projectId, actorId: run.actorId },
      run.id,
      {
        type: "attempt.created",
        visibility: "user",
        actorId: run.actorId,
        attemptId: attempt.id,
        data: { kind: attempt.kind, number: attempt.number },
      },
    );
    return this.loadEnvelope(run);
  }

  private async requireRun(
    scope: RunAccessScope,
    runId: string,
  ): Promise<RunRecord> {
    const run = await this.repository.findRun(scope.projectId, runId);
    if (!run) {
      throw new RunContractError(
        "RUN_NOT_FOUND",
        "Run not found in the authorized project.",
      );
    }
    return run;
  }

  private async loadEnvelope(run: RunRecord): Promise<RunEnvelope> {
    const [events, attempts, continuations] = await Promise.all([
      this.repository.listEvents(run.projectId, run.id),
      this.repository.listAttempts(run.projectId, run.id),
      this.repository.listContinuations(run.projectId, run.id),
    ]);
    for (let index = 0; index < events.length; index += 1) {
      if (events[index]?.sequence !== index + 1) {
        throw new RunContractError(
          "EVENT_ORDER_VIOLATION",
          `Run event sequence is not dense and ordered at index ${index}.`,
        );
      }
    }
    return deepFreeze({
      ...run,
      events: [...events],
      attempts: [...attempts],
      continuations: [...continuations],
    });
  }
}

export const RUN_STATUSES = [
  "queued",
  "running",
  "waiting_approval",
  "paused",
  "succeeded",
  "failed",
  "canceled",
  "expired",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_STATUS_TRANSITIONS: Readonly<
  Record<RunStatus, readonly RunStatus[]>
> = {
  queued: ["running", "failed", "canceled", "expired"],
  running: [
    "waiting_approval",
    "paused",
    "succeeded",
    "failed",
    "canceled",
    "expired",
  ],
  waiting_approval: ["running", "paused", "failed", "canceled", "expired"],
  paused: ["queued", "running", "failed", "canceled", "expired"],
  succeeded: [],
  failed: [],
  canceled: [],
  expired: [],
};

export const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  "succeeded",
  "failed",
  "canceled",
  "expired",
]);

export type RunExecutionMode = "interactive" | "asynchronous";
export type RunWorkspace = "model" | "code" | "research" | "studio";
export type RunAttemptKind = "initial" | "retry" | "continuation";
export type RunEventVisibility = "user" | "admin" | "internal";

export const RUN_EVENT_TYPES = [
  "run.created",
  "run.status_changed",
  "run.error_recorded",
  "attempt.created",
  "attempt.status_changed",
  "continuation.created",
  "research.planning",
  "research.approval",
  "research.retrieval",
  "research.contents",
  "research.synthesis",
  "research.verification",
  "research.checkpoint",
  "research.recovery",
  "research.cancellation",
  "input.received",
  "output.produced",
  "approval.linked",
  "evidence.linked",
  "artifact.linked",
  "usage.linked",
  "audit.linked",
  "context.linked",
  "context.cross_product_read",
] as const;

export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

export type RunErrorCategory =
  | "transient"
  | "provider_limit"
  | "policy"
  | "user"
  | "permanent";

export interface RunError {
  code: string;
  category: RunErrorCategory;
  messageRedacted: string;
  retryable: boolean;
  attemptId: string | null;
  occurredAt: string;
  details: Readonly<Record<string, unknown>>;
}

export interface RunPolicySnapshot {
  id: string;
  version: string;
  hash: string;
  capturedAt: string;
}

export interface RunReferences {
  approvalIds: readonly string[];
  evidenceIds: readonly string[];
  artifactIds: readonly string[];
  usageAttemptIds: readonly string[];
  auditEventIds: readonly string[];
  /**
   * P10 reservation for P30 Outcome semantics. Always present (possibly
   * empty) on new records; no status machine, no evaluator, no computation
   * in P10. Missing on historical rows — use normalizeRunReferences.
   */
  outcomeIds: readonly string[];
  /**
   * P10 reservation for P31 Failure Attribution & Judgment semantics.
   * Same no-semantics rule as outcomeIds.
   */
  judgmentIds: readonly string[];
}

export interface RunEvent {
  id: string;
  schemaVersion: 1;
  runId: string;
  projectId: string;
  sequence: number;
  type: RunEventType;
  visibility: RunEventVisibility;
  actorId: string | null;
  attemptId: string | null;
  data: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export interface RunAttempt {
  id: string;
  runId: string;
  projectId: string;
  number: number;
  kind: RunAttemptKind;
  status: RunStatus;
  retryOfAttemptId: string | null;
  error: RunError | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  /**
   * P10 reservation for P30 Outcome semantics. Always null in P10: no
   * outcome computation, no evaluator, no status machine. A non-null value
   * in P10 carries no semantics and must not be interpreted.
   */
  outcomeId: string | null;
  /**
   * P10 reservation for P31 Failure Attribution & Judgment semantics.
   * Always null in P10, same no-semantics rule as outcomeId.
   */
  judgmentId: string | null;
  /**
   * P10 human-intervention correlation reservation. Null unless a later
   * human correction/intervention explicitly correlates to this attempt.
   * Correlation infrastructure only — P10 implements no correction,
   * review-queue, or judgment workflow.
   */
  humanInterventionId: string | null;
  /**
   * P11 stable context-set identity for attempts that consumed
   * constructed retrieval/context. Null when no context set was used.
   * P11 never fabricates context sets. Durable: persisted on run_attempts.
   * Correlation only, never authorization.
   */
  contextSetId: string | null;
}

export interface RunContinuation {
  id: string;
  projectId: string;
  priorRunId: string;
  nextRunId: string;
  fromAttemptId: string | null;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface RunRecord {
  id: string;
  organizationId: string;
  projectId: string;
  actorId: string;
  executionMode: RunExecutionMode;
  workspace: RunWorkspace;
  /**
   * A0-H2 versioned taxonomy extension. Null = first-party product
   * run. Founder/Bot orchestration records the honest base surface
   * in `workspace` plus this server-admitted pair; it must never be
   * used to relabel another surface as `model`.
   */
  workspaceExtension: RunWorkspaceExtension | null;
  status: RunStatus;
  requestedModel: string | null;
  resolvedModel: string | null;
  provider: string | null;
  traceId: string;
  idempotencyKey: string;
  parentRunId: string | null;
  continuationOfRunId: string | null;
  policySnapshot: RunPolicySnapshot;
  references: RunReferences;
  error: RunError | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunEnvelope extends RunRecord {
  events: readonly RunEvent[];
  attempts: readonly RunAttempt[];
  continuations: readonly RunContinuation[];
}

export interface RunAccessScope {
  projectId: string;
  actorId: string;
}

export interface CreateRunInput {
  organizationId: string;
  projectId: string;
  actorId: string;
  executionMode: RunExecutionMode;
  workspace: RunWorkspace;
  workspaceExtension?: RunWorkspaceExtension | null;
  idempotencyKey: string;
  policySnapshot: RunPolicySnapshot;
  requestedModel?: string | null;
  traceId?: string;
  parentRunId?: string | null;
  references?: Partial<RunReferences>;
}

export interface AppendRunEventInput {
  type: RunEventType;
  visibility: RunEventVisibility;
  actorId?: string | null;
  attemptId?: string | null;
  data?: Readonly<Record<string, unknown>>;
}

export interface CreateContinuationInput {
  idempotencyKey: string;
  reason: string;
  actorId: string;
  executionMode?: RunExecutionMode;
}

export const EMPTY_RUN_REFERENCES: RunReferences = Object.freeze({
  approvalIds: Object.freeze([]),
  evidenceIds: Object.freeze([]),
  artifactIds: Object.freeze([]),
  usageAttemptIds: Object.freeze([]),
  auditEventIds: Object.freeze([]),
  outcomeIds: Object.freeze([]),
  judgmentIds: Object.freeze([]),
});

/**
 * P10 backward compatibility: historical `resource_references` rows predate
 * the outcome/judgment reservation collections. Normalize missing keys to
 * empty (never fabricate values, never mutate the input).
 */
export function normalizeRunReferences(
  references: Partial<RunReferences> | null | undefined,
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
    judgmentIds: [...(references?.judgmentIds ?? EMPTY_RUN_REFERENCES.judgmentIds)],
  };
}

export function canTransitionRun(
  from: RunStatus,
  to: RunStatus,
): boolean {
  return RUN_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * A0-H2 -- versioned run-taxonomy extension seam.
 *
 * The canonical base taxonomy (`RunWorkspace`) is frozen P09 authority and
 * is unchanged. Orchestrated product runtimes (Founder now, Bot in Slice D)
 * must not masquerade as `model`: they record the honest base surface in
 * `workspace` plus a server-controlled extension pair. Admission is
 * allowlist-driven and version-pinned; anything not listed is denied by the
 * service gate and by the `runs_workspace_extension_check` database CHECK.
 */
export const RUN_WORKSPACE_EXTENSION_VERSION = 1 as const;

export type RunWorkspaceExtensionName = "founder" | "bot";

export interface RunWorkspaceExtension {
  name: RunWorkspaceExtensionName;
  version: typeof RUN_WORKSPACE_EXTENSION_VERSION;
}

/**
 * Server-controlled admission allowlist. Slice A admitted Founder; `bot` was
 * reserved in the database CHECK and held denied here until Slice D put the
 * Bot canonical binding on the production path. It is admitted now, still
 * version-pinned: any name or version not listed is denied by this gate and
 * by `runs_workspace_extension_check`.
 */
export const SUPPORTED_WORKSPACE_EXTENSIONS: ReadonlyArray<RunWorkspaceExtension> =
  Object.freeze([
    { name: "founder", version: 1 },
    { name: "bot", version: 1 },
  ] as const as RunWorkspaceExtension[]);

export function isSupportedWorkspaceExtension(
  extension: RunWorkspaceExtension | null | undefined,
): boolean {
  if (!extension) return true;
  if (extension.version !== RUN_WORKSPACE_EXTENSION_VERSION) return false;
  return SUPPORTED_WORKSPACE_EXTENSIONS.some(
    (supported) =>
      supported.name === extension.name &&
      supported.version === extension.version,
  );
}

export function normalizeWorkspaceExtension(
  extension: RunWorkspaceExtension | null | undefined,
): RunWorkspaceExtension | null {
  if (!extension) return null;
  return { name: extension.name, version: extension.version };
}

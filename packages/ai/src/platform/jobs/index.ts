export {
  JOB_STATUSES,
  JOB_STATUS_TRANSITIONS,
  TERMINAL_JOB_STATUSES,
  DEFAULT_QUEUE_NAME,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BACKOFF_BASE_SECONDS,
  DEFAULT_LEASE_DURATION_SECONDS,
  canTransitionJob,
  calculateBackoffSeconds,
  isJobTerminal,
  isJobActive,
  isDispatchBoundaryRecorded,
} from "./contract";

export type {
  CreateJobInput,
  JobAccessScope,
  JobError,
  JobEvent,
  JobEventName,
  JobRecord,
  JobStatus,
} from "./contract";

export { JobContractError, JobPersistenceError } from "./errors";

export { DurableJobService } from "./service";

export type {
  JobRepository,
  JobClaimFilter,
  ReconcileDispatchedInput,
  ReconcileTarget,
  FencingGeneration,
} from "./repository";

export {
  EXECUTION_ENVELOPE_KEY,
  GOVERNANCE_ENVELOPE_KEY,
  buildExecutionEnvelope,
  governedActionBytes,
  readExecutionIdentity,
  readGovernedDispatch,
  validateExecutionIdentityForDispatch,
} from "./execution-identity";

export type {
  ExecutionIdentity,
  ExecutionIdentityInput,
  GovernedDispatch,
} from "./execution-identity";

export { sweepReconciliationCandidates } from "./reconciler";

export type {
  ExternalOperationState,
  ReconciliationSweepDeps,
  ReconciliationSweepResult,
} from "./reconciler";

export { InMemoryJobRepository } from "./in-memory-repository";
export {
  SupabaseDurableJobRepository,
  isDurableJobProjectId,
  mapDurableJobRow,
} from "./supabase-repository";
export {
  createPlatformJobRepository,
  isPlatformJobRepositoryDurable,
} from "./factory";

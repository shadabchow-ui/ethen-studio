/**
 * Slice B — P30–P33 platform plane domain types.
 *
 * Canonical identities reuse the P10-reserved seams: outcome records are
 * keyed by the `outcome_id` domain (`out_` ids, also referenced from
 * `run_attempts.outcome_id` / `resource_references.outcomeIds`), judgment
 * records by the `judgment_id` domain (`jdg_` ids). No second execution-
 * outcome identity exists. All cross-plane links are canonical-ID
 * correlation, never a second authority.
 */

export interface OutcomeScope {
  organizationId: string;
  tenantId: string;
  projectId: string | null;
  actorId: string;
}

export type OutcomeResultState =
  | "succeeded"
  | "partial"
  | "failed"
  | "rejected"
  | "rolled_back"
  | "unknown"
  | "pending";

export interface OutcomeRecord {
  /** Canonical P30 id (`out_...`); also the value stored in P10 seams. */
  id: string;
  scope: OutcomeScope;
  sourceRunId: string | null;
  sourceAttemptId: string | null;
  sourceTaskId: string | null;
  sourceActionId: string | null;
  resultState: OutcomeResultState;
  executionSuccess: boolean | null;
  taskSuccess: boolean | null;
  businessSuccess: boolean | null;
  evidenceRefId: string | null;
  receiptRefId: string | null;
  supersedesOutcomeId: string | null;
  evaluationVersion: number;
  idempotencyKey: string;
  createdAt: string;
}

/** Code-side P09 linkage proof: validated id-correlation, no table writes. */
export interface AttemptOutcomeBinding {
  runId: string;
  attemptId: string;
  outcomeId: string;
  boundAt: string;
}

export type EvaluatorKind = "deterministic" | "model" | "expert" | "user";

export type JudgmentConclusion = "sound" | "unsound" | "inconclusive";

export type FailureCategory =
  | "transient"
  | "provider_limit"
  | "policy"
  | "user"
  | "permanent"
  | "unknown";

export interface JudgmentRecord {
  /** Canonical P31 id (`jdg_...`); also the value stored in P10 seams. */
  id: string;
  scope: OutcomeScope;
  outcomeId: string | null;
  evaluatorKind: EvaluatorKind;
  evaluatorVersion: string;
  conclusion: JudgmentConclusion;
  confidence: number | null;
  failureCategory: FailureCategory | null;
  dissentRefs: string[];
  supersedesJudgmentId: string | null;
  evidenceRefs: string[];
  criteriaRefId: string | null;
  rationale: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface ExperienceRecord {
  id: string;
  scope: OutcomeScope;
  label: string;
  contextSetId: string | null;
  policySnapshotHash: string | null;
  runRefId: string | null;
  attemptRefId: string | null;
  jobRefId: string | null;
  toolTraceRefs: string[];
  evidenceRefs: string[];
  outcomeRefId: string | null;
  judgmentRefId: string | null;
  costCents: number | null;
  latencyMs: number | null;
  interventionRefId: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export type GroundTruthState =
  | "proposed"
  | "verified"
  | "applied"
  | "retracted"
  | "superseded"
  | "invalid";

export interface GroundTruthCandidate {
  id: string;
  scope: OutcomeScope;
  statement: string;
  provenance: Record<string, unknown>;
  state: GroundTruthState;
  verifiedByJudgmentId: string | null;
  verificationEvidenceRefId: string | null;
  supersedesCandidateId: string | null;
  derivedFromCandidateIds: string[];
  appliedPolicy: string | null;
  sharedCrossTenant: boolean;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export type GroundTruthEventKind =
  | "proposed"
  | "verified"
  | "applied"
  | "corrected"
  | "retracted"
  | "superseded"
  | "invalidated"
  | "shared"
  | "unshared";

export interface GroundTruthEvent {
  candidateId: string;
  scope: OutcomeScope;
  actorId: string;
  event: GroundTruthEventKind;
  detail: Record<string, unknown>;
  createdAt: string;
}

import type { RunPolicySnapshot } from "../runs/contract";

export interface EvidenceRecord {
  id: string;
  organizationId: string;
  projectId: string;
  runId: string;
  attemptId: string;
  /**
   * P10 canonical execution trace binding, recorded at emission. Null on
   * historical rows. Never part of the content/policy hash domain.
   */
  traceId: string | null;
  /**
   * P10 durable-job correlation (`durable_jobs.id` domain, no FK).
   * Null when the evidence was not produced by a job execution.
   */
  jobId: string | null;
  /**
   * P10 canonical-approval correlation, recorded when approval-gated
   * execution produced this evidence. Null otherwise.
   */
  approvalId: string | null;
  /**
   * P10 ActionReceipt correlation, recorded when a receipt references
   * this evidence. Null otherwise.
   */
  receiptId: string | null;
  /**
   * P11 stable context-set identity for evidence recorded from a context-
   * consuming execution (Code lane and others). Null when no context set
   * was used. Correlation only.
   */
  contextSetId: string | null;
  actorId: string;
  observationType: string;
  source: string;
  mediaType: string;
  filename: string;
  objectKey: string;
  contentHash: string;
  contentByteLength: number;
  hashAlgorithm: "sha256";
  policySnapshot: RunPolicySnapshot;
  policyHash: string;
  metadata: Readonly<Record<string, unknown>>;
  supersedesEvidenceId: string | null;
  createdAt: string;
}

export interface ArtifactRecord {
  id: string;
  organizationId: string;
  projectId: string;
  runId: string | null;
  createdBy: string;
  name: string;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactVersion {
  id: string;
  artifactId: string;
  projectId: string;
  version: number;
  createdBy: string;
  mediaType: string;
  filename: string;
  objectKey: string;
  contentHash: string;
  contentByteLength: number;
  hashAlgorithm: "sha256";
  metadata: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export interface ArtifactEnvelope extends ArtifactRecord {
  versions: readonly ArtifactVersion[];
}

export interface ProofAccessScope {
  projectId: string;
  actorId: string;
}

export interface RecordEvidenceInput {
  organizationId: string;
  runId: string;
  attemptId: string;
  /** P10 execution correlation, recorded at emission (all nullable). */
  traceId?: string | null;
  jobId?: string | null;
  approvalId?: string | null;
  receiptId?: string | null;
  /** P11 context-set correlation, recorded when a context set was consumed. */
  contextSetId?: string | null;
  observationType: string;
  source: string;
  mediaType: string;
  filename: string;
  bytes: Uint8Array;
  policySnapshot: RunPolicySnapshot;
  metadata?: Readonly<Record<string, unknown>>;
  supersedesEvidenceId?: string | null;
}

export interface CreateArtifactInput {
  organizationId: string;
  runId?: string | null;
  name: string;
  mediaType: string;
  filename: string;
  bytes: Uint8Array;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface CreateArtifactVersionInput {
  mediaType: string;
  filename: string;
  bytes: Uint8Array;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface VerifiedEvidence {
  record: EvidenceRecord;
  bytes: Uint8Array;
}

export interface VerifiedArtifactVersion {
  artifact: ArtifactRecord;
  version: ArtifactVersion;
  bytes: Uint8Array;
}

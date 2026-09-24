import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ArtifactRecord,
  ArtifactVersion,
  EvidenceRecord,
} from "@ethen/contracts/platform/proof/contract";
import { ProofPersistenceError } from "./errors";
import type { ProofRepository } from "./repository";

type Row = Record<string, unknown>;

function detail(error: unknown): string {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : String(error);
}

function evidenceFromRow(row: Row): EvidenceRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    projectId: String(row.project_id),
    runId: String(row.run_id),
    attemptId: String(row.attempt_id),
    traceId: (row.trace_id as string | null) ?? null,
    jobId: (row.job_id as string | null) ?? null,
    approvalId: (row.approval_id as string | null) ?? null,
    receiptId: (row.receipt_id as string | null) ?? null,
    contextSetId: (row.context_set_id as string | null) ?? null,
    actorId: String(row.actor_id),
    observationType: String(row.observation_type),
    source: String(row.source),
    mediaType: String(row.media_type),
    filename: String(row.filename),
    objectKey: String(row.object_key),
    contentHash: String(row.content_hash),
    contentByteLength: Number(row.content_byte_length),
    hashAlgorithm: "sha256",
    policySnapshot: row.policy_snapshot as EvidenceRecord["policySnapshot"],
    policyHash: String(row.policy_hash),
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    supersedesEvidenceId:
      (row.supersedes_evidence_id as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function evidenceToRow(record: EvidenceRecord): Row {
  return {
    id: record.id,
    organization_id: record.organizationId,
    project_id: record.projectId,
    run_id: record.runId,
    attempt_id: record.attemptId,
    trace_id: record.traceId,
    job_id: record.jobId,
    approval_id: record.approvalId,
    receipt_id: record.receiptId,
    context_set_id: record.contextSetId,
    actor_id: record.actorId,
    observation_type: record.observationType,
    source: record.source,
    media_type: record.mediaType,
    filename: record.filename,
    object_key: record.objectKey,
    content_hash: record.contentHash,
    content_byte_length: record.contentByteLength,
    hash_algorithm: record.hashAlgorithm,
    policy_snapshot: record.policySnapshot,
    policy_hash: record.policyHash,
    metadata: record.metadata,
    supersedes_evidence_id: record.supersedesEvidenceId,
    created_at: record.createdAt,
  };
}

function artifactFromRow(row: Row): ArtifactRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    projectId: String(row.project_id),
    runId: (row.run_id as string | null) ?? null,
    createdBy: String(row.created_by),
    name: String(row.name),
    currentVersionId: String(row.current_version_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function versionFromRow(row: Row): ArtifactVersion {
  return {
    id: String(row.id),
    artifactId: String(row.artifact_id),
    projectId: String(row.project_id),
    version: Number(row.version_number),
    createdBy: String(row.created_by),
    mediaType: String(row.media_type),
    filename: String(row.filename),
    objectKey: String(row.object_key),
    contentHash: String(row.content_hash),
    contentByteLength: Number(row.content_byte_length),
    hashAlgorithm: "sha256",
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: String(row.created_at),
  };
}

function artifactToRow(record: ArtifactRecord): Row {
  return {
    id: record.id,
    organization_id: record.organizationId,
    project_id: record.projectId,
    run_id: record.runId,
    created_by: record.createdBy,
    name: record.name,
    current_version_id: record.currentVersionId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function versionToRow(record: Omit<ArtifactVersion, "version">): Row {
  return {
    id: record.id,
    artifact_id: record.artifactId,
    project_id: record.projectId,
    created_by: record.createdBy,
    media_type: record.mediaType,
    filename: record.filename,
    object_key: record.objectKey,
    content_hash: record.contentHash,
    content_byte_length: record.contentByteLength,
    hash_algorithm: record.hashAlgorithm,
    metadata: record.metadata,
    created_at: record.createdAt,
  };
}

export class SupabaseProofRepository implements ProofRepository {
  constructor(private readonly client: SupabaseClient) {}

  async insertEvidence(record: EvidenceRecord): Promise<void> {
    const { error } = await this.client
      .from("proof_evidence")
      .insert(evidenceToRow(record));
    if (error) {
      throw new ProofPersistenceError("insert_evidence", detail(error));
    }
  }

  async findEvidence(
    projectId: string,
    evidenceId: string,
  ): Promise<EvidenceRecord | null> {
    const { data, error } = await this.client
      .from("proof_evidence")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", evidenceId)
      .maybeSingle();
    if (error) {
      throw new ProofPersistenceError("find_evidence", detail(error));
    }
    return data ? evidenceFromRow(data as Row) : null;
  }

  async insertArtifactWithVersion(
    artifact: ArtifactRecord,
    version: ArtifactVersion,
  ): Promise<void> {
    const { error } = await this.client.rpc("create_proof_artifact", {
      p_artifact: artifactToRow(artifact),
      p_version: {
        ...versionToRow(version),
        version_number: version.version,
      },
    });
    if (error) {
      throw new ProofPersistenceError("create_artifact", detail(error));
    }
  }

  async appendArtifactVersion(
    projectId: string,
    artifactId: string,
    version: Omit<ArtifactVersion, "version">,
    updatedAt: string,
  ): Promise<ArtifactVersion> {
    const { data, error } = await this.client.rpc(
      "append_proof_artifact_version",
      {
        p_project_id: projectId,
        p_artifact_id: artifactId,
        p_version: versionToRow(version),
        p_updated_at: updatedAt,
      },
    );
    if (error) {
      throw new ProofPersistenceError("append_artifact_version", detail(error));
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      throw new ProofPersistenceError(
        "append_artifact_version",
        "no version returned",
      );
    }
    return versionFromRow(row as Row);
  }

  async findArtifact(
    projectId: string,
    artifactId: string,
  ): Promise<ArtifactRecord | null> {
    const { data, error } = await this.client
      .from("proof_artifacts")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", artifactId)
      .maybeSingle();
    if (error) {
      throw new ProofPersistenceError("find_artifact", detail(error));
    }
    return data ? artifactFromRow(data as Row) : null;
  }

  async findArtifactVersion(
    projectId: string,
    artifactId: string,
    versionId: string,
  ): Promise<ArtifactVersion | null> {
    const { data, error } = await this.client
      .from("proof_artifact_versions")
      .select("*")
      .eq("project_id", projectId)
      .eq("artifact_id", artifactId)
      .eq("id", versionId)
      .maybeSingle();
    if (error) {
      throw new ProofPersistenceError("find_artifact_version", detail(error));
    }
    return data ? versionFromRow(data as Row) : null;
  }

  async listArtifactVersions(
    projectId: string,
    artifactId: string,
  ): Promise<readonly ArtifactVersion[]> {
    const { data, error } = await this.client
      .from("proof_artifact_versions")
      .select("*")
      .eq("project_id", projectId)
      .eq("artifact_id", artifactId)
      .order("version_number", { ascending: true });
    if (error) {
      throw new ProofPersistenceError("list_artifact_versions", detail(error));
    }
    return (data ?? []).map((row) => versionFromRow(row as Row));
  }
}

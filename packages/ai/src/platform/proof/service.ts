import { randomUUID } from "node:crypto";
import { parseTenantObjectKey, tenantObjectKey } from "@ethen/database/storage/tenant-object-keys";
import type {
  ArtifactEnvelope,
  ArtifactRecord,
  ArtifactVersion,
  CreateArtifactInput,
  CreateArtifactVersionInput,
  EvidenceRecord,
  ProofAccessScope,
  RecordEvidenceInput,
  VerifiedArtifactVersion,
  VerifiedEvidence,
} from "@ethen/contracts/platform/proof/contract";
import { ProofContractError } from "./errors";
import { hashPolicySnapshot, hashProofBytes } from "./hash";
import type { ProofObjectStore } from "./object-store";
import type { ProofRepository } from "./repository";

interface Dependencies {
  repository: ProofRepository;
  objectStore: ProofObjectStore;
  now?: () => string;
  newId?: () => string;
}

function required(value: string, field: string): void {
  if (!value.trim()) {
    throw new ProofContractError("INVALID_INPUT", `${field} is required.`);
  }
}

function requireBytes(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) {
    throw new ProofContractError(
      "INVALID_INPUT",
      "Recorded proof bytes must not be empty.",
    );
  }
}

function freeze<T>(value: T): T {
  if (ArrayBuffer.isView(value)) return value;
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      freeze(nested);
    }
  }
  return value;
}

export class ProofService {
  private readonly repository: ProofRepository;
  private readonly objectStore: ProofObjectStore;
  private readonly now: () => string;
  private readonly newId: () => string;

  constructor(dependencies: Dependencies) {
    this.repository = dependencies.repository;
    this.objectStore = dependencies.objectStore;
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.newId = dependencies.newId ?? randomUUID;
  }

  async recordEvidence(
    scope: ProofAccessScope,
    input: RecordEvidenceInput,
  ): Promise<EvidenceRecord> {
    for (const [field, value] of Object.entries({
      organizationId: input.organizationId,
      runId: input.runId,
      attemptId: input.attemptId,
      observationType: input.observationType,
      source: input.source,
      mediaType: input.mediaType,
      filename: input.filename,
      policySnapshotId: input.policySnapshot.id,
    })) {
      required(value, field);
    }
    requireBytes(input.bytes);

    if (input.supersedesEvidenceId) {
      const prior = await this.repository.findEvidence(
        scope.projectId,
        input.supersedesEvidenceId,
      );
      if (!prior) {
        throw new ProofContractError(
          "EVIDENCE_NOT_FOUND",
          "Superseded evidence was not found in the authorized project.",
        );
      }
    }

    const id = this.newId();
    const objectKey = tenantObjectKey(scope.projectId, id, input.filename);
    const record: EvidenceRecord = {
      id,
      organizationId: input.organizationId,
      projectId: scope.projectId,
      runId: input.runId,
      attemptId: input.attemptId,
      traceId: input.traceId ?? null,
      jobId: input.jobId ?? null,
      approvalId: input.approvalId ?? null,
      receiptId: input.receiptId ?? null,
      contextSetId: input.contextSetId ?? null,
      actorId: scope.actorId,
      observationType: input.observationType,
      source: input.source,
      mediaType: input.mediaType,
      filename: input.filename,
      objectKey,
      contentHash: hashProofBytes(input.bytes),
      contentByteLength: input.bytes.byteLength,
      hashAlgorithm: "sha256",
      policySnapshot: structuredClone(input.policySnapshot),
      policyHash: hashPolicySnapshot(input.policySnapshot),
      metadata: structuredClone(input.metadata ?? {}),
      supersedesEvidenceId: input.supersedesEvidenceId ?? null,
      createdAt: this.now(),
    };

    await this.objectStore.put(objectKey, input.bytes, input.mediaType);
    try {
      await this.repository.insertEvidence(record);
    } catch (error) {
      await this.objectStore.remove(objectKey);
      throw error;
    }
    return freeze(structuredClone(record));
  }

  async readEvidence(
    scope: ProofAccessScope,
    evidenceId: string,
  ): Promise<VerifiedEvidence | null> {
    const record = await this.repository.findEvidence(
      scope.projectId,
      evidenceId,
    );
    if (!record) return null;
    const bytes = await this.readVerifiedBytes(
      scope.projectId,
      record.objectKey,
      record.contentHash,
      record.contentByteLength,
    );
    return freeze({ record, bytes });
  }

  async createArtifact(
    scope: ProofAccessScope,
    input: CreateArtifactInput,
  ): Promise<ArtifactEnvelope> {
    this.validateArtifactInput(input);
    const artifactId = this.newId();
    const versionId = this.newId();
    const now = this.now();
    const objectKey = tenantObjectKey(
      scope.projectId,
      versionId,
      input.filename,
    );
    const artifact: ArtifactRecord = {
      id: artifactId,
      organizationId: input.organizationId,
      projectId: scope.projectId,
      runId: input.runId ?? null,
      createdBy: scope.actorId,
      name: input.name,
      currentVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    };
    const version = this.versionRecord(
      scope,
      artifactId,
      versionId,
      1,
      objectKey,
      input,
      now,
    );

    await this.objectStore.put(objectKey, input.bytes, input.mediaType);
    try {
      await this.repository.insertArtifactWithVersion(artifact, version);
    } catch (error) {
      await this.objectStore.remove(objectKey);
      throw error;
    }
    return freeze({ ...artifact, versions: [version] });
  }

  async createArtifactVersion(
    scope: ProofAccessScope,
    artifactId: string,
    input: CreateArtifactVersionInput,
  ): Promise<ArtifactEnvelope> {
    required(input.mediaType, "mediaType");
    required(input.filename, "filename");
    requireBytes(input.bytes);
    const artifact = await this.repository.findArtifact(
      scope.projectId,
      artifactId,
    );
    if (!artifact) {
      throw new ProofContractError(
        "ARTIFACT_NOT_FOUND",
        "Artifact not found in the authorized project.",
      );
    }

    const versionId = this.newId();
    const now = this.now();
    const objectKey = tenantObjectKey(
      scope.projectId,
      versionId,
      input.filename,
    );
    const candidate = this.versionRecord(
      scope,
      artifactId,
      versionId,
      0,
      objectKey,
      input,
      now,
    );
    await this.objectStore.put(objectKey, input.bytes, input.mediaType);
    let version: ArtifactVersion;
    try {
      version = await this.repository.appendArtifactVersion(
        scope.projectId,
        artifactId,
        candidate,
        now,
      );
    } catch (error) {
      await this.objectStore.remove(objectKey);
      throw error;
    }
    return this.loadArtifact({ ...artifact, currentVersionId: version.id, updatedAt: now });
  }

  async getArtifact(
    scope: ProofAccessScope,
    artifactId: string,
  ): Promise<ArtifactEnvelope | null> {
    const artifact = await this.repository.findArtifact(
      scope.projectId,
      artifactId,
    );
    return artifact ? this.loadArtifact(artifact) : null;
  }

  async readArtifactVersion(
    scope: ProofAccessScope,
    artifactId: string,
    versionId?: string,
  ): Promise<VerifiedArtifactVersion | null> {
    const artifact = await this.repository.findArtifact(
      scope.projectId,
      artifactId,
    );
    if (!artifact) return null;
    const version = await this.repository.findArtifactVersion(
      scope.projectId,
      artifactId,
      versionId ?? artifact.currentVersionId,
    );
    if (!version) return null;
    const bytes = await this.readVerifiedBytes(
      scope.projectId,
      version.objectKey,
      version.contentHash,
      version.contentByteLength,
    );
    return freeze({ artifact, version, bytes });
  }

  private validateArtifactInput(input: CreateArtifactInput): void {
    required(input.organizationId, "organizationId");
    required(input.name, "name");
    required(input.mediaType, "mediaType");
    required(input.filename, "filename");
    requireBytes(input.bytes);
  }

  private versionRecord(
    scope: ProofAccessScope,
    artifactId: string,
    id: string,
    version: number,
    objectKey: string,
    input: CreateArtifactVersionInput,
    createdAt: string,
  ): ArtifactVersion {
    return {
      id,
      artifactId,
      projectId: scope.projectId,
      version,
      createdBy: scope.actorId,
      mediaType: input.mediaType,
      filename: input.filename,
      objectKey,
      contentHash: hashProofBytes(input.bytes),
      contentByteLength: input.bytes.byteLength,
      hashAlgorithm: "sha256",
      metadata: structuredClone(input.metadata ?? {}),
      createdAt,
    };
  }

  private async loadArtifact(
    artifact: ArtifactRecord,
  ): Promise<ArtifactEnvelope> {
    const versions = await this.repository.listArtifactVersions(
      artifact.projectId,
      artifact.id,
    );
    return freeze({ ...artifact, versions: [...versions] });
  }

  private async readVerifiedBytes(
    projectId: string,
    objectKey: string,
    expectedHash: string,
    expectedLength: number,
  ): Promise<Uint8Array> {
    const parsed = parseTenantObjectKey(objectKey);
    if (!parsed || parsed.projectId !== projectId) {
      throw new ProofContractError(
        "TENANT_BOUNDARY_VIOLATION",
        "Stored object key does not match the authorized project.",
      );
    }
    const bytes = await this.objectStore.get(objectKey);
    if (
      !bytes ||
      bytes.byteLength !== expectedLength ||
      hashProofBytes(bytes) !== expectedHash
    ) {
      throw new ProofContractError(
        "INTEGRITY_VIOLATION",
        "Stored proof bytes failed SHA-256 integrity verification.",
      );
    }
    return bytes;
  }
}

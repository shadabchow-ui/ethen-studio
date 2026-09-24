import type {
  ArtifactRecord,
  ArtifactVersion,
  EvidenceRecord,
} from "@ethen/contracts/platform/proof/contract";

export interface ProofRepository {
  insertEvidence(record: EvidenceRecord): Promise<void>;
  findEvidence(
    projectId: string,
    evidenceId: string,
  ): Promise<EvidenceRecord | null>;

  insertArtifactWithVersion(
    artifact: ArtifactRecord,
    version: ArtifactVersion,
  ): Promise<void>;
  appendArtifactVersion(
    projectId: string,
    artifactId: string,
    version: Omit<ArtifactVersion, "version">,
    updatedAt: string,
  ): Promise<ArtifactVersion>;
  findArtifact(
    projectId: string,
    artifactId: string,
  ): Promise<ArtifactRecord | null>;
  findArtifactVersion(
    projectId: string,
    artifactId: string,
    versionId: string,
  ): Promise<ArtifactVersion | null>;
  listArtifactVersions(
    projectId: string,
    artifactId: string,
  ): Promise<readonly ArtifactVersion[]>;
}

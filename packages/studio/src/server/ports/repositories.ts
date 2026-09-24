/** Studio V5 kernel — repository ports. Server-only. Owners: STUDIO_02..05, 10, 12. */
import "server-only";
import type { AssetVersion, LineageEdge } from "../../contracts/assets";
import type { Job, Attempt, Generation, JobStatus } from "../../contracts/execution";
import type { ProjectScope } from "../../contracts/scope";

export interface CasResult<T> {
  ok: boolean;
  value: T | null;
  conflict: boolean;
}

export interface Pagination {
  cursor: string | null;
  limit: number;
}

export interface DataRepositoryPort {
  getAssetVersion(assetId: string, version: number, scope: ProjectScope): Promise<AssetVersion | null>;
  listAssetVersions(assetId: string, scope: ProjectScope, page: Pagination): Promise<readonly AssetVersion[]>;
  appendLineage(edge: LineageEdge, scope: ProjectScope): Promise<void>;
}

export interface RuntimeRepositoryPort {
  getJob(jobId: string, scope: ProjectScope): Promise<Job | null>;
  updateJobStatus(jobId: string, scope: ProjectScope, from: JobStatus, to: JobStatus): Promise<CasResult<Job>>;
  listAttempts(jobId: string, scope: ProjectScope): Promise<readonly Attempt[]>;
  linkGeneration(generation: Generation, scope: ProjectScope): Promise<void>;
}

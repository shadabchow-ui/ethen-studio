/** Studio V5 data — memory store wiring + kernel port adapter (STUDIO_02). */
import "server-only";
import type { DataRepositoryPort } from "../ports/repositories";
import type { ProjectScope } from "../../contracts/scope";
import { MemoryAssetRepository, type AssetRepository } from "./assets";
import { MemoryBackfillStore, type BackfillStore } from "./backfill";
import { MemoryGenerationIndex, type GenerationRelationPort } from "./generation";
import { MemoryLineageRepository, type LineageRepository } from "./lineage";
import { MemoryProjectRepository, type ProjectRepository } from "./projects";

export interface MemoryDataStore {
  projects: ProjectRepository;
  assets: AssetRepository;
  lineage: LineageRepository;
  backfill: BackfillStore;
  generations: GenerationRelationPort;
}

/** Test/local store. Production binds Supabase-backed adapters instead. */
export function createMemoryDataStore(): MemoryDataStore {
  const projects = new MemoryProjectRepository();
  const assets = new MemoryAssetRepository();
  const lineage = new MemoryLineageRepository(assets);
  const backfill = new MemoryBackfillStore();
  const generations = new MemoryGenerationIndex();
  return { projects, assets, lineage, backfill, generations };
}

/** Adapt rich data repositories to the minimal kernel DataRepositoryPort. */
export function adaptDataRepositoryPort(assets: AssetRepository, lineage: LineageRepository): DataRepositoryPort {
  return {
    getAssetVersion: (assetId, version, scope: ProjectScope) => assets.getVersion(scope, assetId, version),
    listAssetVersions: async (assetId, scope: ProjectScope, page) => {
      const result = await assets.listVersions(scope, assetId, page);
      return result.items;
    },
    appendLineage: (edge, scope: ProjectScope) =>
      lineage
        .appendEdge(scope, {
          parentAssetId: edge.parentAssetId,
          parentVersion: edge.parentVersion,
          childAssetId: edge.childAssetId,
          childVersion: edge.childVersion,
          transform: edge.transform,
          jobId: edge.jobId,
        })
        .then(() => undefined),
  };
}

/**
 * Studio V5 data — Generation relation port (STUDIO_02 exposes, STUDIO_05 owns writes).
 * Generation belongs to execution; data keeps the relation readable for lineage.
 */
import "server-only";
import type { Generation } from "../../contracts/execution";
import type { ProjectScope } from "../../contracts/scope";
import { dataError } from "./types";

export function formatAssetVersionId(assetId: string, version: number): string {
  return `${assetId}#${version}`;
}

export function parseAssetVersionId(value: string): { assetId: string; version: number } {
  const hash = value.lastIndexOf("#");
  const assetId = hash >= 0 ? value.slice(0, hash) : "";
  const version = hash >= 0 ? Number(value.slice(hash + 1)) : NaN;
  if (!assetId || !Number.isInteger(version) || version <= 0) {
    throw dataError("BAD_REQUEST", `Invalid asset version id: ${value}.`);
  }
  return { assetId, version };
}

/**
 * Relation port. The runtime executor (STUDIO_05) implements linkGeneration;
 * data and consumers read through findByAssetVersion. Data never executes.
 */
export interface GenerationRelationPort {
  linkGeneration(generation: Generation, scope: ProjectScope): Promise<void>;
  findByAssetVersion(scope: ProjectScope, assetId: string, version: number): Promise<readonly Generation[]>;
}

export class MemoryGenerationIndex implements GenerationRelationPort {
  private generations: Generation[] = [];

  async linkGeneration(generation: Generation, scope: ProjectScope): Promise<void> {
    if (!generation.generationId?.trim() || !generation.jobId?.trim() || !generation.attemptId?.trim()) {
      throw dataError("BAD_REQUEST", "generationId, jobId and attemptId are required.");
    }
    if (generation.assetVersionIds.length === 0) {
      throw dataError("BAD_REQUEST", "Generation must reference at least one asset version.");
    }
    for (const id of generation.assetVersionIds) parseAssetVersionId(id);
    void scope;
    const duplicate = this.generations.find((g) => g.generationId === generation.generationId);
    if (duplicate) return;
    this.generations.push({
      ...generation,
      assetVersionIds: [...generation.assetVersionIds],
    });
  }

  async findByAssetVersion(scope: ProjectScope, assetId: string, version: number): Promise<readonly Generation[]> {
    void scope;
    const needle = formatAssetVersionId(assetId, version);
    return this.generations.filter((g) => g.assetVersionIds.includes(needle));
  }
}

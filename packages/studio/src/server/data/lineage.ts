/** Studio V5 data — parent lineage edges with cycle rejection (STUDIO_02). */
import "server-only";
import type { Pagination } from "../ports/repositories";
import type { LineageEdge } from "../../contracts/assets";
import { sameScope, type ProjectScope } from "../../contracts/scope";
import { dataError } from "./types";
import type { Page } from "./types";
import { paginate } from "./pagination";
import type { AssetRepository } from "./assets";

export interface NewLineageEdge {
  parentAssetId: string;
  parentVersion: number;
  childAssetId: string;
  childVersion: number;
  transform: string;
  jobId?: string | null;
}

export interface LineageRepository {
  appendEdge(scope: ProjectScope, edge: NewLineageEdge): Promise<LineageEdge>;
  listParents(scope: ProjectScope, childAssetId: string, childVersion?: number): Promise<readonly LineageEdge[]>;
  listChildren(scope: ProjectScope, parentAssetId: string, parentVersion?: number): Promise<readonly LineageEdge[]>;
  listEdges(scope: ProjectScope, page: Pagination): Promise<Page<LineageEdge>>;
}

function nodeId(assetId: string, version: number): string {
  return `${assetId}#${version}`;
}

export class MemoryLineageRepository implements LineageRepository {
  private edges: LineageEdge[] = [];

  constructor(private readonly assets: AssetRepository) {}

  async appendEdge(scope: ProjectScope, edge: NewLineageEdge): Promise<LineageEdge> {
    if (!edge.parentAssetId?.trim() || !edge.childAssetId?.trim()) {
      throw dataError("BAD_REQUEST", "parentAssetId and childAssetId are required.");
    }
    if (!Number.isInteger(edge.parentVersion) || edge.parentVersion <= 0) {
      throw dataError("BAD_REQUEST", "parentVersion must be a positive integer.");
    }
    if (!Number.isInteger(edge.childVersion) || edge.childVersion <= 0) {
      throw dataError("BAD_REQUEST", "childVersion must be a positive integer.");
    }
    if (!edge.transform?.trim()) throw dataError("BAD_REQUEST", "transform is required.");
    if (nodeId(edge.parentAssetId, edge.parentVersion) === nodeId(edge.childAssetId, edge.childVersion)) {
      throw dataError("CONFLICT", "Lineage edges must not be self-loops.", {
        parentAssetId: edge.parentAssetId,
      });
    }
    const parent = await this.assets.getVersion(scope, edge.parentAssetId, edge.parentVersion);
    if (!parent) {
      throw dataError("NOT_FOUND", "Lineage parent version does not exist in this scope.", {
        parentAssetId: edge.parentAssetId,
        parentVersion: edge.parentVersion,
      });
    }
    const child = await this.assets.getVersion(scope, edge.childAssetId, edge.childVersion);
    if (!child) {
      throw dataError("NOT_FOUND", "Lineage child version does not exist in this scope.", {
        childAssetId: edge.childAssetId,
        childVersion: edge.childVersion,
      });
    }
    // Cycle check: the child must not already be an ancestor of the parent.
    const ancestors = this.ancestorNodes(scope, nodeId(edge.parentAssetId, edge.parentVersion));
    if (ancestors.has(nodeId(edge.childAssetId, edge.childVersion))) {
      throw dataError("CONFLICT", "Lineage edge would create a cycle.", {
        parentAssetId: edge.parentAssetId,
        childAssetId: edge.childAssetId,
      });
    }
    const duplicate = this.edges.find(
      (e) =>
        e.parentAssetId === edge.parentAssetId &&
        e.parentVersion === edge.parentVersion &&
        e.childAssetId === edge.childAssetId &&
        e.childVersion === edge.childVersion,
    );
    if (duplicate) return { ...duplicate };
    const stored: LineageEdge = {
      parentAssetId: edge.parentAssetId,
      parentVersion: edge.parentVersion,
      childAssetId: edge.childAssetId,
      childVersion: edge.childVersion,
      transform: edge.transform.trim(),
      jobId: edge.jobId ?? null,
    };
    this.edges.push(stored);
    return { ...stored };
  }

  async listParents(
    scope: ProjectScope,
    childAssetId: string,
    childVersion?: number,
  ): Promise<readonly LineageEdge[]> {
    const child = await this.assets.getAsset(scope, childAssetId);
    if (!child) return [];
    return this.edges
      .filter((e) => e.childAssetId === childAssetId && (childVersion === undefined || e.childVersion === childVersion))
      .map((e) => ({ ...e }));
  }

  async listChildren(
    scope: ProjectScope,
    parentAssetId: string,
    parentVersion?: number,
  ): Promise<readonly LineageEdge[]> {
    const parent = await this.assets.getAsset(scope, parentAssetId);
    if (!parent) return [];
    return this.edges
      .filter(
        (e) => e.parentAssetId === parentAssetId && (parentVersion === undefined || e.parentVersion === parentVersion),
      )
      .map((e) => ({ ...e }));
  }

  async listEdges(scope: ProjectScope, page: Pagination): Promise<Page<LineageEdge>> {
    void scope;
    // Edges carry no scope column of their own; membership is proven through
    // the version existence checks above. This listing is diagnostic only and
    // filters to edges whose child is visible in the requested scope.
    const visible: LineageEdge[] = [];
    for (const edge of this.edges) {
      const child = await this.assets.getVersion(scope, edge.childAssetId, edge.childVersion);
      if (child && sameScope(child.scope, scope)) visible.push({ ...edge });
    }
    return paginate(visible, page.limit, page.cursor);
  }

  /** Ancestor node set of `start` (inclusive), bounded to stored edges. */
  private ancestorNodes(scope: ProjectScope, start: string): Set<string> {
    void scope;
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const edge of this.edges) {
        if (nodeId(edge.childAssetId, edge.childVersion) !== current) continue;
        const parent = nodeId(edge.parentAssetId, edge.parentVersion);
        if (!seen.has(parent)) {
          seen.add(parent);
          queue.push(parent);
        }
      }
    }
    return seen;
  }
}

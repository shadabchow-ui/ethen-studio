/**
 * Studio V5 M2 — local-lane catalog repository. The explicit loopback-only
 * bypass has no Supabase service client, so it loads the same rows the sync
 * script persists (generated catalog JSON + hash-pinned schema snapshots)
 * into a process-memory repository and projects through the one function.
 *
 * No `server-only` marker: `node:fs` already confines this module to the
 * server, and the M2 API suite imports it directly.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PriceRowView } from "@ethen/studio-core/catalog/price-states";
import {
  buildLocalSource,
  type CatalogSourceEndpoint,
  type LocalCatalogJson,
  type SchemaSnapshotDoc,
} from "@ethen/studio-core/catalog/source-local";
import { mapFalSlug } from "@ethen/studio-core/catalog/task-map";
import { parsePriceSentences } from "@ethen/studio-core/server/economics/fal-price-parser";

const APP_RELATIVE_CATALOG = join("lib", "media", "generated", "fal-catalog.json");
const ROOT_RELATIVE_CATALOG = join("apps", "studio", "lib", "media", "generated", "fal-catalog.json");

/** Typed failure when no catalog candidate exists (P01: catalog-scoped SETUP_REQUIRED). */
export class CatalogNotFoundError extends Error {
  readonly tried: readonly string[];
  constructor(tried: readonly string[]) {
    super(`Model catalog file not found. Tried: ${tried.join(", ")}`);
    this.name = "CatalogNotFoundError";
    this.tried = tried;
  }
}

export interface ResolvedCatalogPaths {
  /** Absolute catalog JSON path. */
  file: string;
  /** Absolute repo root (snapshot paths in the JSON are root-relative). */
  root: string;
}

function findWorkspaceRoot(from: string): string | null {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * P01 — resolve the catalog from any cwd: the studio app dir (`next dev`),
 * the repo root (tests, scripts), then the workspace root found by walking
 * up to `pnpm-workspace.yaml` (nested/standalone cwds). Throws
 * CatalogNotFoundError naming every path tried.
 */
export function resolveCatalogPaths(fromCwd: string = process.cwd()): ResolvedCatalogPaths {
  const tried: string[] = [];
  const appCandidate = join(fromCwd, APP_RELATIVE_CATALOG);
  tried.push(appCandidate);
  if (existsSync(appCandidate)) {
    // Standalone repo root carries its own workspace file, so the catalog
    // file's workspace root is the snapshot root in both layouts.
    const root = findWorkspaceRoot(join(fromCwd, "lib")) ?? dirname(dirname(fromCwd));
    return { file: appCandidate, root };
  }
  const rootCandidate = join(fromCwd, ROOT_RELATIVE_CATALOG);
  tried.push(rootCandidate);
  if (existsSync(rootCandidate)) {
    return { file: rootCandidate, root: fromCwd };
  }
  const workspaceRoot = findWorkspaceRoot(fromCwd);
  if (workspaceRoot !== null) {
    const workspaceCandidate = join(workspaceRoot, ROOT_RELATIVE_CATALOG);
    if (!tried.includes(workspaceCandidate)) tried.push(workspaceCandidate);
    if (existsSync(workspaceCandidate)) {
      return { file: workspaceCandidate, root: workspaceRoot };
    }
  }
  throw new CatalogNotFoundError([...new Set(tried)]);
}

/** Cached resolution: the catalog path cannot move under a running process. */
let resolvedPaths: ResolvedCatalogPaths | null = null;

function paths(): ResolvedCatalogPaths {
  if (!resolvedPaths) resolvedPaths = resolveCatalogPaths();
  return resolvedPaths;
}

interface LocalCatalogCache {
  source: CatalogSourceEndpoint[];
  prices: Map<string, PriceRowView>;
  catalogVersion: string;
}

let cache: LocalCatalogCache | null = null;

function load(): LocalCatalogCache {
  let located: ResolvedCatalogPaths;
  try {
    located = paths();
  } catch (error) {
    // Catalog-scoped setup failure: log server-side with the tried paths,
    // then let the route map the typed error to SETUP_REQUIRED.
    if (error instanceof CatalogNotFoundError) console.error(`[studio-catalog] ${error.message}`);
    throw error;
  }
  const catalog = JSON.parse(readFileSync(located.file, "utf8")) as LocalCatalogJson;
  const snapshots: Record<string, SchemaSnapshotDoc> = {};
  for (const record of catalog.records) {
    for (const endpoint of record.endpoints) {
      const snapPath = endpoint.schema?.status === "supported" ? endpoint.schema.snapshot : null;
      if (snapPath && !(snapPath in snapshots)) {
        try {
          snapshots[snapPath] = JSON.parse(readFileSync(join(located.root, snapPath), "utf8")) as SchemaSnapshotDoc;
        } catch {
          // Unreadable snapshot: the endpoint stays schema-unknown. Never throw.
        }
      }
    }
  }
  const source = buildLocalSource(catalog, snapshots);
  const prices = new Map<string, PriceRowView>();
  for (const record of catalog.records) {
    for (const endpoint of record.endpoints) {
      const sentences = (endpoint as { pricing?: { sentences?: string[] } }).pricing?.sentences ?? [];
      const rawHash = endpoint.pricing?.raw_hash ?? null;
      if (!rawHash || sentences.length === 0) continue;
      const mapped = mapFalSlug(endpoint.task);
      const parsed = parsePriceSentences({
        endpointId: endpoint.endpoint_id,
        taskName: mapped.tasks[0] ?? endpoint.task,
        sentences,
        evidenceHash: rawHash,
      });
      if (parsed.status === "DERIVED") {
        prices.set(endpoint.endpoint_id, { status: "DERIVED", evidenceHash: rawHash });
      }
    }
  }
  return { source, prices, catalogVersion: catalog.catalog_version };
}

function cached(): LocalCatalogCache {
  if (!cache) cache = load();
  return cache;
}

/** Test hook: drop the process cache so the next read reloads from disk. */
export function resetLocalCatalogCache(): void {
  cache = null;
  resolvedPaths = null;
}

export async function listLocalCatalogSource(): Promise<CatalogSourceEndpoint[]> {
  return cached().source;
}

export async function listLocalPrices(): Promise<ReadonlyMap<string, PriceRowView>> {
  return cached().prices;
}

export function getLocalCatalogVersion(): string {
  return cached().catalogVersion;
}

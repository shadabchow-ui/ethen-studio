/**
 * Studio V5 node cache memory store (STUDIO_13). Test/port adapter;
 * production persists via the j13 migration tables. Actor-scoped keys:
 * entries never cross actors (cross-user cache is off).
 */
import "server-only";
import type { StoredNodeCacheEntry } from "./validity";
import { checkNodeCacheValidity, type CacheValidityContext } from "./validity";

export class MemoryWorkflowCacheStore {
  private entries = new Map<string, StoredNodeCacheEntry>();

  put(entry: StoredNodeCacheEntry): void {
    this.entries.set(entry.cacheKey, { ...entry, consentIds: [...entry.consentIds] });
  }

  get(cacheKey: string): StoredNodeCacheEntry | null {
    return this.entries.get(cacheKey) ?? null;
  }

  invalidate(cacheKey: string): boolean {
    return this.entries.delete(cacheKey);
  }

  /** Resolve currently-valid cache hits for planning (validity rechecked at use). */
  validHits(
    candidates: ReadonlyMap<string, string>,
    context: CacheValidityContext,
  ): Set<string> {
    const hits = new Set<string>();
    for (const [nodeId, cacheKey] of candidates) {
      const stored = this.entries.get(cacheKey);
      if (!stored) continue;
      const verdict = checkNodeCacheValidity(stored, { cacheKey, ...context });
      if (verdict.valid) hits.add(nodeId);
    }
    return hits;
  }
}

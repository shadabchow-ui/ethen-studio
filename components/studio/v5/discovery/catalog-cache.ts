/**
 * RC11 — module-level catalog fetch cache (pure, browser-safe, CSS-free).
 *
 * One entry per scope (`full:<projectId>` / `summary:<projectId>`, empty
 * projectId = the project-less public lane). Concurrent mounts join the
 * same in-flight request; resolved successes serve instantly for the rest
 * of the session. Auth/terminal states (permission, setup, error) are
 * never cached — a fetcher decides via `shouldCache` — so sign-in and
 * retry always re-read. `retry` busts its scope before refetching.
 */

const resolvedCache = new Map<string, unknown>();
const inflightCache = new Map<string, Promise<unknown>>();

/** Synchronous read for lazy `useState` init; null on miss. */
export function peekCatalogCache<T>(key: string): T | null {
  const hit = resolvedCache.get(key) as T | undefined;
  return hit === undefined ? null : hit;
}

/**
 * Fetch once per scope: resolved hits return immediately, concurrent
 * callers join the in-flight promise, and only `shouldCache` values
 * are retained. Rejections clear the in-flight slot and propagate.
 */
export function fetchCatalogCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  shouldCache: (value: T) => boolean = () => true,
): Promise<T> {
  const hit = resolvedCache.get(key) as T | undefined;
  if (hit !== undefined) return Promise.resolve(hit);
  const ongoing = inflightCache.get(key) as Promise<T> | undefined;
  if (ongoing) return ongoing;
  const pending = fetcher().then(
    (value) => {
      inflightCache.delete(key);
      if (shouldCache(value)) resolvedCache.set(key, value);
      return value;
    },
    (error: unknown) => {
      inflightCache.delete(key);
      throw error;
    },
  );
  inflightCache.set(key, pending);
  return pending;
}

/** Drop the resolved entry so the next read refetches (in-flight joins). */
export function invalidateCatalogCache(key: string): void {
  resolvedCache.delete(key);
}

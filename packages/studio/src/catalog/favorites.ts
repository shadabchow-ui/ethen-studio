/** Studio V5 catalog — stable favorites/recent hydration (STUDIO_06). Browser-safe. */
import type { DiscoverableEndpoint } from "./types";

export type FavoriteStatus = "resolved" | "alias-migrated" | "unknown";

export interface HydratedFavorite {
  requestedId: string;
  status: FavoriteStatus;
  /** Canonical endpoint id after alias migration (null when unknown). */
  endpointId: string | null;
  migratedViaAlias: string | null;
  endpoint: DiscoverableEndpoint | null;
}

export interface FavoriteLookup {
  byId(endpointId: string): DiscoverableEndpoint | null;
  /** Legacy/stored id → canonical endpoint id. No provider portability claimed. */
  resolveAlias(storedId: string): string | null;
}

/**
 * Hydrate favorites/recent selections independently of the currently loaded
 * virtual page: every stored id resolves through direct lookup then the
 * alias map, in stable input order. Unknown ids stay unknown with their
 * requested id preserved — never dropped, never remapped to a "closest"
 * endpoint.
 */
export function hydrateFavorites(
  storedIds: readonly string[],
  lookup: FavoriteLookup,
): HydratedFavorite[] {
  return storedIds.map((requestedId) => {
    const direct = lookup.byId(requestedId);
    if (direct) {
      return {
        requestedId,
        status: "resolved",
        endpointId: direct.endpointId,
        migratedViaAlias: null,
        endpoint: direct,
      } satisfies HydratedFavorite;
    }
    const canonical = lookup.resolveAlias(requestedId);
    if (canonical) {
      const endpoint = lookup.byId(canonical);
      return {
        requestedId,
        status: "alias-migrated",
        endpointId: canonical,
        migratedViaAlias: requestedId,
        endpoint,
      } satisfies HydratedFavorite;
    }
    return {
      requestedId,
      status: "unknown",
      endpointId: null,
      migratedViaAlias: null,
      endpoint: null,
    } satisfies HydratedFavorite;
  });
}

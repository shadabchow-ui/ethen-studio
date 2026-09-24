/**
 * Studio V5 M2 — local-lane catalog preferences store. Process-memory
 * backing for GET/PUT /api/studio/v1/catalog/preferences when the request
 * has no Supabase service client. Pure (no server-only marker) so the M2
 * preferences suite imports it directly.
 */

export const PREFERENCE_FAVORITES_CAP = 64;
export const PREFERENCE_RECENTS_CAP = 8;

export interface CatalogPreferenceLists {
  favorites: string[];
  recents: string[];
}

const store = new Map<string, CatalogPreferenceLists>();

function key(projectId: string, userId: string): string {
  return `${projectId}|${userId}`;
}

function clean(ids: readonly string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0 || id.length > 256) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= cap) break;
  }
  return out;
}

/** Shared validation for both lanes: dedupe, drop empties, enforce caps. */
export function cleanPreferenceIds(ids: readonly string[], kind: "favorite" | "recent"): string[] {
  return clean(ids, kind === "favorite" ? PREFERENCE_FAVORITES_CAP : PREFERENCE_RECENTS_CAP);
}

export function listMemoryPreferences(projectId: string, userId: string): CatalogPreferenceLists {
  const entry = store.get(key(projectId, userId));
  return { favorites: [...(entry?.favorites ?? [])], recents: [...(entry?.recents ?? [])] };
}

export function saveMemoryPreferences(
  projectId: string,
  userId: string,
  lists: { favorites?: readonly string[]; recents?: readonly string[] },
): CatalogPreferenceLists {
  const current = listMemoryPreferences(projectId, userId);
  const next: CatalogPreferenceLists = {
    favorites: lists.favorites !== undefined ? clean(lists.favorites, PREFERENCE_FAVORITES_CAP) : current.favorites,
    recents: lists.recents !== undefined ? clean(lists.recents, PREFERENCE_RECENTS_CAP) : current.recents,
  };
  store.set(key(projectId, userId), next);
  return { favorites: [...next.favorites], recents: [...next.recents] };
}

/** Test hook: drop all process-memory preferences. */
export function resetMemoryPreferences(): void {
  store.clear();
}

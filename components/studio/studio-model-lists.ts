/**
 * MUSE-004 — model favorites + recents list algebra (pure, browser-safe).
 *
 * The pure core behind components/studio/studio-model-favorites.ts: toggle
 * and recency-cap rules with no storage or network. The client hook module
 * re-exports these so UI and tests share one implementation.
 */

export const MAX_MODEL_RECENTS = 8;
export const MAX_MODEL_FAVORITES = 64;

export function toggleFavoriteId(ids: readonly string[], id: string): string[] {
  if (!id) return [...ids];
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id].slice(0, MAX_MODEL_FAVORITES);
}

export function pushRecentId(ids: readonly string[], id: string): string[] {
  if (!id) return [...ids];
  return [id, ...ids.filter((entry) => entry !== id)].slice(0, MAX_MODEL_RECENTS);
}

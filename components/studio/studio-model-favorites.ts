"use client";

/**
 * Studio V5 M2 — model favorites + recents (server-persisted).
 *
 * Favorites and recently-used endpoints persist per project and user through
 * GET/PUT /api/studio/v1/catalog/preferences. The legacy localStorage lists
 * migrate once on first server contact, then that storage is removed.
 * Outside the workbench provider (no project), the module keeps ruthlessly
 * local behavior as a documented fallback. Favorites never imply
 * qualification — support states still come from the registry.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useStudioIdentity } from "./studio-project-scope";

export const STUDIO_MODEL_FAVORITES_KEY = "ethen.studio.model-favorites.v1";
export const STUDIO_MODEL_RECENTS_KEY = "ethen.studio.model-recents.v1";
const MAX_RECENTS = 8;
const EMPTY_LIST: readonly string[] = [];
const LEGACY_KEYS = ["ethen-studio-model-favorites-v1", "ethen-studio-model-recents-v1"];

type ListKind = "favorites" | "recents";

interface StoreEntry {
  version: number;
  byProject: Map<string | null, string[]>;
}

const stores: Record<ListKind, StoreEntry> = {
  favorites: { version: 0, byProject: new Map() },
  recents: { version: 0, byProject: new Map() },
};
/** Projects whose legacy storage already migrated (once per session). */
const migrated = new Set<string>();

function cacheKey(kind: ListKind): string {
  return kind === "favorites" ? STUDIO_MODEL_FAVORITES_KEY : STUDIO_MODEL_RECENTS_KEY;
}

function readLegacyCache(kind: ListKind): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(cacheKey(kind));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.length > 0).slice(0, 64);
  } catch {
    return [];
  }
}

function removeLegacyStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of [STUDIO_MODEL_FAVORITES_KEY, STUDIO_MODEL_RECENTS_KEY, ...LEGACY_KEYS]) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Private mode: nothing persisted, nothing to remove.
  }
}

function snapshot(kind: ListKind, projectId: string | null): readonly string[] {
  const entry = stores[kind]!;
  const hit = entry.byProject.get(projectId);
  if (hit) return hit;
  // First read seeds from the legacy cache (the migration source); the
  // server sync below replaces it and then removes that storage.
  const seeded = readLegacyCache(kind);
  entry.byProject.set(projectId, seeded);
  return seeded;
}

function setSnapshot(kind: ListKind, projectId: string | null, value: string[]): void {
  const entry = stores[kind]!;
  entry.byProject.set(projectId, value);
  entry.version += 1;
  emitModelsChanged();
}

function subscribeModels(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => listener();
  window.addEventListener("ethen:studio-models", onLocal);
  return () => {
    window.removeEventListener("ethen:studio-models", onLocal);
  };
}

function emitModelsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ethen:studio-models"));
}

export function toggleFavoriteId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

export function pushRecentId(ids: readonly string[], id: string): string[] {
  return [id, ...ids.filter((entry) => entry !== id)].slice(0, MAX_RECENTS);
}

async function fetchPreferences(projectId: string): Promise<{ favorites: string[]; recents: string[] } | null> {
  try {
    const response = await fetch(`/api/studio/v1/catalog/preferences?projectId=${encodeURIComponent(projectId)}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: { favorites?: unknown; recents?: unknown };
    } | null;
    if (!response.ok || !body?.ok) return null;
    const clean = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : [];
    return { favorites: clean(body.data?.favorites), recents: clean(body.data?.recents) };
  } catch {
    return null;
  }
}

async function putPreferences(
  projectId: string,
  lists: { favorites?: readonly string[]; recents?: readonly string[] },
): Promise<void> {
  try {
    await fetch(`/api/studio/v1/catalog/preferences?projectId=${encodeURIComponent(projectId)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(lists),
    });
  } catch {
    // Offline: the in-memory snapshot keeps the session consistent.
  }
}

function usePreferenceList(kind: ListKind): {
  ids: readonly string[];
  replace: (next: string[]) => void;
  projectId: string | null;
} {
  const { identity } = useStudioIdentity();
  const projectId = identity.projectId;
  const ids = useSyncExternalStore(subscribeModels, () => snapshot(kind, projectId), () => EMPTY_LIST);

  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      const server = await fetchPreferences(projectId);
      if (cancelled) return;
      const local = snapshot(kind, projectId);
      if (!server) return;
      const incoming = kind === "favorites" ? server.favorites : server.recents;
      const merged = [...incoming];
      for (const id of local) {
        if (!merged.includes(id)) merged.push(id);
      }
      const capped = kind === "recents" ? merged.slice(0, MAX_RECENTS) : merged.slice(0, 64);
      setSnapshot(kind, projectId, capped);
      if (!migrated.has(projectId)) {
        migrated.add(projectId);
        // One-time migration: push the merged union, then remove legacy storage.
        const other: ListKind = kind === "favorites" ? "recents" : "favorites";
        const otherLocal = snapshot(other, projectId);
        const otherServer = other === "favorites" ? server.favorites : server.recents;
        const otherMerged = [...otherServer];
        for (const id of otherLocal) {
          if (!otherMerged.includes(id)) otherMerged.push(id);
        }
        setSnapshot(other, projectId, other === "recents" ? otherMerged.slice(0, MAX_RECENTS) : otherMerged.slice(0, 64));
        await putPreferences(projectId, {
          favorites: kind === "favorites" ? capped : otherMerged.slice(0, 64),
          recents: kind === "recents" ? capped : otherMerged.slice(0, MAX_RECENTS),
        });
        removeLegacyStorage();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, projectId]);

  const replace = useCallback(
    (next: string[]) => {
      setSnapshot(kind, projectId, next);
      if (projectId) void putPreferences(projectId, { [kind]: next });
    },
    [kind, projectId],
  );
  return { ids, replace, projectId };
}

export function useModelFavorites(): { favorites: readonly string[]; toggleFavorite: (id: string) => void } {
  const { ids, replace, projectId } = usePreferenceList("favorites");
  const toggleFavorite = useCallback(
    (id: string) => {
      replace(toggleFavoriteId(snapshot("favorites", projectId), id));
    },
    [replace, projectId],
  );
  return { favorites: ids, toggleFavorite };
}

export function useModelRecents(): { recents: readonly string[]; pushRecent: (id: string) => void } {
  const { ids, replace, projectId } = usePreferenceList("recents");
  const pushRecent = useCallback(
    (id: string) => {
      replace(pushRecentId(snapshot("recents", projectId), id));
    },
    [replace, projectId],
  );
  return { recents: ids, pushRecent };
}

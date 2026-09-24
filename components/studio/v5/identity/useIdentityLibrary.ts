"use client";

/**
 * STUDIO_10 — identity library data hook.
 *
 * One hook for the voices page and the identity libraries: tab state,
 * search, list fetch, favorite toggle, drawer selection. Voice and
 * model selection stay independent — this hook never touches model
 * state.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudioDataState } from "../shell/types";
import { parseIdentitiesResponse } from "./identity-api-client";
import type { IdentityLibraryTab, IdentityListItem } from "./types";

export interface IdentityLibraryQuery {
  projectId: string | null;
  kind: "voice" | "character" | "product" | "brand";
  tab: IdentityLibraryTab;
  search: string;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  return (await response.json().catch(() => ({}))) as unknown;
}

export function identityListUrl(query: IdentityLibraryQuery): string | null {
  if (!query.projectId) return null;
  const params = new URLSearchParams({ projectId: query.projectId, kind: query.kind, tab: query.tab });
  if (query.search.trim()) params.set("q", query.search.trim());
  return `/api/studio/v1/identities?${params.toString()}`;
}

export function useIdentityLibrary(query: IdentityLibraryQuery): {
  state: StudioDataState;
  identities: IdentityListItem[];
  missingFavoriteIds: string[];
  reload: () => void;
  toggleFavorite: (identityId: string, favorite: boolean) => Promise<boolean>;
  recordViewed: (identityId: string) => void;
} {
  const [state, setState] = useState<StudioDataState>("loading");
  const [identities, setIdentities] = useState<IdentityListItem[]>([]);
  const [missingFavoriteIds, setMissingFavoriteIds] = useState<string[]>([]);
  const [nonce, setNonce] = useState(0);

  const { projectId, kind, tab, search } = query;
  const url = useMemo(
    () => identityListUrl({ projectId, kind, tab, search }),
    [projectId, kind, tab, search],
  );

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void (async () => {
      try {
        const parsed = parseIdentitiesResponse(await fetchJson(url));
        if (cancelled) return;
        setIdentities(parsed.identities);
        setMissingFavoriteIds(parsed.missingFavoriteIds);
        setState(parsed.state);
      } catch {
        if (cancelled) return;
        setIdentities([]);
        setMissingFavoriteIds([]);
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const toggleFavorite = useCallback(
    async (identityId: string, favorite: boolean): Promise<boolean> => {
      if (!projectId) return false;
      try {
        const response = await fetch("/api/studio/v1/identities/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, identityId, favorite }),
        });
        const envelope = (await response.json().catch(() => ({}))) as { ok?: boolean };
        if (envelope.ok !== true) return false;
        setIdentities((rows) => rows.map((row) => (row.identityId === identityId ? { ...row, favorite } : row)));
        return true;
      } catch {
        return false;
      }
    },
    [projectId],
  );

  const recordViewed = useCallback(
    (identityId: string) => {
      if (!projectId) return;
      void fetch("/api/studio/v1/identities/recents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, identityId }),
      }).catch(() => undefined);
    },
    [projectId],
  );

  // Without a project scope the library is setup by derivation, never
  // fetched and never fabricated.
  if (!projectId) return { state: "setup" as StudioDataState, identities: [], missingFavoriteIds: [], reload, toggleFavorite, recordViewed };
  return { state, identities, missingFavoriteIds, reload, toggleFavorite, recordViewed };
}

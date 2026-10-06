"use client";

import { useCallback, useEffect, useState } from "react";
import type { StudioDataState } from "../shell/types";
import { fetchCatalogCached, invalidateCatalogCache, peekCatalogCache } from "./catalog-cache";
import {
  parseCatalogResponse,
  parseCatalogSummaryResponse,
  type CatalogProjectionView,
  type CatalogSummaryTallies,
  type ParsedCatalog,
  type ParsedCatalogSummary,
} from "./catalog-client";

async function readJson(path: string): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store" });
  return (await response.json().catch(() => null)) as unknown;
}

/** Only terminal successes are cached; auth/setup/error states re-read. */
function isCacheableState(state: StudioDataState): boolean {
  return state === "ready" || state === "empty";
}

interface CatalogResource<TParsed extends { state: StudioDataState }, TSelected> {
  key: string;
  path: string;
  parse: (body: unknown) => TParsed;
  select: (parsed: TParsed) => TSelected;
  emptySelection: TSelected;
}

/**
 * RC11 — shared cached-resource hook. Module-level cache + in-flight
 * dedupe per scope key, so the catalog is fetched once per session per
 * scope no matter how many pages mount. Lazy-inits from the cache for
 * instant back-navigation; retry busts the scope and refetches.
 */
function useCatalogResource<TParsed extends { state: StudioDataState }, TSelected>(
  resource: CatalogResource<TParsed, TSelected>,
): { state: StudioDataState; value: TSelected; retry: () => void } {
  const { key, path, parse, select, emptySelection } = resource;
  const [snapshot, setSnapshot] = useState<{ state: StudioDataState; value: TSelected }>(() => {
    const cached = peekCatalogCache<TParsed>(key);
    return cached ? { state: cached.state, value: select(cached) } : { state: "loading", value: emptySelection };
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const cached = peekCatalogCache<TParsed>(key);
    if (cached) {
      setSnapshot({ state: cached.state, value: select(cached) });
      return;
    }
    setSnapshot({ state: "loading", value: emptySelection });
    void fetchCatalogCached<TParsed>(
      key,
      async () => parse(await readJson(path)),
      (parsed) => isCacheableState(parsed.state),
    ).then(
      (parsed) => {
        if (!cancelled) setSnapshot({ state: parsed.state, value: select(parsed) });
      },
      () => {
        if (!cancelled) setSnapshot({ state: "error", value: emptySelection });
      },
    );
    return () => {
      cancelled = true;
    };
    // select/parse/emptySelection are module-stable per hook below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, path, nonce]);

  const retry = useCallback(() => {
    invalidateCatalogCache(key);
    setNonce((value) => value + 1);
  }, [key]);
  return { state: snapshot.state, value: snapshot.value, retry };
}

function selectProjection(parsed: ParsedCatalog): CatalogProjectionView | null {
  return parsed.projection;
}

function selectTallies(parsed: ParsedCatalogSummary): CatalogSummaryTallies | null {
  return parsed.summary?.tallies ?? null;
}

/**
 * STUDIO_08 — catalog projection hook over the V1 catalog adapter.
 * S4C: without a project scope the hook serves the PUBLIC catalog
 * (project-less adapter branch: generated registry, no user data) so
 * anonymous visitors browse Models/pickers; project-scoped reads stay
 * authenticated downstream.
 */
export function useCatalogProjection(projectId: string | null): {
  state: StudioDataState;
  projection: CatalogProjectionView | null;
  retry: () => void;
} {
  const path = projectId
    ? `/api/studio/v1/catalog?projectId=${encodeURIComponent(projectId)}`
    : "/api/studio/v1/catalog";
  const { state, value: projection, retry } = useCatalogResource<ParsedCatalog, CatalogProjectionView | null>({
    key: `full:${projectId ?? ""}`,
    path,
    parse: parseCatalogResponse,
    select: selectProjection,
    emptySelection: null,
  });
  return { state, projection, retry };
}

/**
 * RC11 — summary-only catalog hook for the home footer. Same lanes and
 * auth as the full projection, but transfers tallies (~1 KB) instead of
 * the 1.29 MB registry.
 */
export function useCatalogSummary(projectId: string | null): {
  state: StudioDataState;
  tallies: CatalogSummaryTallies | null;
  retry: () => void;
} {
  const path = projectId
    ? `/api/studio/v1/catalog?projectId=${encodeURIComponent(projectId)}&view=summary`
    : "/api/studio/v1/catalog?view=summary";
  const { state, value: tallies, retry } = useCatalogResource<ParsedCatalogSummary, CatalogSummaryTallies | null>({
    key: `summary:${projectId ?? ""}`,
    path,
    parse: parseCatalogSummaryResponse,
    select: selectTallies,
    emptySelection: null,
  });
  return { state, tallies, retry };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { StudioDataState } from "../shell/types";
import { parseCatalogResponse, type CatalogProjectionView } from "./catalog-client";

async function readJson(path: string): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store" });
  return (await response.json().catch(() => null)) as unknown;
}

/**
 * STUDIO_08 — catalog projection hook over the V1 catalog adapter.
 * Requires a project scope; without one the state is empty (select a
 * project), never a fabricated catalog.
 */
export function useCatalogProjection(projectId: string | null): {
  state: StudioDataState;
  projection: CatalogProjectionView | null;
  retry: () => void;
} {
  const [state, setState] = useState<StudioDataState>("loading");
  const [projection, setProjection] = useState<CatalogProjectionView | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const parsed = parseCatalogResponse(await readJson(`/api/studio/v1/catalog?projectId=${encodeURIComponent(projectId)}`));
        if (cancelled) return;
        setProjection(parsed.projection);
        setState(parsed.state);
      } catch {
        if (cancelled) return;
        setProjection(null);
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, nonce]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);
  // Without a project scope the catalog is empty by derivation, never
  // fetched and never fabricated.
  if (!projectId) return { state: "empty" as StudioDataState, projection: null, retry };
  return { state, projection, retry };
}

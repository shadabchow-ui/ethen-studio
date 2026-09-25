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
  const [state, setState] = useState<StudioDataState>("loading");
  const [projection, setProjection] = useState<CatalogProjectionView | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const path = projectId
          ? `/api/studio/v1/catalog?projectId=${encodeURIComponent(projectId)}`
          : "/api/studio/v1/catalog";
        const parsed = parseCatalogResponse(await readJson(path));
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
  return { state, projection, retry };
}

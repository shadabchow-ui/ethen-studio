/**
 * STUDIO_09 — endpoint spec hook.
 *
 * Loads the verified EndpointSpec for an explicit selection (or the
 * Auto-resolved endpoint) so schema controls render parameter truth.
 * No spec is fabricated when the lookup fails. Loading is derived from
 * the settled request key — no synchronous setState in effects.
 */

"use client";

import { useEffect, useState } from "react";
import type { EndpointSpec } from "@ethen/studio-core/catalog";
import { parseEndpointSpec, type CreateApiError } from "./create-api-client";

export interface UseEndpointSpecResult {
  spec: EndpointSpec | null;
  error: CreateApiError | null;
  loading: boolean;
  retry: () => void;
}

export function useEndpointSpec(projectId: string | null, endpointId: string | null): UseEndpointSpecResult {
  const [spec, setSpec] = useState<EndpointSpec | null>(null);
  const [error, setError] = useState<CreateApiError | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const scoped = Boolean(projectId && endpointId);
  const requestKey = scoped ? `${projectId}:${endpointId}:${nonce}` : null;

  useEffect(() => {
    if (!projectId || !endpointId || !requestKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/studio/v1/catalog/${encodeURIComponent(endpointId)}?projectId=${encodeURIComponent(projectId)}`,
          { cache: "no-store" },
        );
        const parsed = parseEndpointSpec(await response.json().catch(() => null));
        if (cancelled) return;
        if (parsed.error || !parsed.spec) {
          setSpec(null);
          setError(parsed.error ?? { code: "UNKNOWN", message: "Endpoint detail failed.", retryable: true });
        } else {
          setError(null);
          setSpec(parsed.spec as unknown as EndpointSpec);
        }
      } catch {
        if (cancelled) return;
        setSpec(null);
        setError({ code: "NETWORK_ERROR", message: "Endpoint detail failed to load.", retryable: true });
      } finally {
        if (!cancelled) setSettledKey(requestKey);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, endpointId, requestKey]);

  const retry = () => setNonce((value) => value + 1);
  // Without a scope the spec is empty by derivation, never fetched.
  if (!requestKey) return { spec: null, error: null, loading: false, retry };
  return { spec, error, loading: settledKey !== requestKey, retry };
}

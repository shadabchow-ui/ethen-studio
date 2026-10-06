/**
 * STUDIO M4 — measured provider health, client view (no server imports).
 *
 * Reads GET /api/studio/v1/health/providers and projects each provider's
 * measured booleans onto one label + tone. Unmeasured is "Unknown" — the
 * view never invents a green.
 *
 * RC3 — the hook reports an explicit status: 401/403 means signed-out (the
 * view prompts sign-in instead of "unmeasured"), timeouts and bad
 * responses are errors with a Retry, and loading is bounded by the
 * timeout so "Checking…" can never stick permanently. `health`/`loading`
 * keep their historical shapes for existing consumers.
 */
import * as React from "react";

export interface ProviderHealthView {
  configured: boolean;
  reachable: boolean;
  registered: boolean;
  catalogQualified: boolean;
  workerReady: boolean;
  storageReady: boolean;
}

export type ProviderHealthTone = "live" | "down" | "unknown";

export type ProviderHealthStatus = "loading" | "signed_out" | "error" | "ready";

interface HealthResponse {
  ok?: unknown;
  data?: { health?: { providers?: Record<string, ProviderHealthView> } } | null;
}

function isHealthView(value: unknown): value is ProviderHealthView {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.configured === "boolean" &&
    typeof row.reachable === "boolean" &&
    typeof row.registered === "boolean" &&
    typeof row.catalogQualified === "boolean" &&
    typeof row.workerReady === "boolean" &&
    typeof row.storageReady === "boolean"
  );
}

/**
 * RC3 — pure response parser behind `useProviderHealth` (unit-tested).
 * Returns the validated provider map, or null when the body carries no
 * usable provider object. Invalid rows are skipped, never rendered.
 */
export function parseProviderHealthResponse(body: unknown): Record<string, ProviderHealthView> | null {
  if (!body || typeof body !== "object") return null;
  const providers = (body as HealthResponse).data?.health?.providers;
  if (!providers || typeof providers !== "object") return null;
  const next: Record<string, ProviderHealthView> = {};
  for (const [name, view] of Object.entries(providers)) {
    if (isHealthView(view)) next[name] = view;
  }
  return next;
}

/** Bounded wait for the health endpoint; slower means error, not loading. */
const PROVIDER_HEALTH_TIMEOUT_MS = 15000;

export function useProviderHealth(): {
  health: Record<string, ProviderHealthView> | null;
  loading: boolean;
  status: ProviderHealthStatus;
  error: string | null;
  retry: () => void;
} {
  const [health, setHealth] = React.useState<Record<string, ProviderHealthView> | null>(null);
  const [status, setStatus] = React.useState<ProviderHealthStatus>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_HEALTH_TIMEOUT_MS);
    void fetch("/api/studio/v1/health/providers", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (cancelled || controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setHealth(null);
          setStatus("signed_out");
          return;
        }
        if (!response.ok) {
          setHealth(null);
          setError(`Provider health request failed (${response.status}).`);
          setStatus("error");
          return;
        }
        const parsed = parseProviderHealthResponse(await response.json().catch(() => null));
        if (cancelled || controller.signal.aborted) return;
        if (!parsed) {
          setHealth(null);
          setError("Provider health response was unreadable.");
          setStatus("error");
          return;
        }
        setHealth(parsed);
        setError(null);
        setStatus("ready");
      })
      .catch(() => {
        // Unmount: leave state alone. Timeout aborts land here too and
        // must settle to error — never back to (or stuck in) loading.
        if (cancelled) return;
        setHealth(null);
        setError("Provider health request timed out or failed.");
        setStatus("error");
      })
      .finally(() => {
        clearTimeout(timeout);
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [nonce]);

  const retry = React.useCallback(() => {
    setError(null);
    setStatus("loading");
    setNonce((value) => value + 1);
  }, []);

  return { health, loading: status === "loading", status, error, retry };
}

/** First failing measurement wins; all-true is Live. */
export function providerHealthLabel(view: ProviderHealthView | null, loading: boolean): string {
  if (!view) return loading ? "Checking…" : "Unknown";
  if (!view.configured) return "Not configured";
  if (!view.reachable) return "Unreachable";
  if (!view.registered) return "Not registered";
  if (!view.workerReady) return "Worker offline";
  if (!view.storageReady) return "Storage unavailable";
  if (!view.catalogQualified) return "No qualified route";
  return "Live";
}

export function providerHealthTone(view: ProviderHealthView | null): ProviderHealthTone {
  if (!view) return "unknown";
  if (!view.configured || !view.registered || !view.catalogQualified) return "unknown";
  if (!view.reachable || !view.workerReady || !view.storageReady) return "down";
  return "live";
}

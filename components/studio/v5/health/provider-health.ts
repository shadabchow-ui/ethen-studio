/**
 * STUDIO M4 — measured provider health, client view (no server imports).
 *
 * Reads GET /api/studio/v1/health/providers once per mount and projects
 * each provider's measured booleans onto one label + tone. Unmeasured
 * (loading, failed, or absent) is always "Unknown" — the UI never
 * invents a green.
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

export function useProviderHealth(): { health: Record<string, ProviderHealthView> | null; loading: boolean } {
  const [health, setHealth] = React.useState<Record<string, ProviderHealthView> | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/studio/v1/health/providers", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as HealthResponse;
        const providers = body.data?.health?.providers;
        if (!providers || typeof providers !== "object") return;
        const next: Record<string, ProviderHealthView> = {};
        for (const [name, view] of Object.entries(providers)) {
          if (isHealthView(view)) next[name] = view;
        }
        if (!controller.signal.aborted) setHealth(next);
      })
      .catch(() => null)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  return { health, loading };
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

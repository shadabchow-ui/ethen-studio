/**
 * Provider health contract.
 *
 * Moved out of `lib/security/provider-health.ts` so `@ethen/security` can name
 * a provider health record without pulling the per-vertical env fan-out into
 * the package graph. The implementation module re-exports these names.
 */

export type ProviderHealthStatus =
  | "configured"
  | "missing-key"
  | "setup-required"
  | "mock-fallback"
  | "unavailable";

export interface ProviderHealth {
  id: string;
  label: string;
  status: ProviderHealthStatus;
  configured: boolean;
  usesMockFallback: boolean;
  setupRequired: boolean;
  detail: string;
  missingEnv?: string[];
  /** True when the provider adapter is implemented and can serve live requests. */
  adapterImplemented: boolean;
  /** True only after a live capability probe confirms tool calling + tool-result continuation pass. */
  codingModeReady: boolean;
  /** Configuration is not evidence of a reachable or authenticated provider. */
  reachable?: boolean | null;
  authenticated?: boolean | null;
  capabilities?: Record<string, { certified: boolean; lastChecked: string | null; evidence: "not_checked" | "passed" | "failed" }>;
}

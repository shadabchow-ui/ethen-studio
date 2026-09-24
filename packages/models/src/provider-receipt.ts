/**
 * Unified provider receipt — a client-safe summary of provider/model/tool
 * routing for any surface: gateway providers, media providers, connectors,
 * agent trust states, or runtime routes.
 *
 * This bridges the gap between lib/providers/types.ts, lib/security/provider-health.ts,
 * lib/media/types.ts, lib/connectors/connection-status.ts, and lib/agents/types.ts
 * so that every surface renders provider truth the same way.
 */

import type { ProviderHealthStatus } from "@ethen/contracts/security/provider-health";
import type { AgentTrustState } from "@ethen/contracts/agents/types";
import type { ConnectorStatus } from "@ethen/tools/connectors/connection-status";
import type { ProviderTrustLabel, ProviderMode } from "@ethen/contracts/media/types";

// Canonical provider status set — includes statuses used by receipt
// fallback helpers that may be supplied by future type extensions.
type ExtendedProviderTrustLabel = ProviderTrustLabel | "degraded";
type ExtendedProviderMode = ProviderMode | "degraded";

/**
 * Canonical client-safe provider status set.
 * Every source status is mapped into one of these.
 */
export type CanonicalProviderStatus =
  | "live"
  | "setup-required"
  | "needs-key"
  | "unavailable"
  | "degraded"
  | "fallback"
  | "mock"
  | "demo"
  | "unknown";

/**
 * Human-readable label for each canonical status.
 */
export const CANONICAL_STATUS_LABELS: Record<CanonicalProviderStatus, string> = {
  live: "Live",
  "setup-required": "Setup Required",
  "needs-key": "Needs Key",
  unavailable: "Unavailable",
  degraded: "Degraded",
  fallback: "Fallback",
  mock: "Mock",
  demo: "Demo",
  unknown: "Unknown",
};

/**
 * Tone mapping for UI rendering.
 */
export const CANONICAL_STATUS_TONE: Record<CanonicalProviderStatus, "success" | "warning" | "danger" | "muted" | "neutral"> = {
  live: "success",
  "setup-required": "warning",
  "needs-key": "warning",
  unavailable: "danger",
  degraded: "warning",
  fallback: "warning",
  mock: "muted",
  demo: "muted",
  unknown: "neutral",
};

/**
 * Client-safe provider receipt.
 * Never contains secrets, raw env vars, or tokens.
 */
export interface ProviderReceipt {
  providerId: string;
  providerLabel: string;
  modelRoute?: string;
  internalRouteId?: string;
  workspaceId?: string;
  agentSlug?: string;
  status: CanonicalProviderStatus;
  fallbackReason?: string;
  degradedReason?: string;
  setupRequirement?: string;
  setupActionLabel?: string;
  setupActionHref?: string;
  timestamp?: string;
  metadata?: Record<string, string>;
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

export function fromProviderHealthStatus(s: ProviderHealthStatus): CanonicalProviderStatus {
  switch (s) {
    case "configured":
      return "live";
    case "missing-key":
      return "needs-key";
    case "setup-required":
      return "setup-required";
    case "mock-fallback":
      return "mock";
    case "unavailable":
      return "unavailable";
    default:
      return "unknown";
  }
}

export function fromAgentTrustState(s: AgentTrustState): CanonicalProviderStatus {
  switch (s) {
    case "live":
      return "live";
    case "preview":
      return "live";
    case "mock":
      return "mock";
    case "setup-required":
      return "setup-required";
    case "degraded":
      return "degraded";
    case "unavailable":
      return "unavailable";
    case "planned":
      return "unknown";
    default:
      return "unknown";
  }
}

export function fromConnectorStatus(s: ConnectorStatus): CanonicalProviderStatus {
  switch (s) {
    case "live":
      return "live";
    case "mock":
      return "mock";
    case "setup-required":
      return "setup-required";
    case "degraded":
      return "degraded";
    case "unavailable":
      return "unavailable";
    case "planned":
      return "unknown";
    default:
      return "unknown";
  }
}

export function fromMediaProviderTrust(s: ExtendedProviderTrustLabel): CanonicalProviderStatus {
  switch (s) {
    case "live":
      return "live";
    case "mock":
      return "mock";
    case "setup_required":
      return "setup-required";
    case "not_provided":
      return "unknown";
    case "disabled":
      return "unavailable";
    case "failed":
      return "unavailable";
    case "fallback":
      return "fallback";
    case "degraded":
      return "degraded";
    case "unavailable":
      return "unavailable";
    default:
      return "unknown";
  }
}

export function fromMediaProviderMode(s: ExtendedProviderMode): CanonicalProviderStatus {
  switch (s) {
    case "live":
      return "live";
    case "mock":
      return "mock";
    case "setup-required":
      return "setup-required";
    case "disabled":
      return "unavailable";
    case "fallback":
      return "fallback";
    case "degraded":
      return "degraded";
    default:
      return "unknown";
  }
}

/**
 * Build a ProviderReceipt from a ProviderHealth entry.
 */
export function receiptFromProviderHealth(
  health: { id: string; label: string; status: ProviderHealthStatus; detail: string; missingEnv?: string[] },
): ProviderReceipt {
  return {
    providerId: health.id,
    providerLabel: health.label,
    status: fromProviderHealthStatus(health.status),
    setupRequirement: health.detail,
    metadata: health.missingEnv?.length ? { missingEnv: health.missingEnv.join(", ") } : undefined,
  };
}

/**
 * Build a ProviderReceipt from an AgentTrustState entry.
 */
export function receiptFromAgentTrust(
  agentSlug: string,
  trust: AgentTrustState,
  agentName?: string,
): ProviderReceipt {
  return {
    providerId: agentSlug,
    providerLabel: agentName ?? agentSlug,
    agentSlug,
    status: fromAgentTrustState(trust),
  };
}

/**
 * Build a ProviderReceipt from a ConnectorStatus entry.
 */
export function receiptFromConnector(
  connectorId: string,
  label: string,
  status: ConnectorStatus,
  detail?: string,
): ProviderReceipt {
  return {
    providerId: connectorId,
    providerLabel: label,
    workspaceId: connectorId,
    status: fromConnectorStatus(status),
    setupRequirement: detail,
  };
}

/**
 * Build a ProviderReceipt from a MediaProviderStatus entry.
 */
export function receiptFromMediaProvider(
  media: { id: string; label: string; trust: ProviderTrustLabel; setupRequiredReason?: string; fallbackProviderId?: string },
): ProviderReceipt {
  return {
    providerId: media.id,
    providerLabel: media.label,
    status: fromMediaProviderTrust(media.trust),
    fallbackReason: media.fallbackProviderId ? `Falls back to ${media.fallbackProviderId}` : undefined,
    setupRequirement: media.setupRequiredReason,
  };
}

/**
 * Check if a status is considered "usable" for live operations.
 * mock and demo are usable but labeled.
 */
export function isUsable(status: CanonicalProviderStatus): boolean {
  return status === "live" || status === "mock" || status === "demo";
}

/**
 * Check if a status should show a blocking indicator.
 */
export function isBlocking(status: CanonicalProviderStatus): boolean {
  return status === "setup-required" || status === "needs-key" || status === "unavailable";
}

/**
 * Check if a status is degraded/fallback — partially working.
 */
export function isDegraded(status: CanonicalProviderStatus): boolean {
  return status === "degraded" || status === "fallback";
}

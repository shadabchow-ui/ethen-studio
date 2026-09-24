import {
  getGatewayProviderHealthSummary,
  getResearchProviderHealth,
  type ProviderHealth,
} from "@ethen/security/provider-health";

export type GatewayRouteId = "runtime-status" | "research-run";

export type GatewayProviderClass = "live" | "mock" | "setup-required" | "unavailable";

export interface GatewayProviderReadiness {
  routeId: GatewayRouteId;
  providerId: string;
  providerLabel: string;
  provider: ProviderHealth;
  status: ProviderHealth["status"];
  providerClass: GatewayProviderClass;
  ready: boolean;
  setupRequired: boolean;
  usesMockFallback: boolean;
  adapterImplemented: boolean;
  codingModeReady: boolean;
  detail: string;
  missingEnv: string[];
}

export interface GatewayProviderOverride {
  providerClass?: GatewayProviderClass;
  ready?: boolean;
  setupRequired?: boolean;
  usesMockFallback?: boolean;
  detail?: string;
}

function classifyProvider(provider: ProviderHealth): GatewayProviderClass {
  if (provider.status === "configured") return "live";
  if (provider.status === "mock-fallback") return "mock";
  if (provider.status === "setup-required" || provider.status === "missing-key") {
    return "setup-required";
  }
  return "unavailable";
}

function toReadiness(routeId: GatewayRouteId, provider: ProviderHealth): GatewayProviderReadiness {
  return {
    routeId,
    providerId: provider.id,
    providerLabel: provider.label,
    provider,
    status: provider.status,
    providerClass: classifyProvider(provider),
    ready: provider.status === "configured",
    setupRequired: provider.setupRequired,
    usesMockFallback: provider.usesMockFallback,
    adapterImplemented: provider.adapterImplemented,
    codingModeReady: provider.codingModeReady,
    detail: provider.detail,
    missingEnv: provider.missingEnv ?? [],
  };
}

export function getRuntimeGatewayProviders(): GatewayProviderReadiness[] {
  return getGatewayProviderHealthSummary().providers.map((provider) =>
    toReadiness("runtime-status", provider),
  );
}

export function getResearchGatewayProvider(): GatewayProviderReadiness {
  return toReadiness("research-run", getResearchProviderHealth());
}

export function overrideGatewayProviderReadiness(
  readiness: GatewayProviderReadiness,
  override: GatewayProviderOverride,
): GatewayProviderReadiness {
  return {
    ...readiness,
    providerClass: override.providerClass ?? readiness.providerClass,
    ready: override.ready ?? readiness.ready,
    setupRequired: override.setupRequired ?? readiness.setupRequired,
    usesMockFallback: override.usesMockFallback ?? readiness.usesMockFallback,
    detail: override.detail ?? readiness.detail,
  };
}

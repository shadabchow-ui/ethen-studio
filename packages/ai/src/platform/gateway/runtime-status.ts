import type { ProviderHealth } from "@ethen/security/provider-health";
import { getGatewayProviderHealthSummary } from "@ethen/security/provider-health";
import { getRuntimeGatewayProviders } from "./provider-registry";

export interface RuntimeStatusPayload {
  mode: string;
  defaultProvider: string | null;
  configured: boolean;
  anyAdapterImplemented: boolean;
  anyCodingModeReady: boolean;
  codingModeNote: string;
  providers: ProviderHealth[];
  gateway: {
    routeId: "runtime-status";
    providers: Array<{
      providerId: string;
      providerClass: string;
      ready: boolean;
      setupRequired: boolean;
      usesMockFallback: boolean;
    }>;
  };
}

export function buildRuntimeStatusPayload(): RuntimeStatusPayload {
  const summary = getGatewayProviderHealthSummary();
  const providers = getRuntimeGatewayProviders();
  const configured = providers.some((provider) => provider.ready);
  const anyAdapterImplemented = providers.some((provider) => provider.adapterImplemented);
  const anyCodingModeReady = providers.some((provider) => provider.codingModeReady);

  return {
    mode: summary.mode,
    defaultProvider: summary.activeProvider,
    configured,
    anyAdapterImplemented,
    anyCodingModeReady,
    codingModeNote: anyCodingModeReady
      ? "At least one provider has confirmed tool-calling capability. Coding mode is available."
      : "No provider has confirmed tool-calling capability. Coding mode is disabled until a live capability probe passes.",
    providers: summary.providers,
    gateway: {
      routeId: "runtime-status",
      providers: providers.map((provider) => ({
        providerId: provider.providerId,
        providerClass: provider.providerClass,
        ready: provider.ready,
        setupRequired: provider.setupRequired,
        usesMockFallback: provider.usesMockFallback,
      })),
    },
  };
}

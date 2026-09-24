import type { GatewayProviderReadiness, GatewayRouteId } from "./provider-registry";

export interface GatewayEvidence {
  routeId: GatewayRouteId;
  providerId: string;
  providerLabel: string;
  providerClass: GatewayProviderReadiness["providerClass"];
  providerStatus: GatewayProviderReadiness["status"];
  ready: boolean;
  setupRequired: boolean;
  usesMockFallback: boolean;
  traceId?: string | null;
}

export function buildGatewayEvidence(
  readiness: GatewayProviderReadiness,
  options?: { traceId?: string | null },
): GatewayEvidence {
  return {
    routeId: readiness.routeId,
    providerId: readiness.providerId,
    providerLabel: readiness.providerLabel,
    providerClass: readiness.providerClass,
    providerStatus: readiness.status,
    ready: readiness.ready,
    setupRequired: readiness.setupRequired,
    usesMockFallback: readiness.usesMockFallback,
    traceId: options?.traceId ?? null,
  };
}

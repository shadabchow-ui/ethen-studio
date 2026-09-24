import type { NextRequest } from "next/server";
import type { GatewayProviderReadiness, GatewayRouteId } from "./provider-registry";
import { buildGatewayEvidence, type GatewayEvidence } from "./gateway-evidence";

export interface GatewayRouteRequest {
  routeId: GatewayRouteId;
  method: string;
  provider: GatewayProviderReadiness;
  evidence: GatewayEvidence;
}

export function buildGatewayRouteRequest(
  request: NextRequest,
  routeId: GatewayRouteId,
  provider: GatewayProviderReadiness,
  options?: { traceId?: string | null },
): GatewayRouteRequest {
  return {
    routeId,
    method: request.method,
    provider,
    evidence: buildGatewayEvidence(provider, options),
  };
}

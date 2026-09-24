import "server-only";

import type { ProviderHealth, ProviderHealthStatus } from "@ethen/contracts/security/provider-health";
import type {
  MicrosoftServiceHealth,
  MicrosoftServiceId,
} from "./types";
import {
  MICROSOFT_SERVICE_SCOPES,
} from "./types";
import {
  hasMicrosoftOAuthConfig,
  isMicrosoftMockMode,
} from "./env";

function makeHealth(id: string, overrides: Partial<ProviderHealth>): ProviderHealth {
  const status: ProviderHealthStatus = overrides.status ?? (overrides.setupRequired ? "setup-required" : overrides.configured ? "configured" : "unavailable");
  return {
    id,
    label: overrides.label ?? id,
    status,
    configured: overrides.configured ?? false,
    usesMockFallback: overrides.usesMockFallback ?? false,
    setupRequired: overrides.setupRequired ?? true,
    detail: overrides.detail ?? "",
    missingEnv: overrides.missingEnv,
    adapterImplemented: overrides.adapterImplemented ?? false,
    codingModeReady: overrides.codingModeReady ?? false,
  };
}

export function getMicrosoftProviderHealth(): ProviderHealth {
  if (isMicrosoftMockMode()) {
    return makeHealth("microsoft365", {
      label: "Microsoft 365",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "Global mock mode is active — Microsoft 365 connectors use stub responses.",
    });
  }

  if (!hasMicrosoftOAuthConfig()) {
    return makeHealth("microsoft365", {
      label: "Microsoft 365",
      status: "setup-required",
      configured: false,
      usesMockFallback: false,
      setupRequired: true,
      detail: "Microsoft 365 OAuth is not configured. Set MICROSOFT_TENANT_ID and MICROSOFT_CLIENT_ID.",
      missingEnv: ["MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID"],
    });
  }

  return makeHealth("microsoft365", {
    label: "Microsoft 365",
    status: "configured",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "Microsoft 365 OAuth base configuration is present. Individual service availability depends on granted scopes.",
  });
}

/** Build a per-service health report for the Connected Apps UI. */
export function getMicrosoftServiceHealthReport(): MicrosoftServiceHealth[] {
  const serviceIds: MicrosoftServiceId[] = ["outlook", "calendar", "onedrive", "sharepoint", "teams"];
  return serviceIds.map((serviceId): MicrosoftServiceHealth => {
    const requiredScopes = MICROSOFT_SERVICE_SCOPES[serviceId];
    const labels: Record<MicrosoftServiceId, string> = {
      outlook: "Outlook",
      calendar: "Microsoft Calendar",
      onedrive: "OneDrive",
      sharepoint: "SharePoint",
      teams: "Microsoft Teams",
    };

    return {
      serviceId,
      label: labels[serviceId],
      status: hasMicrosoftOAuthConfig() ? "configured" : "not_configured",
      requiredScopes,
      grantedScopes: [],
      missingScopes: requiredScopes,
      detail: hasMicrosoftOAuthConfig()
        ? "Provider configured but token-scope availability is unverified (token vault is not operational)."
        : "Microsoft 365 OAuth is not configured.",
    };
  });
}

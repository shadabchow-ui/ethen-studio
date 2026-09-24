import { setupRequiredError, unavailableProviderError } from "@ethen/security/errors";
import type { GatewayProviderReadiness } from "./provider-registry";

export function createSetupRequiredResponse(
  readiness: GatewayProviderReadiness,
  code = "SETUP_REQUIRED",
) {
  return setupRequiredError(readiness.provider, code);
}

export function createUnavailableProviderResponse(
  readiness: GatewayProviderReadiness,
  code = "PROVIDER_UNAVAILABLE",
  detail?: string,
) {
  return unavailableProviderError(
    detail
      ? {
          ...readiness.provider,
          status: "unavailable",
          detail,
        }
      : readiness.provider,
    code,
  );
}

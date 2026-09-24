import "server-only";

import { isMockMode } from "../runtime-flags";
import { getServerEnv } from "../env";
import { isMockModeAllowed } from "../env-contract";

export function getShippoApiToken(): string | undefined {
  return getServerEnv("SHIPPO_API_TOKEN");
}

export function getShippoApiBaseUrl(): string | undefined {
  return getServerEnv("SHIPPO_API_BASE_URL");
}

export function isShippingMockMode(): boolean {
  return isMockMode || (isMockModeAllowed() && process.env.SHIPPING_MOCK_MODE === "true");
}

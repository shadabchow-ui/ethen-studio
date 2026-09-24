import "server-only";

import { isMockMode } from "../runtime-flags";
import { getServerEnv } from "../env";
import { isMockModeAllowed } from "../env-contract";

export function getTravelDataApiKey(): string | undefined {
  return getServerEnv("TRAVEL_DATA_API_KEY");
}

export function getTravelDataApiBaseUrl(): string | undefined {
  return getServerEnv("TRAVEL_DATA_API_BASE_URL");
}

export function isTravelSearchMockMode(): boolean {
  return isMockMode || (isMockModeAllowed() && process.env.TRAVEL_SEARCH_MOCK_MODE === "true");
}

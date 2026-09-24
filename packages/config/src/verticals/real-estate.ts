import "server-only";

import { isMockMode } from "../runtime-flags";
import { getServerEnv } from "../env";

export function getRentCastApiKey(): string | undefined {
  return getServerEnv("RENTCAST_API_KEY");
}

export function getRealEstateProviderEnv(): string | undefined {
  return getServerEnv("REAL_ESTATE_PROVIDER");
}

export function isRealEstateMockMode(): boolean {
  return isMockMode;
}

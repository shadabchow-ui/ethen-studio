import "server-only";

import { isMockMode } from "../runtime-flags";
import { getServerEnv } from "../env";

export function getTwelveDataApiKey(): string | undefined {
  return getServerEnv("TWELVE_DATA_API_KEY");
}

export function isFinanceForcedMockMode(): boolean {
  return isMockMode;
}

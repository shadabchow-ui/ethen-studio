import "server-only";

import { isMockMode } from "../runtime-flags";
import { getServerEnv } from "../env";
import { isMockModeAllowed } from "../env-contract";

export function getJobDataApiKey(): string | undefined {
  return getServerEnv("JOB_DATA_API_KEY");
}

export function getJobDataApiBaseUrl(): string | undefined {
  return getServerEnv("JOB_DATA_API_BASE_URL");
}

export function isJobSearchMockMode(): boolean {
  return isMockMode || (isMockModeAllowed() && process.env.JOB_SEARCH_MOCK_MODE === "true");
}

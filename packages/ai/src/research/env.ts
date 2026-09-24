import "server-only";
import { getServerEnv } from "@ethen/config/env";
import { isMockModeAllowed } from "@ethen/config/env-contract";

export function getExaApiKey(): string | undefined {
  return getServerEnv("EXA_API_KEY");
}

export function isResearchMockMode(): boolean {
  return isMockModeAllowed();
}

export function isResearchPrivateBetaEnabled(): boolean {
  return process.env.ETHEN_RESEARCH_PRIVATE_BETA === "true";
}

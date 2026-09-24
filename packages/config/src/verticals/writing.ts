import "server-only";
import { getServerEnv } from "../env";
import { isMockModeAllowed } from "../env-contract";

export function getLanguageToolApiUrl(): string | undefined {
  return getServerEnv("LANGUAGETOOL_API_URL");
}

export function getLanguageToolApiKey(): string | undefined {
  return getServerEnv("LANGUAGETOOL_API_KEY");
}

export function isWritingMockMode(): boolean {
  return isMockModeAllowed();
}

export function getCopyleaksEmail(): string | undefined {
  return getServerEnv("COPYLEAKS_EMAIL");
}

export function getCopyleaksApiKey(): string | undefined {
  return getServerEnv("COPYLEAKS_API_KEY");
}

export function getCopyleaksApiUrl(): string {
  return getServerEnv("COPYLEAKS_API_URL") ?? "https://api.copyleaks.com";
}

export function hasCopyleaksCredentials(): boolean {
  return Boolean(getCopyleaksEmail() && getCopyleaksApiKey());
}

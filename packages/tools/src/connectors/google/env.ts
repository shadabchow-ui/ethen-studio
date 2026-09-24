import "server-only";
import { getServerEnv } from "@ethen/config/env";
import { isMockModeAllowed } from "@ethen/config/env-contract";

export function getGoogleApiKey(): string | undefined {
  return getServerEnv("GOOGLE_API_KEY");
}

export function getGoogleClientId(): string | undefined {
  return getServerEnv("GOOGLE_CLIENT_ID");
}

export function getGoogleClientSecret(): string | undefined {
  return getServerEnv("GOOGLE_CLIENT_SECRET");
}

export function getGoogleRefreshToken(): string | undefined {
  return getServerEnv("GOOGLE_REFRESH_TOKEN");
}

export function getGoogleServiceAccountEmail(): string | undefined {
  return getServerEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
}

export function getGoogleServiceAccountKey(): string | undefined {
  return getServerEnv("GOOGLE_SERVICE_ACCOUNT_KEY");
}

export function isGoogleWorkspaceMockMode(): boolean {
  return isMockModeAllowed();
}

export function hasGoogleApiCredentials(): boolean {
  return Boolean(getGoogleApiKey());
}

export function hasGoogleOAuthCredentials(): boolean {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

export function hasGoogleServiceAccountCredentials(): boolean {
  return Boolean(getGoogleServiceAccountEmail() && getGoogleServiceAccountKey());
}

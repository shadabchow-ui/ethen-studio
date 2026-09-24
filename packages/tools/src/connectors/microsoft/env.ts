import "server-only";

import { getServerEnv } from "@ethen/config/env";
import { isMockMode } from "@ethen/config/runtime-flags";

/** Microsoft Azure AD tenant identifier — required for OAuth/delegated flows. */
export function getMicrosoftTenantId(): string | undefined {
  return getServerEnv("MICROSOFT_TENANT_ID");
}

/** Microsoft Azure AD application (client) ID. Not a secret. */
export function getMicrosoftClientId(): string | undefined {
  return getServerEnv("MICROSOFT_CLIENT_ID");
}

/** Microsoft Azure AD client secret — server-only. */
export function getMicrosoftClientSecret(): string | undefined {
  return getServerEnv("MICROSOFT_CLIENT_SECRET");
}

/** Microsoft Graph API base URL (falls back to standard global endpoint). */
export function getMicrosoftGraphBaseUrl(): string {
  return getServerEnv("MICROSOFT_GRAPH_BASE_URL") ?? "https://graph.microsoft.com/v1.0";
}

/** Whether the Microsoft 365 connector suite is in mock/forced-mock mode. */
export function isMicrosoftMockMode(): boolean {
  return isMockMode;
}

/** Whether the minimum required Microsoft OAuth config is present. */
export function hasMicrosoftOAuthConfig(): boolean {
  return Boolean(getMicrosoftTenantId() && getMicrosoftClientId());
}

/** Whether the full OAuth config (including client secret) is present. */
export function hasMicrosoftFullOAuthConfig(): boolean {
  return Boolean(hasMicrosoftOAuthConfig() && getMicrosoftClientSecret());
}

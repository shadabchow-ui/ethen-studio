import "server-only";

import {
  isGoogleWorkspaceMockMode,
  hasGoogleApiCredentials,
  hasGoogleOAuthCredentials,
  hasGoogleServiceAccountCredentials,
} from "./env";
import { MockGoogleProvider } from "./mock-provider";
import type { GoogleProviderId, GoogleProviderMode, GoogleWorkspaceProvider, GoogleWorkspaceStatus } from "./types";

export function getGoogleProviderRuntime(): {
  provider: GoogleWorkspaceProvider;
  mode: GoogleProviderMode;
  providerId: GoogleProviderId;
  providerLabel: string;
} {
  if (isGoogleWorkspaceMockMode()) {
    return {
      provider: new MockGoogleProvider(),
      mode: "mock",
      providerId: "mock",
      providerLabel: "Mock (demo data)",
    };
  }

  const hasApiKey = hasGoogleApiCredentials();
  const hasOAuth = hasGoogleOAuthCredentials();
  const hasServiceAccount = hasGoogleServiceAccountCredentials();

  if (hasApiKey || hasOAuth || hasServiceAccount) {
    return {
      provider: new MockGoogleProvider(),
      mode: "setup-required",
      providerId: "google",
      providerLabel: "Google Workspace",
    };
  }

  return {
    provider: new MockGoogleProvider(),
    mode: "setup-required",
    providerId: "google",
    providerLabel: "Google Workspace",
  };
}

export function getGoogleWorkspaceStatus(): GoogleWorkspaceStatus {
  const runtime = getGoogleProviderRuntime();

  const hasApiKey = hasGoogleApiCredentials();
  const hasOAuth = hasGoogleOAuthCredentials();
  const hasServiceAccount = hasGoogleServiceAccountCredentials();

  const configuredServices = {
    drive: hasApiKey || hasOAuth || hasServiceAccount,
    gmail: hasOAuth || hasServiceAccount,
    calendar: hasOAuth || hasServiceAccount,
    docs: hasApiKey || hasOAuth || hasServiceAccount,
    sheets: hasApiKey || hasOAuth || hasServiceAccount,
  };

  const missingEnv: string[] = [];
  if (!hasApiKey && !hasOAuth && !hasServiceAccount) {
    missingEnv.push("GOOGLE_API_KEY", "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET", "GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY");
  }

  const isLive = runtime.mode === "live";

  return {
    mode: runtime.mode,
    providerId: runtime.providerId,
    providerLabel: runtime.providerLabel,
    configured: configuredServices,
    requiresSetup: !isLive,
    isMock: runtime.mode === "mock",
    source: isLive ? "provider" : "mock",
    disclaimer: isLive
      ? "Google Workspace is configured with live credentials."
      : runtime.mode === "mock"
        ? "Mock mode is active. Google Workspace responses use demo data."
        : "Google Workspace provider is not configured. Responses use mock fallback data. Configure GOOGLE_API_KEY, GOOGLE_CLIENT_ID+GOOGLE_CLIENT_SECRET, or GOOGLE_SERVICE_ACCOUNT credentials.",
    note: isLive
      ? "Google Workspace is configured for live API access."
      : runtime.mode === "mock"
        ? "Mock mode is enabled for Google Workspace."
        : "Google Workspace OAuth and token vault infrastructure is not yet implemented in this repo. Live Google API requests cannot be made.",
    missingEnv: missingEnv.length > 0 ? missingEnv : undefined,
  };
}

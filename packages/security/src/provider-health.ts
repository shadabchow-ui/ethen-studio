import "server-only";

import { isMockMode } from "@ethen/config/runtime-flags";
import { getDefaultProvider, getProviderApiKey, isLoopbackProviderUrl } from "@ethen/models/gateway/env";
import type { GatewayProviderId } from "@ethen/models/gateway/types";
import { getTwelveDataApiKey, isFinanceForcedMockMode } from "@ethen/config/verticals/finance";
import { getJobDataApiBaseUrl, getJobDataApiKey, isJobSearchMockMode } from "@ethen/config/verticals/job-search";
import { getExaApiKey, isResearchMockMode } from "@ethen/ai/research/env";
import {
  getCopyleaksApiKey,
  getCopyleaksEmail,
  getLanguageToolApiUrl,
  isWritingMockMode,
} from "@ethen/config/verticals/writing";
import { getRentCastApiKey, isRealEstateMockMode } from "@ethen/config/verticals/real-estate";
import { getScrapeDoToken, isProductScraperMockMode } from "@ethen/config/verticals/product-scraper";
import { getTravelDataApiBaseUrl, getTravelDataApiKey, isTravelSearchMockMode } from "@ethen/config/verticals/travel";
import { getGoogleClientId, getGoogleClientSecret, getGoogleApiKey, isGoogleWorkspaceMockMode } from "@ethen/tools/connectors/google/env";
import { hasMicrosoftOAuthConfig, isMicrosoftMockMode } from "@ethen/tools/connectors/microsoft/env";
import { getShippoApiToken, isShippingMockMode } from "@ethen/config/verticals/shipping";

export type {
  ProviderHealthStatus,
  ProviderHealth,
} from "@ethen/contracts/security/provider-health";
import type {
  ProviderHealthStatus,
  ProviderHealth,
} from "@ethen/contracts/security/provider-health";

function makeHealth(input: Omit<ProviderHealth, "adapterImplemented" | "codingModeReady"> & {
  adapterImplemented?: boolean;
  codingModeReady?: boolean;
}): ProviderHealth {
  return {
    adapterImplemented: false,
    codingModeReady: false,
    ...input,
  };
}

function getGatewayProviderHealth(providerId: Exclude<GatewayProviderId, "mock">): ProviderHealth {
  if (providerId === "openai-compatible") {
    const baseUrl = process.env.ETHEN_OPENAI_COMPATIBLE_BASE_URL?.trim();
    const model = process.env.ETHEN_OPENAI_COMPATIBLE_MODEL?.trim();

    if (!baseUrl || !model) {
      return makeHealth({
        id: providerId,
        label: "OpenAI-compatible",
        status: "setup-required",
        configured: false,
        usesMockFallback: isMockMode,
        setupRequired: true,
        detail: "OpenAI-compatible routing needs a base URL and model before it can be selected.",
        missingEnv: ["ETHEN_OPENAI_COMPATIBLE_BASE_URL", "ETHEN_OPENAI_COMPATIBLE_MODEL"],
      });
    }

    const apiKey = getProviderApiKey("openai-compatible");
    if (!apiKey && !isLoopbackProviderUrl(baseUrl)) {
      return makeHealth({
        id: providerId,
        label: "OpenAI-compatible",
        status: "missing-key",
        configured: false,
        usesMockFallback: isMockMode,
        setupRequired: true,
        adapterImplemented: true,
        detail: "Remote OpenAI-compatible endpoints require ETHEN_OPENAI_COMPATIBLE_API_KEY.",
        missingEnv: ["ETHEN_OPENAI_COMPATIBLE_API_KEY"],
      });
    }

    return makeHealth({
      id: providerId,
      label: "OpenAI-compatible",
      status: "configured",
      configured: true,
      usesMockFallback: false,
      setupRequired: false,
      adapterImplemented: true,
      detail: "OpenAI-compatible endpoint is configured for streaming chat. Coding mode requires a live capability probe.",
    });
  }

  const apiKey = getProviderApiKey(providerId);
  const labels: Record<Exclude<GatewayProviderId, "mock" | "openai-compatible">, string> = {
    "vercel-ai-gateway": "Vercel AI Gateway",
    openai: "OpenAI",
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
  };
  const missingEnvByProvider: Record<Exclude<GatewayProviderId, "mock" | "openai-compatible">, string> = {
    "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
  };

  if (!apiKey) {
    return makeHealth({
      id: providerId,
      label: labels[providerId],
      status: "missing-key",
      configured: false,
      usesMockFallback: isMockMode,
      setupRequired: true,
      detail: `${labels[providerId]} is not configured on this server.`,
      missingEnv: [missingEnvByProvider[providerId]],
    });
  }

  return makeHealth({
    id: providerId,
    label: labels[providerId],
    status: "configured",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    adapterImplemented: true,
    detail: `${labels[providerId]} is configured for live streaming chat. Coding mode requires a live capability probe to confirm tool calling.`,
  });
}

export function getGatewayProviderHealthSummary() {
  const providers = (["openai", "anthropic", "deepseek", "openai-compatible"] as const).map(getGatewayProviderHealth);
  const defaultProvider = getDefaultProvider();
  const activeProvider =
    defaultProvider ??
    providers.find((provider) => provider.status === "configured")?.id ??
    null;

  return {
    mode: isMockMode ? "mock" : "production",
    activeProvider,
    defaultProvider,
    providers,
  };
}

export function getResearchProviderHealth(): ProviderHealth {
  if (isResearchMockMode()) {
    return makeHealth({
      id: "exa",
      label: "Exa",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "Global mock mode is active, so research requests use mock data.",
    });
  }

  if (!getExaApiKey()) {
    return makeHealth({
      id: "exa",
      label: "Exa",
      status: "setup-required",
      configured: false,
      usesMockFallback: false,
      setupRequired: true,
      detail: "Exa API access is not configured for live research requests.",
      missingEnv: ["EXA_API_KEY"],
    });
  }

  return makeHealth({
    id: "exa",
    label: "Exa",
    status: "configured",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "Exa is configured for live research requests.",
    reachable: null,
    authenticated: null,
    capabilities: {
      search: { certified: false, lastChecked: null, evidence: "not_checked" },
      contents: { certified: false, lastChecked: null, evidence: "not_checked" },
      answer: { certified: false, lastChecked: null, evidence: "not_checked" },
    },
  });
}

export function getWritingCheckProviderHealth(): ProviderHealth {
  if (isWritingMockMode()) {
    return makeHealth({
      id: "language-tool",
      label: "LanguageTool",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "Global mock mode is active, so writing review uses mock suggestions.",
    });
  }

  if (!getLanguageToolApiUrl()) {
    return makeHealth({
      id: "language-tool",
      label: "LanguageTool",
      status: "setup-required",
      configured: false,
      usesMockFallback: false,
      setupRequired: true,
      detail: "LanguageTool needs its API URL before live writing review can run.",
      missingEnv: ["LANGUAGETOOL_API_URL"],
    });
  }

  return makeHealth({
    id: "language-tool",
    label: "LanguageTool",
    status: "configured",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "LanguageTool is configured for live writing review.",
  });
}

export function getWritingIntegrityProviderHealth(): ProviderHealth {
  if (isWritingMockMode()) {
    return makeHealth({
      id: "copyleaks",
      label: "Copyleaks",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "Global mock mode is active, so integrity checks use mock preview results.",
    });
  }

  if (!getCopyleaksEmail() || !getCopyleaksApiKey()) {
    return makeHealth({
      id: "copyleaks",
      label: "Copyleaks",
      status: "setup-required",
      configured: false,
      usesMockFallback: false,
      setupRequired: true,
      detail: "Copyleaks credentials are required before live integrity checks can begin.",
      missingEnv: ["COPYLEAKS_EMAIL", "COPYLEAKS_API_KEY"],
    });
  }

  return makeHealth({
    id: "copyleaks",
    label: "Copyleaks",
    status: "unavailable",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "Credentials are configured, but the repo only supports the async webhook flow in a future phase.",
  });
}

export function getFinanceProviderHealth(): ProviderHealth {
  if (isFinanceForcedMockMode()) {
    return makeHealth({
      id: "mock",
      label: "Mock finance provider",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "Global mock mode is active, so finance uses mock market data.",
    });
  }

  if (!getTwelveDataApiKey()) {
    return makeHealth({
      id: "twelve-data",
      label: "Twelve Data",
      status: "setup-required",
      configured: false,
      usesMockFallback: true,
      setupRequired: true,
      detail: "Finance falls back to mock data until Twelve Data credentials are configured.",
      missingEnv: ["TWELVE_DATA_API_KEY"],
    });
  }

  return makeHealth({
    id: "twelve-data",
    label: "Twelve Data",
    status: "configured",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "Twelve Data is configured for live finance requests.",
  });
}

export function getJobSearchProviderHealth(): ProviderHealth {
  if (isJobSearchMockMode()) {
    return makeHealth({
      id: "mock",
      label: "Mock (demo data)",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "Job search mock mode is active, so all responses use deterministic demo data.",
    });
  }

  const apiKey = getJobDataApiKey();
  const baseUrl = getJobDataApiBaseUrl();
  const missingEnv = [
    ...(!apiKey ? ["JOB_DATA_API_KEY"] : []),
    ...(!baseUrl ? ["JOB_DATA_API_BASE_URL"] : []),
  ];

  if (missingEnv.length > 0) {
    return makeHealth({
      id: "job-data-api",
      label: "Job data API",
      status: "setup-required",
      configured: false,
      usesMockFallback: true,
      setupRequired: true,
      detail: "Job search falls back to mock data until the job data API base URL and credentials are configured.",
      missingEnv,
    });
  }

  return makeHealth({
    id: "job-data-api",
    label: "Job data API",
    status: "configured",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "Job data API is configured for live job search requests.",
  });
}

export function getProductScraperProviderHealth(): ProviderHealth {
  if (isProductScraperMockMode()) {
    return makeHealth({
      id: "mock",
      label: "Mock (demo data)",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "PRODUCT_SCRAPER_MOCK_MODE is active — all scraping uses demo data.",
    });
  }

  if (!getScrapeDoToken()) {
    return makeHealth({
      id: "scrape-do",
      label: "Scrape.do",
      status: "setup-required",
      configured: false,
      usesMockFallback: true,
      setupRequired: true,
      detail: "Product scraper falls back to mock demo data until Scrape.do credentials are configured.",
      missingEnv: ["SCRAPE_DO_TOKEN"],
    });
  }

  return makeHealth({
    id: "scrape-do",
    label: "Scrape.do",
    status: "configured",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "Scrape.do is configured for live product scraping.",
  });
}

export function getTravelProviderHealth(): ProviderHealth {
  if (isTravelSearchMockMode()) {
    return makeHealth({
      id: "mock",
      label: "Mock (demo data)",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "Travel mock mode is active, so all travel responses use deterministic demo data.",
    });
  }

  const apiKey = getTravelDataApiKey();
  const baseUrl = getTravelDataApiBaseUrl();
  const missingEnv = [
    ...(!apiKey ? ["TRAVEL_DATA_API_KEY"] : []),
    ...(!baseUrl ? ["TRAVEL_DATA_API_BASE_URL"] : []),
  ];

  if (missingEnv.length > 0) {
    return makeHealth({
      id: "travel-data-api",
      label: "Travel data API",
      status: "setup-required",
      configured: false,
      usesMockFallback: true,
      setupRequired: true,
      detail: "Travel falls back to mock data until the travel data API base URL and credentials are configured.",
      missingEnv,
    });
  }

  return makeHealth({
    id: "travel-data-api",
    label: "Travel data API",
    status: "configured",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "Travel data API is configured for live travel requests.",
  });
}

export function getRealEstateProviderHealth(): ProviderHealth {
  if (isRealEstateMockMode()) {
    return makeHealth({
      id: "mock",
      label: "Mock real estate provider",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "Global mock mode is active, so real estate uses mock listings.",
    });
  }

  if (!getRentCastApiKey()) {
    return makeHealth({
      id: "rentcast",
      label: "RentCast",
      status: "setup-required",
      configured: false,
      usesMockFallback: true,
      setupRequired: true,
      detail: "Real estate falls back to mock listings until RentCast credentials are configured.",
      missingEnv: ["RENTCAST_API_KEY"],
    });
  }

  return makeHealth({
    id: "rentcast",
    label: "RentCast",
    status: "configured",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "RentCast is configured for live real estate search requests.",
  });
}

export function getShippingProviderHealth(): ProviderHealth {
  if (isShippingMockMode()) {
    return makeHealth({
      id: "mock",
      label: "Mock (demo data)",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "Shipping mock mode is active — all shipping responses use deterministic demo data.",
    });
  }

  const apiToken = getShippoApiToken();

  if (!apiToken) {
    return makeHealth({
      id: "shippo",
      label: "Shippo",
      status: "setup-required",
      configured: false,
      usesMockFallback: true,
      setupRequired: true,
      detail: "Shipping falls back to mock data until SHIPPO_API_TOKEN is configured.",
      missingEnv: ["SHIPPO_API_TOKEN"],
    });
  }

  return makeHealth({
    id: "shippo",
    label: "Shippo",
    status: "configured",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "Shippo is configured for live shipping label creation.",
  });
}

export function getGoogleWorkspaceProviderHealth(): ProviderHealth {
  if (isGoogleWorkspaceMockMode()) {
    return makeHealth({
      id: "google",
      label: "Google Workspace",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "Global mock mode is active, so Google Workspace requests use mock demo data.",
    });
  }

  const hasApiKey = Boolean(getGoogleApiKey());
  const hasOAuth = Boolean(getGoogleClientId() && getGoogleClientSecret());

  if (!hasApiKey && !hasOAuth) {
    return makeHealth({
      id: "google",
      label: "Google Workspace",
      status: "setup-required",
      configured: false,
      usesMockFallback: true,
      setupRequired: true,
      detail: "Google Workspace falls back to mock data until Google API credentials are configured. Set GOOGLE_API_KEY or GOOGLE_CLIENT_ID+GOOGLE_CLIENT_SECRET.",
      missingEnv: ["GOOGLE_API_KEY", "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET"],
    });
  }

  return makeHealth({
    id: "google",
    label: "Google Workspace",
    status: "unavailable",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "Google Workspace credentials are configured, but the OAuth token vault and live API client are not implemented in this repo. Responses use mock data as fallback.",
  });
}

export function getMicrosoftProviderHealth(): ProviderHealth {
  if (isMicrosoftMockMode()) {
    return makeHealth({
      id: "microsoft365",
      label: "Microsoft 365",
      status: "mock-fallback",
      configured: false,
      usesMockFallback: true,
      setupRequired: false,
      detail: "Global mock mode is active — Microsoft 365 connectors use stub responses.",
    });
  }

  if (!hasMicrosoftOAuthConfig()) {
    return makeHealth({
      id: "microsoft365",
      label: "Microsoft 365",
      status: "setup-required",
      configured: false,
      usesMockFallback: false,
      setupRequired: true,
      detail: "Microsoft 365 OAuth is not configured. Set MICROSOFT_TENANT_ID and MICROSOFT_CLIENT_ID.",
      missingEnv: ["MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID"],
    });
  }

  return makeHealth({
    id: "microsoft365",
    label: "Microsoft 365",
    status: "unavailable",
    configured: true,
    usesMockFallback: false,
    setupRequired: false,
    detail: "Microsoft 365 OAuth configuration is present, but the token vault and live Graph API client are not operational in this repo.",
  });
}

import "server-only";

import type { GatewayProviderId } from "./types";
import { getServerEnv } from "@ethen/config/env";

export interface OpenAICompatibleEnv {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface DeepSeekEnv {
  baseUrl: string;
  model?: string;
}

export function getProviderApiKey(providerId: GatewayProviderId) {
  switch (providerId) {
    case "vercel-ai-gateway":
      return getServerEnv("AI_GATEWAY_API_KEY");
    case "openai":
      return getServerEnv("OPENAI_API_KEY");
    case "anthropic":
      return getServerEnv("ANTHROPIC_API_KEY");
    case "deepseek":
      return getServerEnv("DEEPSEEK_API_KEY");
    case "openai-compatible":
      return getServerEnv("ETHEN_OPENAI_COMPATIBLE_API_KEY");
    case "mock":
    default:
      return undefined;
  }
}

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export function getDeepSeekEnv(): DeepSeekEnv {
  return {
    baseUrl: getServerEnv("DEEPSEEK_API_BASE_URL") ?? DEFAULT_DEEPSEEK_BASE_URL,
    model: getServerEnv("DEEPSEEK_MODEL"),
  };
}

/** Local runtimes (Ollama, LM Studio) may omit an API key. Remote endpoints may not. */
export function isLoopbackProviderUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1";
  } catch {
    return false;
  }
}

export function getOpenAICompatibleEnv(): OpenAICompatibleEnv | null {
  const baseUrl = getServerEnv("ETHEN_OPENAI_COMPATIBLE_BASE_URL");
  const apiKey = getServerEnv("ETHEN_OPENAI_COMPATIBLE_API_KEY");
  const model = getServerEnv("ETHEN_OPENAI_COMPATIBLE_MODEL");

  if (!baseUrl || !model) return null;

  return { baseUrl, apiKey: apiKey ?? "", model };
}

/** Applied when a caller does not set providerTimeouts for a provider. */
export const DEFAULT_GATEWAY_PROVIDER_TIMEOUT_MS = 60_000;

export function getDefaultProvider(): Exclude<GatewayProviderId, "mock"> | null {
  const configured = getServerEnv("ETHEN_DEFAULT_PROVIDER")?.toLowerCase();

  if (
    configured === "openai" ||
    configured === "anthropic" ||
    configured === "deepseek" ||
    configured === "openai-compatible" || configured === "vercel-ai-gateway"
  ) {
    return configured;
  }

  return null;
}

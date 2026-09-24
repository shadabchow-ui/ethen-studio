export type ProviderCategory =
  | "frontier-hosted"
  | "low-cost-hosted"
  | "router"
  | "local"
  | "custom";

/**
 * Repository certification is deliberately separate from an adapter or an
 * environment variable. A provider is never launch-ready merely because a
 * catalog row or a route exists.
 */
export type ProviderCertificationState =
  | "implemented"
  | "configured-not-certified"
  | "provider-supported-not-implemented"
  | "deprecated"
  | "unverified";

export interface ProviderCertification {
  state: ProviderCertificationState;
  /** Null until a repeatable live certification has been recorded. */
  lastCertifiedAt: string | null;
  evidenceUrl: string | null;
  reason: string;
}

export interface ProviderApiFact {
  endpoint: string | null;
  authentication: string | null;
  newerPrimitive: string | null;
  source: string | null;
}

export interface ProviderMeta {
  id: string;
  label: string;
  category: ProviderCategory;
  categoryLabel: string;
  builtIn: boolean;
  requiresBaseUrl: boolean;
  requiresApiKey: boolean;
  isOpenAICompatible: boolean;
  docsUrl?: string;
  defaultModels: string[];
  /** Older model ids kept selectable for backward compatibility. Not used as the default. */
  legacyModels?: string[];
  tags: string[];
  certification: ProviderCertification;
  api: ProviderApiFact;
}

export const PROVIDER_CATEGORIES: { value: ProviderCategory; label: string }[] = [
  { value: "frontier-hosted", label: "Frontier hosted" },
  { value: "low-cost-hosted", label: "Low-cost hosted" },
  { value: "router", label: "Routers / Gateways" },
  { value: "local", label: "Local" },
  { value: "custom", label: "Custom" },
];

type ProviderDefinition = Omit<ProviderMeta, "certification" | "api">;

const PROVIDER_CERTIFICATIONS: Record<ProviderDefinition["id"], ProviderCertification> = {
  openai: {
    state: "implemented",
    lastCertifiedAt: null,
    evidenceUrl: "https://platform.openai.com/docs/api-reference/chat",
    reason: "The repository implements an OpenAI Chat Completions adapter; live provider certification has not been recorded.",
  },
  anthropic: {
    state: "implemented",
    lastCertifiedAt: null,
    evidenceUrl: "https://docs.anthropic.com/en/api/messages",
    reason: "The repository implements an Anthropic Messages adapter; live provider certification has not been recorded.",
  },
  deepseek: {
    state: "implemented",
    lastCertifiedAt: null,
    evidenceUrl: null,
    reason: "A repository adapter exists, but no dated provider certification evidence is registered.",
  },
  openrouter: {
    state: "unverified",
    lastCertifiedAt: null,
    evidenceUrl: null,
    reason: "Configuration metadata exists without a repository adapter or dated certification evidence.",
  },
  ollama: {
    state: "provider-supported-not-implemented",
    lastCertifiedAt: null,
    evidenceUrl: "https://docs.ollama.com/api/introduction",
    reason: "Ollama local discovery exists, but this registry does not certify it as a Gateway provider adapter.",
  },
  "lm-studio": {
    state: "unverified",
    lastCertifiedAt: null,
    evidenceUrl: null,
    reason: "Local runtime metadata exists without dated provider certification evidence.",
  },
  groq: {
    state: "unverified",
    lastCertifiedAt: null,
    evidenceUrl: null,
    reason: "Configuration metadata exists without a repository adapter or dated certification evidence.",
  },
  gemini: {
    state: "unverified",
    lastCertifiedAt: null,
    evidenceUrl: null,
    reason: "Configuration metadata exists without a repository adapter or dated certification evidence.",
  },
  cloudflare: {
    state: "unverified",
    lastCertifiedAt: null,
    evidenceUrl: null,
    reason: "Configuration metadata exists without a repository adapter or dated certification evidence.",
  },
  custom: {
    state: "unverified",
    lastCertifiedAt: null,
    evidenceUrl: null,
    reason: "Custom endpoints require project-specific certification and cannot inherit a launch claim.",
  },
};

const PROVIDER_API_FACTS: Record<ProviderDefinition["id"], ProviderApiFact> = {
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    authentication: "Bearer API key",
    newerPrimitive: "Responses API",
    source: "https://platform.openai.com/docs/api-reference/chat",
  },
  anthropic: {
    endpoint: "https://api.anthropic.com/v1/messages",
    authentication: "x-api-key with anthropic-version: 2023-06-01",
    newerPrimitive: null,
    source: "https://docs.anthropic.com/en/api/messages",
  },
  deepseek: { endpoint: null, authentication: null, newerPrimitive: null, source: null },
  openrouter: { endpoint: null, authentication: null, newerPrimitive: null, source: null },
  ollama: {
    endpoint: "http://localhost:11434",
    authentication: "No built-in authentication",
    newerPrimitive: null,
    source: "https://docs.ollama.com/api/introduction",
  },
  "lm-studio": { endpoint: null, authentication: null, newerPrimitive: null, source: null },
  groq: { endpoint: null, authentication: null, newerPrimitive: null, source: null },
  gemini: { endpoint: null, authentication: null, newerPrimitive: null, source: null },
  cloudflare: { endpoint: null, authentication: null, newerPrimitive: null, source: null },
  custom: { endpoint: null, authentication: null, newerPrimitive: null, source: null },
};

const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "openai",
    label: "OpenAI",
    category: "frontier-hosted",
    categoryLabel: "Frontier hosted",
    builtIn: true,
    requiresBaseUrl: false,
    requiresApiKey: true,
    isOpenAICompatible: false,
    defaultModels: ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
    tags: ["frontier", "tool-calling", "reasoning"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    category: "frontier-hosted",
    categoryLabel: "Frontier hosted",
    builtIn: true,
    requiresBaseUrl: false,
    requiresApiKey: true,
    isOpenAICompatible: false,
    defaultModels: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
    tags: ["frontier", "tool-calling", "reasoning"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    category: "low-cost-hosted",
    categoryLabel: "Low-cost hosted",
    builtIn: true,
    requiresBaseUrl: false,
    requiresApiKey: true,
    isOpenAICompatible: true,
    docsUrl: "https://api.deepseek.com",
    defaultModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
    legacyModels: ["deepseek-chat", "deepseek-reasoner"],
    tags: ["cheap", "reasoning", "tool-calling"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    category: "router",
    categoryLabel: "Routers / Gateways",
    builtIn: false,
    requiresBaseUrl: true,
    requiresApiKey: true,
    isOpenAICompatible: true,
    docsUrl: "https://openrouter.ai/api/v1",
    defaultModels: ["openrouter/auto"],
    tags: ["router", "multi-model"],
  },
  {
    id: "ollama",
    label: "Ollama",
    category: "local",
    categoryLabel: "Local",
    builtIn: false,
    requiresBaseUrl: true,
    requiresApiKey: false,
    isOpenAICompatible: true,
    docsUrl: "http://localhost:11434/v1",
    defaultModels: ["qwen2.5-coder"],
    tags: ["local", "free", "tool-calling unknown"],
  },
  {
    id: "lm-studio",
    label: "LM Studio",
    category: "local",
    categoryLabel: "Local",
    builtIn: false,
    requiresBaseUrl: true,
    requiresApiKey: false,
    isOpenAICompatible: true,
    docsUrl: "http://localhost:1234/v1",
    defaultModels: ["local-model"],
    tags: ["local", "free", "tool-calling unknown"],
  },
  {
    id: "groq",
    label: "Groq",
    category: "low-cost-hosted",
    categoryLabel: "Low-cost hosted",
    builtIn: false,
    requiresBaseUrl: true,
    requiresApiKey: true,
    isOpenAICompatible: true,
    docsUrl: "https://api.groq.com/openai/v1",
    defaultModels: ["llama-3.2-90b-vision-preview", "qwen-2.5-32b"],
    tags: ["cheap", "fast", "tool-calling"],
  },
  {
    id: "gemini",
    label: "Gemini",
    category: "frontier-hosted",
    categoryLabel: "Frontier hosted",
    builtIn: false,
    requiresBaseUrl: true,
    requiresApiKey: true,
    isOpenAICompatible: true,
    docsUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModels: ["gemini-2.5-flash", "gemini-2.5-pro"],
    tags: ["frontier", "tool-calling", "reasoning"],
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    category: "low-cost-hosted",
    categoryLabel: "Low-cost hosted",
    builtIn: false,
    requiresBaseUrl: true,
    requiresApiKey: true,
    isOpenAICompatible: true,
    docsUrl: "not provided",
    defaultModels: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast"],
    tags: ["cheap", "free-quota", "edge"],
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    category: "custom",
    categoryLabel: "Custom",
    builtIn: false,
    requiresBaseUrl: true,
    requiresApiKey: false,
    isOpenAICompatible: true,
    defaultModels: ["custom-model"],
    tags: ["custom"],
  },
];

/** The sole provider/certification registry consumed by Gateway metadata. */
export const BUILT_IN_PROVIDERS: ProviderMeta[] = PROVIDER_DEFINITIONS.map((provider) => ({
  ...provider,
  certification: (() => {
    const configured = PROVIDER_CERTIFICATIONS[provider.id];
    const receipt = getCurrentCertification(provider.id);
    return receipt
      ? {
          ...configured,
          lastCertifiedAt: receipt.certifiedAt,
          evidenceUrl: receipt.evidence,
          reason: `Passing ${receipt.mode} certification is current until ${receipt.expiresAt}.`,
        }
      : configured;
  })(),
  api: PROVIDER_API_FACTS[provider.id],
}));

export function getProviderMetadata(providerId: string): ProviderMeta | null {
  return BUILT_IN_PROVIDERS.find((provider) => provider.id === providerId) ?? null;
}

export function getProviderCertification(providerId: string): ProviderCertification {
  return getProviderMetadata(providerId)?.certification ?? {
    state: "unverified",
    lastCertifiedAt: null,
    evidenceUrl: null,
    reason: "This provider appears in a legacy catalog without a canonical provider record or certification evidence.",
  };
}

/** A provider needs a current passing receipt in addition to an implemented adapter. */
export function isProviderLaunchReady(
  provider: ProviderMeta,
  now = new Date(),
): boolean {
  return (
    provider.certification.state === "implemented" &&
    getCurrentCertification(provider.id, now) !== null
  );
}
import { getCurrentCertification } from "./runtime/certification-receipts";

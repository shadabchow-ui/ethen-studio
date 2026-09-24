import { ADAPTER_CAPABILITIES } from "@ethen/models/capabilities";
// ── Cortex provider/model registry ─────────────────────────────────────────
// Builds router-facing ModelCandidate records from the gateway's model
// registry (lib/gateway/routes.ts), so the router can actually differentiate
// between candidates instead of treating every provider as identical.
//
// Tier/latency/score fields below are conservative, repo-grounded heuristics
// based on the model id (e.g. "mini"/"flash" = cheaper & faster than
// "pro"/"sonnet"/"o3"). They are NOT precise billing or benchmark data —
// exact cost-per-token and context-window figures are not available in this
// repo, so those fields are intentionally left undefined rather than guessed.
//
// Capability flags (supportsTools/supportsVision/supportsJsonMode) reflect
// what lib/providers/*.ts adapters actually wire into their request bodies
// today, not what the upstream model API is theoretically capable of. None
// of the adapters (openai.ts, anthropic.ts, deepseek.ts,
// openai-compatible.ts) send a `tools`, `response_format`, or image payload
// — they all issue plain text chat-completions/messages calls. Until a
// tool-calling/JSON-mode/vision request path is wired into an adapter, the
// corresponding candidate flag must stay false rather than overclaim.

import type {
  GatewayModelRegistry,
  GatewayProviderId,
} from "@ethen/models/gateway/types";
import type { CostTier, ModelCandidate, ProviderKind, QualityTier } from "./types";
import { resolveCanonicalModelReference } from "@ethen/models/model-intelligence/registry-api";

// ── Provider-level config (one entry per gateway provider, independent of
// which model is configured for a given route) ─────────────────────────────

export interface ProviderConfig {
  id: GatewayProviderId;
  displayName: string;
  providerKind: ProviderKind;
  /** Wire protocol the adapter speaks, as implemented in lib/providers/*.ts. */
  wireApi: "openai-chat-completions" | "anthropic-messages";
  /** Env var name(s) that gate availability for this provider, per lib/gateway/env.ts. */
  envKey: string;
  /** Base URL is configurable (not fixed) for this provider; undefined means fixed/repo-hardcoded. */
  baseUrlConfigurable: boolean;
  /** Whether this adapter currently sends a `tools`/function-calling payload. */
  supportsTools: boolean;
  /** Whether this adapter currently requests a vision/image-capable payload. */
  supportsVision: boolean;
  /** Whether this adapter currently requests a JSON/structured-output mode. */
  supportsJsonMode: boolean;
  /** Whether this adapter streams responses (all current adapters do). */
  supportsStreaming: boolean;
  /** Whether the gateway's fallback chain is allowed to route to this provider. */
  fallbackEligible: boolean;
}

export const PROVIDER_CONFIG: Record<GatewayProviderId, ProviderConfig> = {
  openai: {
    id: "openai",
    displayName: "OpenAI",
    providerKind: "openai",
    wireApi: "openai-chat-completions",
    envKey: "OPENAI_API_KEY",
    baseUrlConfigurable: false,
    supportsTools: ADAPTER_CAPABILITIES["openai"].tools,
    supportsVision: ADAPTER_CAPABILITIES["openai"].vision,
    supportsJsonMode: ADAPTER_CAPABILITIES["openai"].json,
    supportsStreaming: true,
    fallbackEligible: true,
  },
  anthropic: {
    id: "anthropic",
    displayName: "Anthropic",
    providerKind: "anthropic",
    wireApi: "anthropic-messages",
    envKey: "ANTHROPIC_API_KEY",
    baseUrlConfigurable: false,
    supportsTools: ADAPTER_CAPABILITIES["anthropic"].tools,
    supportsVision: ADAPTER_CAPABILITIES["anthropic"].vision,
    supportsJsonMode: ADAPTER_CAPABILITIES["anthropic"].json,
    supportsStreaming: true,
    fallbackEligible: true,
  },
  deepseek: {
    id: "deepseek",
    displayName: "DeepSeek",
    providerKind: "deepseek",
    wireApi: "openai-chat-completions",
    envKey: "DEEPSEEK_API_KEY",
    // lib/gateway/env.ts: DEEPSEEK_API_BASE_URL overrides the default base URL.
    baseUrlConfigurable: true,
    supportsTools: ADAPTER_CAPABILITIES["deepseek"].tools,
    supportsVision: ADAPTER_CAPABILITIES["deepseek"].vision,
    supportsJsonMode: ADAPTER_CAPABILITIES["deepseek"].json,
    supportsStreaming: true,
    fallbackEligible: true,
  },
  "openai-compatible": {
    id: "openai-compatible",
    displayName: "OpenAI-compatible",
    providerKind: "openai-compatible",
    wireApi: "openai-chat-completions",
    envKey: "ETHEN_OPENAI_COMPATIBLE_BASE_URL",
    baseUrlConfigurable: true,
    supportsTools: ADAPTER_CAPABILITIES["openai-compatible"].tools,
    supportsVision: ADAPTER_CAPABILITIES["openai-compatible"].vision,
    supportsJsonMode: ADAPTER_CAPABILITIES["openai-compatible"].json,
    supportsStreaming: true,
    // Endpoint and capabilities are operator-supplied and unverified — never
    // used as an implicit fallback target for a different provider's request.
    fallbackEligible: false,
  },
  "vercel-ai-gateway": {
    id:"vercel-ai-gateway", displayName:"Vercel AI Gateway", providerKind:"custom", wireApi:"openai-chat-completions",
    envKey:"AI_GATEWAY_API_KEY", baseUrlConfigurable:false, supportsTools:true, supportsVision:true,
    supportsJsonMode:true, supportsStreaming:true, fallbackEligible:false,
  },
  mock: {
    id: "mock",
    displayName: "Mock",
    providerKind: "custom",
    wireApi: "openai-chat-completions",
    envKey: "",
    baseUrlConfigurable: false,
    supportsTools: false,
    supportsVision: false,
    supportsJsonMode: false,
    supportsStreaming: true,
    fallbackEligible: false,
  },
};

function getProviderConfig(providerId: string): ProviderConfig | null {
  return (PROVIDER_CONFIG as Record<string, ProviderConfig>)[providerId] ?? null;
}

function mapProviderKind(providerId: string): ProviderKind {
  return getProviderConfig(providerId)?.providerKind ?? "custom";
}

// ── Model-level tier inference (conservative, id-based heuristics only) ────

interface InferredTier {
  qualityTier: QualityTier;
  latencyClass: "fast" | "balanced" | "slow" | "unknown";
  reliabilityScore: number;
  // Coarse cost tier inferred from the same id hints used for quality tier.
  // Not a price — only used as a fallback signal when exact per-token cost
  // is not configured, so unknown-cost candidates don't score as free.
  costTier: CostTier;
}

const STARTER_HINTS = ["mini", "flash", "haiku"];
const PREMIUM_HINTS = ["pro", "sonnet", "o3", "o4"];

function inferTier(modelId: string): InferredTier {
  const lower = modelId.toLowerCase();

  if (STARTER_HINTS.some((hint) => lower.includes(hint))) {
    return { qualityTier: "starter", latencyClass: "fast", reliabilityScore: 0.7, costTier: "low" };
  }
  if (PREMIUM_HINTS.some((hint) => lower.includes(hint))) {
    return { qualityTier: "premium", latencyClass: "slow", reliabilityScore: 0.8, costTier: "high" };
  }
  return { qualityTier: "balanced", latencyClass: "balanced", reliabilityScore: 0.6, costTier: "medium" };
}

/**
 * Build router-ready candidates from a gateway route's model registry.
 * One candidate is produced per configured provider/model pair.
 */
export function buildCandidatesFromModelRegistry(
  models: GatewayModelRegistry | undefined,
  options?: { availableProviders?: GatewayProviderId[] }
): ModelCandidate[] {
  if (!models) return [];

  const availableSet = options?.availableProviders
    ? new Set(options.availableProviders)
    : null;

  return Object.entries(models)
    .filter(([, modelId]) => typeof modelId === "string" && modelId.length > 0)
    .map(([providerId, modelId]) => {
      const tier = inferTier(modelId as string);
      const enabled = availableSet ? availableSet.has(providerId as GatewayProviderId) : true;
      const providerConfig = getProviderConfig(providerId);
      const canonicalResolution = resolveCanonicalModelReference(modelId as string, providerId);
      const canonical = canonicalResolution.status === "mapped"
        ? canonicalResolution.canonicalModel.profile
        : undefined;

      const candidate: ModelCandidate = {
        id: `${providerId}:${modelId}`,
        providerId,
        providerKind: mapProviderKind(providerId),
        modelId: modelId as string,
        visibleName: canonical?.identity.name ?? modelId as string,
        qualityTier: tier.qualityTier,
        // Exact per-token costs and context windows are not available in
        // this repo. Leave undefined rather than fabricate billing/context
        // figures. costTier is a coarse, id-based fallback signal only.
        costTier: tier.costTier,
        contextWindowTokens: canonical?.context.maxTokens ?? undefined,
        maxOutputTokens: canonical?.context.maxOutputTokens ?? undefined,
        supportsTools: providerConfig?.supportsTools ?? false,
        supportsVision: providerConfig?.supportsVision ?? false,
        supportsJsonMode: providerConfig?.supportsJsonMode ?? false,
        supportsStreaming: providerConfig?.supportsStreaming ?? true,
        latencyClass: tier.latencyClass,
        reliabilityScore: tier.reliabilityScore,
        enabled,
        canonical: canonical ? {
          modelId: canonical.identity.id,
          providerId: canonical.identity.providerId,
          contextWindowTokens: canonical.context.maxTokens,
          maxOutputTokens: canonical.context.maxOutputTokens,
          supportsTools: canonical.capabilities.functionCalling,
          supportsVision: canonical.capabilities.vision,
          supportsStructuredOutput: canonical.context.supportsStructuredOutput,
        } : undefined,
      };
      return candidate;
    });
}

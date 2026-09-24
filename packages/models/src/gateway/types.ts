import type {
  CortexFallbackAttempt,
  CortexRouteProfile,
  CortexSelectionMetadata,
} from "@ethen/ai/cortex/types";

export type GatewayProviderId = "mock" | "openai" | "anthropic" | "deepseek" | "openai-compatible" | "vercel-ai-gateway";

export type GatewayMessageRole = "system" | "user" | "assistant" | "tool";

export interface GatewayChatMessage {
  role: GatewayMessageRole;
  content: string | GatewayContentPart[];
  toolCallId?: string;
  toolCalls?: GatewayToolCall[];
}
export type GatewayContentPart = { type: "text"; text: string } | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp"; data: string };
export interface GatewayToolDefinition { name: string; description?: string; parameters: Record<string, unknown> }
export interface GatewayToolCall { id: string; name: string; arguments: string }
export function gatewayContentText(content: GatewayChatMessage["content"]): string {
  return typeof content === "string" ? content : content.filter(part => part.type === "text").map(part => part.text).join("\n");
}

export interface GatewayAgentContext {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  routeId?: string | null;
  creditCost?: number | null;
}

export type GatewayProviderCredentialStatus = "active" | "revoked" | "test_failed";

export interface GatewayProviderAllowlistConfig {
  providerId: string;
  allowed: boolean;
  notes?: string | null;
}

export interface GatewaySettingsPayload {
  zeroDataRetention?: boolean;
  loggingMode?: "metadata_only" | "content" | "off";
  contentRetentionDays?: number | null;
  platformFallbackEnabled?: boolean;
  platformFallbackProviderId?: string | null;
  defaultProviderOrder?: string[];
  providerSettings?: Record<string, { enabled?: boolean; apiBaseUrl?: string }>;
  rateLimitRpm?: number | null;
  rateLimitTpm?: number | null;
}

export interface GatewayChatRequest {
  tools?: GatewayToolDefinition[];
  toolChoice?: "auto" | "none" | "required" | { name: string };
  responseFormat?: { type: "text" } | { type: "json_object" } | { type: "json_schema"; name: string; schema: Record<string, unknown> };
  sessionId?: string | null;
  routeId?: string | null;
  agent?: GatewayAgentContext | null;
  messages: GatewayChatMessage[];
  maxOutputTokens?: number;
  /** Provider selected by the Cortex router. Takes priority over env defaults when available. */
  selectedProviderId?: GatewayProviderId | null;
  /** Model id selected by the Cortex router for selectedProviderId. */
  selectedModelId?: string | null;
  /** Router-ranked fallback provider order (selected provider first), used in place of the static fallback order. */
  fallbackProviderOrder?: GatewayProviderId[] | null;
  /** Project ID for BYOK key lookup and provider allowlist enforcement. When set, BYOK credentials are used first. */
  projectId?: string | null;
  /**
   * Request-level allow-list of providers. When non-empty, only these providers
   * are eligible (intersection with available/configured providers). Takes
   * priority over the static production provider order but is still subject to
   * catalog gating, policy preflight, and circuit-breaker state.
   */
  onlyProviders?: GatewayProviderId[] | null;
  /**
   * Per-provider timeouts (ms). Applied to each provider call via AbortController.
   * A timeout counts as a provider failure and triggers the normal fallback path.
   */
  providerTimeouts?: Partial<Record<GatewayProviderId, number>> | null;
  /**
   * Per-provider model alias override chain. Maps a provider id to the model
   * alias the gateway should request from that provider for this call.
   */
  modelAliasOverride?: Partial<Record<GatewayProviderId, string>> | null;
  /**
   * Client disconnect / cancellation signal. When the client disconnects
   * mid-stream, this signal is aborted. Provider adapters should propagate
   * it to upstream API calls. Falls through to the provider adapter's
   * signal parameter.
   */
  clientSignal?: AbortSignal | null;
}

/**
 * Request-level gateway routing controls, parsed from OpenAI-style
 * `providerOptions.gateway` in the chat completions request body.
 * Fields are optional and individually applied.
 */
export interface GatewayProviderOptions {
  /** Preferred provider execution order (highest priority first). */
  order?: GatewayProviderId[];
  /** When non-empty, restrict eligible providers to this allow-list. */
  only?: GatewayProviderId[];
  /** Per-provider model alias overrides. */
  models?: Partial<Record<GatewayProviderId, string>>;
  /** Per-provider timeouts in milliseconds. */
  providerTimeouts?: Partial<Record<GatewayProviderId, number>>;
}

export type GatewayModelRegistry = {
  openai?: string;
  anthropic?: string;
  deepseek?: string;
  "openai-compatible"?: string;
  "vercel-ai-gateway"?: string;
};

export interface GatewayRouteProfile {
  routeId: string;
  capability: "quality" | "creative" | "reasoning" | "generic";
  description: string;
  models?: GatewayModelRegistry;
}

export interface GatewayProviderRoute {
  routeId: string;
  profile: GatewayRouteProfile;
  providerId: GatewayProviderId;
  fallbackProviderId?: GatewayProviderId | null;
  /** True when the primary provider failed and fallback was used. */
  fallbackUsed?: boolean;
  /** Reason the primary provider failed, when fallback was used. */
  fallbackReason?: string;
  mode: "mock" | "production";
  source: "mock-mode" | "env-default" | "auto-detected";

  // ── Cortex-compatible optional metadata ──────────────────────────────
  /** Cortex route profile mapped from the gateway route profile. */
  cortexProfile?: CortexRouteProfile | null;
  /** Fallback attempt records (primary + any fallback attempts). */
  attempts?: CortexFallbackAttempt[];
  /** Total number of provider attempts made (primary + fallbacks). */
  attemptCount?: number;
  /** Human-readable label for the selected provider. */
  selectedProvider?: string;
  /** Model alias actually used for the call: router override if honored, otherwise the route profile default. */
  selectedModelAlias?: string | null;
  /** Cortex-compatible selection metadata (reason codes, candidate info). */
  cortexSelection?: CortexSelectionMetadata | null;
  /** True when the gateway honored a Cortex router-selected provider/model for this call. */
  routingApplied?: boolean;
}

export interface GatewayUsageMetadata {
  inputMessages: number;
  inputCharacters: number;
  outputCharacters: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  /** Provider-reported cached / cache-read input tokens, when the adapter parsed them. */
  cachedTokens?: number | null;
  creditCost?: number | null;
}

export interface GatewayStreamResult {
  /** Populated as the text stream is consumed; complete when the stream closes. */
  toolCalls?: GatewayToolCall[];
  textStream: ReadableStream<string>;
  usage: GatewayUsageMetadata;
}

export interface GatewayResult extends GatewayStreamResult {
  route: GatewayProviderRoute;
  warnings: string[];
}

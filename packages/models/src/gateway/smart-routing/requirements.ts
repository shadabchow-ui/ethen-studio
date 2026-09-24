// ── Ethen Gateway — GW-R6 — Request requirements extraction ─────────────
// Derives hard requirements from the raw OpenAI-style chat completions
// body. Hard requirements filter candidates BEFORE scoring.

import { estimateTokens } from "../../shared";
import type { GatewayProviderId } from "../types";
import type {
  CertificationLevel,
  LatencyTarget,
  SmartRoutingRequirements,
} from "./types";

// ── Raw body shape (OpenAI-compatible) ──────────────────────────────────

export interface RawChatPart {
  type?: string;
  text?: string;
  image_url?: { url?: string } | null;
  input_audio?: unknown;
}

export interface RawChatMessage {
  role?: string;
  content?: string | RawChatPart[];
}

export interface RawToolSpec {
  type?: string;
  function?: unknown;
}

export interface RawChatCompletionsBody {
  model?: string;
  messages?: RawChatMessage[];
  tools?: RawToolSpec[];
  response_format?: unknown;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: string;
  metadata?: {
    routing?: {
      latency_target?: string;
      budget_ceiling_usd?: number;
      certification_level?: string;
    };
  } | null;
}

const KNOWN_PROVIDER_IDS: readonly string[] = [
  "mock",
  "openai",
  "anthropic",
  "deepseek",
  "openai-compatible",
];

function normalizeLatencyTarget(value: unknown): LatencyTarget {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized === "fast" || normalized === "balanced" || normalized === "patient") {
    return normalized;
  }
  return "unknown";
}

function normalizeCertificationLevel(value: unknown): CertificationLevel {
  if (typeof value !== "string") return "any";
  return value.trim().toLowerCase() === "live" ? "live" : "any";
}

function normalizeBudgetCeiling(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function messageHasImagePart(message: RawChatMessage): boolean {
  if (!Array.isArray(message.content)) return false;
  return message.content.some(
    (part) =>
      part?.type === "image_url" ||
      part?.type === "image" ||
      (part?.image_url && typeof part.image_url === "object"),
  );
}

function messageHasAudioPart(message: RawChatMessage): boolean {
  if (!Array.isArray(message.content)) return false;
  return message.content.some((part) => part?.type === "input_audio" || part?.type === "audio");
}

function messageText(message: RawChatMessage): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n");
}

/**
 * Extract hard requirements from a raw chat completions body.
 * Everything here is derived from what the client actually sent — no
 * guessing, no fabricated modality signals.
 */
export function extractSmartRoutingRequirements(
  body: RawChatCompletionsBody,
): SmartRoutingRequirements {
  const messages = Array.isArray(body.messages) ? body.messages : [];

  const text = messages.map(messageText).join("\n");
  const estimatedInputTokens = text ? estimateTokens(text) : 0;

  const hasImage = messages.some(messageHasImagePart);
  const hasAudio = messages.some(messageHasAudioPart);

  const tools = Array.isArray(body.tools) ? body.tools.filter(Boolean) : [];
  const requiresTools = tools.length > 0;

  const requiresStructuredOutput =
    body.response_format != null &&
    typeof body.response_format === "object" &&
    Object.keys(body.response_format as Record<string, unknown>).length > 0;

  const maxOutputTokens = body.max_completion_tokens ?? body.max_tokens;

  const routingMetadata = body.metadata?.routing;
  const latencyTarget = normalizeLatencyTarget(routingMetadata?.latency_target);
  const budgetCeilingUsd = normalizeBudgetCeiling(routingMetadata?.budget_ceiling_usd);
  const certificationLevel = normalizeCertificationLevel(routingMetadata?.certification_level);

  return {
    modality: hasImage ? "image" : hasAudio ? "unknown" : "text",
    requiresVision: hasImage,
    requiresTools,
    requiresStructuredOutput,
    estimatedInputTokens,
    maxOutputTokens:
      typeof maxOutputTokens === "number" && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
        ? Math.round(maxOutputTokens)
        : undefined,
    latencyTarget,
    budgetCeilingUsd,
    providerRestrictions: undefined,
    certificationLevel,
    source: "request",
  };
}

/** Coerce request-level provider restrictions (providerOptions.gateway.only). */
export function normalizeProviderRestrictions(value: unknown): GatewayProviderId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter(
    (v): v is GatewayProviderId =>
      typeof v === "string" && KNOWN_PROVIDER_IDS.includes(v),
  );
  return filtered.length > 0 ? filtered : undefined;
}

// ── Ethen Gateway — GW-R6 — Model Intelligence integration ──────────────
// Builds the smart-routing candidate pool from repo-grounded sources:
//   1. Gateway route profiles (which provider/model pairs the Gateway can call)
//   2. Model Intelligence normalized profiles (quality, latency, vision,
//      reasoning, context) — data/model-intelligence/normalized
//   3. The pricing registry (authoritative per-token prices)
//   4. The Gateway model catalog CSV (context window, prices)
//   5. Provider metadata + certification receipts (capability tags, live cert)
// No scores are hardcoded here; Model Intelligence is the quality/latency/
// capability source of truth where a profile exists.

import "server-only";

import type { GatewayProviderId } from "../types";
import { getGatewayRouteProfile } from "../routes";
import { getProviderMetadata, isProviderLaunchReady } from "../../metadata";
import { getPriceRecord } from "../../pricing-registry";
import { getOpenAICompatibleEnv, getProviderApiKey } from "../env";
import { loadGatewayModelCatalog } from "../model-catalog/loader";
import { loadNormalizedModelProfile } from "../../model-intelligence/loadNormalizedModelProfile";
import type {
  RawModelProfile,
} from "../../model-intelligence/loadNormalizedModelProfile";
import type { CostTier } from "@ethen/ai/cortex/types";
import type { SmartRoutingCandidate } from "./types";

// ── Raw profile parsing helpers ─────────────────────────────────────────

function findSpec(profile: RawModelProfile, key: string): string | null {
  const spec = profile.technical_specs?.find((s) => s?.key === key);
  return spec?.value?.trim() || null;
}

function parseSummaryCardNumber(profile: RawModelProfile, id: string): number | null {
  const card = profile.summary_cards?.find((c) => c?.id === id);
  if (!card?.value) return null;
  const match = card.value.replace(/[$,]/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "$3.00" or "$0.14/M" → 3.0 / 0.14 (per 1M tokens). */
function parsePricePerMillion(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/[$,]/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * "1.0M tokens" → 1_000_000; "128K" → 131_072; "160K" → 163_840.
 * Uses the common token-window convention (K = 1024, M = 1_000_000).
 */
export function parseContextWindowTokens(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([km]b?)/i);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  const unit = match[2].toLowerCase();
  if (unit.startsWith("m")) return Math.round(number * 1_000_000);
  if (unit.startsWith("k")) return Math.round(number * 1024);
  return null;
}

function parseTtftSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)s/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveLatencyClass(ttftSeconds: number | null | undefined): SmartRoutingCandidate["latencyClass"] {
  if (ttftSeconds == null) return "unknown";
  if (ttftSeconds < 1.5) return "fast";
  if (ttftSeconds < 4) return "balanced";
  return "slow";
}

export interface ModelIntelligenceEnrichment {
  qualityScore: number;
  qualitySource: "model-intelligence" | "quality-tier";
  ttftSeconds?: number;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  supportsVision: boolean;
  supportsReasoning: boolean;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
}

/**
 * Enrichment for a model slug from the Model Intelligence normalized data.
 * Returns null when no profile exists — callers must fall back gracefully.
 */
export function getModelIntelligenceEnrichment(slug: string): ModelIntelligenceEnrichment | null {
  const bundle = loadNormalizedModelProfile(slug);
  const profile = bundle?.profile;
  if (!profile) return null;

  const intelligence = parseSummaryCardNumber(profile, "intelligence");
  const qualityScore = intelligence != null
    ? Math.min(1, Math.max(0, intelligence / 100))
    : 0.5;
  const qualitySource: ModelIntelligenceEnrichment["qualitySource"] =
    intelligence != null ? "model-intelligence" : "quality-tier";

  const latencySeconds = parseTtftSeconds(findSpec(profile, "latency"))
    ?? parseSummaryCardNumber(profile, "latency");

  const inputModalities = findSpec(profile, "input_modalities") ?? "";
  const supportsVision = /image/i.test(inputModalities);
  const reasoningSpec = findSpec(profile, "reasoning");
  const supportsReasoning = reasoningSpec != null && /^yes/i.test(reasoningSpec);

  return {
    qualityScore,
    qualitySource,
    ttftSeconds: latencySeconds ?? undefined,
    contextWindowTokens: parseContextWindowTokens(findSpec(profile, "context_window")) ?? undefined,
    maxOutputTokens: undefined,
    supportsVision,
    supportsReasoning,
    inputPricePerMillion: parsePricePerMillion(findSpec(profile, "input_price"))
      ?? parseSummaryCardNumber(profile, "input_price") ?? undefined,
    outputPricePerMillion: parsePricePerMillion(findSpec(profile, "output_price"))
      ?? parseSummaryCardNumber(profile, "output_price") ?? undefined,
  };
}

// ── Candidate pool ──────────────────────────────────────────────────────

const PROVIDER_COST_TIER: Partial<Record<GatewayProviderId, CostTier>> = {
  openai: "high",
  anthropic: "high",
  deepseek: "low",
  "openai-compatible": "medium",
};

const PROVIDER_DEFAULT_TOOL_SUPPORT: Partial<Record<GatewayProviderId, boolean>> = {
  openai: true,
  anthropic: true,
  deepseek: true,
  "openai-compatible": false,
};

interface CatalogLookupRow {
  contextWindow?: number;
  maxOutputTokens?: number;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
}

function buildCatalogLookup(snapshot: Awaited<ReturnType<typeof loadGatewayModelCatalog>>): Map<string, CatalogLookupRow> {
  const lookup = new Map<string, CatalogLookupRow>();
  for (const model of snapshot.models) {
    const row: CatalogLookupRow = {
      contextWindow: parseContextWindowTokens(model.context_window) ?? undefined,
      maxOutputTokens: model.max_output_tokens
        ? Number.parseInt(model.max_output_tokens, 10) || undefined
        : undefined,
      inputPricePerMillion: parsePricePerMillion(model.input_price) ?? undefined,
      outputPricePerMillion: parsePricePerMillion(model.output_price) ?? undefined,
    };
    // Keyed both by prefixed and plain id so lookups are forgiving.
    lookup.set(model.model_id, row);
    const plain = model.model_id.split("/").at(-1);
    if (plain) lookup.set(plain, row);
  }
  return lookup;
}

let catalogLookupPromise: Promise<Map<string, CatalogLookupRow>> | null = null;

function getCatalogLookup(): Promise<Map<string, CatalogLookupRow>> {
  if (!catalogLookupPromise) {
    catalogLookupPromise = loadGatewayModelCatalog()
      .then(buildCatalogLookup)
      .catch(() => new Map<string, CatalogLookupRow>());
  }
  return catalogLookupPromise;
}

function providerHasEnvKey(providerId: GatewayProviderId): boolean {
  if (providerId === "openai-compatible") {
    return getOpenAICompatibleEnv() != null;
  }
  return Boolean(getProviderApiKey(providerId));
}

function providerCertified(providerId: string): boolean {
  const metadata = getProviderMetadata(providerId);
  return metadata ? isProviderLaunchReady(metadata) : false;
}

function providerCostTier(providerId: GatewayProviderId): CostTier | undefined {
  return PROVIDER_COST_TIER[providerId];
}

function providerSupportsTools(providerId: GatewayProviderId): boolean {
  return PROVIDER_DEFAULT_TOOL_SUPPORT[providerId] ?? false;
}

function routeQualityTier(routeId: string): number {
  switch (routeId) {
    case "text-reasoning": return 0.75;
    case "text-quality": return 0.7;
    default: return 0.6;
  }
}

/**
 * Build the capability-annotated candidate pool for a gateway route.
 * Deterministic: candidates are sorted by (providerId, modelId).
 * Availability is NOT applied here — the router intersects availability,
 * project allowlist, and BYOK state before scoring.
 */
export async function buildSmartCandidates(routeId: string): Promise<SmartRoutingCandidate[]> {
  const profile = getGatewayRouteProfile(routeId);
  const models = profile.models ?? {};

  const entries: Array<{ providerId: GatewayProviderId; modelId: string }> = [];

  for (const [providerId, modelId] of Object.entries(models)) {
    if (!modelId) continue;
    entries.push({ providerId: providerId as GatewayProviderId, modelId });
  }

  // OpenAI-compatible is env-configured rather than route-profile based;
  // include it as a candidate only when the environment declares it.
  const compatibleEnv = getOpenAICompatibleEnv();
  if (compatibleEnv) {
    entries.push({ providerId: "openai-compatible", modelId: compatibleEnv.model });
  }

  const candidates: SmartRoutingCandidate[] = [];
  const seen = new Set<string>();
  const catalogLookup = await getCatalogLookup();

  for (const entry of entries) {
    const key = `${entry.providerId}:${entry.modelId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const enrichment = getModelIntelligenceEnrichment(entry.modelId);
    const catalogRow = catalogLookup.get(entry.modelId) ?? catalogLookup.get(`${entry.providerId}/${entry.modelId}`);

    // Authoritative price: pricing registry first, then MI profile, then catalog.
    const priceRecord = getPriceRecord(entry.modelId);
    let costPerInputTokenUsd: number | undefined;
    let costPerOutputTokenUsd: number | undefined;
    let priceSource: SmartRoutingCandidate["priceSource"] = "tier";

    if (priceRecord) {
      costPerInputTokenUsd = priceRecord.inputPricePerUnit ?? undefined;
      costPerOutputTokenUsd = priceRecord.outputPricePerUnit ?? undefined;
      priceSource = "pricing-registry";
    } else if (enrichment?.inputPricePerMillion != null && enrichment.outputPricePerMillion != null) {
      costPerInputTokenUsd = enrichment.inputPricePerMillion / 1_000_000;
      costPerOutputTokenUsd = enrichment.outputPricePerMillion / 1_000_000;
      priceSource = "catalog";
    } else if (catalogRow?.inputPricePerMillion != null && catalogRow.outputPricePerMillion != null) {
      costPerInputTokenUsd = catalogRow.inputPricePerMillion / 1_000_000;
      costPerOutputTokenUsd = catalogRow.outputPricePerMillion / 1_000_000;
      priceSource = "catalog";
    }

    const contextWindowTokens =
      enrichment?.contextWindowTokens ??
      catalogRow?.contextWindow;

    const supportsTools = providerSupportsTools(entry.providerId);
    const qualityScore = enrichment?.qualityScore ?? routeQualityTier(routeId);

    candidates.push({
      providerId: entry.providerId,
      modelId: entry.modelId,
      visibleName: entry.modelId,
      qualityScore,
      qualitySource: enrichment?.qualitySource ?? "quality-tier",
      costPerInputTokenUsd,
      costPerOutputTokenUsd,
      priceSource,
      costTier: providerCostTier(entry.providerId),
      contextWindowTokens,
      maxOutputTokens: enrichment?.maxOutputTokens ?? catalogRow?.maxOutputTokens,
      supportsTools,
      supportsVision: enrichment?.supportsVision ?? false,
      supportsStructuredOutput: false,
      supportsStreaming: true,
      supportsReasoning: enrichment?.supportsReasoning,
      latencyClass: deriveLatencyClass(enrichment?.ttftSeconds),
      ttftSeconds: enrichment?.ttftSeconds,
      health: providerHasEnvKey(entry.providerId) ? "healthy" : "unavailable",
      certified: providerCertified(entry.providerId),
      source: enrichment ? "route-profile+model-intelligence" : "route-profile",
    });
  }

  candidates.sort((a, b) =>
    `${a.providerId}:${a.modelId}`.localeCompare(`${b.providerId}:${b.modelId}`),
  );
  return candidates;
}

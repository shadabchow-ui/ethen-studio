/**
 * Canonical, typed projection of the committed Model Intelligence documents.
 *
 * The normalized directory is still the source dataset. This module is the
 * only supported bridge from its document-shaped records to runtime consumers:
 * it preserves unknown values and reports bad records instead of dropping them.
 */
import fs from "node:fs";
import path from "node:path";

import { getModelIntelligenceDataPaths } from "./data-paths";
import type {
  MIModelCapabilities,
  MIModelContext,
  MIModelIdentity,
  MIModelPrice,
  MIModelProfile,
} from "./schemas";
import type { MIProvenance } from "./provenance";

export const MI_CANONICAL_SCHEMA_VERSION = "mi-r1.0";

export interface CanonicalRegistryIssue {
  path: string;
  message: string;
}
export type SourceRecordDispositionKind = "CANONICAL_MODEL" | "AGGREGATE_OR_CATEGORY_RECORD";
export interface SourceRecordDisposition {
  slug: string;
  kind: SourceRecordDispositionKind;
  reason: string;
}
export const MI_SOURCE_RECORD_DISPOSITIONS: Readonly<Record<string, SourceRecordDisposition>> = {
  caching: { slug: "caching", kind: "AGGREGATE_OR_CATEGORY_RECORD", reason: "Provider-comparison prompt-caching analysis; no model identity, provider, or model facts." },
  multilingual: { slug: "multilingual", kind: "AGGREGATE_OR_CATEGORY_RECORD", reason: "Cross-model multilingual benchmark and language leaderboard; no individual model identity or provider." },
};

export interface CanonicalModelRegistry {
  schemaVersion: typeof MI_CANONICAL_SCHEMA_VERSION;
  records: MIModelProfile[];
  issues: CanonicalRegistryIssue[];
  generatedFrom: string;
  sourceRecordCount: number;
  intentionalExclusions: SourceRecordDisposition[];
  unresolvedInvalidRecords: CanonicalRegistryIssue[];
}

interface LegacySpec { key?: unknown; value?: unknown; }
interface LegacyCard { id?: unknown; value?: unknown; unit?: unknown; }
interface LegacyProfile {
  slug?: unknown;
  name?: unknown;
  provider?: unknown;
  release_date?: unknown;
  model_type?: unknown;
  technical_specs?: unknown;
  summary_cards?: unknown;
  source?: { canonical_url?: unknown; source_name?: unknown; normalized_at?: unknown };
}

function providerSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function provenance(raw: LegacyProfile, label: string): MIProvenance {
  const source = raw.source;
  return {
    sourceUrl: asString(source?.canonical_url),
    sourceLabel: asString(source?.source_name) ?? label,
    retrievedAt: asString(source?.normalized_at),
    methodology: "legacy normalized document projection",
    confidence: "medium",
  };
}

function specs(raw: LegacyProfile): Map<string, string> {
  const out = new Map<string, string>();
  if (!Array.isArray(raw.technical_specs)) return out;
  for (const item of raw.technical_specs as LegacySpec[]) {
    const key = asString(item?.key);
    const value = asString(item?.value);
    if (key && value) out.set(key, value);
  }
  return out;
}

function card(raw: LegacyProfile, id: string): LegacyCard | null {
  if (!Array.isArray(raw.summary_cards)) return null;
  return (raw.summary_cards as LegacyCard[]).find((entry) => entry?.id === id) ?? null;
}

function parseNumber(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(/[$,]/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseTokens(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([km])?/i);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  const unit = match[2]?.toLowerCase();
  return unit === "m" ? Math.round(number * 1_000_000) : unit === "k" ? Math.round(number * 1_000) : Math.round(number);
}

function price(raw: LegacyProfile, tier: "input" | "output", source: MIProvenance): MIModelPrice | null {
  const current = card(raw, `${tier}_price`);
  const value = parseNumber(asString(current?.value));
  if (value === null) return null;
  const recordedAt = source.retrievedAt ?? "1970-01-01T00:00:00.000Z";
  return {
    tier,
    priceUsd: value,
    unit: asString(current?.unit) ?? "per 1M tokens",
    effectiveAt: recordedAt,
    recordedAt,
    // A document-normalization date is not proof that a price is current.
    status: "unknown",
    provenance: source,
  };
}

/** Convert one legacy document without inventing static model facts. */
export function projectLegacyProfile(raw: unknown): MIModelProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as LegacyProfile;
  const slug = asString(source.slug);
  const name = asString(source.name);
  const provider = asString(source.provider);
  if (!slug || !name || !provider) return null;

  const recordProvenance = provenance(source, `Model Intelligence legacy profile: ${slug}`);
  const technical = specs(source);
  const identity: MIModelIdentity = {
    id: `mi:${slug}`,
    slug,
    name,
    providerId: providerSlug(provider),
    aliases: [],
    categories: [],
    addedAt: asString(source.release_date) ?? "unknown",
    provenance: recordProvenance,
  };
  const context: MIModelContext = {
    maxTokens: parseTokens(technical.get("context_window") ?? null),
    maxOutputTokens: null,
    supportsStructuredOutput: null,
    provenance: recordProvenance,
  };
  const capabilities: MIModelCapabilities = {
    streaming: null,
    functionCalling: null,
    vision: /\bimage\b/i.test(technical.get("input_modalities") ?? "") ? true : null,
    audio: /\b(audio|speech)\b/i.test(technical.get("input_modalities") ?? "") ? true : null,
    codeExecution: null,
    provenance: recordProvenance,
  };
  const prices = [price(source, "input", recordProvenance), price(source, "output", recordProvenance)].filter((entry): entry is MIModelPrice => entry !== null);
  const unknownFields = [
    context.maxTokens === null ? "context.maxTokens" : null,
    "context.maxOutputTokens",
    "context.supportsStructuredOutput",
    capabilities.streaming === null ? "capabilities.streaming" : null,
    "capabilities.functionCalling",
    "capabilities.codeExecution",
    prices.length === 0 ? "pricing" : null,
    "benchmarks",
  ].filter((entry): entry is string => entry !== null);

  return {
    identity,
    pricing: prices,
    benchmarks: [],
    context,
    capabilities,
    knowledgeCutoff: technical.get("knowledge_cutoff") ?? null,
    displayValue: name,
    provenance: recordProvenance,
    integrity: { allFieldsKnownOrExplicitUnknown: true, unknownFields },
  };
}

/** Read every profile and retain actionable failures in the registry report. */
export function loadCanonicalModelRegistry(cwd = process.cwd()): CanonicalModelRegistry {
  const paths = getModelIntelligenceDataPaths(cwd);
  const issues: CanonicalRegistryIssue[] = [];
  const records: MIModelProfile[] = [];
  const files = fs.readdirSync(paths.profilesDir).filter((file) => file.endsWith(".profile.json")).sort();
  const intentionalExclusions: SourceRecordDisposition[] = [];
  for (const file of files) {
    const slug = file.replace(/\.profile\.json$/, "");
    const disposition = MI_SOURCE_RECORD_DISPOSITIONS[slug];
    if (disposition) {
      intentionalExclusions.push(disposition);
      continue;
    }
    const profilePath = path.join(paths.profilesDir, file);
    try {
      const projected = projectLegacyProfile(JSON.parse(fs.readFileSync(profilePath, "utf8")));
      if (!projected) issues.push({ path: path.join(paths.relativeRoot, "profiles", file), message: "Missing required legacy identity fields" });
      else records.push(projected);
    } catch (error) {
      issues.push({ path: path.join(paths.relativeRoot, "profiles", file), message: error instanceof Error ? error.message : "Unreadable profile" });
    }
  }
  return { schemaVersion: MI_CANONICAL_SCHEMA_VERSION, records, issues, generatedFrom: paths.relativeRoot, sourceRecordCount: files.length, intentionalExclusions, unresolvedInvalidRecords: issues };
}

/**
 * ETHEN-READY-039 — Ingestion / Normalization Validation.
 *
 * Validates raw profile JSON against the canonical MIModelProfile schema.
 * Deterministic: same input always produces the same output.
 * Never coerces null/unknown to zero/false/empty — uses preserveUnknown
 * from the stale-policy module.
 * Never throws — returns a validation result with errors array.
 */

import type {
  MIModelProfile,
  MIModelIdentity,
  MIModelPrice,
  MIBenchmarkScore,
  MIModelContext,
  MIModelCapabilities,
  MIPriceTier,
  MIPriceStatus,
  MIBenchmarkCategory,
} from "./schemas";
import type { MIProvenance, MIEvidenceState } from "./provenance";
import { createEvidenceState } from "./provenance";
import { preserveUnknown } from "./stale-policy";
import { createHash } from "node:crypto";

// ─── Public Types ───────────────────────────────────────────────────────────

export interface ValidationError {
  /** JSON path to the field that failed validation (e.g. "identity.slug") */
  path: string;
  /** Human-readable description of the problem */
  message: string;
  /** The value that failed validation, if available */
  value: unknown;
  /** Severity — "error" prevents ingestion, "warn" is advisory */
  severity: "error" | "warn";
}

export interface ValidationResult {
  /** True when there are zero error-severity issues */
  valid: boolean;
  /** All issues found during validation (errors + warnings) */
  errors: ValidationError[];
  /** The validated profile, if valid enough to normalize */
  profile: MIModelProfile | null;
  /** Deterministic hash of the normalized output (SHA-256 hex) */
  normalizedHash: string;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isISODate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && v.includes("T");
}

function isOptionalISODate(v: unknown): v is string | null {
  return v === null || v === undefined || isISODate(v);
}

function isArray<T>(v: unknown, itemGuard: (x: unknown) => x is T): v is T[] {
  return Array.isArray(v) && v.every(itemGuard);
}

const VALID_TIERS: MIPriceTier[] = [
  "input", "output", "cache_read", "cache_write", "training", "fine_tuning",
];

const VALID_PRICE_STATUSES: MIPriceStatus[] = ["current", "stale", "unknown"];

const VALID_BENCHMARK_CATEGORIES: MIBenchmarkCategory[] = [
  "reasoning", "knowledge", "coding", "math",
  "language", "vision", "audio", "agentic",
  "safety", "instruction_following", "general",
];

function isValidProvenance(v: unknown): v is MIProvenance {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    (p.sourceUrl === null || typeof p.sourceUrl === "string") &&
    typeof p.sourceLabel === "string" &&
    (p.retrievedAt === null || typeof p.retrievedAt === "string") &&
    (p.methodology === null || typeof p.methodology === "string") &&
    ["high", "medium", "low", "unknown"].includes(String(p.confidence))
  );
}

function validProvenanceOrDefault(
  v: unknown,
  label: string,
): MIProvenance {
  if (isValidProvenance(v)) return v;
  return {
    sourceUrl: null,
    sourceLabel: label,
    retrievedAt: null,
    methodology: null,
    confidence: "unknown",
  };
}

// ─── Deterministic Sort ──────────────────────────────────────────────────────

/**
 * Sort an array of records by a deterministic key using stable sort.
 * Ensures same input always produces same output ordering.
 */
function deterministicSort<T>(
  arr: T[],
  keyFn: (item: T) => string,
): T[] {
  return [...arr].sort((a, b) => keyFn(a).localeCompare(keyFn(b)));
}

// ─── Field Validators ────────────────────────────────────────────────────────

function validateIdentity(
  raw: unknown,
  errors: ValidationError[],
  prefix: string,
): MIModelIdentity | null {
  if (!raw || typeof raw !== "object") {
    errors.push({
      path: prefix,
      message: "identity must be an object",
      value: raw,
      severity: "error",
    });
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Required string fields
  const id = isNonEmptyString(obj.id) ? obj.id : null;
  if (!id) {
    errors.push({
      path: `${prefix}.id`,
      message: "identity.id is required and must be a non-empty string",
      value: obj.id,
      severity: "error",
    });
  }

  const slug = isNonEmptyString(obj.slug) ? obj.slug : null;
  if (!slug) {
    errors.push({
      path: `${prefix}.slug`,
      message: "identity.slug is required and must be a non-empty string",
      value: obj.slug,
      severity: "error",
    });
  }

  const name = isNonEmptyString(obj.name) ? obj.name : null;
  if (!name) {
    errors.push({
      path: `${prefix}.name`,
      message: "identity.name is required and must be a non-empty string",
      value: obj.name,
      severity: "error",
    });
  }

  const providerId = isNonEmptyString(obj.providerId) ? obj.providerId : null;
  if (!providerId) {
    errors.push({
      path: `${prefix}.providerId`,
      message: "identity.providerId is required and must be a non-empty string",
      value: obj.providerId,
      severity: "error",
    });
  }

  // Aliases
  const aliases: string[] = Array.isArray(obj.aliases)
    ? (obj.aliases as unknown[]).filter((a): a is string => typeof a === "string")
    : [];

  // Categories
  const categories: string[] = Array.isArray(obj.categories)
    ? (obj.categories as unknown[]).filter((a): a is string => typeof a === "string")
    : [];

  // MI-P0-02: missing factual time stays unknown — never substituted with now().
  const addedAt = isNonEmptyString(obj.addedAt) ? obj.addedAt : "unknown";

  const provenance = validProvenanceOrDefault(
    obj.provenance,
    `identity provenance for ${slug ?? "unknown"}`,
  );

  return {
    id: id ?? "unknown",
    slug: slug ?? "unknown",
    name: name ?? "unknown",
    providerId: providerId ?? "unknown",
    aliases,
    categories,
    addedAt,
    provenance,
  };
}

function validatePricing(
  raw: unknown,
  errors: ValidationError[],
  prefix: string,
): MIModelPrice[] {
  if (!Array.isArray(raw)) {
    errors.push({
      path: `${prefix}.pricing`,
      message: "pricing must be an array",
      value: raw,
      severity: "warn",
    });
    return [];
  }

  return raw.map((item, idx): MIModelPrice => {
    const itemPrefix = `${prefix}.pricing[${idx}]`;
    if (!item || typeof item !== "object") {
      errors.push({
        path: itemPrefix,
        message: "price entry must be an object, substituting default",
        value: item,
        severity: "warn",
      });
      return defaultPrice();
    }

    const obj = item as Record<string, unknown>;
    const tier = VALID_TIERS.includes(obj.tier as MIPriceTier)
      ? (obj.tier as MIPriceTier)
      : "input";

    const priceUsdRaw = preserveUnknown(
      typeof obj.priceUsd === "number" ? (obj.priceUsd as number) : null,
    );

    const unit = isNonEmptyString(obj.unit) ? obj.unit : "per 1M tokens";

    const effectiveAt = isNonEmptyString(obj.effectiveAt) ? obj.effectiveAt : new Date().toISOString();
    const recordedAt = isNonEmptyString(obj.recordedAt) ? obj.recordedAt : effectiveAt;

    const status = VALID_PRICE_STATUSES.includes(obj.status as MIPriceStatus)
      ? (obj.status as MIPriceStatus)
      : "unknown";

    const provenance = validProvenanceOrDefault(
      obj.provenance,
      `price ${tier} for entry ${idx}`,
    );

    return {
      tier,
      priceUsd: priceUsdRaw.known ? priceUsdRaw.value : null,
      unit,
      effectiveAt,
      recordedAt,
      status,
      provenance,
    };
  });
}

function defaultPrice(): MIModelPrice {
  return {
    tier: "input",
    priceUsd: null,
    unit: "per 1M tokens",
    effectiveAt: new Date().toISOString(),
    recordedAt: new Date().toISOString(),
    status: "unknown",
    provenance: {
      sourceUrl: null,
      sourceLabel: "Default unknown price",
      retrievedAt: null,
      methodology: null,
      confidence: "unknown",
    },
  };
}

function validateBenchmarks(
  raw: unknown,
  errors: ValidationError[],
  prefix: string,
): MIBenchmarkScore[] {
  if (!Array.isArray(raw)) {
    errors.push({
      path: `${prefix}.benchmarks`,
      message: "benchmarks must be an array",
      value: raw,
      severity: "warn",
    });
    return [];
  }

  return raw.map((item, idx): MIBenchmarkScore => {
    const itemPrefix = `${prefix}.benchmarks[${idx}]`;
    if (!item || typeof item !== "object") {
      errors.push({
        path: itemPrefix,
        message: "benchmark entry must be an object, substituting default",
        value: item,
        severity: "warn",
      });
      return defaultBenchmark();
    }

    const obj = item as Record<string, unknown>;

    const benchmarkId = isNonEmptyString(obj.benchmarkId) ? obj.benchmarkId : `benchmark_${idx}`;
    const benchmarkName = isNonEmptyString(obj.benchmarkName) ? obj.benchmarkName : benchmarkId;

    const category = VALID_BENCHMARK_CATEGORIES.includes(obj.category as MIBenchmarkCategory)
      ? (obj.category as MIBenchmarkCategory)
      : "general";

    const scoreRaw = preserveUnknown(
      typeof obj.score === "number" ? (obj.score as number) : null,
    );

    const displayValue = isNonEmptyString(obj.displayValue)
      ? obj.displayValue
      : scoreRaw.known ? String(scoreRaw.value) : "Unknown";

    const recordedAt = isNonEmptyString(obj.recordedAt) ? obj.recordedAt : new Date().toISOString();
    const isStale = typeof obj.isStale === "boolean" ? obj.isStale : false;

    const provenance = validProvenanceOrDefault(
      obj.provenance,
      `benchmark ${benchmarkId}`,
    );

    return {
      benchmarkId,
      benchmarkName,
      category,
      score: scoreRaw.known ? scoreRaw.value : null,
      displayValue,
      recordedAt,
      isStale,
      provenance,
    };
  });
}

function defaultBenchmark(): MIBenchmarkScore {
  return {
    benchmarkId: "unknown",
    benchmarkName: "Unknown Benchmark",
    category: "general",
    score: null,
    displayValue: "Unknown",
    recordedAt: new Date().toISOString(),
    isStale: true,
    provenance: {
      sourceUrl: null,
      sourceLabel: "Default unknown benchmark",
      retrievedAt: null,
      methodology: null,
      confidence: "unknown",
    },
  };
}

function validateContext(
  raw: unknown,
  errors: ValidationError[],
  prefix: string,
): MIModelContext {
  if (!raw || typeof raw !== "object") {
    errors.push({
      path: `${prefix}.context`,
      message: "context must be an object, using defaults",
      value: raw,
      severity: "warn",
    });
    return defaultContext();
  }

  const obj = raw as Record<string, unknown>;

  const maxTokensRaw = preserveUnknown(
    typeof obj.maxTokens === "number" ? (obj.maxTokens as number) : null,
  );
  const maxOutputTokensRaw = preserveUnknown(
    typeof obj.maxOutputTokens === "number" ? (obj.maxOutputTokens as number) : null,
  );
  const supportsStructuredOutputRaw = preserveUnknown(
    typeof obj.supportsStructuredOutput === "boolean" ? (obj.supportsStructuredOutput as boolean) : null,
  );

  const provenance = validProvenanceOrDefault(
    obj.provenance,
    "context",
  );

  return {
    maxTokens: maxTokensRaw.known ? maxTokensRaw.value : null,
    maxOutputTokens: maxOutputTokensRaw.known ? maxOutputTokensRaw.value : null,
    supportsStructuredOutput: supportsStructuredOutputRaw.known ? supportsStructuredOutputRaw.value : null,
    provenance,
  };
}

function defaultContext(): MIModelContext {
  return {
    maxTokens: null,
    maxOutputTokens: null,
    supportsStructuredOutput: null,
    provenance: {
      sourceUrl: null,
      sourceLabel: "Default unknown context",
      retrievedAt: null,
      methodology: null,
      confidence: "unknown",
    },
  };
}

function validateCapabilities(
  raw: unknown,
  errors: ValidationError[],
  prefix: string,
): MIModelCapabilities {
  if (!raw || typeof raw !== "object") {
    errors.push({
      path: `${prefix}.capabilities`,
      message: "capabilities must be an object, using defaults",
      value: raw,
      severity: "warn",
    });
    return defaultCapabilities();
  }

  const obj = raw as Record<string, unknown>;

  const streaming = preserveUnknown(
    typeof obj.streaming === "boolean" ? (obj.streaming as boolean) : null,
  );
  const functionCalling = preserveUnknown(
    typeof obj.functionCalling === "boolean" ? (obj.functionCalling as boolean) : null,
  );
  const vision = preserveUnknown(
    typeof obj.vision === "boolean" ? (obj.vision as boolean) : null,
  );
  const audio = preserveUnknown(
    typeof obj.audio === "boolean" ? (obj.audio as boolean) : null,
  );
  const codeExecution = preserveUnknown(
    typeof obj.codeExecution === "boolean" ? (obj.codeExecution as boolean) : null,
  );

  const provenance = validProvenanceOrDefault(
    obj.provenance,
    "capabilities",
  );

  return {
    streaming: streaming.known ? streaming.value : null,
    functionCalling: functionCalling.known ? functionCalling.value : null,
    vision: vision.known ? vision.value : null,
    audio: audio.known ? audio.value : null,
    codeExecution: codeExecution.known ? codeExecution.value : null,
    provenance,
  };
}

function defaultCapabilities(): MIModelCapabilities {
  return {
    streaming: null,
    functionCalling: null,
    vision: null,
    audio: null,
    codeExecution: null,
    provenance: {
      sourceUrl: null,
      sourceLabel: "Default unknown capabilities",
      retrievedAt: null,
      methodology: null,
      confidence: "unknown",
    },
  };
}

// ─── Deterministic Normalization ─────────────────────────────────────────────

/**
 * Deterministically normalize a validated MIModelProfile.
 * Same input always produces the same output — sorts arrays by stable keys.
 * Never mutates the input.
 */
export function normalizeProfile(
  profile: MIModelProfile,
): MIModelProfile {
  return {
    ...profile,
    pricing: deterministicSort(profile.pricing, (p) => `${p.tier}|${p.effectiveAt}|${String(p.priceUsd)}`),
    benchmarks: deterministicSort(profile.benchmarks, (b) => `${b.benchmarkId}|${b.recordedAt}`),
    identity: {
      ...profile.identity,
      aliases: [...profile.identity.aliases].sort(),
      categories: [...profile.identity.categories].sort(),
    },
  };
}

// ─── Hash Computation ────────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hash from the normalized JSON.
 * The JSON is serialized with sorted keys for full determinism.
 */
function computeNormalizedHash(profile: MIModelProfile): string {
  const json = JSON.stringify(profile, Object.keys(profile).sort());
  return createHash("sha256").update(json).digest("hex");
}

// ─── Main Validation Entry Point ─────────────────────────────────────────────

/**
 * Normalize a legacy flat-format profile into the canonical nested shape.
 *
 * Legacy flat format (on-disk, not yet migrated):
 *   { "slug": "gpt-4o", "name": "GPT-4o (Nov)", "provider": "OpenAI", ... }
 *
 * Canonical format (what the validators expect):
 *   { "identity": { "slug": "gpt-4o", "name": "...", "providerId": "openai", ... },
 *     "pricing": [...], "benchmarks": [...], ... }
 *
 * Provider normalization follows the same rule used in aliases.ts and read-api.ts:
 *   provider.toLowerCase().replace(/[^a-z0-9]+/g, "-")
 *
 * @param raw The raw parsed JSON object (mutated only in the return, never in place)
 * @returns A canonical-format object ready for validateModelProfile
 */
function normalizeLegacyProfile(obj: Record<string, unknown>): Record<string, unknown> {
  const providerRaw = typeof obj.provider === "string" ? obj.provider : "";
  const providerId = providerRaw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, ""); // strip leading/trailing dashes

  const slug = typeof obj.slug === "string" ? obj.slug : "";
  const name = typeof obj.name === "string" ? obj.name : slug;

  // Build identity from legacy top-level fields
  const identity: Record<string, unknown> = {
    id: slug,
    slug,
    name,
    providerId: providerId || "unknown",
    aliases: Array.isArray(obj.aliases)
      ? (obj.aliases as unknown[]).filter((a): a is string => typeof a === "string")
      : [],
    categories: Array.isArray(obj.categories)
      ? (obj.categories as unknown[]).filter((c): c is string => typeof c === "string")
      : [],
    addedAt: typeof obj.release_date === "string"
      ? tryParseAsIsoDate(obj.release_date) ?? "unknown"
      : "unknown",
    provenance: {
      sourceUrl: null,
      sourceLabel: `Legacy profile: ${slug}`,
      retrievedAt: null,
      methodology: null,
      confidence: "unknown" as const,
    },
  };

  // Extract knowledge cutoff from release_date if present
  const knowledgeCutoff = typeof obj.release_date === "string"
    ? tryParseAsIsoDate(obj.release_date)
    : null;

  // Build provenance from legacy source field
  const provenance: Record<string, unknown> = {
    sourceUrl: typeof obj.source === "object" && obj.source !== null
      ? (obj.source as Record<string, unknown>).url ?? null
      : null,
    sourceLabel: typeof obj.source === "string"
      ? obj.source
      : typeof obj.source === "object" && obj.source !== null
        ? String((obj.source as Record<string, unknown>).url ?? "")
        : `Legacy profile: ${slug}`,
    retrievedAt: null,
    methodology: null,
    confidence: "unknown",
  };

  return {
    identity,
    pricing: obj.pricing ?? [],
    benchmarks: obj.benchmarks ?? [],
    context: obj.context ?? null,
    capabilities: obj.capabilities ?? null,
    knowledgeCutoff,
    displayValue: name || "Unknown",
    provenance,
  };
}

/**
 * Attempt to parse a free-form date string into an ISO-8601 date.
 * Returns null if the string cannot be parsed.
 */
function tryParseAsIsoDate(raw: string): string | null {
  try {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Validate a raw (unknown) profile against the canonical MIModelProfile schema.
 *
 * Deterministic: same input always produces the same normalized output.
 * Never coerces null/unknown to zero/false/empty — uses preserveUnknown().
 * Never throws — returns a ValidationResult with an errors array.
 *
 * @param raw The raw profile value to validate (typically parsed JSON)
 * @returns A ValidationResult containing errors, the validated profile, and hash
 */
export function validateModelProfile(
  raw: unknown,
): ValidationResult {
  const errors: ValidationError[] = [];

  // Top-level guard
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({
      path: "$",
      message: "profile must be a non-null object",
      value: raw,
      severity: "error",
    });
    return {
      valid: false,
      errors,
      profile: null,
      normalizedHash: "",
    };
  }

  const obj = raw as Record<string, unknown>;

  // ── Legacy flat-format adapter ──
  // Detect flat format: has top-level `slug` and/or `name` but no `identity` key.
  // The existing index and alias code already handles both formats; this adapter
  // brings the same compatibility to the ingestion/validation layer.
  const hasCanonicalIdentity = obj.identity !== undefined && obj.identity !== null;
  const hasLegacySlug = typeof obj.slug === "string";
  if (!hasCanonicalIdentity && hasLegacySlug) {
    const adapted = normalizeLegacyProfile(obj);
    return validateModelProfile(adapted); // Recurse with adapted canonical shape
  }

  // ── identity ──
  const identity = validateIdentity(obj.identity, errors, "$");

  // ── pricing ──
  const pricing = validatePricing(obj.pricing, errors, "$");

  // ── benchmarks ──
  const benchmarks = validateBenchmarks(obj.benchmarks, errors, "$");

  // ── context ──
  const context = validateContext(obj.context, errors, "$");

  // ── capabilities ──
  const capabilities = validateCapabilities(obj.capabilities, errors, "$");

  // ── scalar top-level fields ──
  const knowledgeCutoff = isOptionalISODate(obj.knowledgeCutoff) ? (obj.knowledgeCutoff ?? null) : null;
  const displayValue = isNonEmptyString(obj.displayValue) ? obj.displayValue : "Unknown";

  const provenance = validProvenanceOrDefault(obj.provenance, "top-level profile");

  // ── integrity check: count unknown fields ──
  const unknownFields: string[] = [];

  if (identity && identity.slug === "unknown") unknownFields.push("identity.slug");
  if (identity && identity.name === "unknown") unknownFields.push("identity.name");
  if (pricing.length === 0) unknownFields.push("pricing");
  if (benchmarks.length === 0) unknownFields.push("benchmarks");
  if (!isNonEmptyString(obj.knowledgeCutoff)) unknownFields.push("knowledgeCutoff");

  // Build the profile
  const profile: MIModelProfile = {
    identity: identity ?? {
      id: "unknown",
      slug: "unknown",
      name: "Unknown",
      providerId: "unknown",
      aliases: [],
      categories: [],
      addedAt: "unknown",
      provenance: {
        sourceUrl: null,
        sourceLabel: "Default identity",
        retrievedAt: null,
        methodology: null,
        confidence: "unknown" as const,
      },
    },
    pricing,
    benchmarks,
    context,
    capabilities,
    knowledgeCutoff,
    displayValue,
    provenance,
    integrity: {
      allFieldsKnownOrExplicitUnknown: unknownFields.length === 0,
      unknownFields,
    },
  };

  // Normalize deterministically
  const normalized = normalizeProfile(profile);
  const normalizedHash = computeNormalizedHash(normalized);

  const hasErrors = errors.some((e) => e.severity === "error");

  return {
    valid: !hasErrors,
    errors,
    profile: normalized,
    normalizedHash,
  };
}

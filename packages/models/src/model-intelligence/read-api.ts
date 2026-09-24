/**
 * ETHEN-READY-039 — Typed Read API with Pagination.
 *
 * Server-only read API for the Model Intelligence data authority.
 * Provides typed access to models, providers, benchmarks, and pricing
 * with offset/limit-based pagination, stable sorting, and cache invalidation
 * timestamps.
 *
 * All functions work against the committed data on disk
 * (data/model-intelligence/normalized) via data-paths.ts.
 */

import "server-only";

import fs from "node:fs";
import path from "node:path";

import {
  getModelIntelligenceDataPaths,
  assertModelIntelligenceDataPresent,
  readModelIntelligenceIndexRaw,
} from "./data-paths";
import type {
  MIModelProfile,
  MIIndexEntry,
  MIIndex,
  MIProvider,
  MIBenchmarkScore,
  MIModelPrice,
} from "./schemas";
import type { MIEvidenceState } from "./provenance";
import { validateModelProfile } from "./ingestion";
import { evaluatePriceStatus, isBenchmarkStale } from "./stale-policy";

// ─── Public Types ───────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  regeneratedAt: string;
}

export interface ListModelsOptions {
  provider?: string;
  category?: string;
  search?: string;
  offset?: number;
  limit?: number;
}

export interface ListBenchmarksOptions {
  category?: string;
  modelSlug?: string;
  stale?: boolean;
  offset?: number;
  limit?: number;
}

export interface ListPricesOptions {
  modelSlug?: string;
  tier?: string;
  stale?: boolean;
  offset?: number;
  limit?: number;
}

// ─── Internal State ─────────────────────────────────────────────────────────

let _indexCache: MIIndex | null = null;
let _providerCache: Map<string, MIProvider> | null = null;

// ─── Index Helpers ──────────────────────────────────────────────────────────

function getIndex(): MIIndex {
  if (_indexCache) return _indexCache;

  const raw = readModelIntelligenceIndexRaw();
  // The on-disk index has a different shape (ModelIndex) than MIIndex.
  // We do a best-effort read for the regeneratedAt / profiles, falling back
  // gracefully so the read API doesn't depend on a specific index.bin format.
  const obj = raw as Record<string, unknown>;

  const rawProfiles = obj.profiles;
  let profiles: MIIndexEntry[] = [];
  if (Array.isArray(rawProfiles)) {
    profiles = rawProfiles.map((entry: unknown) => {
      const e = entry as Record<string, unknown>;
      return {
        slug: typeof e.slug === "string" ? e.slug : "",
        name: typeof e.name === "string" ? e.name : "",
        providerId: typeof e.providerId === "string"
          ? e.providerId
          : typeof e.provider === "string" ? e.provider.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "",
        providerName: typeof e.providerName === "string"
          ? e.providerName
          : typeof e.provider === "string" ? e.provider : "",
        profilePath: typeof e.profilePath === "string" ? e.profilePath : `profiles/${e.slug}.profile.json`,
        pagePath: typeof e.pagePath === "string" ? e.pagePath : `pages/${e.slug}.page.json`,
        categories: Array.isArray(e.categories) ? (e.categories as string[]).filter((c): c is string => typeof c === "string") : [],
        regeneratedAt: typeof e.regeneratedAt === "string"
          ? e.regeneratedAt
          : typeof obj.generated_at === "string" ? obj.generated_at : new Date().toISOString(),
        regeneratedFromCommit: typeof e.regeneratedFromCommit === "string"
          ? e.regeneratedFromCommit
          : typeof obj.regeneratedFromCommit === "string" ? obj.regeneratedFromCommit : "",
      } as MIIndexEntry;
    });
  }

  const index: MIIndex = {
    profiles,
    regeneratedAt: typeof obj.regeneratedAt === "string"
      ? obj.regeneratedAt
      : typeof obj.generated_at === "string" ? obj.generated_at : new Date().toISOString(),
    regeneratedFromCommit: typeof obj.regeneratedFromCommit === "string"
      ? obj.regeneratedFromCommit
      : typeof obj.regeneratedFromCommit === "string" ? obj.regeneratedFromCommit : "",
    schemaVersion: typeof obj.schemaVersion === "string" ? obj.schemaVersion : "1.0",
  };

  _indexCache = index;
  return index;
}

/** Invalidate the index cache (e.g., after data regeneration). */
export function invalidateCache(): void {
  _indexCache = null;
  _providerCache = null;
}

// ─── Provider Helpers ───────────────────────────────────────────────────────

/**
 * Build a provider map from the index entries, deriving provider metadata
 * from the profile entries themselves.
 */
function getProviders(): Map<string, MIProvider> {
  if (_providerCache) return _providerCache;

  const index = getIndex();
  const providerMap = new Map<string, MIProvider>();

  for (const entry of index.profiles) {
    const pid = entry.providerId || entry.providerName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (!providerMap.has(pid)) {
      providerMap.set(pid, {
        id: pid,
        name: entry.providerName,
        slug: pid,
        addedAt: entry.regeneratedAt,
        provenance: {
          sourceUrl: null,
          sourceLabel: `Provider: ${entry.providerName}`,
          retrievedAt: null,
          methodology: null,
          confidence: "unknown",
        },
      });
    }
  }

  _providerCache = providerMap;
  return providerMap;
}

// ─── Model Helpers ──────────────────────────────────────────────────────────

/**
 * Read a single model profile from disk by slug.
 * Validates and normalizes the profile against the MIModelProfile schema.
 * Returns null if the profile doesn't exist or fails critical validation.
 */
export function getModel(slug: string): MIModelProfile | null {
  const paths = getModelIntelligenceDataPaths();
  const profilePath = path.join(paths.profilesDir, `${slug}.profile.json`);

  let raw: string;
  try {
    raw = fs.readFileSync(profilePath, "utf-8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = validateModelProfile(parsed);
  return result.profile;
}

/**
 * List models with optional filtering and pagination.
 *
 * Filters:
 *   - provider: filter by providerId (exact match)
 *   - category: filter by category (exact match against entry.categories)
 *   - search: case-insensitive substring match against name and slug
 *
 * Sorting: stable — primary sort by slug, secondary by name.
 * Pagination: offset/limit-based with total count and hasMore flag.
 */
export function listModels(options?: ListModelsOptions): PaginatedResult<MIModelProfile> {
  const index = getIndex();
  const paths = getModelIntelligenceDataPaths();
  const {
    provider,
    category,
    search,
    offset = 0,
    limit = 20,
  } = options ?? {};

  // Gather all model slugs matching filters
  let candidates = index.profiles;

  if (provider) {
    const providerLower = provider.toLowerCase();
    candidates = candidates.filter(
      (e) => e.providerId.toLowerCase() === providerLower,
    );
  }

  if (category) {
    const categoryLower = category.toLowerCase();
    candidates = candidates.filter(
      (e) => e.categories.some((c) => c.toLowerCase() === categoryLower),
    );
  }

  if (search) {
    const query = search.toLowerCase();
    candidates = candidates.filter(
      (e) =>
        e.slug.toLowerCase().includes(query) ||
        e.name.toLowerCase().includes(query),
    );
  }

  // Stable sort: primary by slug, secondary by name
  candidates = [...candidates].sort((a, b) => {
    const bySlug = a.slug.localeCompare(b.slug);
    if (bySlug !== 0) return bySlug;
    return a.name.localeCompare(b.name);
  });

  const total = candidates.length;
  const sliced = candidates.slice(offset, offset + limit);

  // Load and validate each profile
  const data: MIModelProfile[] = [];
  for (const entry of sliced) {
    const profile = getModel(entry.slug);
    if (profile) {
      data.push(profile);
    }
  }

  return {
    data,
    total,
    offset,
    limit,
    hasMore: offset + limit < total,
    regeneratedAt: index.regeneratedAt,
  };
}

/**
 * Get provider metadata by providerId.
 * Returns null if no models are associated with that provider.
 */
export function getProvider(providerId: string): MIProvider | null {
  const providers = getProviders();
  return providers.get(providerId) ?? null;
}

/**
 * List all known providers with model counts.
 */
export function listProviders(): Array<MIProvider & { modelCount: number }> {
  const providers = getProviders();
  const index = getIndex();

  const counts = new Map<string, number>();
  for (const entry of index.profiles) {
    const pid = entry.providerId;
    counts.set(pid, (counts.get(pid) || 0) + 1);
  }

  return Array.from(providers.entries()).map(([id, provider]) => ({
    ...provider,
    modelCount: counts.get(id) ?? 0,
  }));
}

// ─── Benchmark Helpers ──────────────────────────────────────────────────────

/**
 * Return benchmark data with optional filtering.
 * By default only returns non-stale benchmarks (pass stale: true to include all).
 */
export function getBenchmarks(
  options?: ListBenchmarksOptions,
): PaginatedResult<MIBenchmarkScore> {
  const index = getIndex();
  const paths = getModelIntelligenceDataPaths();
  const {
    category,
    modelSlug,
    stale = false,
    offset = 0,
    limit = 50,
  } = options ?? {};

  const allScores: MIBenchmarkScore[] = [];

  // Determine which model profiles to scan
  const slugsToScan = modelSlug
    ? [modelSlug]
    : index.profiles.map((e) => e.slug);

  for (const slug of slugsToScan) {
    const profile = getModel(slug);
    if (!profile) continue;

    for (const score of profile.benchmarks) {
      // Category filter
      if (category && score.category !== category) continue;

      // Stale filter
      if (!stale && score.isStale) continue;

      allScores.push(score);
    }
  }

  // Stable sort by benchmarkId, then recordedAt
  allScores.sort((a, b) => {
    const byId = a.benchmarkId.localeCompare(b.benchmarkId);
    if (byId !== 0) return byId;
    return a.recordedAt.localeCompare(b.recordedAt);
  });

  const total = allScores.length;
  const data = allScores.slice(offset, offset + limit);

  return {
    data,
    total,
    offset,
    limit,
    hasMore: offset + limit < total,
    regeneratedAt: index.regeneratedAt,
  };
}

// ─── Pricing Helpers ─────────────────────────────────────────────────────────

/**
 * Return pricing data with optional filtering.
 * By default only returns current (non-stale) prices (pass stale: true to include all).
 */
export function getPrices(
  options?: ListPricesOptions,
): PaginatedResult<MIModelPrice> {
  const index = getIndex();
  const {
    modelSlug,
    tier,
    stale = false,
    offset = 0,
    limit = 50,
  } = options ?? {};

  const allPrices: MIModelPrice[] = [];

  const slugsToScan = modelSlug
    ? [modelSlug]
    : index.profiles.map((e) => e.slug);

  for (const slug of slugsToScan) {
    const profile = getModel(slug);
    if (!profile) continue;

    for (const price of profile.pricing) {
      // Tier filter
      if (tier && price.tier !== tier) continue;

      // Stale filter: use evaluatePriceStatus from stale-policy
      if (!stale) {
        const status = evaluatePriceStatus(price);
        if (status !== "current") continue;
      }

      allPrices.push(price);
    }
  }

  // Stable sort by tier, then effectiveAt
  allPrices.sort((a, b) => {
    const byTier = a.tier.localeCompare(b.tier);
    if (byTier !== 0) return byTier;
    return a.effectiveAt.localeCompare(b.effectiveAt);
  });

  const total = allPrices.length;
  const data = allPrices.slice(offset, offset + limit);

  return {
    data,
    total,
    offset,
    limit,
    hasMore: offset + limit < total,
    regeneratedAt: index.regeneratedAt,
  };
}

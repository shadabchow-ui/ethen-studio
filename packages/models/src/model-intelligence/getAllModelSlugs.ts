/**
 * lib/model-intelligence/getAllModelSlugs.ts
 * Read the committed Model Intelligence data authority index.json
 * (data/model-intelligence/normalized/index.json).
 * Return all model slugs + metadata for static params and search lists.
 */
import "server-only";

import {
  readModelIntelligenceIndexRaw,
} from "./data-paths";

export interface ModelIndexEntry {
  slug: string;
  name: string;
  provider: string;
  model_type: string;
  release_date: string;
  chart_count: number;
  faq_count: number;
  summary_card_count: number;
  quality_flags: string[];
}

export interface ModelIndex {
  generated_at: string;
  counts: {
    profiles_generated: number;
    page_specs_generated: number;
    chart_specs_generated: number;
    profiles_with_faqs: number;
    profiles_with_charts: number;
    failed_pages: number;
  };
  quality: {
    flags: Record<string, number>;
    providers: Record<string, number>;
    model_types: Record<string, number>;
    average_charts_per_profile: number;
    average_faqs_per_profile: number;
  };
  profiles: ModelIndexEntry[];
}

let _cachedIndex: ModelIndex | null = null;

export function getModelIndex(): ModelIndex {
  if (_cachedIndex) return _cachedIndex;
  _cachedIndex = readModelIntelligenceIndexRaw() as ModelIndex;
  return _cachedIndex;
}

/** Test seam: clear the process-local index cache. */
export function clearModelIndexCache(): void {
  _cachedIndex = null;
}

export function getAllModelSlugs(): string[] {
  return getModelIndex().profiles.map((p) => p.slug);
}

export function getAllModelEntries(): ModelIndexEntry[] {
  return getModelIndex().profiles;
}

export function getModelEntryBySlug(slug: string): ModelIndexEntry | undefined {
  return getModelIndex().profiles.find((p) => p.slug === slug);
}

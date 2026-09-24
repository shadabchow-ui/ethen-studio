/**
 * lib/model-intelligence/getModelsByProvider.ts
 * Filter model index entries by provider.
 * Provider slugs use lowercase, spaces → hyphens, dots removed.
 */
import { getAllModelEntries, type ModelIndexEntry } from "./getAllModelSlugs";

/**
 * Normalize a display provider name into a URL-safe slug.
 * E.g. "AI21 Labs" → "ai21-labs",  "NVIDIA" → "nvidia"
 */
export function providerNameToSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/\./g, "");
}

/**
 * Reverse: convert a URL slug back to the display provider name.
 * Returns null if no provider matches.
 */
export function slugToProviderName(slug: string): string | null {
  const all = getAllModelEntries();
  const seen = new Set<string>();
  for (const entry of all) {
    if (!entry.provider || seen.has(entry.provider)) continue;
    seen.add(entry.provider);
    if (providerNameToSlug(entry.provider) === slug) {
      return entry.provider;
    }
  }
  return null;
}

/**
 * Get all unique provider names from the index (excluding empty).
 */
export function getAllProviderNames(): string[] {
  const all = getAllModelEntries();
  const set = new Set<string>();
  for (const entry of all) {
    if (entry.provider) set.add(entry.provider);
  }
  return Array.from(set).sort();
}

/**
 * Get all provider slugs for generateStaticParams.
 */
export function getAllProviderSlugs(): string[] {
  return getAllProviderNames().map(providerNameToSlug);
}

/**
 * Get model entries for a provider by its display name.
 */
export function getModelsByProviderName(
  providerName: string,
): ModelIndexEntry[] {
  return getAllModelEntries().filter((e) => e.provider === providerName);
}

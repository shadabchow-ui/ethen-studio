/**
 * ETHEN-READY-039 — Duplicate Alias Reconciliation.
 *
 * Scans all model profiles for duplicate slugs and aliases, building an
 * AliasMap that maps every known alias to its canonical slug.
 *
 * NEVER breaks canonical URLs — aliases only resolve, never replace.
 * Uses MIModelIdentity.aliases from schemas.ts.
 */

import fs from "node:fs";
import path from "node:path";

import { getModelIntelligenceDataPaths } from "./data-paths";
import type { MIModelIdentity } from "./schemas";

// ─── Public Types ───────────────────────────────────────────────────────────

/**
 * Maps every known alias (or slug) to the slug that owns it.
 * Canonical slugs map to themselves.
 */
export type AliasMap = Map<string, string>;

export interface AliasReconciliationResult {
  /** Total number of alias mappings (including self-mappings for canonical slugs) */
  totalAliases: number;
  /** Number of canonical slugs */
  canonicalSlugs: number;
  /** Number of non-self aliases */
  nonSelfAliases: number;
  /** Aliases that map to more than one canonical slug (conflicts) */
  duplicateAliases: Array<{
    alias: string;
    conflictingSlugs: string[];
  }>;
  /** Configs (slugs) that appear as aliases of multiple models */
  slugConflicts: Array<{
    slug: string;
    owners: string[];
  }>;
  /** Warnings about potential issues found during reconciliation */
  warnings: string[];
}

// ─── Core Reconciliation ────────────────────────────────────────────────────

/**
 * Read all model profile files from disk and extract identity information.
 * Returns a map of slug -> MIModelIdentity for every profile.
 */
function readAllIdentities(): Map<string, MIModelIdentity> {
  const paths = getModelIntelligenceDataPaths();
  const identities = new Map<string, MIModelIdentity>();

  if (!fs.existsSync(paths.profilesDir)) {
    return identities;
  }

  const files = fs.readdirSync(paths.profilesDir);

  for (const file of files) {
    if (!file.endsWith(".profile.json")) continue;

    const filePath = path.join(paths.profilesDir, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // Extract identity fields from the profile
      const identityField = parsed.identity as Record<string, unknown> | undefined;

      const slug = slugFromProfile(parsed);
      if (!slug) continue;

      // Extract aliases from identity or from profile-level alias array
      const aliases: string[] = [];
      if (identityField && Array.isArray(identityField.aliases)) {
        for (const a of identityField.aliases) {
          if (typeof a === "string") aliases.push(a);
        }
      }
      // Also check for top-level aliases field (legacy format)
      if (Array.isArray(parsed.aliases)) {
        for (const a of parsed.aliases) {
          if (typeof a === "string" && !aliases.includes(a)) aliases.push(a);
        }
      }

      identities.set(slug, {
        id: typeof identityField?.id === "string" ? identityField.id : slug,
        slug,
        name: typeof identityField?.name === "string"
          ? identityField.name
          : typeof parsed.name === "string" ? parsed.name : slug,
        providerId: typeof identityField?.providerId === "string"
          ? identityField.providerId
          : typeof parsed.provider === "string" ? parsed.provider.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "unknown",
        aliases,
        categories: Array.isArray(identityField?.categories)
          ? (identityField.categories as string[]).filter((c): c is string => typeof c === "string")
          : [],
        addedAt: typeof identityField?.addedAt === "string"
          ? identityField.addedAt
          : new Date().toISOString(),
        provenance: {
          sourceUrl: null,
          sourceLabel: `Reconciliation scan: ${slug}`,
          retrievedAt: null,
          methodology: null,
          confidence: "unknown",
        },
      });
    } catch {
      // Skip malformed profiles
    }
  }

  return identities;
}

/**
 * Extract slug from a profile JSON object.
 * Checks identity.slug first, then top-level slug.
 */
function slugFromProfile(parsed: Record<string, unknown>): string | null {
  const identityField = parsed.identity as Record<string, unknown> | undefined;

  if (identityField && typeof identityField.slug === "string") {
    return identityField.slug;
  }

  if (typeof parsed.slug === "string") {
    return parsed.slug;
  }

  return null;
}

/**
 * Reconcile all aliases across the dataset.
 *
 * Scans all profiles, builds a map of alias -> canonical slug,
 * and detects conflicts (same alias pointing to multiple slugs).
 *
 * NEVER breaks canonical URLs — alias mappings only resolve,
 * they never replace the canonical slug on disk.
 *
 * @returns An AliasReconciliationResult with the alias map and any conflicts
 */
export function reconcileAliases(): {
  map: AliasMap;
  result: AliasReconciliationResult;
} {
  const identities = readAllIdentities();
  const map: AliasMap = new Map();
  const canonicalSlugs = new Set<string>();
  const aliasToOwners = new Map<string, string[]>();
  const slugToOwners = new Map<string, string[]>();
  const warnings: string[] = [];

  // Phase 1: Build reverse index of alias -> owners
  for (const [slug, identity] of identities) {
    canonicalSlugs.add(slug);

    // Self-mapping
    const existingSlug = map.get(slug);
    if (existingSlug && existingSlug !== slug) {
      // Slug is already mapped to another canonical slug — conflict
      const owners = slugToOwners.get(slug) ?? [];
      if (!owners.includes(existingSlug)) owners.push(existingSlug);
      if (!owners.includes(slug)) owners.push(slug); // the slug IS one of its owners
      slugToOwners.set(slug, owners);
    }
    map.set(slug, slug);

    // Process each alias
    for (const alias of identity.aliases) {
      if (!alias || alias === slug) continue;

      const existing = aliasToOwners.get(alias) ?? [];
      if (!existing.includes(slug)) {
        existing.push(slug);
      }
      aliasToOwners.set(alias, existing);

      // If this alias happens to also be a canonical slug of another model, flag it
      if (canonicalSlugs.has(alias) && alias !== slug) {
        const owners = slugToOwners.get(alias) ?? [];
        if (!owners.includes(slug)) owners.push(slug);
        slugToOwners.set(alias, owners);
      }
    }
  }

  // Phase 2: Resolve — assign each alias to exactly one owner (first wins)
  // and detect duplicates
  const duplicateAliases: AliasReconciliationResult["duplicateAliases"] = [];
  const slugConflicts: AliasReconciliationResult["slugConflicts"] = [];

  for (const [alias, owners] of aliasToOwners) {
    if (owners.length > 1) {
      duplicateAliases.push({ alias, conflictingSlugs: owners });
      warnings.push(
        `Duplicate alias "${alias}" owned by: ${owners.join(", ")}. ` +
        "Canonical resolution is blocked until the conflict is curated.",
      );
      // Conflicts are not valid canonical identities. Do not pick a winner.
      map.delete(alias);
      continue;
    }
    map.set(alias, owners[0]);
  }

  for (const [slug, owners] of slugToOwners) {
    if (owners.length > 1) {
      slugConflicts.push({ slug, owners });
      warnings.push(
        `Slug "${slug}" is both a canonical slug for one model and an alias of: ${owners.join(", ")}. ` +
        `This means "${slug}" cannot unambiguously identify a single model.`,
      );
      map.delete(slug);
    }
  }

  let nonSelfAliases = 0;
  for (const [alias, canonical] of map) {
    if (alias !== canonical) nonSelfAliases++;
  }

  return {
    map,
    result: {
      totalAliases: map.size,
      canonicalSlugs: canonicalSlugs.size,
      nonSelfAliases,
      duplicateAliases,
      slugConflicts,
      warnings,
    },
  };
}

/**
 * Resolve an alias to its canonical slug.
 * Returns the canonical slug if found, or null if unknown.
 *
 * @param alias The slug or alias to resolve
 * @returns The canonical slug, or null if not found
 */
export function resolveCanonicalSlug(
  alias: string,
  map?: AliasMap,
): string | null {
  const aliasMap = map ?? reconcileAliases().map;
  return aliasMap.get(alias) ?? null;
}

/**
 * Get all aliases that resolve to a given canonical slug.
 * Returns an empty array if the slug is unknown.
 */
export function getAliasesForSlug(
  slug: string,
  map?: AliasMap,
): string[] {
  const aliasMap = map ?? reconcileAliases().map;
  const aliases: string[] = [];

  for (const [alias, canonical] of aliasMap) {
    if (canonical === slug && alias !== slug) {
      aliases.push(alias);
    }
  }

  return aliases.sort();
}

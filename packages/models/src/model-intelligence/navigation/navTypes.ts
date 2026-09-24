/**
 * lib/model-intelligence/navigation/navTypes.ts
 * Type definitions for Model Intelligence navigation taxonomy.
 */
import type { ReactNode } from "react";

/** Badge variants for nav items */
export type MINavBadge = "new" | "soon" | "beta" | "preview" | string;

/** A single navigation item, optionally nested */
export interface MINavItem {
  label: string;
  href: string;
  description?: string;
  badge?: MINavBadge;
  count?: number;
  children?: MINavItem[];
}

/** A top-level navigation group */
export interface MINavGroup {
  label: string;
  description?: string;
  href?: string;
  items: MINavItem[];
}

// ---------------------------------------------------------------------------
// Category taxonomy types
// ---------------------------------------------------------------------------

/** Known model category keys. Maps to available categories in the normalized data. */
export type ModelCategoryKey =
  | "open-weight"
  | "proprietary"
  | "reasoning"
  | "coding"
  | "vision"
  | "long-context"
  | "low-cost"
  | "fastest";

/** A category definition with metadata */
export interface ModelCategoryDef {
  key: ModelCategoryKey;
  label: string;
  description: string;
  href: string;
}

// ---------------------------------------------------------------------------
// Leaderboard / metric taxonomy types
// ---------------------------------------------------------------------------

/** Known leaderboard metric keys */
export type LeaderboardMetricKey =
  | "intelligence"
  | "speed"
  | "latency"
  | "input-price"
  | "output-price"
  | "context-window"
  | "cost-per-task";

/** A leaderboard metric definition */
export interface LeaderboardMetricDef {
  key: LeaderboardMetricKey;
  label: string;
  description: string;
  href: string;
  /** The corresponding summary card label in normalized profiles */
  summaryCardLabel?: string;
}

// ---------------------------------------------------------------------------
// Provider entry type
// ---------------------------------------------------------------------------

/** A derived provider entry from normalized data */
export interface MIProviderEntry {
  name: string;
  slug: string;
  modelCount: number;
}

// ---------------------------------------------------------------------------
// Model entry with extended fields for navigation helpers
// ---------------------------------------------------------------------------

/** Extended model entry used by data helpers */
export interface MIModelNavEntry {
  slug: string;
  name: string;
  provider: string;
  modelType: string;
  chartCount: number;
  faqCount: number;
  qualityFlags: string[];
  /** Inferred categories for this model */
  categories?: ModelCategoryKey[];
}

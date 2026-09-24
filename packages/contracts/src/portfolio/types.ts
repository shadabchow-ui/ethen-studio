/**
 * SOL-04 — Canonical portfolio registry types.
 *
 * Sole schema for product taxonomy, lifecycle, route ownership, capabilities,
 * and product-vs-template classification. Discovery surfaces must read from
 * this schema rather than local hard-coded product lists.
 */

/** Explicit lifecycle vocabulary (GPT Sol portfolio + reconciled plan). */
export const PRODUCT_LIFECYCLES = [
  "available",
  "beta",
  "private-beta",
  "private-alpha",
  "preview",
  "setup-required",
  "unavailable",
  "retired",
] as const;

export type ProductLifecycle = (typeof PRODUCT_LIFECYCLES)[number];

/**
 * Claim strength for evidence-bound lifecycle checks.
 * Higher = stronger public readiness claim. A registry entry may not declare
 * a lifecycle stronger than its evidence supports.
 *
 * Private lifecycle states are intentional enrollment gating, not GA claims.
 */
export const LIFECYCLE_CLAIM_STRENGTH: Record<ProductLifecycle, number> = {
  available: 5,
  beta: 4,
  preview: 3,
  "setup-required": 2,
  "private-beta": 2,
  "private-alpha": 2,
  unavailable: 1,
  retired: 0,
};

/** Release hierarchy groups from the reconciled implementation plan. */
export const HIERARCHY_GROUPS = [
  "workspaces",
  "platform",
  "shared-capabilities",
  "fleet",
  "supporting",
] as const;

export type HierarchyGroup = (typeof HIERARCHY_GROUPS)[number];

/**
 * Kind of surface in the portfolio.
 * - workspace: user-facing work surface (Model, Code, Research, Security, Studio)
 * - platform: Gateway, Models, Usage, Policies, Credentials, Audit, Projects, …
 * - shared-capability: Ethen Auto, Computer Use, local runtimes, MCP, …
 * - template: Fleet solution pack only — never owns a runtime family
 * - supporting: acquisition/data surfaces (Model Intelligence)
 */
export const PRODUCT_KINDS = [
  "workspace",
  "platform",
  "shared-capability",
  "template",
  "fleet",
  "supporting",
] as const;

export type ProductKind = (typeof PRODUCT_KINDS)[number];

/** Template vs product classification for marketing/Fleet. */
export type PortfolioClassification = "product" | "template" | "capability";

/** Discovery surfaces that must not invent product truth locally. */
export const DISCOVERY_SURFACES = [
  "navigation",
  "command-palette",
  "sitemap",
  "search",
  "fleet",
  "marketing",
] as const;

export type DiscoverySurface = (typeof DISCOVERY_SURFACES)[number];

export type NavBadge = "soon" | "new" | "preview" | "beta" | "mock";

export interface PortfolioNavConfig {
  section: string;
  icon: string;
  order: number;
  badge?: NavBadge;
  label?: string;
}

export interface PortfolioEvidence {
  /**
   * Strongest lifecycle this entry may claim given current repository evidence.
   * Must be set explicitly; never inferred from route presence alone.
   */
  maxLifecycle: ProductLifecycle;
  /** Whether a first-class app route exists for the canonical path. */
  routeExists: boolean;
  /** Human-readable evidence notes (audit-backed, not marketing copy). */
  notes: string;
}

export interface PortfolioVisibility {
  navigation: boolean;
  "command-palette": boolean;
  sitemap: boolean;
  search: boolean;
  fleet: boolean;
  marketing: boolean;
}

/**
 * One registry entry — the sole product-truth record.
 */
export interface PortfolioEntry {
  /** Stable id (e.g. "model", "code", "gateway"). */
  id: string;
  /** User-facing display name. */
  displayName: string;
  kind: ProductKind;
  hierarchyGroup: HierarchyGroup;
  /**
   * Owning workspace id for templates/capabilities, or self id for workspaces.
   * Platform entries use "platform". Required for every entry.
   */
  owningWorkspace: string;
  /** Canonical product route (console or marketing primary). */
  canonicalRoute: string;
  /** Compatibility / alias routes owned by this entry. */
  routeAliases: readonly string[];
  /** Optional consolidation target for aliases when the entry is an internal capability. */
  compatibilityTarget?: string;
  /**
   * URL path prefixes this entry owns for consistency checks
   * (e.g. "/code", "/ai-gateway").
   */
  productNamespaces: readonly string[];
  lifecycle: ProductLifecycle;
  requiredCapabilities: readonly string[];
  /** Provider dependency ids; empty when none or unknown. */
  providerDependencies: readonly string[];
  classification: PortfolioClassification;
  visibility: PortfolioVisibility;
  /** Optional primary-nav presentation. */
  nav?: PortfolioNavConfig;
  /** Marketing product path when applicable (e.g. "/products/code"). */
  marketingRoute?: string;
  /** Seed-agent slug when this entry maps to Fleet/agent catalogue. */
  agentSlug?: string;
  /** Short one-line description for marketing modules / dropdowns. */
  oneline?: string;
  evidence: PortfolioEvidence;
}

export type PortfolioEntryInput = Omit<PortfolioEntry, "routeAliases" | "productNamespaces" | "requiredCapabilities" | "providerDependencies"> & {
  routeAliases?: readonly string[];
  productNamespaces?: readonly string[];
  requiredCapabilities?: readonly string[];
  providerDependencies?: readonly string[];
};

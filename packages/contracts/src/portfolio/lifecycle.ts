/**
 * SOL-04 — Lifecycle vocabulary helpers and visibility rules.
 */

import {
  LIFECYCLE_CLAIM_STRENGTH,
  PRODUCT_LIFECYCLES,
  type DiscoverySurface,
  type PortfolioEntry,
  type ProductLifecycle,
} from "./types";

/** Map registry lifecycle → marketing/hero badge label. */
export function lifecycleToHeroStatus(
  lifecycle: ProductLifecycle,
): "Live" | "Preview" | "Setup Required" | "Private Alpha" {
  switch (lifecycle) {
    case "available":
      return "Live";
    case "private-alpha":
      return "Private Alpha";
    case "private-beta":
      return "Preview";
    case "setup-required":
      return "Setup Required";
    case "beta":
    case "preview":
    case "unavailable":
    case "retired":
    default:
      return "Preview";
  }
}

/** Map registry lifecycle → nav badge (only when useful). */
export function lifecycleToNavBadge(
  lifecycle: ProductLifecycle,
): "beta" | "preview" | "soon" | undefined {
  switch (lifecycle) {
    case "beta":
      return "beta";
    case "preview":
    case "setup-required":
      return "preview";
    case "private-alpha":
    case "private-beta":
      return undefined;
    case "retired":
    case "unavailable":
      return "soon";
    default:
      return undefined;
  }
}

export function isKnownLifecycle(value: unknown): value is ProductLifecycle {
  return (
    typeof value === "string" &&
    (PRODUCT_LIFECYCLES as readonly string[]).includes(value)
  );
}

/**
 * Evidence-bound check: declared lifecycle must not exceed max evidence.
 * available may only be claimed when evidence.maxLifecycle is available.
 */
export function lifecycleWithinEvidence(
  lifecycle: ProductLifecycle,
  maxLifecycle: ProductLifecycle,
): boolean {
  return LIFECYCLE_CLAIM_STRENGTH[lifecycle] <= LIFECYCLE_CLAIM_STRENGTH[maxLifecycle];
}

/**
 * Whether an entry may appear on a discovery surface.
 * Hidden / retired / unavailable never appear on public discovery.
 */
export function isVisibleOnSurface(
  entry: PortfolioEntry,
  surface: DiscoverySurface,
): boolean {
  if (entry.lifecycle === "retired" || entry.lifecycle === "unavailable") {
    return false;
  }
  return entry.visibility[surface] === true;
}

/** Surfaces used for "leakage" tests (public discovery). */
export const PUBLIC_DISCOVERY_SURFACES: readonly DiscoverySurface[] = [
  "navigation",
  "command-palette",
  "sitemap",
  "search",
  "fleet",
  "marketing",
] as const;

/**
 * Pre-launch / hidden products that must not leak into discovery.
 * private-alpha may appear only when visibility explicitly allows a surface
 * (e.g. enrolled Security). By default registry sets all public surfaces false.
 */
export function isHiddenFromPublicDiscovery(entry: PortfolioEntry): boolean {
  return PUBLIC_DISCOVERY_SURFACES.every((s) => !entry.visibility[s]);
}

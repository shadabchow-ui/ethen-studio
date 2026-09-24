/**
 * Portfolio and flagship consumers for navigation, palette, sitemap, search,
 * footer, marketing, and legacy Fleet compatibility.
 *
 * FOUNDATION-01: flagship discovery projects from
 * CANONICAL_FLAGSHIP_RUNTIME_MAP. The broader portfolio registry remains the
 * authority for utility, administrative, marketing, and compatibility routes.
 */

import type { NavItemConfig, NavSection, CommandItem } from "@ethen/navigation";
import { CANONICAL_FLAGSHIP_RUNTIME_MAP } from "./flagship-map";
import { lifecycleToHeroStatus, lifecycleToNavBadge, isVisibleOnSurface } from "./lifecycle";
import {
  getFleetVisibleAgentSlugs,
  getPortfolioEntry,
  getPortfolioEntryByAgentSlug,
  listFleetTemplates,
  listVisiblePortfolio,
  PORTFOLIO_REGISTRY,
  resolvePortfolioEntryForPath,
} from "./registry";
import type { PortfolioEntry, ProductLifecycle } from "./types";

const FLAGSHIP_ICON_BY_ID: Readonly<Record<string, string>> = {
  "ethen-auto": "chats",
  research: "search",
  code: "terminal",
  "local-models": "models",
  "computer-use": "grid",
  sentinel: "shield",
  studio: "sparkle",
  voice: "chats",
  automation: "tasks",
  designer: "sparkle",
  founder: "star",
  gateway: "permissions",
  "model-intelligence": "models",
  "gpu-compute": "terminal",
};

const FLAGSHIP_REGISTRY_IDS = new Set(
  CANONICAL_FLAGSHIP_RUNTIME_MAP.map((product) => product.registryId),
);
const FLAGSHIP_ROUTES = new Set(
  CANONICAL_FLAGSHIP_RUNTIME_MAP.map((product) => product.canonicalRoute),
);

function flagshipToNavItem(
  product: (typeof CANONICAL_FLAGSHIP_RUNTIME_MAP)[number],
): NavItemConfig {
  return {
    id: product.id,
    label: product.displayName,
    icon: FLAGSHIP_ICON_BY_ID[product.id] ?? "grid",
    href: product.canonicalRoute,
    badge: lifecycleToNavBadge(product.lifecycle) ?? undefined,
  };
}

/** Build primary sidebar sections from the canonical flagship map plus utilities. */
export function buildNavSectionsFromPortfolio(): NavSection[] {
  const productSection: NavSection = {
    label: "Products",
    items: CANONICAL_FLAGSHIP_RUNTIME_MAP.map(flagshipToNavItem),
  };

  const visibleUtilities = listVisiblePortfolio("navigation").filter(
    (entry) =>
      entry.nav &&
      !FLAGSHIP_REGISTRY_IDS.has(entry.id) &&
      !FLAGSHIP_ROUTES.has(entry.canonicalRoute),
  );
  const bySection = new Map<string, PortfolioEntry[]>();

  for (const entry of visibleUtilities) {
    const section = entry.nav!.section;
    const list = bySection.get(section) ?? [];
    list.push(entry);
    bySection.set(section, list);
  }

  const sectionOrder = [
    "New work",
    "Projects",
    "Platform",
    "Library",
    "Admin",
    "Build",
    "System",
  ];

  const sections: NavSection[] = [productSection];
  const seen = new Set<string>();

  for (const label of sectionOrder) {
    const items = bySection.get(label);
    if (!items?.length) continue;
    seen.add(label);
    items.sort((a, b) => (a.nav?.order ?? 0) - (b.nav?.order ?? 0));
    sections.push({
      label,
      items: items.map(entryToNavItem),
    });
  }

  for (const [label, items] of bySection) {
    if (seen.has(label)) continue;
    items.sort((a, b) => (a.nav?.order ?? 0) - (b.nav?.order ?? 0));
    sections.push({
      label,
      items: items.map(entryToNavItem),
    });
  }

  return sections;
}

function entryToNavItem(entry: PortfolioEntry): NavItemConfig {
  const badge = entry.nav?.badge ?? lifecycleToNavBadge(entry.lifecycle) ?? undefined;
  return {
    id: entry.id,
    label: entry.nav?.label ?? entry.displayName,
    icon: entry.nav?.icon ?? "grid",
    href: entry.canonicalRoute,
    badge,
  };
}

/** Command-palette product actions derived from the fourteen-product map. */
export function buildProductCommandItemsFromPortfolio(): CommandItem[] {
  return CANONICAL_FLAGSHIP_RUNTIME_MAP.map((product) => ({
    id: `flagship-${product.id}`,
    label: product.displayName,
    group: "Navigate",
    href: product.canonicalRoute,
    hint: product.description,
  }));
}

/** Command-center product group derived from the same flagship authority. */
export function buildCommandCenterAgentItemsFromPortfolio(): Array<{
  id: string;
  label: string;
  hint: string;
  href?: string;
  agentSlug?: string;
}> {
  return CANONICAL_FLAGSHIP_RUNTIME_MAP.map((product) => ({
    id: `cc-${product.id}`,
    label: product.displayName,
    hint: product.description,
    href: product.canonicalRoute,
    agentSlug: product.agentSlug,
  }));
}

/** Marketing module cards for homepage / product dropdown. */
export function buildMarketingModulesFromPortfolio(): Array<{
  id: string;
  href: string;
  name: string;
  badgeColor: string;
  status: string;
  description: string;
  oneline: string;
}> {
  return listVisiblePortfolio("marketing")
    .filter((e) => e.classification === "product" && e.kind !== "supporting")
    .map((entry) => ({
      id: entry.id,
      href: entry.marketingRoute ?? entry.canonicalRoute,
      name: entry.displayName,
      badgeColor: "border-white/[0.08] text-white/50 bg-white/[0.02]",
      status: lifecycleToHeroStatus(entry.lifecycle),
      description: entry.oneline ?? entry.displayName,
      oneline: entry.oneline ?? entry.displayName,
    }));
}

/** Compact product dropdown modules (marketing header / legacy ProductDropdown). */
export function buildProductDropdownModulesFromPortfolio(): Array<{
  label: string;
  href: string;
  oneline: string;
}> {
  return buildMarketingModulesFromPortfolio().map((m) => ({
    label: m.name.startsWith("Ethen") ? m.name : `Ethen ${m.name}`,
    href: m.href,
    oneline: m.oneline,
  }));
}

/**
 * Filter marketing taxonomy product pages by registry marketing visibility.
 * Non-product taxonomy pages pass through unchanged.
 */
export function isMarketingHrefVisible(href: string): boolean {
  if (href === "/products" || href === "/platform" || href === "/") return true;
  if (!href.startsWith("/products/") && !href.startsWith("/ethen/")) {
    const entry = resolvePortfolioEntryForPath(href);
    if (!entry) return true;
    return isVisibleOnSurface(entry, "marketing") || isVisibleOnSurface(entry, "sitemap");
  }

  const byMarketing = PORTFOLIO_REGISTRY.find((e) => e.marketingRoute === href);
  if (byMarketing) return isVisibleOnSurface(byMarketing, "marketing");

  const byPath = resolvePortfolioEntryForPath(
    href.replace(/^\/products\//, "/").replace(/^\/ethen\//, "/"),
  );
  const marketingMap: Record<string, string> = {
    "/products/code": "code",
    "/products/api": "gateway",
    "/products/cybersecurity": "security",
    "/products/computer": "computer-use",
    "/products/local": "local-models",
    "/products/cortex": "model",
    "/products/workflow": "automation",
    "/products/studio": "studio",
  };
  const id = marketingMap[href];
  if (id) {
    const entry = getPortfolioEntry(id);
    if (!entry) return false;
    return isVisibleOnSurface(entry, "marketing");
  }

  if (byPath) return isVisibleOnSurface(byPath, "marketing");
  return false;
}

/** Sitemap: include only registry-visible marketing/sitemap entries for product paths. */
export function isSitemapHrefVisible(href: string): boolean {
  if (href.startsWith("/products/") || href.startsWith("/ethen/")) {
    return isMarketingHrefVisible(href);
  }
  const entry = resolvePortfolioEntryForPath(href);
  if (!entry) return true;
  return isVisibleOnSurface(entry, "sitemap");
}

/** Search index filter for marketing search destinations. */
export function isSearchHrefVisible(href: string): boolean {
  if (href.startsWith("/products/") || href.startsWith("/ethen/")) {
    return isMarketingHrefVisible(href);
  }
  const entry = resolvePortfolioEntryForPath(href);
  if (!entry) return true;
  return isVisibleOnSurface(entry, "search");
}

/** Footer uses the same registry truth as search; no independent product list. */
export function isFooterHrefVisible(href: string): boolean {
  return isSearchHrefVisible(href);
}

/** Legacy agent-marketplace compatibility. Not used by canonical Fleet. */
export function isAgentSlugFleetVisible(slug: string): boolean {
  const entry = getPortfolioEntryByAgentSlug(slug);
  if (!entry) return false;
  return (
    (entry.classification === "template" || entry.classification === "product") &&
    isVisibleOnSurface(entry, "fleet")
  );
}

/** Legacy agent-marketplace compatibility. Not used by canonical Fleet. */
export function filterAgentsForFleet<T extends { slug: string }>(agents: T[]): T[] {
  const allowed = getFleetVisibleAgentSlugs();
  return agents.filter((a) => allowed.has(a.slug));
}

/** Lifecycle for a product id — used by ProductPageTemplate / temporary-lifecycle bridge. */
export function getLifecycleForProductId(id: string): ProductLifecycle | undefined {
  return getPortfolioEntry(id)?.lifecycle;
}

/** Hero status from portfolio id or marketing route. */
export function resolveHeroStatusFromPortfolio(input: {
  productId?: string;
  marketingRoute?: string;
  pathname?: string;
}): "Live" | "Preview" | "Setup Required" | "Private Alpha" {
  let entry: PortfolioEntry | undefined;
  if (input.productId) entry = getPortfolioEntry(input.productId);
  if (!entry && input.marketingRoute) {
    entry = PORTFOLIO_REGISTRY.find((e) => e.marketingRoute === input.marketingRoute);
  }
  if (!entry && input.pathname) {
    entry = resolvePortfolioEntryForPath(input.pathname);
  }
  if (!entry) return "Preview";
  return lifecycleToHeroStatus(entry.lifecycle);
}

export function listFleetTemplateSummaries(): Array<{
  id: string;
  displayName: string;
  owningWorkspace: string;
  lifecycle: ProductLifecycle;
  agentSlug?: string;
  canonicalRoute: string;
  requiredCapabilities: readonly string[];
  providerDependencies: readonly string[];
  providerState: "setup-required" | "unknown";
  approvalNeeds: "required" | "unknown";
}> {
  return listFleetTemplates().map((e) => ({
    id: e.id,
    displayName: e.displayName,
    owningWorkspace: e.owningWorkspace,
    lifecycle: e.lifecycle,
    agentSlug: e.agentSlug,
    canonicalRoute: e.canonicalRoute,
    requiredCapabilities: e.requiredCapabilities,
    providerDependencies: e.providerDependencies,
    providerState: e.providerDependencies.length > 0 ? "setup-required" : "unknown",
    approvalNeeds: e.requiredCapabilities.includes("approvals") ? "required" : "unknown",
  }));
}

/** Paths that must never appear in registry-derived discovery lists. */
export function assertNoHiddenLeakage(
  hrefs: readonly string[],
  surface: "navigation" | "command-palette" | "sitemap" | "search" | "fleet" | "marketing",
): string[] {
  const leaks: string[] = [];
  for (const href of hrefs) {
    const entry = resolvePortfolioEntryForPath(href);
    if (!entry) continue;
    if (!isVisibleOnSurface(entry, surface)) {
      leaks.push(`${href} → ${entry.id} (lifecycle=${entry.lifecycle}, surface=${surface})`);
    }
  }
  return leaks;
}

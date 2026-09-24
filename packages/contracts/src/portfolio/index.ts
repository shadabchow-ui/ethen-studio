/**
 * SOL-04 — Public API for the canonical portfolio registry.
 *
 * Import from `@ethen/contracts/portfolio/index` in navigation, marketing, Fleet, sitemap,
 * command palette, and CI validators.
 */

export * from "./types";
export * from "./lifecycle";
export * from "./flagship-map";
export * from "./product-ownership";
export {
  designerAvailabilityDecision,
  getDesignerPortfolioEntry,
  DESIGNER_PRODUCT_ID,
} from "./designer-guard";
export {
  founderAvailabilityDecision,
  getFounderPortfolioEntry,
  FOUNDER_PRODUCT_ID,
  getFounderCapabilityGates,
  founderCapabilityDecision,
  FOUNDER_CAPABILITY_SWITCH_IDS,
  FOUNDER_CAPABILITY_TO_SWITCH,
} from "./founder-guard";
export {
  computerUseAvailabilityDecision,
  getComputerUsePortfolioEntry,
  COMPUTER_USE_PRODUCT_ID,
} from "./computer-use-guard";
export {
  PORTFOLIO_REGISTRY,
  PRODUCT_ROUTE_NAMESPACES,
  getPortfolioRegistry,
  getPortfolioEntry,
  getPortfolioEntryByAgentSlug,
  listPortfolioByKind,
  listVisiblePortfolio,
  listFleetTemplates,
  getFleetVisibleAgentSlugs,
  resolvePortfolioEntryForPath,
  validatePortfolioEntry,
  validatePortfolioRegistry,
} from "./registry";
export {
  buildNavSectionsFromPortfolio,
  buildProductCommandItemsFromPortfolio,
  buildCommandCenterAgentItemsFromPortfolio,
  buildMarketingModulesFromPortfolio,
  buildProductDropdownModulesFromPortfolio,
  isMarketingHrefVisible,
  isSitemapHrefVisible,
  isSearchHrefVisible,
  isFooterHrefVisible,
  isAgentSlugFleetVisible,
  filterAgentsForFleet,
  getLifecycleForProductId,
  resolveHeroStatusFromPortfolio,
  listFleetTemplateSummaries,
  assertNoHiddenLeakage,
} from "./consumers";

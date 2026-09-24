import type { ReactNode } from "react";
import type { MIProvenance } from "./provenance";

export type ModelIntelligenceTemplateKind =
  | "model_profile"
  | "leaderboard"
  | "compare"
  | "provider"
  | "use_case"
  | "calculator"
  | "methodology";

export type MIProviderKey =
  | "current"
  | "openai"
  | "anthropic"
  | "google"
  | "meta"
  | "mistral"
  | "deepseek"
  | "qwen"
  | "alibaba"
  | "nvidia"
  | "xai"
  | "kimi"
  | "unknown";

export type MIMetricKind =
  | "score"
  | "percent"
  | "currency"
  | "tokens"
  | "context"
  | "latency"
  | "speed"
  | "count"
  | "size";

export type MINavLink = {
  label: string;
  href: string;
  active?: boolean;
};

export type MIAction = {
  label: string;
  href?: string;
  variant?: "primary" | "secondary" | "dark";
  icon?: string;
};

/** A dropdown navigation group inside the top nav */
export interface MIDropdownGroup {
  label: string;
  description?: string;
  href?: string;
  items: Array<{
    label: string;
    href: string;
    description?: string;
    badge?: string;
    count?: number;
    disabled?: boolean;
  }>;
}

export type MITopNavSpec = {
  brandLabel: string;
  brandHref?: string;
  /** Optional logo image src (e.g. "/brand/upcube.png") rendered alongside brandLabel */
  brandLogoSrc?: string;
  /** Flat links (rendered as simple text buttons in the nav bar) */
  links: MINavLink[];
  /** Dropdown groups (rendered as hover/popover menus) */
  dropdownGroups?: MIDropdownGroup[];
  actions?: MIAction[];
};

export type MIRailItem = {
  id: string;
  label: string;
};

export type MIHeroMetaItem = {
  label: string;
  icon?: string;
};

export type MITrustChipSpec = {
  label: string;
  value: string;
  tone?: "neutral" | "warning";
};

export type MIHeroSpec = {
  eyebrow?: string;
  eyebrowItems: MIHeroMetaItem[];
  title: string;
  subtitle?: string;
  actions?: MIAction[];
  trustChips?: MITrustChipSpec[];
};

export type MISummaryCardSpec = {
  label: string;
  rank?: string;
  value: string;
  unit?: string;
  hint?: string;
  classAverage?: string;
  icon?: string;
  tone?: "neutral" | "green" | "amber" | "red";
  provenance?: MIProvenance;
};

export type MIVerdictSpec = {
  recommendedRole: string;
  bestFor: string[];
  avoidFor: string[];
  routingRole: string;
  suggestedFallbacks: string[];
  costWarning: string;
};

export type MIModelFitRowSpec = {
  useCase: string;
  fit: "Excellent" | "Strong" | "Moderate" | "Weak" | "Not suitable";
  reason: string;
  routingNote: string;
};

export type MICostPressureSpec = {
  level: "Low" | "Medium" | "High";
  summary: string;
  cheaperSubstitutes: string[];
  routeAwayWhen: string[];
};

export type MISpecTableSpec = {
  comparisonTitle: string;
  comparisonBody: string[];
  specsTitle: string;
  specs: Array<{ label: string; value: string; icon?: string }>;
  footerAction?: string;
};

export type MITabSpec = {
  id: string;
  label: string;
};

export type MIAccordionRowSpec = {
  label: string;
  value?: string;
  detail: string;
};

export type MIBenchmarkBarDatum = {
  label: string;
  value: number;
  provider: MIProviderKey;
  icon?: string;
  highlighted?: boolean;
};

export type MIBenchmarkStackedDatum = {
  label: string;
  provider: MIProviderKey;
  icon?: string;
  highlighted?: boolean;
  segments: Array<{ key: string; value: number; color?: string }>;
};

export type MIBenchmarkScatterDatum = {
  label: string;
  provider: MIProviderKey;
  x: number;
  y: number;
  highlighted?: boolean;
};

export type MIDenseBarChartSpec = {
  type: "dense_bar";
  data: MIBenchmarkBarDatum[];
  metricKind: MIMetricKind;
  visibleCount?: number;
  allowNegative?: boolean;
};

export type MIMiniBarChartSpec = {
  title: string;
  subtitle?: string;
  data: MIBenchmarkBarDatum[];
  metricKind: MIMetricKind;
  visibleCount?: number;
  allowNegative?: boolean;
};

export type MIMiniGridChartSpec = {
  type: "mini_grid";
  charts: MIMiniBarChartSpec[];
};

export type MIStackedBarChartSpec = {
  type: "stacked_bar";
  data: MIBenchmarkStackedDatum[];
  metricKind?: MIMetricKind;
  visibleCount?: number;
};

export type MIScatterChartSpec = {
  type: "scatter";
  data: MIBenchmarkScatterDatum[];
  xLabel: string;
  yLabel: string;
  xMetricKind?: MIMetricKind;
  yMetricKind?: MIMetricKind;
  quadrantLabel?: string;
};

export type MIChartSpec = MIDenseBarChartSpec | MIMiniGridChartSpec | MIStackedBarChartSpec | MIScatterChartSpec;

export type MIChartCardSpec = {
  id?: string;
  title: string;
  subtitle: string;
  tabs?: MITabSpec[];
  defaultTab?: string;
  modelCountLabel?: string;
  footer: string;
  provenance?: MIProvenance;
  accordionRows?: MIAccordionRowSpec[];
  chart: MIChartSpec;
  children?: ReactNode;
};

export type MISectionSpec = {
  id: string;
  title: string;
  description?: string;
  chartCards: MIChartCardSpec[];
};

export type ResearchAction = MIAction;
export type ResearchTopNavSpec = MITopNavSpec;
export type ResearchRailItem = MIRailItem;
export type ResearchTab = MITabSpec;
export type ResearchHeroSpec = MIHeroSpec;
export type ResearchSummaryCard = MISummaryCardSpec;
export type ResearchAccordionRow = MIAccordionRowSpec;
export type ResearchChartSpec = MIChartSpec;
export type ResearchChartCardSpec = MIChartCardSpec;
export type ResearchSpecsTableSpec = MISpecTableSpec;

export type ModelGatewayHeroSpec = {
  eyebrow: string;
  title: string;
  subtitle: string;
  modelCount: number;
  providerCount: number;
  primaryCta?: MIAction;
  secondaryCta?: MIAction;
};

export type ModelGatewayStat = {
  id: string;
  label: string;
  value: string;
  hint?: string;
};

export type ModelGatewayDecisionCard = {
  id: string;
  title: string;
  description: string;
  metricKey: string;
  modelSlug: string | null;
  modelName: string | null;
  provider: string | null;
  value: number | null;
  displayValue: string | null;
  href: string | null;
};

export type ModelGatewayHighlightChart = {
  id: string;
  title: string;
  subtitle: string;
  metricKind: MIMetricKind;
  empty: boolean;
  footer: string;
  chart: MIChartSpec;
  topModelSlug: string | null;
};

export type ModelGatewayRoutingMatrixRow = {
  id: string;
  useCase: string;
  description: string;
  primarySlug: string | null;
  primaryName: string | null;
  fallbackSlug: string | null;
  fallbackName: string | null;
  rationale: string;
};

export type ModelGatewayDirectoryRow = {
  name: string;
  slug: string;
  provider: string;
  type: string | null;
  intelligence: number | null;
  intelligenceDisplay: string | null;
  speed: number | null;
  speedDisplay: string | null;
  inputPrice: number | null;
  inputPriceDisplay: string | null;
  outputPrice: number | null;
  outputPriceDisplay: string | null;
  contextWindow: number | null;
  contextWindowDisplay: string | null;
  costPerTask: number | null;
  costPerTaskDisplay: string | null;
  chartCount: number;
  faqCount: number;
  href: string;
};

export type ModelGatewaySectionSpec = {
  id: string;
  title: string;
  description?: string;
};

export type ModelGatewayGroupSpec = {
  id: string;
  title: string;
  description: string;
  slugs: string[];
};

export type ModelGatewayDeepChartCard = {
  id: string;
  title: string;
  subtitle: string;
  empty: boolean;
  emptyReason?: string;
  footer: string;
  modelCountLabel?: string;
  layout?: "full" | "half" | "mini";
  chart: MIChartSpec | null;
};

export type ModelGatewayDeepSection = {
  id: string;
  title: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
  cards: ModelGatewayDeepChartCard[];
};

export type ModelGatewayOverviewSpec = {
  hero: ModelGatewayHeroSpec;
  stats: ModelGatewayStat[];
  decisionCards: ModelGatewayDecisionCard[];
  highlightCharts: ModelGatewayHighlightChart[];
  routingMatrix: ModelGatewayRoutingMatrixRow[];
  directoryRows: ModelGatewayDirectoryRow[];
  sections: ModelGatewaySectionSpec[];
  deepSections: ModelGatewayDeepSection[];
  groups: ModelGatewayGroupSpec[];
  derivations: string[];
};

export type MIMethodologySpec = {
  title: string;
  summary: string[];
  rows: MIAccordionRowSpec[];
};

export type MIHighlightSpec = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  chartId: string;
  chartTitle: string;
  title: string;
  subtitle: string;
  comparison?: string;
  metricKind: MIMetricKind;
  data: MIBenchmarkBarDatum[];
  anchor: string;
  visibleCount?: number;
};

export type ModelIntelligencePageSpec = {
  kind: ModelIntelligenceTemplateKind;
  topNav: MITopNavSpec;
  rail: MIRailItem[];
  hero: MIHeroSpec;
  summaryCards: MISummaryCardSpec[];
  verdict?: MIVerdictSpec;
  fitMatrix?: MIModelFitRowSpec[];
  costPressure?: MICostPressureSpec;
  specs?: MISpecTableSpec;
  methodology?: MIMethodologySpec;
  highlights?: MIHighlightSpec[];
  sections: MISectionSpec[];
  footer?: string[];
};

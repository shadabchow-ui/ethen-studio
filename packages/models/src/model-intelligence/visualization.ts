/**
 * PR-MI-01 / ETHEN-READY-040 — Model Intelligence: visibility, charts, search, comparisons
 *
 * Chart readability fixes: responsive widths, horizontal bars below threshold,
 * 4-significant-figure price formatting, accessible data-table alternative.
 *
 * Navigation visibility: Model Intelligence set as top-level nav entry.
 * Deep links: context transfer to Console, Gateway, Code, Research, Local Models.
 * Unknown/stale: surfaced visibly instead of hidden or zero-filled.
 */

// ── Price formatting: 4 significant figures ───────────────────────────────────

/**
 * Format a USD price with 4 significant figures so sub-cent prices
 * do not render as "$0.00".
 *
 * Examples:
 *   2.50    → "$2.50"
 *   0.15    → "$0.15"
 *   0.0015  → "$0.0015"
 *   0.00003 → "$0.00003"
 *   1500    → "$1,500"
 *   null    → "Unknown"
 */
export function formatModelPrice(priceUsd: number | null | undefined): string {
  if (priceUsd === null || priceUsd === undefined) return "Unknown";

  if (priceUsd === 0) return "$0";

  // 4 significant figures
  const formatted = priceUsd.toPrecision(4);

  // Parse back to number for locale formatting
  const parsed = parseFloat(formatted);

  // For values >= 1, use locale formatting with 2 decimal places
  if (Math.abs(parsed) >= 1) {
    return `$${parsed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }

  // For values < 1, keep the precision formatting (shows sub-cent values)
  const str = parsed.toPrecision(4);
  // Remove trailing zeros after decimal, but keep at least 2 decimal places
  if (str.includes(".")) {
    const trimmed = str.replace(/0+$/, "");
    const withMin = trimmed.endsWith(".") ? trimmed + "00" : trimmed;
    // Ensure at least 2 decimal places for cents
    const parts = withMin.split(".");
    if (parts.length === 2 && parts[1].length < 2) {
      return `$${withMin}0`;
    }
    return `$${withMin}`;
  }
  return `$${str}.00`;
}

/**
 * Format a price label for chart display.
 * Uses compact notation for chart axis labels.
 */
export function formatChartPrice(priceUsd: number | null | undefined): string {
  if (priceUsd === null || priceUsd === undefined) return "N/A";
  if (priceUsd === 0) return "$0";
  if (priceUsd < 0.0001) return `$${priceUsd.toExponential(2)}`;
  if (priceUsd < 0.01) return `$${priceUsd.toPrecision(3)}`;
  if (priceUsd < 1) return `$${priceUsd.toPrecision(3)}`;
  return `$${priceUsd.toFixed(2)}`;
}

// ── Chart configuration ───────────────────────────────────────────────────────

export type ChartOrientation = "vertical" | "horizontal";

export interface ChartLayoutConfig {
  /** Chart orientation. */
  orientation: ChartOrientation;
  /** Minimum width for vertical bars (px). Below this, use horizontal bars. */
  verticalBarMinWidth: number;
  /** Whether to use compact labels. */
  compactLabels: boolean;
  /** Maximum bars to show before truncating. */
  maxBars: number;
}

const VERTICAL_BAR_MIN_WIDTH = 600;

/**
 * Determine chart layout based on available width.
 * Below VERTICAL_BAR_MIN_WIDTH (600px), horizontal bars are used.
 */
export function getChartLayout(availableWidth: number): ChartLayoutConfig {
  return {
    orientation: availableWidth >= VERTICAL_BAR_MIN_WIDTH ? "vertical" : "horizontal",
    verticalBarMinWidth: VERTICAL_BAR_MIN_WIDTH,
    compactLabels: availableWidth < 800,
    maxBars: availableWidth < 500 ? 10 : 20,
  };
}

/**
 * Get the number of bars to display based on available width.
 */
export function getVisibleBarCount(availableWidth: number, totalBars: number): number {
  const config = getChartLayout(availableWidth);
  return Math.min(totalBars, config.maxBars);
}

// ── Chart accessibility ― accessible data table ──────────────────────────────

export interface DataTableColumn {
  key: string;
  label: string;
  format?: "text" | "number" | "price" | "percentage";
}

export interface DataTableRow {
  [key: string]: string | number | null | undefined;
}

/**
 * Build an accessible data table from chart data.
 * This provides a screen-reader-friendly alternative to the visual chart.
 */
export function buildChartDataTable(
  columns: DataTableColumn[],
  rows: DataTableRow[],
): { headers: string[]; body: string[][]; caption: string } {
  const headers = columns.map((c) => c.label);
  const body = rows.map((row) =>
    columns.map((col) => {
      const val = row[col.key];
      if (val === null || val === undefined) return "—";
      if (col.format === "price" && typeof val === "number") return formatModelPrice(val);
      return String(val);
    }),
  );

  return {
    headers,
    body,
    caption: `Chart data table with ${columns.length} columns and ${rows.length} rows`,
  };
}

// ── Deep-link context ─────────────────────────────────────────────────────────

export interface DeepLinkContext {
  /** Source page providing the link. */
  source: "model-intelligence" | "model-detail" | "benchmark" | "leaderboard" | "category";
  /** Target product receiving the context. */
  target: "console" | "gateway" | "code" | "research" | "local-models";
  /** Model slug being referenced. */
  modelSlug?: string;
  /** Provider ID being referenced. */
  providerId?: string;
  /** Benchmark metric being referenced. */
  metric?: string;
  /** Human-readable label for the link. */
  label: string;
  /** Destination URL. */
  href: string;
  /** Whether the target is available (e.g., has real data). */
  available: boolean;
  /** Reason why the target is not available (if not available). */
  unavailabilityReason?: string;
}

/**
 * Build deep-link contexts from Model Intelligence to other products.
 */
export function buildDeepLinks(input: {
  modelSlug?: string;
  providerId?: string;
  metric?: string;
  category?: string;
}): DeepLinkContext[] {
  const links: DeepLinkContext[] = [];

  // → Console (usage/cost for this model)
  if (input.modelSlug) {
    links.push({
      source: "model-intelligence",
      target: "console",
      modelSlug: input.modelSlug,
      label: "View usage in Console",
      href: `/console?model=${encodeURIComponent(input.modelSlug)}`,
      available: true,
    });
  }

  // → Gateway (provider credentials for this model)
  if (input.providerId) {
    links.push({
      source: "model-intelligence",
      target: "gateway",
      providerId: input.providerId,
      label: "Configure provider in Gateway",
      href: `/ai-gateway/byok?provider=${encodeURIComponent(input.providerId)}`,
      available: true,
    });

    links.push({
      source: "model-intelligence",
      target: "gateway",
      providerId: input.providerId,
      label: "View provider models",
      href: `/ai-gateway/providers/${encodeURIComponent(input.providerId)}`,
      available: true,
    });
  }

  // → Code (agent with this model)
  if (input.modelSlug) {
    links.push({
      source: "model-intelligence",
      target: "code",
      modelSlug: input.modelSlug,
      label: "Use in Code agent",
      href: `/code?model=${encodeURIComponent(input.modelSlug)}`,
      available: true,
    });
  }

  // → Research (benchmarks for this model)
  if (input.modelSlug || input.metric) {
    const params = new URLSearchParams();
    if (input.modelSlug) params.set("model", input.modelSlug);
    if (input.metric) params.set("metric", input.metric);
    links.push({
      source: "model-intelligence",
      target: "research",
      modelSlug: input.modelSlug,
      metric: input.metric,
      label: "View research data",
      href: `/research?${params.toString()}`,
      available: true,
    });
  }

  // → Local Models (compatible local alternative)
  if (input.modelSlug) {
    links.push({
      source: "model-intelligence",
      target: "local-models",
      modelSlug: input.modelSlug,
      label: "Find local alternative",
      href: `/local-models?compatible=${encodeURIComponent(input.modelSlug)}`,
      available: true,
    });
  }

  return links;
}

// ── Search and filter ────────────────────────────────────────────────────────

export interface ModelSearchQuery {
  query: string;
  providerId?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  hasToolCalling?: boolean;
  hasStreaming?: boolean;
  sortBy?: "name" | "price" | "provider" | "date";
  sortDirection?: "asc" | "desc";
}

export interface ModelSearchResult {
  slug: string;
  name: string;
  providerId: string;
  categories: string[];
  priceInput?: number | null;
  priceOutput?: number | null;
  relevance: number;
}

/**
 * Simple model search function.
 * Filters by query, provider, category, price range, and capabilities.
 */
export function searchModels(
  models: ModelSearchResult[],
  query: ModelSearchQuery,
): ModelSearchResult[] {
  let results = [...models];

  // Text search
  if (query.query) {
    const q = query.query.toLowerCase();
    results = results.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.slug.toLowerCase().includes(q) ||
        m.providerId.toLowerCase().includes(q),
    );
  }

  // Provider filter
  if (query.providerId) {
    results = results.filter((m) => m.providerId === query.providerId);
  }

  // Price range
  if (query.minPrice !== undefined) {
    results = results.filter((m) => (m.priceInput ?? 0) >= query.minPrice!);
  }
  if (query.maxPrice !== undefined) {
    results = results.filter((m) => (m.priceInput ?? 0) <= query.maxPrice!);
  }

  // Sort
  if (query.sortBy) {
    const dir = query.sortDirection === "desc" ? -1 : 1;
    results.sort((a, b) => {
      switch (query.sortBy) {
        case "name": return dir * a.name.localeCompare(b.name);
        case "price": return dir * ((a.priceInput ?? 0) - (b.priceInput ?? 0));
        case "provider": return dir * a.providerId.localeCompare(b.providerId);
        default: return 0;
      }
    });
  }

  return results;
}

// ── Model comparison ─────────────────────────────────────────────────────────

export interface ModelComparisonDimension {
  key: string;
  label: string;
  format: "text" | "number" | "price" | "boolean" | "percentage";
}

export interface ModelComparisonRow {
  dimension: ModelComparisonDimension;
  values: Record<string, string | number | boolean | null>;
}

/**
 * Build a model comparison table from multiple models.
 * Each row is a dimension, each column is a model.
 * Unknown/stale values are surfaced as "Unknown" not zero.
 */
export function buildModelComparison(
  dimensions: ModelComparisonDimension[],
  models: Array<{ slug: string; name: string; data: Record<string, unknown> }>,
): ModelComparisonRow[] {
  return dimensions.map((dim) => {
    const values: Record<string, string | number | boolean | null> = {};
    for (const model of models) {
      const raw = model.data[dim.key];
      if (raw === null || raw === undefined) {
        values[model.slug] = "Unknown";
      } else if (dim.format === "price" && typeof raw === "number") {
        values[model.slug] = formatModelPrice(raw);
      } else {
        values[model.slug] = raw as string | number | boolean;
      }
    }
    return { dimension: dim, values };
  });
}

/**
 * lib/model-intelligence/chartInteractionTypes.ts
 * Client-side interaction types for chart card controls.
 *
 * These are the serializable state contracts shared between URL persistence,
 * client controls, and chart/table rendering — never store mutable DOM state.
 */

import type {
  MIChartSpec,
  MIProviderKey,
} from "./modelIntelligenceTypes";

// ---------------------------------------------------------------------------
// View mode
// ---------------------------------------------------------------------------

export type ChartViewMode = "chart" | "table";

export const CHART_VIEW_MODES: ChartViewMode[] = ["chart", "table"];

// ---------------------------------------------------------------------------
// Count selection
// ---------------------------------------------------------------------------

export type ChartCountOption = 10 | 25 | 50;

export const CHART_COUNT_OPTIONS: ChartCountOption[] = [10, 25, 50];

export const CHART_COUNT_ALL = "all" as const;

export type ChartCount = ChartCountOption | typeof CHART_COUNT_ALL;

export function isChartCount(value: unknown): value is ChartCount {
  return (
    value === CHART_COUNT_ALL ||
    (typeof value === "number" &&
      (CHART_COUNT_OPTIONS as readonly number[]).includes(value))
  );
}

export function parseChartCount(raw: string | null): ChartCount {
  if (raw === null) return 10; // default
  if (raw.toLowerCase() === "all") return CHART_COUNT_ALL;
  const n = parseInt(raw, 10);
  if ((CHART_COUNT_OPTIONS as readonly number[]).includes(n)) return n as ChartCountOption;
  return 10; // fallback
}

export function chartCountToNumber(count: ChartCount, totalCount: number): number {
  if (count === CHART_COUNT_ALL) return totalCount;
  return count;
}

// ---------------------------------------------------------------------------
// Sort direction
// ---------------------------------------------------------------------------

export type SortDirection = "asc" | "desc";

export const SORT_DIRECTIONS: SortDirection[] = ["asc", "desc"];

export function parseSortDirection(raw: string | null): SortDirection {
  if (raw === "asc") return "asc";
  return "desc"; // default
}

// ---------------------------------------------------------------------------
// Sort field — which metric to sort by
// ---------------------------------------------------------------------------

/** Fields we can sort bars or stacked bars by. */
export type BarSortField = "label" | "value" | "provider";

/** Fields we can sort scatter charts by. */
export type ScatterSortField = "label" | "x" | "y" | "provider";

export type SortField = BarSortField | ScatterSortField;

export function parseSortField(raw: string | null, chartType: MIChartSpec["type"]): SortField {
  if (chartType === "scatter") {
    if (raw === "x" || raw === "y" || raw === "label" || raw === "provider") return raw;
    return "y"; // default for scatter
  }
  if (raw === "label" || raw === "value" || raw === "provider") return raw;
  return "value"; // default for bars
}

// ---------------------------------------------------------------------------
// Provider filter (set of provider keys to include)
// ---------------------------------------------------------------------------

export const ALL_PROVIDERS_SENTINEL = "__all__" as const;

/**
 * Parse a comma-separated provider filter string.
 * Empty, null, or "all" means show all (no filter).
 */
export function parseProviderFilter(
  raw: string | null,
  availableProviders: readonly MIProviderKey[],
): MIProviderKey[] | null {
  if (!raw || raw === ALL_PROVIDERS_SENTINEL) return null;
  const parts = raw.split(",").map((p) => p.trim().toLowerCase()) as MIProviderKey[];
  const valid = parts.filter((p) =>
    (availableProviders as readonly string[]).includes(p),
  );
  return valid.length > 0 ? valid : null;
}

// ---------------------------------------------------------------------------
// Openness filter
// ---------------------------------------------------------------------------

export type OpennessFilter = "open" | "proprietary" | null;

export function parseOpennessFilter(raw: string | null): OpennessFilter {
  if (raw === "open" || raw === "proprietary") return raw;
  return null;
}

// ---------------------------------------------------------------------------
// Chart interaction state (the complete serializable state bag)
// ---------------------------------------------------------------------------

export interface ChartInteractionState {
  /** Chart id used for URL namespace prefix. */
  chartId: string;
  view: ChartViewMode;
  count: ChartCount;
  sortField: SortField;
  sortDirection: SortDirection;
  providerFilter: MIProviderKey[] | null;
  opennessFilter: OpennessFilter;
  /** Selected comparison model IDs (stable model identifiers). */
  comparisonIds: string[];
}

export function defaultChartInteractionState(chartId: string): ChartInteractionState {
  return {
    chartId,
    view: "chart",
    count: 10,
    sortField: "value",
    sortDirection: "desc",
    providerFilter: null,
    opennessFilter: null,
    comparisonIds: [],
  };
}

// ---------------------------------------------------------------------------
// URL query-parameter namespace helpers
// ---------------------------------------------------------------------------

/**
 * Build query-parameter keys namespaced to a chart section.
 * Example: for chartId="intelligence", count → "intelligence_n"
 */
export function chartParamKey(chartId: string, param: string): string {
  return `${chartId}_${param}`;
}

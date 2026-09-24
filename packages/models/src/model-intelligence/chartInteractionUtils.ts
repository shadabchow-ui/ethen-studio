/**
 * lib/model-intelligence/chartInteractionUtils.ts
 * Pure data manipulation utilities for chart interaction.
 *
 * All functions are:
 *  - Pure (no side effects, no mutations of input arrays)
 *  - Deterministic (stable sort, predictable top-N behavior)
 *  - Independently testable
 */

import type {
  MIBenchmarkBarDatum,
  MIBenchmarkStackedDatum,
  MIBenchmarkScatterDatum,
  MIProviderKey,
} from "./modelIntelligenceTypes";
import type {
  ChartCount,
  SortField,
  SortDirection,
  OpennessFilter,
} from "./chartInteractionTypes";
import { CHART_COUNT_ALL, chartCountToNumber } from "./chartInteractionTypes";

// ---------------------------------------------------------------------------
// Provider extraction from data
// ---------------------------------------------------------------------------

/**
 * Extract unique provider keys from bar chart data, sorted by frequency
 * (most common first) then alphabetically.
 */
export function getBarProviders(
  data: readonly MIBenchmarkBarDatum[],
): MIProviderKey[] {
  const counts = new Map<MIProviderKey, number>();
  for (const d of data) {
    counts.set(d.provider, (counts.get(d.provider) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}

/**
 * Extract unique provider keys from stacked chart data.
 */
export function getStackedProviders(
  data: readonly MIBenchmarkStackedDatum[],
): MIProviderKey[] {
  const counts = new Map<MIProviderKey, number>();
  for (const d of data) {
    counts.set(d.provider, (counts.get(d.provider) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}

/**
 * Extract unique provider keys from scatter chart data.
 */
export function getScatterProviders(
  data: readonly MIBenchmarkScatterDatum[],
): MIProviderKey[] {
  const counts = new Map<MIProviderKey, number>();
  for (const d of data) {
    counts.set(d.provider, (counts.get(d.provider) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}

// ---------------------------------------------------------------------------
// Sorting helpers
// ---------------------------------------------------------------------------

function compareByProvider(a: string, b: string): number {
  return a.localeCompare(b);
}

function stableSort<T>(items: T[], compare: (a: T, b: T) => number): T[] {
  // Use map-index stable sort technique
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const cmp = compare(a.item, b.item);
      return cmp !== 0 ? cmp : a.index - b.index;
    })
    .map(({ item }) => item);
}

/**
 * Sort bar data by the given field and direction.
 * Uses stable sort (preserves original order for equal values).
 * Never mutates the input array.
 */
export function sortBarData(
  data: readonly MIBenchmarkBarDatum[],
  field: SortField,
  direction: SortDirection,
): MIBenchmarkBarDatum[] {
  const dir = direction === "asc" ? 1 : -1;
  return stableSort([...data], (a, b) => {
    switch (field) {
      case "value":
        return dir * (a.value - b.value);
      case "label":
        return dir * a.label.localeCompare(b.label);
      case "provider":
        return dir * compareByProvider(a.provider, b.provider);
      default:
        return 0;
    }
  });
}

/**
 * Sort stacked bar data by total or a specific field.
 */
export function sortStackedData(
  data: readonly MIBenchmarkStackedDatum[],
  field: SortField,
  direction: SortDirection,
): MIBenchmarkStackedDatum[] {
  const dir = direction === "asc" ? 1 : -1;
  return stableSort([...data], (a, b) => {
    switch (field) {
      case "value": {
        const totalA = a.segments.reduce((s, seg) => s + seg.value, 0);
        const totalB = b.segments.reduce((s, seg) => s + seg.value, 0);
        return dir * (totalA - totalB);
      }
      case "label":
        return dir * a.label.localeCompare(b.label);
      case "provider":
        return dir * compareByProvider(a.provider, b.provider);
      default:
        return 0;
    }
  });
}

/**
 * Sort scatter data by the given axis field or label.
 */
export function sortScatterData(
  data: readonly MIBenchmarkScatterDatum[],
  field: SortField,
  direction: SortDirection,
): MIBenchmarkScatterDatum[] {
  const dir = direction === "asc" ? 1 : -1;
  return stableSort([...data], (a, b) => {
    switch (field) {
      case "x":
        return dir * (a.x - b.x);
      case "y":
        return dir * (a.y - b.y);
      case "label":
        return dir * a.label.localeCompare(b.label);
      case "provider":
        return dir * compareByProvider(a.provider, b.provider);
      default:
        return 0;
    }
  });
}

// ---------------------------------------------------------------------------
// Provider filtering
// ---------------------------------------------------------------------------

/**
 * Filter bar data to only include models from selected providers.
 * When filter is null, returns all data (no filter applied).
 */
export function filterBarDataByProvider(
  data: readonly MIBenchmarkBarDatum[],
  filter: MIProviderKey[] | null,
): MIBenchmarkBarDatum[] {
  if (!filter || filter.length === 0) return [...data];
  return data.filter((d) => filter.includes(d.provider));
}

/**
 * Filter stacked data by provider.
 */
export function filterStackedDataByProvider(
  data: readonly MIBenchmarkStackedDatum[],
  filter: MIProviderKey[] | null,
): MIBenchmarkStackedDatum[] {
  if (!filter || filter.length === 0) return [...data];
  return data.filter((d) => filter.includes(d.provider));
}

/**
 * Filter scatter data by provider.
 */
export function filterScatterDataByProvider(
  data: readonly MIBenchmarkScatterDatum[],
  filter: MIProviderKey[] | null,
): MIBenchmarkScatterDatum[] {
  if (!filter || filter.length === 0) return [...data];
  return data.filter((d) => filter.includes(d.provider));
}

// ---------------------------------------------------------------------------
// Openness filtering
// ---------------------------------------------------------------------------

/**
 * Check if a model label suggests open-source.
 * Returns true for known open-weight patterns.
 * This is a heuristic and should not be considered authoritative.
 */
function isOpenModel(label: string): boolean | undefined {
  const l = label.toLowerCase();
  // Known open-weight patterns
  if (
    l.includes("llama") ||
    l.includes("mistral") ||
    l.includes("mixtral") ||
    l.includes("qwen") ||
    l.includes("deepseek") ||
    l.includes("nvidia") ||
    l.includes("nemotron") ||
    l.includes("kimi") ||
    l.includes("gemma") ||
    l.includes("phi") ||
    l.includes("olmo") ||
    l.includes("dbrx") ||
    l.includes("falcon") ||
    l.includes("bloom") ||
    l.includes("yi-") ||
    l.includes("command r") ||
    l.includes("aya")
  )
    return true;
  // Known proprietary patterns
  if (
    l.includes("gpt") ||
    l.includes("claude") ||
    l.includes("gemini") ||
    l.includes("grok")
  )
    return false;
  // Cannot determine reliably
  return undefined;
}

/**
 * Check if a model label is reliably known to be open or proprietary.
 * Only returns true/false when the field is reliable.
 */
export function hasReliableOpenness(label: string): boolean {
  return isOpenModel(label) !== undefined;
}

/**
 * Filter bar data by openness.
 * Only filters when the openness field is reliable for each entry.
 * Entries with unknown openness are included when no filter is applied,
 * and excluded when an openness filter IS applied (conservative approach).
 */
export function filterBarDataByOpenness(
  data: readonly MIBenchmarkBarDatum[],
  filter: OpennessFilter,
): MIBenchmarkBarDatum[] {
  if (filter === null) return [...data];
  return data.filter((d) => {
    const isOpen = isOpenModel(d.label);
    if (isOpen === undefined) return false; // exclude unreliable
    return filter === "open" ? isOpen : !isOpen;
  });
}

/**
 * Filter stacked data by openness.
 */
export function filterStackedDataByOpenness(
  data: readonly MIBenchmarkStackedDatum[],
  filter: OpennessFilter,
): MIBenchmarkStackedDatum[] {
  if (filter === null) return [...data];
  return data.filter((d) => {
    const isOpen = isOpenModel(d.label);
    if (isOpen === undefined) return false;
    return filter === "open" ? isOpen : !isOpen;
  });
}

/**
 * Filter scatter data by openness.
 */
export function filterScatterDataByOpenness(
  data: readonly MIBenchmarkScatterDatum[],
  filter: OpennessFilter,
): MIBenchmarkScatterDatum[] {
  if (filter === null) return [...data];
  return data.filter((d) => {
    const isOpen = isOpenModel(d.label);
    if (isOpen === undefined) return false;
    return filter === "open" ? isOpen : !isOpen;
  });
}

// ---------------------------------------------------------------------------
// Top-N + current-model inclusion
// ---------------------------------------------------------------------------

/**
 * Retain the complete deterministic top-N set and append the current model
 * when it is outside that set. The rendered count may be N+1 when the
 * current model is not already in the top N. Does not mutate input arrays.
 *
 * This is the unified variant that works with any highlightable datum type.
 */
export function ensureCurrentModelIncluded<T extends { highlighted?: boolean }>(
  data: readonly T[],
  capCount: number,
): T[] {
  const topN = data.slice(0, capCount);
  const highlighted = data.find((item) => Boolean(item.highlighted));
  if (!highlighted) return topN;
  if (topN.some((item) => Boolean(item.highlighted))) return topN;
  return [...topN, highlighted];
}

// ---------------------------------------------------------------------------
// Complete data pipeline
// ---------------------------------------------------------------------------

export interface BarDataPipelineInput {
  data: readonly MIBenchmarkBarDatum[];
  count: ChartCount;
  sortField: SortField;
  sortDirection: SortDirection;
  providerFilter: MIProviderKey[] | null;
  opennessFilter: OpennessFilter;
}

/**
 * Run the complete data pipeline for bar chart data:
 * 1. Provider filter
 * 2. Openness filter
 * 3. Sort
 * 4. Top-N selection with current-model inclusion
 *
 * Never mutates input arrays. Returns a new array.
 */
export function runBarDataPipeline(
  input: BarDataPipelineInput,
): MIBenchmarkBarDatum[] {
  const { data, count, sortField, sortDirection, providerFilter, opennessFilter } = input;

  let result: MIBenchmarkBarDatum[];

  // 1. Provider filter
  result = filterBarDataByProvider(data, providerFilter);

  // 2. Openness filter
  result = filterBarDataByOpenness(result, opennessFilter);

  // 3. Sort
  result = sortBarData(result, sortField, sortDirection);

  // 4. Top-N with current-model inclusion
  const cap = chartCountToNumber(count, result.length);
  result = ensureCurrentModelIncluded(result, cap);

  return result;
}

export interface StackedDataPipelineInput {
  data: readonly MIBenchmarkStackedDatum[];
  count: ChartCount;
  sortField: SortField;
  sortDirection: SortDirection;
  providerFilter: MIProviderKey[] | null;
  opennessFilter: OpennessFilter;
}

export function runStackedDataPipeline(
  input: StackedDataPipelineInput,
): MIBenchmarkStackedDatum[] {
  const { data, count, sortField, sortDirection, providerFilter, opennessFilter } = input;

  let result: MIBenchmarkStackedDatum[];

  result = filterStackedDataByProvider(data, providerFilter);
  result = filterStackedDataByOpenness(result, opennessFilter);
  result = sortStackedData(result, sortField, sortDirection);

  const cap = chartCountToNumber(count, result.length);
  result = ensureCurrentModelIncluded(result, cap);

  return result;
}

export interface ScatterDataPipelineInput {
  data: readonly MIBenchmarkScatterDatum[];
  count: ChartCount;
  sortField: SortField;
  sortDirection: SortDirection;
  providerFilter: MIProviderKey[] | null;
  opennessFilter: OpennessFilter;
}

export function runScatterDataPipeline(
  input: ScatterDataPipelineInput,
): MIBenchmarkScatterDatum[] {
  const { data, count, sortField, sortDirection, providerFilter, opennessFilter } = input;

  let result: MIBenchmarkScatterDatum[];

  result = filterScatterDataByProvider(data, providerFilter);
  result = filterScatterDataByOpenness(result, opennessFilter);
  result = sortScatterData(result, sortField, sortDirection);

  const cap = chartCountToNumber(count, result.length);
  result = ensureCurrentModelIncluded(result, cap);

  return result;
}

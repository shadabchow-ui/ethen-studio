/**
 * lib/model-intelligence/chartUrlState.ts
 * URL state serialization and deserialization for chart interaction.
 *
 * Uses a per-chart namespace prefix to avoid collisions between multiple
 * chart cards on the same page. All parsing is safe (invalid values fall
 * back to defaults). Never mutates the router or URL directly — the
 * client component calls replaceState/pushState via next/navigation.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type {
  ChartInteractionState,
  ChartViewMode,
  ChartCount,
  SortField,
  SortDirection,
  OpennessFilter,
} from "./chartInteractionTypes";
import {
  defaultChartInteractionState,
  parseChartCount,
  parseSortField,
  parseSortDirection,
  parseProviderFilter,
  parseOpennessFilter,
  chartParamKey,
} from "./chartInteractionTypes";
import type { MIChartSpec, MIProviderKey } from "./modelIntelligenceTypes";

// ---------------------------------------------------------------------------
// URL parameter parsing
// ---------------------------------------------------------------------------

export interface ParsedChartParams {
  view: ChartViewMode;
  count: ChartCount;
  sortField: SortField;
  sortDirection: SortDirection;
  providerFilter: MIProviderKey[] | null;
  opennessFilter: OpennessFilter;
  comparisonIds: string[];
}

/**
 * Parse chart interaction parameters from URL search params.
 * All invalid values fall back to safe defaults. Never throws.
 */
export function parseChartParamsFromSearchParams(
  sp: URLSearchParams,
  chartId: string,
  chartType: MIChartSpec["type"],
  availableProviders: readonly MIProviderKey[],
): ParsedChartParams {
  const defaults = defaultChartInteractionState(chartId);
  const vk = chartParamKey(chartId, "v");
  const nk = chartParamKey(chartId, "n");
  const sk = chartParamKey(chartId, "s");
  const dk = chartParamKey(chartId, "d");
  const pk = chartParamKey(chartId, "p");
  const ok = chartParamKey(chartId, "o");
  const ck = chartParamKey(chartId, "c");

  // View
  const viewRaw = sp.get(vk);
  const view: ChartViewMode =
    viewRaw === "chart" || viewRaw === "table" ? viewRaw : defaults.view;

  // Count
  const count = parseChartCount(sp.get(nk));

  // Sort field
  const sortField = parseSortField(sp.get(sk), chartType);

  // Sort direction
  const sortDirection = parseSortDirection(sp.get(dk));

  // Provider filter
  const providerFilter = parseProviderFilter(sp.get(pk), availableProviders);

  // Openness filter
  const opennessFilter = parseOpennessFilter(sp.get(ok));

  // Comparison IDs
  const comparisonRaw = sp.get(ck);
  const comparisonIds: string[] = comparisonRaw
    ? comparisonRaw.split(",").map((id: string) => id.trim()).filter(Boolean)
    : [];

  return {
    view,
    count,
    sortField,
    sortDirection,
    providerFilter,
    opennessFilter,
    comparisonIds,
  };
}

/**
 * Serialize chart interaction state to URL search params.
 * Only includes params that differ from defaults to keep URLs clean.
 * Sets on a provided URLSearchParams (or creates fresh) using the namespaced keys.
 *
 * Does NOT call router.replace/push — caller decides navigation behavior.
 */
export function serializeChartStateToParams(
  state: ChartInteractionState,
): URLSearchParams {
  const params = new URLSearchParams();
  const defaults = defaultChartInteractionState(state.chartId);

  if (state.view !== defaults.view) {
    params.set(chartParamKey(state.chartId, "v"), state.view);
  }
  if (state.count !== defaults.count) {
    params.set(chartParamKey(state.chartId, "n"), String(state.count));
  }
  if (state.sortField !== defaults.sortField) {
    params.set(chartParamKey(state.chartId, "s"), state.sortField);
  }
  if (state.sortDirection !== defaults.sortDirection) {
    params.set(chartParamKey(state.chartId, "d"), state.sortDirection);
  }
  if (state.providerFilter !== null && state.providerFilter.length > 0) {
    params.set(
      chartParamKey(state.chartId, "p"),
      state.providerFilter.join(","),
    );
  }
  if (state.opennessFilter !== null) {
    params.set(chartParamKey(state.chartId, "o"), state.opennessFilter);
  }
  if (state.comparisonIds.length > 0) {
    params.set(
      chartParamKey(state.chartId, "c"),
      state.comparisonIds.join(","),
    );
  }

  return params;
}

/**
 * Merge chart state params into existing URL search params.
 * Keeps non-chart params intact. Resets existing chart namespaced keys
 * that are no longer relevant.
 */
export function mergeChartStateIntoUrl(
  currentUrl: string,
  state: ChartInteractionState,
): string {
  const [basePath, queryString] = currentUrl.split("?", 2);
  const existingParams = new URLSearchParams(queryString ?? "");

  // Remove all existing params under this chart's namespace
  const prefix = `${state.chartId}_`;
  for (const key of Array.from(existingParams.keys())) {
    if (key.startsWith(prefix)) {
      existingParams.delete(key);
    }
  }

  // Set new params
  const newParams = serializeChartStateToParams(state);
  for (const [key, value] of newParams.entries()) {
    existingParams.set(key, value);
  }

  const serialized = existingParams.toString();
  return serialized ? `${basePath}?${serialized}` : basePath;
}

/**
 * Build the complete URL (including chart state) for the current page,
 * suitable for clipboard copy.
 */
export function buildPermalinkUrl(
  pathname: string,
  state: ChartInteractionState,
): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://ethen.upcube.ai";
  const url = mergeChartStateIntoUrl(pathname, state);
  return url.startsWith("http") ? url : `${origin}${url}`;
}

// ---------------------------------------------------------------------------
// React hook — live URL ↔ state binding
// ---------------------------------------------------------------------------

export interface UseChartUrlStateOptions {
  chartId: string;
  chartType: MIChartSpec["type"];
  availableProviders: readonly MIProviderKey[];
}

export interface UseChartUrlStateReturn {
  /** Current parsed state from URL (readonly snapshot). */
  state: ChartInteractionState;
  /** Replace current history entry (transient control changes). */
  replaceState: (partial: Partial<ChartInteractionState>) => void;
  /** Push a new history entry (not often used — prefer replaceState). */
  pushState: (partial: Partial<ChartInteractionState>) => void;
  /** Build a permalink URL from the current state. */
  permalinkUrl: string;
  /** Copy permalink to clipboard. */
  copyPermalink: () => Promise<void>;
}

/**
 * React hook that binds chart interaction state to URL search params.
 * Uses `replaceState` for control changes (no unnecessary history entries).
 * Uses `pushState` only when explicitly directed (e.g. comparison selection).
 */
export function useChartUrlState(
  options: UseChartUrlStateOptions,
): UseChartUrlStateReturn {
  const { chartId, chartType, availableProviders } = options;
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state: ChartInteractionState = useMemo(() => {
    const parsed = parseChartParamsFromSearchParams(
      searchParams,
      chartId,
      chartType,
      availableProviders,
    );
    return {
      chartId,
      view: parsed.view,
      count: parsed.count,
      sortField: parsed.sortField,
      sortDirection: parsed.sortDirection,
      providerFilter: parsed.providerFilter,
      opennessFilter: parsed.opennessFilter,
      comparisonIds: parsed.comparisonIds,
    };
  }, [searchParams, chartId, chartType, availableProviders]);

  const updateUrl = useCallback(
    (partial: Partial<ChartInteractionState>, method: "replace" | "push") => {
      const next: ChartInteractionState = { ...state, ...partial };
      const url = mergeChartStateIntoUrl(pathname, next);
      if (method === "replace") {
        router.replace(url, { scroll: false });
      } else {
        router.push(url, { scroll: false });
      }
    },
    [state, pathname, router],
  );

  const replaceState = useCallback(
    (partial: Partial<ChartInteractionState>) => updateUrl(partial, "replace"),
    [updateUrl],
  );

  const pushState = useCallback(
    (partial: Partial<ChartInteractionState>) => updateUrl(partial, "push"),
    [updateUrl],
  );

  const permalinkUrl = useMemo(
    () => buildPermalinkUrl(pathname, state),
    [pathname, state],
  );

  const copyPermalink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(permalinkUrl);
    } catch {
      // Clipboard not available — silently fail
    }
  }, [permalinkUrl]);

  return {
    state,
    replaceState,
    pushState,
    permalinkUrl,
    copyPermalink,
  };
}

/**
 * STUDIO_M3A — model switcher model (pure, browser-safe).
 *
 * List primitives for the one canonical StudioModelSwitcher: recency
 * merge, favorite toggle, row windowing (moved verbatim from the
 * retired StudioModelPicker), plus the pure row selector the switcher
 * dialog renders. Support truth comes from the V1 catalog projection,
 * never fixtures.
 */

import type { DiscoverableEndpointView } from "../discovery/catalog-client";

export type SwitcherTab = "recommended" | "recent" | "favorites" | "browse";

export const SWITCHER_TABS: readonly SwitcherTab[] = ["recommended", "recent", "favorites", "browse"];

export const SWITCHER_ROW_HEIGHT = 64;
export const SWITCHER_VIEWPORT_HEIGHT = 384;
const SWITCHER_OVERSCAN = 6;

/** Pure list helpers (tested): recency merge, favorite toggle, row windowing. */
export function mergeRecent(ids: readonly string[], id: string, cap = 8): string[] {
  return [id, ...ids.filter((item) => item !== id)].slice(0, cap);
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export function windowRows<T>(
  rows: readonly T[],
  scrollTop: number,
  viewportHeight: number,
  rowHeight = SWITCHER_ROW_HEIGHT,
  overscan = SWITCHER_OVERSCAN,
): { start: number; visible: readonly T[] } {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const count = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  return { start, visible: rows.slice(start, start + count) };
}

export interface SwitcherRow {
  id: string;
  label: string;
  provider: string;
  detail: string | null;
  blocked: boolean;
  blockedReason: string | null;
}

export const SWITCHER_AUTO_ROW: SwitcherRow = {
  id: "auto",
  label: "Auto — Best match",
  provider: "Ethen",
  detail: "Deterministic routing with a recorded reason.",
  blocked: false,
  blockedReason: null,
};

export function endpointToRow(hit: DiscoverableEndpointView): SwitcherRow {
  const blocked = !hit.executable;
  return {
    id: hit.endpointId,
    label: hit.familyLabel && hit.familyLabel !== hit.endpointId ? `${hit.familyLabel} — ${hit.label}` : hit.label,
    provider: hit.providerId,
    detail: hit.endpointId,
    blocked,
    blockedReason: blocked ? (hit.disabledReasons[0] ?? "Not qualified for execution.") : null,
  };
}

function resolveIds(ids: readonly string[], byId: ReadonlyMap<string, DiscoverableEndpointView>): SwitcherRow[] {
  return ids.map((id) => {
    const hit = byId.get(id);
    if (!hit) {
      return {
        id,
        label: id,
        provider: "unknown",
        detail: "Not in this task catalog.",
        blocked: true,
        blockedReason: "Unknown endpoint for this task.",
      };
    }
    return endpointToRow(hit);
  });
}

export interface SwitcherRowSelection {
  rows: SwitcherRow[];
  counts: Record<SwitcherTab, number>;
  /** Endpoints in scope after the task filter, before search. */
  scoped: DiscoverableEndpointView[];
  /** Endpoints matching the debounced search query. */
  searched: DiscoverableEndpointView[];
}

/**
 * Pure tab/search selector: task scope, then search, then tab slice.
 * A null task keeps every endpoint (the models-library scope).
 */
export function selectSwitcherRows(args: {
  endpoints: readonly DiscoverableEndpointView[];
  task: string | null;
  query: string;
  tab: SwitcherTab;
  favorites: readonly string[];
  recents: readonly string[];
}): SwitcherRowSelection {
  const scoped = args.task ? args.endpoints.filter((endpoint) => endpoint.task === args.task) : [...args.endpoints];
  const needle = args.query.trim().toLowerCase();
  const searched = needle
    ? scoped.filter((endpoint) =>
        `${endpoint.label} ${endpoint.endpointId} ${endpoint.familyLabel} ${endpoint.providerId}`
          .toLowerCase()
          .includes(needle),
      )
    : scoped;
  const recommended = searched.filter((endpoint) => endpoint.executable);
  const byId = new Map<string, DiscoverableEndpointView>();
  for (const endpoint of scoped) byId.set(endpoint.endpointId, endpoint);

  let rows: SwitcherRow[];
  if (args.tab === "recent") rows = resolveIds(args.recents, byId);
  else if (args.tab === "favorites") rows = resolveIds(args.favorites, byId);
  else {
    const source = args.tab === "recommended" ? recommended : searched;
    rows = [SWITCHER_AUTO_ROW, ...source.map(endpointToRow)];
  }
  return {
    rows,
    counts: {
      recommended: recommended.length,
      recent: args.recents.length,
      favorites: args.favorites.length,
      browse: searched.length,
    },
    scoped,
    searched,
  };
}

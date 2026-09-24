/**
 * STUDIO_08 — discovery catalog client (pure, browser-safe).
 *
 * Consumes the STUDIO_06 V1 catalog projection. Family counts and endpoint
 * counts are computed live from the projection — a catalog fetch failure
 * is an error state, never an empty catalog, and no endpoint count is
 * presented as a model count.
 */

import type { StudioDataState } from "../shell/types";

export interface DiscoverableEndpointView {
  endpointId: string;
  familyId: string;
  familyLabel: string;
  providerId: string;
  task: string;
  label: string;
  supportedParameters: readonly string[];
  requiredParameters: readonly string[];
  executable: boolean;
  disabledReasons: readonly string[];
}

export interface FamilyView {
  familyId: string;
  label: string;
  providerId: string;
  tasks: readonly string[];
  endpointCount: number;
  executableCount: number;
}

export interface CatalogProjectionView {
  families: readonly FamilyView[];
  endpoints: readonly DiscoverableEndpointView[];
  tallies: { families: number; endpoints: number; executable: number };
}

export interface ParsedCatalog {
  state: StudioDataState;
  projection: CatalogProjectionView | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function parseCatalogResponse(body: unknown): ParsedCatalog {
  const envelope = asRecord(body);
  if (envelope.ok === false) {
    const error = asRecord(envelope.error);
    const code = typeof error.code === "string" ? error.code : "UNKNOWN";
    if (code === "SETUP_REQUIRED") return { state: "setup", projection: null };
    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return { state: "permission", projection: null };
    return { state: "error", projection: null };
  }
  const data = asRecord(envelope.data !== undefined ? envelope.data : envelope);
  const catalog = asRecord(data.catalog !== undefined ? data.catalog : data);
  const rawFamilies = catalog.families;
  const rawEndpoints = catalog.endpoints;
  if (!Array.isArray(rawFamilies) || !Array.isArray(rawEndpoints)) {
    return { state: "error", projection: null };
  }
  const endpoints: DiscoverableEndpointView[] = [];
  for (const entry of rawEndpoints) {
    const record = asRecord(entry);
    if (typeof record.endpointId !== "string" || typeof record.familyId !== "string") continue;
    endpoints.push({
      endpointId: record.endpointId,
      familyId: record.familyId,
      familyLabel: typeof record.familyLabel === "string" ? record.familyLabel : record.familyId,
      providerId: typeof record.providerId === "string" ? record.providerId : "unknown",
      task: typeof record.task === "string" ? record.task : "unknown",
      label: typeof record.label === "string" ? record.label : record.endpointId,
      supportedParameters: asStringArray(record.supportedParameters),
      requiredParameters: asStringArray(record.requiredParameters),
      executable: record.executable === true,
      disabledReasons: asStringArray(record.disabledReasons),
    });
  }
  // Recompute family rollups live; never trust a stale tally.
  const families = summarizeFamilies(endpoints, rawFamilies);
  const tallies = {
    families: families.length,
    endpoints: endpoints.length,
    executable: endpoints.filter((endpoint) => endpoint.executable).length,
  };
  if (endpoints.length === 0) {
    return { state: "empty", projection: { families, endpoints, tallies } };
  }
  return { state: "ready", projection: { families, endpoints, tallies } };
}

function summarizeFamilies(
  endpoints: readonly DiscoverableEndpointView[],
  rawFamilies: readonly unknown[],
): FamilyView[] {
  const labels = new Map<string, string>();
  for (const entry of rawFamilies) {
    const record = asRecord(entry);
    if (typeof record.familyId === "string" && typeof record.label === "string") {
      labels.set(record.familyId, record.label);
    }
  }
  const byFamily = new Map<string, FamilyView & { taskSet: Set<string> }>();
  for (const endpoint of endpoints) {
    let family = byFamily.get(endpoint.familyId);
    if (!family) {
      family = {
        familyId: endpoint.familyId,
        label: labels.get(endpoint.familyId) ?? endpoint.familyLabel,
        providerId: endpoint.providerId,
        tasks: [],
        endpointCount: 0,
        executableCount: 0,
        taskSet: new Set<string>(),
      };
      byFamily.set(endpoint.familyId, family);
    }
    family.taskSet.add(endpoint.task);
    family.endpointCount += 1;
    if (endpoint.executable) family.executableCount += 1;
  }
  return [...byFamily.values()].map((family) => ({
    familyId: family.familyId,
    label: family.label,
    providerId: family.providerId,
    tasks: [...family.taskSet].sort(),
    endpointCount: family.endpointCount,
    executableCount: family.executableCount,
  }));
}

export interface CatalogFilter {
  query: string;
  task: string | null;
  executableOnly: boolean;
}

export const EMPTY_CATALOG_FILTER: CatalogFilter = { query: "", task: null, executableOnly: false };

export function filterCatalog(
  projection: CatalogProjectionView,
  filter: CatalogFilter,
): { families: FamilyView[]; endpoints: DiscoverableEndpointView[] } {
  const query = filter.query.trim().toLowerCase();
  const endpoints = projection.endpoints.filter((endpoint) => {
    if (filter.task && endpoint.task !== filter.task) return false;
    if (filter.executableOnly && !endpoint.executable) return false;
    if (!query) return true;
    const haystack = `${endpoint.label} ${endpoint.endpointId} ${endpoint.familyLabel} ${endpoint.providerId}`.toLowerCase();
    return query.split(/\s+/).every((token) => haystack.includes(token));
  });
  const visibleFamilies = new Set(endpoints.map((endpoint) => endpoint.familyId));
  return {
    families: projection.families.filter((family) => visibleFamilies.has(family.familyId)),
    endpoints,
  };
}

export function endpointsForFamily(
  projection: CatalogProjectionView,
  familyId: string,
): DiscoverableEndpointView[] {
  return projection.endpoints.filter((endpoint) => endpoint.familyId === familyId);
}

export function catalogTasks(projection: CatalogProjectionView): string[] {
  return [...new Set(projection.endpoints.map((endpoint) => endpoint.task))].sort();
}

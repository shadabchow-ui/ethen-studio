/**
 * MUSE-004 — endpoint comparison (pure, browser-safe).
 *
 * Side-by-side comparison rows for catalog endpoints: identity, task,
 * support state, parameters, pricing and license provenance. Unknowns
 * render as "Unknown" and are excluded from difference highlighting —
 * never estimated, never ranked. The models UI consumes this; the
 * discovery suite certifies it across representative families.
 */

import type { StudioEndpoint } from "./endpoint-registry";

export const MODEL_COMPARE_MIN = 2;
export const MODEL_COMPARE_MAX = 4;

export interface CompareColumn {
  endpointId: string;
  familyId: string | null;
  label: string;
}

export interface CompareRow {
  key: string;
  label: string;
  values: readonly string[];
  /** True when the columns genuinely disagree (unknowns excluded). */
  differing: boolean;
}

export interface CompareResult {
  columns: readonly CompareColumn[];
  rows: readonly CompareRow[];
  truncated: boolean;
}

const UNKNOWN = "Unknown";

function supportLabel(endpoint: StudioEndpoint): string {
  if (endpoint.support === "executable_candidate") return "Executable candidate";
  if (endpoint.support === "schema_supported") return "Schema supported";
  return "Cataloged";
}

function availabilityLabel(endpoint: StudioEndpoint): string {
  const parts: string[] = [];
  parts.push(endpoint.disposition === "eligible" ? "Eligible" : endpoint.disposition === "quarantined" ? "Quarantined" : "Excluded");
  parts.push(supportLabel(endpoint));
  return parts.join(" · ");
}

function pricingLabel(endpoint: StudioEndpoint): string {
  if (endpoint.pricing.status === "known") {
    return endpoint.pricing.unit ? `Priced (${endpoint.pricing.unit})` : "Priced";
  }
  return UNKNOWN;
}

function licenseLabel(endpoint: StudioEndpoint): string {
  if (endpoint.license) return `${endpoint.license.id} (${endpoint.license.upstream})`;
  return UNKNOWN;
}

function row(key: string, label: string, values: readonly string[], unknownIsNeutral: boolean): CompareRow {
  const significant = unknownIsNeutral ? values.filter((value) => value !== UNKNOWN) : values;
  return { key, label, values, differing: new Set(significant).size > 1 };
}

export function compareEndpoints(endpoints: readonly StudioEndpoint[]): CompareResult {
  const columns = endpoints.slice(0, MODEL_COMPARE_MAX).map((endpoint) => ({
    endpointId: endpoint.endpointId,
    familyId: endpoint.familyId,
    label: endpoint.endpointId,
  }));
  const picked = endpoints.slice(0, MODEL_COMPARE_MAX);
  const rows: CompareRow[] = [
    row("task", "Task", picked.map((e) => e.task), false),
    row("availability", "Availability", picked.map(availabilityLabel), false),
    row(
      "required_inputs",
      "Required inputs",
      picked.map((e) => (e.capabilities.requiredInputs && e.capabilities.requiredInputs.length > 0 ? e.capabilities.requiredInputs.join(", ") : "none")),
      false,
    ),
    row(
      "supported_inputs",
      "Supported inputs",
      picked.map((e) => (e.capabilities.supportedInputs ? String(e.capabilities.supportedInputs.length) : UNKNOWN)),
      true,
    ),
    row("pricing", "Pricing", picked.map(pricingLabel), true),
    row("license", "License", picked.map(licenseLabel), true),
    row("developer", "Developer", picked.map((e) => (e.developer === "unknown" ? UNKNOWN : e.developer)), true),
  ];
  return { columns, rows, truncated: endpoints.length > MODEL_COMPARE_MAX };
}

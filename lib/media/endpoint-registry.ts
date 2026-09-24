/**
 * Studio V3 Job 2 — endpoint-level catalog registry (pure, browser-safe).
 *
 * Truth ladder: CATALOGED (all source rows) != SCHEMA_SUPPORTED (valid input
 * schema snapshot) != EXECUTABLE (Job 3 qualification — never here). Missing
 * schema, adapter, credential, policy or health support means disabled
 * Generate with a reason. Unknown pricing/latency/quality stays unknown and
 * is excluded from rankings — never estimated.
 *
 * Consumer contract (Jobs 3-4 + UI):
 * - `StudioEndpoint` (endpoint identity, disposition, provenance, pricing,
 *   capabilities, support state + reasons), `normalizeEndpointRow`,
 *   `reconcileCatalog`, `searchEndpoints`, `CATALOG_TALLIES`.
 * - Counts always distinguish families from endpoints; source rows are
 *   retained for accounting, never silently dropped.
 */

export type EndpointDisposition = "eligible" | "quarantined" | "excluded";
export type EndpointSupport = "cataloged" | "schema_supported" | "executable_candidate";

export interface EndpointPricing {
  status: "known" | "unknown";
  /** Verbatim evidence sentences (prose, not a schema). */
  sentences: readonly string[];
  /** Parsed unit only when a $X/unit pattern matches with quoted evidence. */
  unit: string | null;
  unitEvidence: string | null;
  rawHash: string | null;
}

export interface EndpointCapabilities {
  /** Required input names from the schema snapshot (null when no schema). */
  requiredInputs: readonly string[] | null;
  /** Supported input names from the schema snapshot. */
  supportedInputs: readonly string[] | null;
  /** Capability constraints derived from schema enums/bounds. */
  constraints: Readonly<Record<string, readonly string[] | { min?: number; max?: number }>>;
  tasks: readonly string[];
  mediaClass: string | null;
}

export interface StudioEndpoint {
  endpointId: string;
  familyId: string | null;
  task: string;
  developer: string;
  developerClues: readonly string[];
  disposition: EndpointDisposition;
  dispositionReason: string | null;
  provenance: {
    rowSha256: string | null;
    rowIndex: number | null;
    pageUrl: string | null;
  };
  pricing: EndpointPricing;
  schema: {
    status: "supported" | "unavailable";
    snapshot: string | null;
    version: string | null;
    verifiedAt: string | null;
    reason: string | null;
  };
  health: { status: "unknown"; reason: string };
  capabilities: EndpointCapabilities;
  support: EndpointSupport;
  supportReasons: readonly string[];
}

export interface EndpointSourceRow {
  endpoint_id: string;
  task?: string;
  disposition?: string;
  disposition_reason?: string | null;
  developer?: string;
  developer_clues?: readonly { kind?: string; value?: string }[];
  pricing?: {
    normalized?: { status?: string };
    price_sentences?: readonly string[];
    raw_hash?: string | null;
  } | null;
  media_class?: string | null;
  fal_namespace?: string | null;
  url?: string | null;
  row_sha256?: string | null;
  row_index?: number | null;
}

export interface SchemaSnapshotRef {
  endpoint_id: string;
  snapshot: string;
  info_version?: string | null;
  retrieved_at?: string | null;
  input?: { required?: readonly string[]; properties?: Readonly<Record<string, unknown>> } | null;
}

const PRICE_UNIT_PATTERNS: readonly { unit: string; pattern: RegExp }[] = [
  { unit: "$/second", pattern: /\$\s?[\d.]+\s*\/\s*(second|sec|s\b)/i },
  { unit: "$/image", pattern: /\$\s?[\d.]+\s*\/\s*(image|picture|generation)/i },
  { unit: "$/mp", pattern: /\$\s?[\d.]+\s*\/\s*(megapixel|mp)\b/i },
  { unit: "$/minute", pattern: /\$\s?[\d.]+\s*\/\s*(minute|min)\b/i },
];

function parsePricingUnit(sentences: readonly string[]): { unit: string | null; evidence: string | null } {
  for (const sentence of sentences) {
    for (const { unit, pattern } of PRICE_UNIT_PATTERNS) {
      if (pattern.test(sentence)) return { unit, evidence: sentence.slice(0, 200) };
    }
  }
  return { unit: null, evidence: null };
}

function normalizeDisposition(value: unknown): EndpointDisposition {
  return value === "eligible" || value === "quarantined" || value === "excluded" ? value : "quarantined";
}

export function normalizePricing(row: EndpointSourceRow): EndpointPricing {
  const sentences = row.pricing?.price_sentences ?? [];
  const { unit, evidence } = parsePricingUnit(sentences);
  const explicitKnown = row.pricing?.normalized?.status === "known";
  return {
    status: explicitKnown && unit ? "known" : "unknown",
    sentences,
    unit: explicitKnown ? unit : unit,
    unitEvidence: evidence,
    rawHash: row.pricing?.raw_hash ?? null,
  };
}

export function normalizeEndpointRow(
  row: EndpointSourceRow,
  familyId: string | null,
  snapshot: SchemaSnapshotRef | null,
  snapshotReason: string | null,
): StudioEndpoint {
  const disposition = normalizeDisposition(row.disposition);
  const pricing = normalizePricing(row);
  const schemaSupported = Boolean(snapshot?.input && typeof snapshot.input === "object");
  const requiredInputs = schemaSupported
    ? [...((snapshot!.input!.required as readonly string[] | undefined) ?? [])]
    : null;
  const supportedInputs = schemaSupported
    ? Object.keys((snapshot!.input!.properties as Record<string, unknown> | undefined) ?? {})
    : null;
  const reasons: string[] = [];
  if (disposition === "quarantined") reasons.push(row.disposition_reason ?? "quarantined by source disposition");
  if (disposition === "excluded") reasons.push(row.disposition_reason ?? "excluded by source disposition");
  if (!schemaSupported) reasons.push(snapshotReason ?? "schema unavailable: no verified input schema");
  if (pricing.status === "unknown") reasons.push("pricing unknown: excluded from cost ranking");
  return {
    endpointId: row.endpoint_id,
    familyId,
    task: row.task ?? "unknown",
    developer: row.developer ?? "unknown",
    developerClues: (row.developer_clues ?? []).map((c) => `${c.kind ?? "clue"}:${c.value ?? ""}`),
    disposition,
    dispositionReason: row.disposition_reason ?? null,
    provenance: { rowSha256: row.row_sha256 ?? null, rowIndex: row.row_index ?? null, pageUrl: row.url ?? null },
    pricing,
    schema: {
      status: schemaSupported ? "supported" : "unavailable",
      snapshot: snapshot?.snapshot ?? null,
      version: snapshot?.info_version ?? null,
      verifiedAt: snapshot?.retrieved_at ?? null,
      reason: schemaSupported ? null : (snapshotReason ?? "schema unavailable"),
    },
    health: { status: "unknown", reason: "job-3-runtime: no availability probing in catalog job" },
    capabilities: {
      requiredInputs,
      supportedInputs,
      constraints: {},
      tasks: row.task ? [row.task] : [],
      mediaClass: row.media_class ?? null,
    },
    support: schemaSupported ? "schema_supported" : "cataloged",
    supportReasons: reasons,
  };
}

export interface CatalogTallies {
  families: number;
  endpoints: number;
  eligible: number;
  quarantined: number;
  excluded: number;
  schemaSupported: number;
  schemaUnavailable: number;
}

export function tallyEndpoints(endpoints: readonly StudioEndpoint[], families: number): CatalogTallies {
  let eligible = 0, quarantined = 0, excluded = 0, supported = 0;
  for (const e of endpoints) {
    if (e.disposition === "eligible") eligible += 1;
    else if (e.disposition === "quarantined") quarantined += 1;
    else excluded += 1;
    if (e.schema.status === "supported") supported += 1;
  }
  return {
    families,
    endpoints: endpoints.length,
    eligible,
    quarantined,
    excluded,
    schemaSupported: supported,
    schemaUnavailable: endpoints.length - supported,
  };
}

export interface Reconciliation {
  ok: boolean;
  sourceIds: number;
  projectedIds: number;
  missing: readonly string[];
  extra: readonly string[];
}

export function reconcileCatalog(sourceIds: readonly string[], projectedIds: readonly string[]): Reconciliation {
  const source = new Set(sourceIds);
  const projected = new Set(projectedIds);
  const missing = sourceIds.filter((id) => !projected.has(id));
  const extra = projectedIds.filter((id) => !source.has(id));
  return { ok: missing.length === 0 && extra.length === 0, sourceIds: source.size, projectedIds: projected.size, missing, extra };
}

/** Strict allowlist for detail lookups (no traversal; exact catalog ids only). */
export const ENDPOINT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,160}$/;

export function isEndpointIdShape(id: string): boolean {
  return ENDPOINT_ID_PATTERN.test(id);
}

export interface EndpointFilters {
  query?: string;
  task?: string;
  developer?: string;
  provider?: string;
  support?: EndpointSupport;
  disposition?: EndpointDisposition;
  capabilities?: readonly string[];
  hasPricing?: boolean;
}

export function searchEndpoints(endpoints: readonly StudioEndpoint[], filters: EndpointFilters = {}): StudioEndpoint[] {
  const q = (filters.query ?? "").trim().toLowerCase();
  return endpoints.filter((e) => {
    if (filters.task && e.task !== filters.task) return false;
    if (filters.developer && e.developer !== filters.developer && !e.developerClues.some((c) => c.includes(filters.developer!))) return false;
    if (filters.provider && filters.provider !== "fal.ai") return false;
    if (filters.support && e.support !== filters.support) return false;
    if (filters.disposition && e.disposition !== filters.disposition) return false;
    if (filters.hasPricing && e.pricing.status !== "known") return false;
    if (filters.capabilities && filters.capabilities.length > 0) {
      const have = new Set([...(e.capabilities.supportedInputs ?? []), ...e.capabilities.tasks]);
      if (!filters.capabilities.every((c) => have.has(c))) return false;
    }
    if (q) {
      const hay = `${e.endpointId} ${e.familyId ?? ""} ${e.task} ${e.developer} ${e.developerClues.join(" ")}`.toLowerCase();
      if (!q.split(/\s+/).every((term) => hay.includes(term))) return false;
    }
    return true;
  });
}

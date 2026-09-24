/**
 * Studio V5 providers — endpoint spec readers (STUDIO M4). Server-only.
 *
 * The generic fal-queue adapter resolves the pinned EndpointSpec per
 * submit; this module is the one mapping from storage rows (Supabase
 * studio_v5_endpoints) or local catalog documents (fixture/dev) onto
 * EndpointSpec. One mapping, two sources: the row mapper is shared so
 * worker SQL reads and route reads cannot drift.
 */
import "server-only";

import type { TaskName } from "../../contracts/tasks";
import type { EndpointSpec } from "../../catalog/types";
import type { CatalogSourceEndpoint, LocalCatalogJson, SchemaSnapshotDoc } from "../../catalog/source-local";
import { mapFalSlug } from "../../catalog/task-map";

/** Resolve the pinned spec for an endpoint id, or null when unknown. */
export interface EndpointSpecReader {
  getSpec(endpointId: string): Promise<EndpointSpec | null>;
}

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function strArray(row: Row, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function obj(row: Row, key: string): Readonly<Record<string, unknown>> {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** One row mapping for studio_v5_endpoints (worker SQL + route reads). */
export function specFromRow(row: Row): EndpointSpec {
  const raw = obj(row, "raw_params");
  const rawParams: Record<string, "string" | "number" | "boolean" | "integer"> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === "string" || v === "number" || v === "boolean" || v === "integer") rawParams[k] = v;
  }
  return {
    endpointId: str(row, "endpoint_id"),
    familyId: str(row, "family_id"),
    providerId: str(row, "provider_id"),
    task: str(row, "task_name") as TaskName,
    label: str(row, "label"),
    description: str(row, "description"),
    adapterName: str(row, "adapter_name"),
    adapterVersion: str(row, "adapter_version"),
    schemaVersion: str(row, "schema_version"),
    jsonSchema: obj(row, "schema"),
    requiredControls: strArray(row, "required_controls"),
    supportedControls: strArray(row, "supported_controls"),
    rawParams,
    priceVersion: str(row, "price_version"),
    policyProfile: str(row, "policy_profile") || "standard",
    identityBinding: row["identity_binding"] === true,
    capabilityTags: strArray(row, "capability_tags"),
  };
}

export interface SpecReaderQuery {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Supabase/Postgres reader over studio_v5_endpoints. */
export function createSqlSpecReader(db: SpecReaderQuery): EndpointSpecReader {
  return {
    async getSpec(endpointId: string): Promise<EndpointSpec | null> {
      const result = await db.query("select * from public.studio_v5_endpoints where endpoint_id = $1", [endpointId]);
      const row = result.rows[0];
      return row ? specFromRow(row) : null;
    },
  };
}

export interface LocalSpecDocuments {
  catalog: LocalCatalogJson;
  snapshots: Readonly<Record<string, SchemaSnapshotDoc>>;
  /** Local-lane controls per endpoint (from buildLocalSource). */
  controls: ReadonlyMap<string, Pick<CatalogSourceEndpoint, "requiredControls" | "supportedControls">>;
}

/**
 * Build an EndpointSpec for a local-lane catalog endpoint: schema from
 * the hash-pinned snapshot input, controls from the M2 local source,
 * versions from the catalog row. Returns null for unknown endpoints,
 * unmapped tasks, and missing snapshots — never a guessed spec.
 */
export function localSpecFor(
  docs: LocalSpecDocuments,
  endpointId: string,
  versions: { adapterName: string; adapterVersion: string; priceVersion: string; catalogVersion: string },
): EndpointSpec | null {
  for (const record of docs.catalog.records) {
    for (const endpoint of record.endpoints) {
      if (endpoint.endpoint_id !== endpointId) continue;
      const mapped = mapFalSlug(endpoint.task);
      const task = mapped.tasks[0];
      if (!task) return null;
      const snapPath = endpoint.schema?.status === "supported" ? endpoint.schema.snapshot : null;
      const snapshot = snapPath ? docs.snapshots[snapPath] : undefined;
      if (!snapshot) return null;
      const controls = docs.controls.get(endpointId);
      if (!controls) return null;
      const meta = snapshot as SchemaSnapshotDoc & { description?: unknown; bytes_sha256?: unknown };
      const schemaHash = typeof meta.bytes_sha256 === "string" && meta.bytes_sha256.length > 0 ? meta.bytes_sha256 : null;
      // No pinned hash, no spec: an unpinned schema can never validate.
      if (!schemaHash) return null;
      return {
        endpointId,
        familyId: record.family_id,
        providerId: "fal",
        task,
        label: endpoint.endpoint_id,
        description: typeof meta.description === "string" ? meta.description : "",
        adapterName: versions.adapterName,
        adapterVersion: versions.adapterVersion,
        schemaVersion: schemaHash,
        jsonSchema: snapshot.input as Readonly<Record<string, unknown>>,
        requiredControls: controls.requiredControls,
        supportedControls: controls.supportedControls,
        rawParams: {},
        priceVersion: versions.priceVersion,
        policyProfile: "standard",
        identityBinding: false,
        capabilityTags: mapped.capabilityTags,
      };
    }
  }
  return null;
}

/** Local-lane reader over parsed catalog documents (fixture/dev only). */
export function createLocalSpecReader(
  docs: LocalSpecDocuments,
  versions: { adapterName: string; adapterVersion: string; priceVersion: string; catalogVersion: string },
): EndpointSpecReader {
  const cache = new Map<string, EndpointSpec | null>();
  return {
    async getSpec(endpointId: string): Promise<EndpointSpec | null> {
      if (!cache.has(endpointId)) {
        cache.set(endpointId, localSpecFor(docs, endpointId, versions));
      }
      return cache.get(endpointId) ?? null;
    },
  };
}

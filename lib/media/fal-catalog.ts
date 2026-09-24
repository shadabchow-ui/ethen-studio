/**
 * J03 — generated fal media catalog projection (+ V3 Job 2 registry).
 * Rebuilt from data/media-models/canonical-media-models.jsonl via
 * scripts/media-models/project-studio-catalog.mjs. Source/version/hash below;
 * never hand-edit the generated file. All entries are catalog-known only
 * (contract_only + setup required): catalog membership does not imply
 * executable Studio support, and only qualified routes execute.
 *
 * SERVER-ONLY: the full projection (~1MB+) must not enter the client bundle.
 * Browser surfaces use /api/studio/v1/catalog (paginated search projection) and
 * lazy per-endpoint detail/schema loads.
 */
import catalogJson from "./generated/fal-catalog.json";
import type { MediaModel } from "./types";
import {
  normalizeEndpointRow,
  searchEndpoints as filterRegistry,
  tallyEndpoints,
  type CatalogTallies,
  type EndpointFilters,
  type StudioEndpoint,
} from "./endpoint-registry";

export const FAL_CATALOG_VERSION: string = catalogJson.catalog_version;
export const FAL_CATALOG_SOURCE: string = catalogJson.source;
export const FAL_CATALOG_SHA: string = catalogJson.canonical_sha256;
export const FAL_CATALOG_COUNT: number = catalogJson.record_count;
export const FAL_CATALOG_ENDPOINT_COUNT: number =
  (catalogJson as { endpoint_count?: number }).endpoint_count ?? 0;

export interface FalCatalogEndpoint {
  familyId: string;
  endpointId: string;
  task: string;
  disposition: string;
  modality: "image" | "video" | "audio";
}

function narrowModality(value: string): "image" | "video" | "audio" {
  if (value === "video" || value === "audio") return value;
  return "image";
}

export function getFalCatalogModels(): MediaModel[] {
  return catalogJson.records.map((record) => ({
    id: record.family_id,
    provider: "fal.ai",
    name: record.name,
    displayName: record.display_name,
    modality: narrowModality(record.modality),
    tasks: [...record.tasks],
    maxOutput: "not provided",
    supportsFineTuning: record.supports_fine_tuning,
    // Unpriced in Studio: catalog-known only, setup required. Quotes come
    // from pricing versions for qualified routes, never from this field.
    estimatedCredits: 0,
    executionState: "contract_only",
    setupRequired: true,
  }));
}

export function getFalCatalogModelById(id: string): MediaModel | undefined {
  return getFalCatalogModels().find((model) => model.id === id);
}

export function getFalCatalogEndpoints(): FalCatalogEndpoint[] {
  return catalogJson.records.flatMap((record) => {
    const modality = narrowModality(record.modality);
    return record.endpoints.map((endpoint) => ({
      familyId: record.family_id,
      endpointId: endpoint.endpoint_id,
      task: endpoint.task,
      disposition: endpoint.disposition,
      modality,
    }));
  });
}

// ── V3 Job 2 — endpoint registry (server; powers the models API) ─────────────

type GeneratedEndpoint = {
  endpoint_id: string;
  task: string;
  disposition: string;
  disposition_reason?: string | null;
  developer?: string;
  developer_clues?: string[];
  page_url?: string | null;
  row_sha256?: string | null;
  pricing?: { status?: string; sentences?: string[]; raw_hash?: string | null };
  schema?: { status?: string; snapshot?: string | null; verified_at?: string | null; reason?: string | null };
  capabilities?: { required_inputs?: string[] | null; supported_inputs?: string[] | null };
};

let registryCache: StudioEndpoint[] | null = null;

/** All projected endpoints normalized to StudioEndpoint (memoized per process). */
export function getRegistryEndpoints(): StudioEndpoint[] {
  if (registryCache) return registryCache;
  const records = catalogJson.records as unknown as {
    family_id: string;
    endpoints: GeneratedEndpoint[];
  }[];
  registryCache = records.flatMap((record) =>
    record.endpoints.map((endpoint) =>
      normalizeEndpointRow(
        {
          endpoint_id: endpoint.endpoint_id,
          task: endpoint.task,
          disposition: endpoint.disposition,
          disposition_reason: endpoint.disposition_reason ?? null,
          developer: endpoint.developer ?? "unknown",
          developer_clues: (endpoint.developer_clues ?? []).map((clue) => {
            const separator = clue.indexOf(":");
            return separator === -1
              ? { kind: "clue", value: clue }
              : { kind: clue.slice(0, separator), value: clue.slice(separator + 1) };
          }),
          pricing: {
            normalized: { status: endpoint.pricing?.status },
            price_sentences: endpoint.pricing?.sentences ?? [],
            raw_hash: endpoint.pricing?.raw_hash ?? null,
          },
          url: endpoint.page_url ?? null,
          row_sha256: endpoint.row_sha256 ?? null,
        },
        record.family_id,
        endpoint.schema?.status === "supported" && endpoint.schema.snapshot
          ? {
              endpoint_id: endpoint.endpoint_id,
              snapshot: endpoint.schema.snapshot,
              retrieved_at: endpoint.schema.verified_at ?? null,
              input: {
                required: endpoint.capabilities?.required_inputs ?? [],
                properties: Object.fromEntries(
                  (endpoint.capabilities?.supported_inputs ?? []).map((name) => [name, {}]),
                ),
              },
            }
          : null,
        endpoint.schema?.status === "supported" ? null : (endpoint.schema?.reason ?? "not yet imported"),
      ),
    ),
  );
  return registryCache;
}

export function getRegistryTallies(): CatalogTallies {
  return tallyEndpoints(getRegistryEndpoints(), catalogJson.record_count);
}

export function searchRegistry(filters: EndpointFilters = {}): StudioEndpoint[] {
  return filterRegistry(getRegistryEndpoints(), filters);
}

export function getRegistryEndpointById(endpointId: string): StudioEndpoint | undefined {
  return getRegistryEndpoints().find((endpoint) => endpoint.endpointId === endpointId);
}

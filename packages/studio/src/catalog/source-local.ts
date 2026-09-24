/** Studio V5 M2 — local-lane catalog source builder. Pure, browser-safe. */
import type { PriceRowView } from "./price-states";
import { mapFalSlug } from "./task-map";
import { FAL_ADAPTER_NAME, FAL_ADAPTER_VERSION } from "../server/providers/fal-constants";
import type { TaskName } from "../contracts/tasks";
import type { EndpointSpec, ParameterFormField } from "./types";

export const BLOCKED_SCHEMA_UNKNOWN = "BLOCKED_SCHEMA_UNKNOWN" as const;
export const BLOCKED_PRICE_UNKNOWN = "BLOCKED_PRICE_UNKNOWN" as const;

/** One enriched endpoint row, identical for the local and Supabase lanes. */
export interface CatalogSourceEndpoint {
  endpointId: string;
  familyId: string;
  familyLabel: string;
  providerId: string;
  label: string;
  description: string;
  /** Canonical tasks (empty when the source slug is unmapped). */
  tasks: readonly TaskName[];
  capabilityTags: readonly string[];
  modalityIn: readonly string[];
  modalityOut: readonly string[];
  requiredControls: readonly string[];
  supportedControls: readonly string[];
  parameterForm: readonly ParameterFormField[];
  schemaKnown: boolean;
  snapshotPath: string | null;
  pricingSourceHash: string | null;
  disposition: string;
  dispositionReason: string | null;
  enabled: boolean;
  deprecated: boolean;
  unhealthy: boolean;
  adapterName: string;
  adapterVersion: string;
  schemaVersion: string;
  priceVersion: string;
  policyProfile: string;
  identityBinding: boolean;
  priceRow: PriceRowView | null;
}

/** Minimal view of the generated `fal-catalog.json` surface this builder reads. */
export interface LocalCatalogJson {
  catalog_version: string;
  canonical_sha256: string;
  records: LocalCatalogJsonFamily[];
}

export interface LocalCatalogJsonFamily {
  family_id: string;
  display_name: string;
  modality: string;
  endpoints: LocalCatalogJsonEndpoint[];
}

export interface LocalCatalogJsonEndpoint {
  endpoint_id: string;
  task: string;
  disposition: string;
  disposition_reason: string | null;
  pricing: { raw_hash: string | null } | null;
  schema: { status: string; snapshot: string | null };
}

/** Minimal view of one hash-pinned schema snapshot this builder reads. */
export interface SchemaSnapshotDoc {
  input?: {
    required?: readonly string[];
    properties?: Readonly<Record<string, SchemaSnapshotProp>>;
  };
}

export interface SchemaSnapshotProp {
  type?: string;
  enum?: readonly unknown[];
  anyOf?: readonly { type?: string }[];
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

const TASK_MODALITY_OUT: Readonly<Record<string, string>> = {
  image: "image",
  video: "video",
  speech: "audio",
  music: "audio",
  audio: "audio",
  mesh: "model",
};

const IMAGE_INPUT_NAMES = new Set(["image", "image_url", "input_image", "reference_image", "image_urls", "input_images"]);
const MASK_NAMES = new Set(["mask", "mask_url", "input_mask", "mask_image"]);
const START_FRAME_NAMES = new Set(["start_frame", "first_frame", "start_image"]);
const REFERENCE_NAMES = new Set(["reference", "reference_url", "reference_video", "reference_audio"]);

function humanize(name: string): string {
  return name
    .split("_")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function fieldType(prop: SchemaSnapshotProp): ParameterFormField["type"] {
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return "enum";
  const direct = prop.type;
  if (direct === "string" || direct === "number" || direct === "integer" || direct === "boolean" || direct === "array" || direct === "object") {
    return direct;
  }
  if (!direct && Array.isArray(prop.anyOf)) {
    for (const variant of prop.anyOf) {
      const t = variant?.type;
      if (t === "string" || t === "number" || t === "integer" || t === "boolean" || t === "array" || t === "object") return t;
    }
  }
  return "string";
}

function toParameterForm(
  properties: Readonly<Record<string, SchemaSnapshotProp>>,
  required: ReadonlySet<string>,
): ParameterFormField[] {
  return Object.entries(properties).map(([name, prop]) => ({
    name,
    label: humanize(name),
    type: fieldType(prop),
    required: required.has(name),
    enumValues: Array.isArray(prop.enum) ? prop.enum.map((v) => String(v)) : [],
    min: typeof prop.minimum === "number" ? prop.minimum : typeof prop.minLength === "number" ? prop.minLength : null,
    max: typeof prop.maximum === "number" ? prop.maximum : typeof prop.maxLength === "number" ? prop.maxLength : null,
    defaultValue: prop.default ?? null,
    description: typeof prop.description === "string" ? prop.description.slice(0, 500) : "",
  }));
}

/**
 * Schema-conditional capability tags (Plan §M2): `mask` when the schema has
 * a mask input, `start_frame`/`reference` for video conditioning, plus an
 * `input:image` upgrade when a text-first task actually takes images.
 */
function schemaConditionalTags(propertyNames: ReadonlySet<string>): string[] {
  const tags: string[] = [];
  if ([...propertyNames].some((n) => IMAGE_INPUT_NAMES.has(n))) tags.push("input:image");
  if ([...propertyNames].some((n) => MASK_NAMES.has(n))) tags.push("mask");
  if ([...propertyNames].some((n) => START_FRAME_NAMES.has(n))) tags.push("start_frame");
  if ([...propertyNames].some((n) => REFERENCE_NAMES.has(n))) tags.push("reference");
  return tags;
}

function lastSegment(endpointId: string): string {
  const parts = endpointId.split("/");
  return parts[parts.length - 1] ?? endpointId;
}

export interface BuildLocalSourceOptions {
  adapterName?: string;
  adapterVersion?: string;
}

/**
 * Build normalized source rows from the generated catalog JSON plus the
 * hash-pinned schema snapshots. Unknown slugs stay taskless (the projection
 * marks them BLOCKED_UNMAPPED_TASK); endpoints without a supported snapshot
 * carry no controls (the projection marks them BLOCKED_SCHEMA_UNKNOWN).
 */
export function buildLocalSource(
  catalog: LocalCatalogJson,
  snapshots: Readonly<Record<string, SchemaSnapshotDoc>>,
  options: BuildLocalSourceOptions = {},
): CatalogSourceEndpoint[] {
  const adapterName = options.adapterName ?? FAL_ADAPTER_NAME;
  const adapterVersion = options.adapterVersion ?? FAL_ADAPTER_VERSION;
  const rows: CatalogSourceEndpoint[] = [];
  for (const family of catalog.records) {
    for (const endpoint of family.endpoints) {
      const mapped = mapFalSlug(endpoint.task);
      const snapshotPath = endpoint.schema?.status === "supported" ? endpoint.schema.snapshot : null;
      const snapshot = snapshotPath ? snapshots[snapshotPath] : undefined;
      const properties = snapshot?.input?.properties ?? {};
      const required = new Set(snapshot?.input?.required ?? []);
      const propertyNames = new Set(Object.keys(properties));
      const schemaKnown = snapshotPath !== null && propertyNames.size > 0;
      const tags = [...mapped.capabilityTags];
      if (schemaKnown) {
        for (const tag of schemaConditionalTags(propertyNames)) {
          if (!tags.includes(tag)) tags.push(tag);
        }
      }
      const modalityOut = mapped.tasks.length > 0
        ? [...new Set(mapped.tasks.map((t) => TASK_MODALITY_OUT[t.split(".")[0]!] ?? "unknown"))]
        : [family.modality || "unknown"];
      const modalityIn = [...new Set(tags.filter((t) => t.startsWith("input:")).map((t) => t.slice("input:".length)))];
      rows.push({
        endpointId: endpoint.endpoint_id,
        familyId: family.family_id,
        familyLabel: family.display_name,
        providerId: "fal",
        label: lastSegment(endpoint.endpoint_id),
        description: "",
        tasks: mapped.tasks,
        capabilityTags: tags,
        modalityIn,
        modalityOut,
        requiredControls: schemaKnown ? [...required].filter((n) => propertyNames.has(n)) : [],
        supportedControls: schemaKnown ? [...propertyNames] : [],
        parameterForm: schemaKnown ? toParameterForm(properties, required) : [],
        schemaKnown,
        snapshotPath,
        pricingSourceHash: endpoint.pricing?.raw_hash ?? null,
        disposition: endpoint.disposition,
        dispositionReason: endpoint.disposition_reason ?? null,
        enabled: true,
        deprecated: false,
        unhealthy: false,
        adapterName,
        adapterVersion,
        schemaVersion: "1.0.0",
        priceVersion: "1.0.0",
        policyProfile: "standard",
        identityBinding: false,
        priceRow: null,
      });
    }
  }
  return rows;
}

/**
 * Supabase-lane adapter: a stored EndpointSpec row becomes the same
 * normalized source shape the local lane builds, so both lanes project
 * through one function. Stored rows are already canonical-task shaped.
 */
export function specToCatalogSource(
  spec: EndpointSpec,
  extra: {
    familyLabel?: string;
    description?: string;
    schemaKnown?: boolean;
    snapshotPath?: string | null;
    pricingSourceHash?: string | null;
    disposition?: string;
    dispositionReason?: string | null;
    enabled?: boolean;
    deprecated?: boolean;
    unhealthy?: boolean;
    parameterForm?: readonly ParameterFormField[];
    priceRow?: PriceRowView | null;
  } = {},
): CatalogSourceEndpoint {
  // Stored specs are already canonical; no slug mapping applies.
  const tasks = [spec.task];
  return {
    endpointId: spec.endpointId,
    familyId: spec.familyId,
    familyLabel: extra.familyLabel ?? spec.familyId,
    providerId: spec.providerId,
    label: spec.label,
    description: extra.description ?? spec.description,
    tasks,
    capabilityTags: [...spec.capabilityTags],
    modalityIn: [...new Set(spec.capabilityTags.filter((t) => t.startsWith("input:")).map((t) => t.slice("input:".length)))],
    modalityOut: [TASK_MODALITY_OUT[spec.task.split(".")[0]!] ?? "unknown"],
    requiredControls: [...spec.requiredControls],
    supportedControls: [...spec.supportedControls],
    parameterForm: extra.parameterForm ?? [],
    schemaKnown: extra.schemaKnown ?? true,
    snapshotPath: extra.snapshotPath ?? null,
    pricingSourceHash: extra.pricingSourceHash ?? null,
    disposition: extra.disposition ?? "eligible",
    dispositionReason: extra.dispositionReason ?? null,
    enabled: extra.enabled ?? true,
    deprecated: extra.deprecated ?? false,
    unhealthy: extra.unhealthy ?? false,
    adapterName: spec.adapterName,
    adapterVersion: spec.adapterVersion,
    schemaVersion: spec.schemaVersion,
    priceVersion: spec.priceVersion,
    policyProfile: spec.policyProfile,
    identityBinding: spec.identityBinding,
    priceRow: extra.priceRow ?? null,
  };
}

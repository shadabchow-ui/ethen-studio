/** Studio V5 catalog — shared contracts (STUDIO_06). Browser-safe: types + pure fns only. */
import type { TaskName } from "../contracts/tasks";
import type { VersionPins } from "../contracts/versions";

/**
 * Operational endpoint configuration. Discoverable (browsable) is separate
 * from executable: only a live QualificationAttestation makes an endpoint
 * executable. No endpoint is invented here — rows come from the generated
 * catalog projection plus measured qualification evidence.
 */
export interface EndpointSpec {
  endpointId: string;
  familyId: string;
  providerId: string;
  task: TaskName;
  label: string;
  description: string;
  adapterName: string;
  adapterVersion: string;
  schemaVersion: string;
  /** Complete endpoint JSON schema (subset validated by schema-validation.ts). */
  jsonSchema: Readonly<Record<string, unknown>>;
  requiredControls: readonly string[];
  supportedControls: readonly string[];
  /**
   * Raw provider passthrough allowlist: exact provider_params names with
   * primitive kinds. Anything else is rejected explicitly.
   */
  rawParams: Readonly<Record<string, "string" | "number" | "boolean" | "integer">>;
  priceVersion: string;
  policyProfile: string;
  identityBinding: boolean;
  capabilityTags: readonly string[];
}

/**
 * Versioned operational qualification tuple, keyed by endpoint, adapter,
 * schema, policy profile and price version (authority §10). Existing
 * attestation-shaped code does not equal live qualification: only a live,
 * matching, unexpired attestation with executable=true qualifies.
 */
export interface QualificationAttestation {
  endpointId: string;
  adapterName: string;
  adapterVersion: string;
  schemaVersion: string;
  policyProfile: string;
  priceVersion: string;
  executable: boolean;
  evidenceHash: string | null;
  attestedBy: string;
  attestedAt: string;
  expiresAt: string;
}

export type ExclusionReason =
  | "UNSUPPORTED_SCHEMA"
  | "UNKNOWN_REQUIRED_CONTROL"
  | "SCHEMA_VERSION_MISMATCH"
  | "STALE_PRICE_ATTESTATION"
  | "STALE_ADAPTER_ATTESTATION"
  | "ATTESTATION_EXPIRED"
  | "UNQUALIFIED_ENDPOINT"
  | "TENANT_RESTRICTED"
  | "PROVIDER_RESTRICTED"
  | "IDENTITY_BINDING_MISMATCH"
  | "BREAKER_PAUSED"
  | "ENDPOINT_DISABLED"
  | "ENDPOINT_DEPRECATED"
  | "REGION_BLOCKED"
  | "CREDENTIAL_MISSING"
  | "SCHEMA_UNKNOWN"
  | "TASK_UNMAPPED"
  | "PRICE_UNKNOWN"
  | "TASK_MISMATCH";

export interface CandidateExclusion {
  endpointId: string;
  reason: ExclusionReason;
  detail: string;
}

export interface AutoRationaleFactors {
  taskFit: string;
  identityCompatibility: string;
  workspaceAllowance: string;
  availability: string;
  qualityIntent: string;
  priceWithinCap: string;
}

export interface AutoRationale {
  selectedReason: string;
  factors: AutoRationaleFactors;
}

export interface QuoteInputs {
  endpointId: string;
  task: TaskName;
  pins: VersionPins;
  priceVersion: string;
  meterUnit: string;
  meterQuantity: number;
}

/** Exact endpoint pins carried into estimate/run; explicit never reroutes. */
export interface RouteDecision {
  endpointId: string;
  mode: "auto" | "explicit";
  pins: VersionPins;
  rationale: AutoRationale;
  excluded: readonly CandidateExclusion[];
  quoteInputs: QuoteInputs;
}

/** Discoverable projection for browse surfaces (known-but-unavailable honest). */
export interface DiscoverableEndpoint {
  endpointId: string;
  familyId: string;
  familyLabel: string;
  providerId: string;
  /**
   * M2: primary canonical task, or null when the source slug is unmapped
   * (browse-only). Clients already null-tolerate this field.
   */
  task: TaskName | null;
  /** M2: all canonical tasks (empty when unmapped). */
  tasks: readonly TaskName[];
  label: string;
  supportedParameters: readonly string[];
  requiredParameters: readonly string[];
  /** executable=false endpoints carry human-readable disabled reasons. */
  executable: boolean;
  disabledReasons: readonly string[];
  /** M2: exactly one qualification state per endpoint (Blueprint §15). */
  qualificationState: QualificationState;
  /** M2: exactly one price state per endpoint (Lock L). */
  priceState: PriceState;
  /** M2: canonical capability tags from the task map + schema enrichment. */
  capabilityTags: readonly string[];
  /** M2: input/output media modalities (text, image, video, audio, model). */
  modalityIn: readonly string[];
  modalityOut: readonly string[];
  /** M2: parameter form derived from the hash-pinned schema snapshot. */
  parameterForm: readonly ParameterFormField[];
  /** M2: machine-readable BLOCKED_* codes behind the disabled reasons. */
  blockedCodes: readonly string[];
}

/** M2 (Blueprint §15) — one qualification state per endpoint. */
export type QualificationState =
  | "QUALIFIED"
  | "PARTIALLY_QUALIFIED"
  | "UNVERIFIED"
  | "DISABLED"
  | "DEPRECATED"
  | "UNHEALTHY"
  | "REGION_BLOCKED"
  | "CREDENTIAL_MISSING";

/** M2 (Lock L) — one price state per endpoint. */
export type PriceState = "VERIFIED" | "DERIVED" | "STALE" | "UNKNOWN";

/** M2 — one hash-pinned schema property rendered as a form control. */
export interface ParameterFormField {
  name: string;
  label: string;
  /** JSON-schema kind; "enum" when the property carries enumerated values. */
  type: "string" | "number" | "integer" | "boolean" | "enum" | "array" | "object";
  required: boolean;
  enumValues: readonly string[];
  min: number | null;
  max: number | null;
  defaultValue: unknown;
  description: string;
}

export interface FamilyProjection {
  familyId: string;
  label: string;
  providerId: string;
  tasks: readonly TaskName[];
  endpointCount: number;
  executableCount: number;
}

export type QualityIntent = "fast" | "balanced" | "quality" | "custom";

export interface RouteIntent {
  quality: QualityIntent;
  /** Approved cap in ICU; candidates priced above it are excluded with reason. */
  capIcu: number | null;
  /** Estimated ICU per endpoint, when a priced row exists. Unknown stays unknown. */
  estimatedIcuByEndpoint?: Readonly<Record<string, number>>;
}

export const EXCLUSION_STATUS: Readonly<Record<ExclusionReason, string>> = {
  UNSUPPORTED_SCHEMA: "ENDPOINT_UNAVAILABLE",
  UNKNOWN_REQUIRED_CONTROL: "ENDPOINT_UNAVAILABLE",
  SCHEMA_VERSION_MISMATCH: "ENDPOINT_UNAVAILABLE",
  STALE_PRICE_ATTESTATION: "ENDPOINT_UNAVAILABLE",
  STALE_ADAPTER_ATTESTATION: "ENDPOINT_UNAVAILABLE",
  ATTESTATION_EXPIRED: "ENDPOINT_UNAVAILABLE",
  UNQUALIFIED_ENDPOINT: "ENDPOINT_UNAVAILABLE",
  TENANT_RESTRICTED: "FORBIDDEN",
  PROVIDER_RESTRICTED: "FORBIDDEN",
  IDENTITY_BINDING_MISMATCH: "FORBIDDEN",
  BREAKER_PAUSED: "ENDPOINT_UNAVAILABLE",
  ENDPOINT_DISABLED: "ENDPOINT_UNAVAILABLE",
  ENDPOINT_DEPRECATED: "ENDPOINT_UNAVAILABLE",
  REGION_BLOCKED: "FORBIDDEN",
  CREDENTIAL_MISSING: "ENDPOINT_UNAVAILABLE",
  SCHEMA_UNKNOWN: "ENDPOINT_UNAVAILABLE",
  TASK_UNMAPPED: "ENDPOINT_UNAVAILABLE",
  PRICE_UNKNOWN: "ENDPOINT_UNAVAILABLE",
  TASK_MISMATCH: "BAD_REQUEST",
};

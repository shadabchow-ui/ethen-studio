/** Studio V5 catalog — pure qualification evaluation (STUDIO_06). Browser-safe. */
import type { VersionPins } from "../contracts/versions";
import type {
  CandidateExclusion,
  EndpointSpec,
  ExclusionReason,
  QualificationAttestation,
  QualificationState,
} from "./types";

export interface QualificationResult {
  qualified: boolean;
  exclusions: CandidateExclusion[];
}

function exclusion(
  endpointId: string,
  reason: ExclusionReason,
  detail: string,
): CandidateExclusion {
  return { endpointId, reason, detail };
}

/**
 * Evaluate one endpoint against its attestation and the requested pins.
 * Qualified requires ALL of: a live attestation, executable=true, exact
 * adapter/schema/price/policy tuple match, and no expiry. Anything else is
 * an honest exclusion — never a silent pass.
 *
 * Null pins mean "endpoint self-consistency only" (attestation tuple must
 * equal the endpoint's own versions): used by Auto, which pins FROM the
 * winner. Explicit routing passes requested pins for exact-match enforcement.
 */
export function evaluateQualification(
  spec: EndpointSpec,
  attestation: QualificationAttestation | null,
  pins: VersionPins | null,
  nowIso?: string,
): QualificationResult {
  const now = nowIso ?? new Date().toISOString();
  if (!attestation) {
    return {
      qualified: false,
      exclusions: [
        exclusion(
          spec.endpointId,
          "UNQUALIFIED_ENDPOINT",
          `Endpoint ${spec.endpointId} is catalog-known but has no qualification attestation; it cannot execute.`,
        ),
      ],
    };
  }
  const exclusions: CandidateExclusion[] = [];
  if (!attestation.executable) {
    exclusions.push(
      exclusion(
        spec.endpointId,
        "UNQUALIFIED_ENDPOINT",
        `Endpoint ${spec.endpointId} attestation marks executable=false; browse-only.`,
      ),
    );
  }
  if (attestation.expiresAt <= now) {
    exclusions.push(
      exclusion(
        spec.endpointId,
        "ATTESTATION_EXPIRED",
        `Endpoint ${spec.endpointId} attestation expired at ${attestation.expiresAt}.`,
      ),
    );
  }
  if (
    attestation.adapterName !== spec.adapterName ||
    attestation.adapterVersion !== spec.adapterVersion ||
    (pins !== null && attestation.adapterVersion !== pins.adapterVersion)
  ) {
    exclusions.push(
      exclusion(
        spec.endpointId,
        "STALE_ADAPTER_ATTESTATION",
        `Endpoint ${spec.endpointId} attestation adapter ${attestation.adapterName}@${attestation.adapterVersion} does not match pinned ${spec.adapterName}@${pins?.adapterVersion ?? spec.adapterVersion}.`,
      ),
    );
  }
  if (
    attestation.schemaVersion !== spec.schemaVersion ||
    (pins !== null && attestation.schemaVersion !== pins.endpointSchemaVersion)
  ) {
    exclusions.push(
      exclusion(
        spec.endpointId,
        "SCHEMA_VERSION_MISMATCH",
        `Endpoint ${spec.endpointId} attestation schema ${attestation.schemaVersion} does not match pinned ${pins?.endpointSchemaVersion ?? spec.schemaVersion}.`,
      ),
    );
  }
  if (
    attestation.priceVersion !== spec.priceVersion ||
    (pins !== null && attestation.priceVersion !== pins.priceVersion)
  ) {
    exclusions.push(
      exclusion(
        spec.endpointId,
        "STALE_PRICE_ATTESTATION",
        `Endpoint ${spec.endpointId} attestation price ${attestation.priceVersion} does not match pinned ${pins?.priceVersion ?? spec.priceVersion}.`,
      ),
    );
  }
  if (attestation.policyProfile !== spec.policyProfile) {
    exclusions.push(
      exclusion(
        spec.endpointId,
        "UNQUALIFIED_ENDPOINT",
        `Endpoint ${spec.endpointId} attestation policy profile ${attestation.policyProfile} does not match required ${spec.policyProfile}.`,
      ),
    );
  }
  return { qualified: exclusions.length === 0, exclusions };
}

/**
 * M2 (Blueprint §15) — operational signals that force a terminal state
 * before attestation evidence is even considered.
 */
export interface QualificationSignals {
  /** Row-level kill switch (`enabled = false`). */
  disabled: boolean;
  /** Provider-retired endpoint. */
  deprecated: boolean;
  /** Breaker paused or measured transport/auth failure. */
  unhealthy: boolean;
  regionBlocked: boolean;
  credentialMissing: boolean;
  /** A hash-pinned supported schema snapshot exists. */
  schemaKnown: boolean;
  /** The source task slug maps to a canonical task. */
  taskMapped: boolean;
  /** A DERIVED-or-better price row exists for the current source hash. */
  hasPriceEvidence: boolean;
}

export const DEFAULT_QUALIFICATION_SIGNALS: QualificationSignals = {
  disabled: false,
  deprecated: false,
  unhealthy: false,
  regionBlocked: false,
  credentialMissing: false,
  schemaKnown: false,
  taskMapped: false,
  hasPriceEvidence: false,
};

export interface QualificationStateResult {
  state: QualificationState;
  exclusions: CandidateExclusion[];
}

/**
 * M2 — resolve exactly one Blueprint §15 state. Terminal signals win in
 * documented priority order; otherwise a live, matching, executable
 * attestation qualifies, a live matching attestation with schema + price
 * evidence is partially qualified, and everything else is UNVERIFIED.
 * M2 creates no attestations, so nothing can qualify yet — the machine is
 * still total and tested with fixtures.
 */
export function resolveQualificationState(
  spec: Pick<EndpointSpec, "endpointId" | "adapterName" | "adapterVersion" | "schemaVersion" | "policyProfile" | "priceVersion">,
  attestation: QualificationAttestation | null,
  pins: VersionPins | null,
  signals: QualificationSignals,
  nowIso?: string,
): QualificationStateResult {
  const now = nowIso ?? new Date().toISOString();
  const id = spec.endpointId;
  if (signals.disabled) {
    return {
      state: "DISABLED",
      exclusions: [exclusion(id, "ENDPOINT_DISABLED", `Endpoint ${id} is disabled by its catalog row.`)],
    };
  }
  if (signals.regionBlocked) {
    return {
      state: "REGION_BLOCKED",
      exclusions: [exclusion(id, "REGION_BLOCKED", `Endpoint ${id} is not available in this region.`)],
    };
  }
  if (signals.credentialMissing) {
    return {
      state: "CREDENTIAL_MISSING",
      exclusions: [exclusion(id, "CREDENTIAL_MISSING", `Endpoint ${id} has no provider credential configured.`)],
    };
  }
  if (signals.unhealthy) {
    return {
      state: "UNHEALTHY",
      exclusions: [exclusion(id, "BREAKER_PAUSED", `Endpoint ${id} is paused by its health breaker; the owner must clear it after verified recovery.`)],
    };
  }
  if (signals.deprecated) {
    return {
      state: "DEPRECATED",
      exclusions: [exclusion(id, "ENDPOINT_DEPRECATED", `Endpoint ${id} is retired by its provider; browse-only.`)],
    };
  }
  const evaluated = evaluateQualification(
    spec as EndpointSpec,
    attestation,
    pins,
    now,
  );
  if (evaluated.qualified) return { state: "QUALIFIED", exclusions: [] };
  if (
    attestation &&
    attestation.expiresAt > now &&
    attestation.adapterName === spec.adapterName &&
    attestation.adapterVersion === (pins?.adapterVersion ?? spec.adapterVersion) &&
    attestation.schemaVersion === (pins?.endpointSchemaVersion ?? spec.schemaVersion) &&
    attestation.priceVersion === (pins?.priceVersion ?? spec.priceVersion) &&
    attestation.policyProfile === spec.policyProfile &&
    signals.schemaKnown &&
    signals.hasPriceEvidence
  ) {
    return {
      state: "PARTIALLY_QUALIFIED",
      exclusions: [
        exclusion(
          id,
          "UNQUALIFIED_ENDPOINT",
          `Endpoint ${id} has live schema and price evidence but no executable attestation; executable only with an owner-authorised canary.`,
        ),
      ],
    };
  }
  const fallback: CandidateExclusion[] = [...evaluated.exclusions];
  if (!signals.taskMapped) {
    fallback.push(exclusion(id, "TASK_UNMAPPED", `Endpoint ${id} has no canonical task mapping; browse-only.`));
  }
  if (!signals.schemaKnown) {
    fallback.push(exclusion(id, "SCHEMA_UNKNOWN", `Endpoint ${id} has no verified input schema; browse-only.`));
  }
  return { state: "UNVERIFIED", exclusions: fallback };
}

/** Attestation tuple key: endpoint + adapter + schema + policy + price. */
export function attestationKey(attestation: Pick<
  QualificationAttestation,
  "endpointId" | "adapterVersion" | "schemaVersion" | "policyProfile" | "priceVersion"
>): string {
  return [
    attestation.endpointId,
    attestation.adapterVersion,
    attestation.schemaVersion,
    attestation.policyProfile,
    attestation.priceVersion,
  ].join("|");
}

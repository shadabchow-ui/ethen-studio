export type MIConfidence = "high" | "medium" | "low" | "unknown";

export interface MIProvenance {
  sourceUrl: string | null;
  sourceLabel: string;
  retrievedAt: string | null;
  methodology: string | null;
  confidence: MIConfidence;
  sourceType?: import("./evidence").MISourceType;
  effectiveAt?: string | null;
  expiresAt?: string | null;
  sourceHash?: string | null;
  methodologyVersion?: string | null;
}

export interface MIEvidenceState<T> {
  state: "known" | "unknown";
  value: T | null;
  displayValue: string;
  reason: string | null;
  provenance: MIProvenance;
}

function validDate(value: string | null | undefined): value is string {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

export function createEvidenceState<T>(input: {
  value: T | null;
  displayValue: string;
  provenance: MIProvenance;
  reason?: string;
}): MIEvidenceState<T> {
  const complete =
    input.value !== null &&
    Boolean(input.provenance.sourceUrl) &&
    validDate(input.provenance.retrievedAt) &&
    Boolean(input.provenance.methodology) &&
    input.provenance.confidence !== "low" &&
    input.provenance.confidence !== "unknown";

  if (!complete) {
    return {
      state: "unknown",
      value: null,
      displayValue: "Unknown",
      reason: input.reason ?? "A sourced value, retrieval date, and methodology are required.",
      provenance: input.provenance,
    };
  }

  return {
    state: "known",
    value: input.value,
    displayValue: input.displayValue,
    reason: null,
    provenance: input.provenance,
  };
}

export function chartProvenance(input: {
  canonicalUrl?: string;
  retrievedAt?: string;
  sourceType?: string;
  methodology?: string;
  description?: string;
}): MIProvenance {
  return {
    sourceUrl: input.canonicalUrl || null,
    sourceLabel: input.sourceType === "json_ld_dataset" ? "Published benchmark dataset" : "Committed normalized dataset",
    retrievedAt: validDate(input.retrievedAt) ? input.retrievedAt : null,
    methodology: input.methodology || input.description || null,
    confidence: input.sourceType === "json_ld_dataset" ? "medium" : "unknown",
  };
}

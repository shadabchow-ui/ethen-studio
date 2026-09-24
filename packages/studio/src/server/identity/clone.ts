/** Studio V5 identity — Design/Clone request validation (STUDIO_10). Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import { IdentityStoreError } from "./types";

export type IdentityCreationFlow = "design" | "clone";

export interface IdentityCreationRequest {
  flow: IdentityCreationFlow;
  name: string;
  /** Purpose statement shown before any usable binding exists. */
  purpose: string;
  /** Consent/rights evidence reference (j03 grant id or evidence locator). */
  evidenceRef: string | null;
  locale: string;
  /** Task the created identity must serve; must be a qualified capability. */
  capability: TaskName;
  sourceAssetIds?: readonly string[];
}

export interface QualifiedCapability {
  task: TaskName;
  executable: boolean;
  reason: string;
}

/** Design/Clone capability gate: the flow may proceed only through a qualified capability. */
export type CapabilityGate = (task: TaskName) => Promise<QualifiedCapability> | QualifiedCapability;

export interface ValidatedCreationRequest extends IdentityCreationRequest {
  sourceAssetIds: readonly string[];
}

function clean(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new IdentityStoreError("IDENTITY_VALIDATION", `${label} is required.`);
  if (trimmed.length > max) throw new IdentityStoreError("IDENTITY_VALIDATION", `${label} exceeds ${max} characters.`);
  return trimmed;
}

/**
 * Validate a Design/Clone request. Clone without consent evidence is
 * denied outright; both flows require purpose, locale, and a qualified
 * capability. Validation alone never creates a usable binding — the
 * created identity still needs consent + provider qualification.
 */
export async function validateCreationRequest(
  input: IdentityCreationRequest,
  gate: CapabilityGate,
): Promise<ValidatedCreationRequest> {
  const flow = input.flow;
  if (flow !== "design" && flow !== "clone") {
    throw new IdentityStoreError("IDENTITY_VALIDATION", "Flow must be design or clone.");
  }
  const name = clean(input.name, "Name", 120);
  const purpose = clean(input.purpose, "Purpose", 2000);
  const locale = clean(input.locale, "Locale", 32);
  const evidenceRef = input.evidenceRef?.trim() ? input.evidenceRef.trim() : null;
  if (flow === "clone" && !evidenceRef) {
    throw new IdentityStoreError(
      "IDENTITY_EVIDENCE_REQUIRED",
      "Voice cloning requires recorded consent evidence before it can proceed.",
    );
  }
  const capability = await gate(input.capability);
  if (!capability.executable) {
    throw new IdentityStoreError("IDENTITY_CAPABILITY_UNQUALIFIED", capability.reason, { task: input.capability });
  }
  const sourceAssetIds = (input.sourceAssetIds ?? []).filter((id) => id.trim().length > 0).map((id) => id.trim());
  return { flow, name, purpose, evidenceRef, locale, capability: input.capability, sourceAssetIds };
}

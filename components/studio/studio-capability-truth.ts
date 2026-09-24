/** Client-safe UI truth only. It does not certify provider readiness or enable generation. */
export type StudioCapabilityPresentation = "v1_candidate" | "catalog_only";

const V1_CANDIDATE_APP_IDS = new Set(["create-image", "image-to-video"]);

export function getStudioCapabilityPresentation(appId: string): StudioCapabilityPresentation {
  return V1_CANDIDATE_APP_IDS.has(appId) ? "v1_candidate" : "catalog_only";
}

export function studioCapabilityLabel(appId: string): string {
  return getStudioCapabilityPresentation(appId) === "v1_candidate"
    ? "V1 candidate — availability depends on private-alpha and provider readiness"
    : "Catalog only — not executable in Studio V1";
}

export function isStudioV1Candidate(appId: string): boolean {
  return getStudioCapabilityPresentation(appId) === "v1_candidate";
}

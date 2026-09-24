/**
 * Studio V5 composites — soundtrack rights gate (STUDIO_15).
 * Music with unestablished commercial/export rights cannot be
 * downloaded, shared, published or exported; only provider-permitted
 * private preview is allowed. Rights come from j03; this module decides.
 */
import "server-only";
import type { SoundtrackDecision, SoundtrackOperation, SoundtrackRights } from "./types";

export function authorizeSoundtrackUse(rights: SoundtrackRights, operation: SoundtrackOperation): SoundtrackDecision {
  if (operation === "preview") {
    if (rights.providerAllowsPrivatePreview) {
      return { allowed: true, reason: "Private preview permitted by the provider.", code: "SOUNDTRACK_OK" };
    }
    return {
      allowed: false,
      reason: "Private preview is not permitted for this soundtrack.",
      code: "SOUNDTRACK_RIGHTS_UNKNOWN",
    };
  }
  if (!rights.hasCommercialGrant || !rights.hasExportGrant) {
    return {
      allowed: false,
      reason:
        "Soundtrack rights are unestablished: commercial and export grants are both required before " +
        `${operation}. Private preview only.`,
      code: "SOUNDTRACK_PREVIEW_ONLY",
    };
  }
  return { allowed: true, reason: "Commercial and export soundtrack grants verified.", code: "SOUNDTRACK_OK" };
}

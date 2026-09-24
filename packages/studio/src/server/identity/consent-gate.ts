/** Studio V5 identity — consent/reference gate at use and delivery (STUDIO_10). Server-only. */
import "server-only";
import type {
  IdentityConsentSnapshot,
  IdentityUseDecision,
  IdentityUseOperation,
  IdentityVersionRecord,
} from "./types";

export interface ConsentGateInput {
  identityId: string;
  version: IdentityVersionRecord | null;
  /** Null snapshot = no grant on file: unknown, therefore blocked. */
  consent: IdentityConsentSnapshot | null;
  operation: IdentityUseOperation;
  now?: string;
}

function expired(snapshot: IdentityConsentSnapshot, now: string): boolean {
  if (snapshot.status === "expired") return true;
  if (snapshot.expiresAt && snapshot.expiresAt <= now) return true;
  return false;
}

/**
 * Reference policy for identity use. Unknown legacy permission is
 * blocked: a missing snapshot, an unknown status, or an unknown
 * verification state denies every operation including preview.
 * Revocation blocks new admission immediately; delivery operations
 * (export/download/share/publish) additionally require a live grant.
 */
export function checkIdentityUse(input: ConsentGateInput): IdentityUseDecision {
  const now = input.now ?? new Date().toISOString();
  if (!input.version || input.version.identityId !== input.identityId) {
    return {
      allowed: false,
      code: "IDENTITY_NOT_FOUND",
      reason: `Identity ${input.identityId} has no usable version for this operation.`,
    };
  }
  if (input.version.revokedAt !== null) {
    return {
      allowed: false,
      code: "IDENTITY_VERSION_REVOKED",
      reason: `Identity version ${input.version.version} was revoked at ${input.version.revokedAt}; new use is blocked.`,
    };
  }
  const consent = input.consent;
  if (!consent) {
    return {
      allowed: false,
      code: "IDENTITY_CONSENT_UNKNOWN",
      reason: "No consent record is on file for this identity, so use is blocked until consent is recorded.",
    };
  }
  if (consent.status === "revoked") {
    return {
      allowed: false,
      code: "IDENTITY_CONSENT_REVOKED",
      reason: "Consent for this identity was revoked; new use is blocked and active work must cancel or quarantine.",
    };
  }
  if (expired(consent, now)) {
    return {
      allowed: false,
      code: "IDENTITY_CONSENT_EXPIRED",
      reason: "Consent for this identity has expired; renew consent before further use or delivery.",
    };
  }
  if (consent.status === "unknown" || consent.verification === "unknown") {
    return {
      allowed: false,
      code: "IDENTITY_CONSENT_UNKNOWN",
      reason:
        "Consent for this identity is unverified (imported legacy permission is not assumed valid); use is blocked until reviewed.",
    };
  }
  if (consent.status === "needs_review") {
    return {
      allowed: false,
      code: "IDENTITY_CONSENT_REVIEW",
      reason: "Consent for this identity needs review before it can be used.",
    };
  }
  return {
    allowed: true,
    code: "IDENTITY_OK",
    reason: `Consent grant ${consent.grantId ?? "on file"} authorizes ${input.operation}.`,
  };
}

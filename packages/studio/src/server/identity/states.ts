/** Studio V5 identity — consumer state vocabulary (STUDIO_10). Server-only. */
import "server-only";
import type { IdentityUseDecision } from "./types";

/** Typed UI states the identity selectors render; fetch failure is never empty success. */
export type IdentityConsumerState =
  | "loading"
  | "ready"
  | "empty"
  | "permission"
  | "blocked"
  | "setup"
  | "error";

export interface IdentityBlockedView {
  state: "blocked";
  title: string;
  description: string;
  actionLabel: string;
}

const BLOCKED_COPY: Record<string, { title: string; description: string; actionLabel: string }> = {
  IDENTITY_CONSENT_UNKNOWN: {
    title: "Consent not verified",
    description: "This identity cannot be used until its consent record is reviewed. Imported permissions are never assumed valid.",
    actionLabel: "Review consent",
  },
  IDENTITY_CONSENT_REVOKED: {
    title: "Consent revoked",
    description: "Consent for this identity was revoked. New work is blocked; late outputs are quarantined.",
    actionLabel: "View rights",
  },
  IDENTITY_CONSENT_EXPIRED: {
    title: "Consent expired",
    description: "Consent for this identity has expired. Renew it before further use or delivery.",
    actionLabel: "Renew consent",
  },
  IDENTITY_CONSENT_REVIEW: {
    title: "Consent needs review",
    description: "This identity is waiting on a consent review before it can be used.",
    actionLabel: "Review consent",
  },
  IDENTITY_VERSION_REVOKED: {
    title: "Version revoked",
    description: "This identity version was revoked. Select another version or identity.",
    actionLabel: "Choose version",
  },
  IDENTITY_NOT_FOUND: {
    title: "Identity unavailable",
    description: "This identity is not available in the current project.",
    actionLabel: "Browse library",
  },
};

/** Project a use-decision into the blocked view the selectors render. */
export function blockedViewFor(decision: IdentityUseDecision): IdentityBlockedView | null {
  if (decision.allowed) return null;
  const copy = BLOCKED_COPY[decision.code] ?? BLOCKED_COPY.IDENTITY_NOT_FOUND;
  return { state: "blocked", ...copy };
}

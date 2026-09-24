/** Studio V5 policy — readable reason codes + actionable remediation (STUDIO_03). */
import "server-only";

/** Frozen policy engine version stamped on every decision. */
export const STUDIO_POLICY_VERSION = "studio-policy-v1" as const;

export type PolicyReasonCode =
  | "ALLOWED"
  | "CONSENT_REVOKED"
  | "CONSENT_EXPIRED"
  | "CONSENT_MISSING"
  | "CONSENT_UNKNOWN_LEGACY"
  | "CONSENT_SCOPE_MISMATCH"
  | "CONSENT_NEEDS_REVIEW"
  | "RIGHTS_UNKNOWN"
  | "RIGHTS_BLOCKED"
  | "RIGHTS_COMMERCIAL_UNESTABLISHED"
  | "RIGHTS_CHANNEL_MISMATCH"
  | "RIGHTS_EXPIRED"
  | "AUTHORITY_MISSING"
  | "AUTHORITY_EXPIRED"
  | "AUTHORITY_CHANNEL_MISMATCH"
  | "AUTHORITY_CLASS_MISMATCH"
  | "AUTHORITY_LIMIT_EXCEEDED"
  | "AUTHORITY_REVOKED"
  | "IDENTITY_RIGHTS_MISSING"
  | "REVIEW_LINK_SCOPE_MISMATCH"
  | "REVIEW_LINK_EXPIRED"
  | "REVIEW_LINK_REVOKED"
  | "REVIEW_LINK_UNKNOWN"
  | "DOWNLOAD_REAUTHORIZATION_REQUIRED"
  | "DELIVERY_GRANT_EXPIRED"
  | "CONTENT_REVIEW_REQUIRED"
  | "SPEND_APPROVAL_REQUIRED"
  | "FORBIDDEN_ROLE"
  | "UNKNOWN_ACTION"
  | "LATE_OUTPUT_QUARANTINED";

export interface ReasonDetail {
  /** Short human-readable title for UI surfaces. */
  title: string;
  /** What the user/operator should do next. Null when allowed. */
  remediation: string | null;
}

/** Readable titles + remediation for every reason code (all UI owners). */
export const POLICY_REASON_DETAILS: Readonly<Record<PolicyReasonCode, ReasonDetail>> = {
  ALLOWED: { title: "Allowed", remediation: null },
  CONSENT_REVOKED: {
    title: "Consent was revoked",
    remediation: "This identity can no longer be used. Ask the rights holder to record a new consent grant.",
  },
  CONSENT_EXPIRED: {
    title: "Consent expired",
    remediation: "Renew the consent grant before generating or delivering with this identity.",
  },
  CONSENT_MISSING: {
    title: "No consent on file",
    remediation: "Record a consent grant for this identity before continuing.",
  },
  CONSENT_UNKNOWN_LEGACY: {
    title: "Consent needs verification",
    remediation: "This consent was imported from a legacy record and is not verified. Complete verification to re-enable use.",
  },
  CONSENT_SCOPE_MISMATCH: {
    title: "Consent does not cover this use",
    remediation: "The grant covers a different operation, channel, or provider. Request an expanded grant.",
  },
  CONSENT_NEEDS_REVIEW: {
    title: "Consent is under review",
    remediation: "Use is blocked until the open review or abuse report is resolved.",
  },
  RIGHTS_UNKNOWN: {
    title: "Rights are unestablished",
    remediation: "Rights for this asset are unknown, so delivery is blocked. Add a rights assertion or keep to private preview where permitted.",
  },
  RIGHTS_BLOCKED: {
    title: "Rights blocked",
    remediation: "The rights holder blocked this use. Choose different source material.",
  },
  RIGHTS_COMMERCIAL_UNESTABLISHED: {
    title: "Commercial rights not established",
    remediation: "Commercial or export permission was never established. Obtain a license before downloading, sharing, or publishing.",
  },
  RIGHTS_CHANNEL_MISMATCH: {
    title: "Rights do not cover this channel",
    remediation: "The rights assertion covers different channels. Obtain channel-specific clearance.",
  },
  RIGHTS_EXPIRED: {
    title: "Rights assertion expired",
    remediation: "Renew the rights assertion before delivering this asset.",
  },
  AUTHORITY_MISSING: {
    title: "No publish authority",
    remediation: "Publishing needs explicit approval or a scoped publish authority for this channel.",
  },
  AUTHORITY_EXPIRED: {
    title: "Publish authority expired",
    remediation: "Request a fresh publish approval; the previous authority expired.",
  },
  AUTHORITY_CHANNEL_MISMATCH: {
    title: "Publish authority covers a different channel",
    remediation: "Request publish approval for this specific channel.",
  },
  AUTHORITY_CLASS_MISMATCH: {
    title: "Publish authority covers a different asset class",
    remediation: "Request publish approval covering this asset class.",
  },
  AUTHORITY_LIMIT_EXCEEDED: {
    title: "Publish authority use limit reached",
    remediation: "This authority has no remaining uses. Request a new publish approval.",
  },
  AUTHORITY_REVOKED: {
    title: "Publish authority revoked",
    remediation: "This authority was revoked. Request a new publish approval.",
  },
  IDENTITY_RIGHTS_MISSING: {
    title: "No identity rights",
    remediation: "Your role does not grant identity rights. An identity rights holder must provide consent.",
  },
  REVIEW_LINK_SCOPE_MISMATCH: {
    title: "Review link is bound to a different project",
    remediation: "Review links work only in their original project. Ask for a new link in the correct project.",
  },
  REVIEW_LINK_EXPIRED: {
    title: "Review link expired",
    remediation: "Ask for a fresh review link.",
  },
  REVIEW_LINK_REVOKED: {
    title: "Review link revoked",
    remediation: "This link was revoked. Ask for a fresh review link.",
  },
  REVIEW_LINK_UNKNOWN: {
    title: "Unknown review link",
    remediation: "This link is not recognized. Check the URL or ask for a new link.",
  },
  DOWNLOAD_REAUTHORIZATION_REQUIRED: {
    title: "Download needs reauthorization",
    remediation: "Rights or consent changed since this download was authorized. Request a fresh download.",
  },
  DELIVERY_GRANT_EXPIRED: {
    title: "Download link expired",
    remediation: "Request a fresh download.",
  },
  CONTENT_REVIEW_REQUIRED: {
    title: "Content review required",
    remediation: "This delivery needs content approval. Request a review; rights and spend approvals do not substitute.",
  },
  SPEND_APPROVAL_REQUIRED: {
    title: "Spend approval required",
    remediation: "This action needs spend approval. Rights clearance does not substitute.",
  },
  FORBIDDEN_ROLE: {
    title: "Role cannot perform this action",
    remediation: "Your role does not permit this action. Ask a workspace admin for access.",
  },
  UNKNOWN_ACTION: {
    title: "Unknown action",
    remediation: "This action is not recognized, so it is blocked. Use a supported Studio action.",
  },
  LATE_OUTPUT_QUARANTINED: {
    title: "Output quarantined after revocation",
    remediation: "This output arrived after consent was revoked and is quarantined. It cannot be delivered.",
  },
};

export function reasonDetail(code: PolicyReasonCode): ReasonDetail {
  return POLICY_REASON_DETAILS[code];
}

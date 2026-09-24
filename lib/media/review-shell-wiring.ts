/**
 * Studio V2 Job 12 (P0-7) — review/approval shell wiring.
 *
 * Pure mappers from canonical Studio review state to shared card props.
 * The UI is never the approval authority: every mapper re-checks the
 * canonical record (expiry, revocation, consent liveness, export linkage)
 * and degrades to an explicit blocked state instead of rendering an
 * actionable control.
 */

import type { ApprovalCardPayload, ApprovalCardProps } from "@ethen/ui/approval-card";

export type CanonicalApprovalLifecycle =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "consumed";

export interface CanonicalStudioApproval {
  id: string;
  title: string;
  description: string;
  riskCategories: string[];
  action: string;
  resource: string;
  affectedEntities: string[];
  lifecycle: CanonicalApprovalLifecycle;
  expiresAt: string | null;
  consumedAt: string | null;
  promptHash: string | null;
}

export interface CanonicalConsentSnapshot {
  id: string;
  lifecycle: "active" | "granted" | "approved" | "revoked" | "expired" | string;
  expiresAt: string | null;
}

export interface CanonicalReviewLink {
  id: string;
  expiresAt: string | null;
  revokedAt: string | null;
  consentIds: string[];
}

export interface CanonicalExportLinkage {
  exportId: string;
  manifestHash: string | null;
  approvalId: string | null;
  approvalConsumed: boolean;
}

export type ReviewBlockCode =
  | "CONSENT_REVOKED"
  | "CONSENT_EXPIRED"
  | "REVIEW_EXPIRED"
  | "REVIEW_REVOKED"
  | "APPROVAL_INVALID"
  | "APPROVAL_EXPIRED"
  | "EXPORT_LINKAGE_BROKEN";

export interface ReviewBlock {
  blocked: true;
  code: ReviewBlockCode;
  message: string;
}

export interface ReviewClear {
  blocked: false;
}

function expiredAt(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  return !Number.isFinite(parsed) || parsed <= now;
}

function checkConsents(
  consents: readonly CanonicalConsentSnapshot[],
  requiredIds: readonly string[],
  now: number,
): ReviewBlock | null {
  for (const id of requiredIds) {
    const consent = consents.find((entry) => entry.id === id);
    if (!consent || consent.lifecycle === "revoked") {
      return { blocked: true, code: "CONSENT_REVOKED", message: `Consent ${id.slice(0, 8)}… is revoked or missing; resolution is blocked.` };
    }
    if (consent.lifecycle === "expired" || expiredAt(consent.expiresAt, now)) {
      return { blocked: true, code: "CONSENT_EXPIRED", message: `Consent ${id.slice(0, 8)}… expired; resolution is blocked.` };
    }
    if (consent.lifecycle !== "active" && consent.lifecycle !== "granted" && consent.lifecycle !== "approved") {
      return { blocked: true, code: "CONSENT_REVOKED", message: `Consent ${id.slice(0, 8)}… is not granted; resolution is blocked.` };
    }
  }
  return null;
}

/**
 * Gate a review link resolution. Returns a block for revoked/expired links
 * or non-live consent; otherwise clear. Mirrors the server resolver without
 * duplicating its authority.
 */
export function gateReviewLinkResolution(input: {
  link: CanonicalReviewLink;
  consents: readonly CanonicalConsentSnapshot[];
  now?: number;
}): ReviewBlock | ReviewClear {
  const now = input.now ?? Date.now();
  if (input.link.revokedAt) {
    return { blocked: true, code: "REVIEW_REVOKED", message: "This review link was revoked." };
  }
  if (expiredAt(input.link.expiresAt, now)) {
    return { blocked: true, code: "REVIEW_EXPIRED", message: "This review link expired; request a new one." };
  }
  return checkConsents(input.consents, input.link.consentIds, now) ?? { blocked: false };
}

/**
 * Gate delivery on export linkage: the export must pin a manifest hash and
 * reference a consumed approval. Anything else blocks delivery.
 */
export function gateExportDelivery(input: {
  linkage: CanonicalExportLinkage;
  approval: CanonicalStudioApproval | null;
  now?: number;
}): ReviewBlock | ReviewClear {
  const now = input.now ?? Date.now();
  if (!input.linkage.manifestHash || !/^[0-9a-f]{64}$/i.test(input.linkage.manifestHash)) {
    return { blocked: true, code: "EXPORT_LINKAGE_BROKEN", message: "Export manifest is not pinned; delivery is blocked." };
  }
  if (!input.linkage.approvalId || !input.approval || !input.linkage.approvalConsumed) {
    return { blocked: true, code: "EXPORT_LINKAGE_BROKEN", message: "Export approval linkage is not pinned; delivery is blocked." };
  }
  if (input.approval.lifecycle === "expired" || expiredAt(input.approval.expiresAt, now)) {
    return { blocked: true, code: "APPROVAL_EXPIRED", message: "Export approval expired; delivery is blocked." };
  }
  if (input.approval.lifecycle !== "approved" && input.approval.lifecycle !== "consumed") {
    return { blocked: true, code: "APPROVAL_INVALID", message: "Export approval is not valid; delivery is blocked." };
  }
  return { blocked: false };
}

function approvalStatusForCard(
  lifecycle: CanonicalApprovalLifecycle,
  expiresAt: string | null,
  now: number,
): ApprovalCardProps["status"] {
  // Job 12B certification fix: lapsed expiry renders expired for every
  // non-terminal lifecycle, including approved. The canonical authority
  // (authorize/claimExecution) denies approved-but-lapsed records, so the
  // card must never present them as actionable. Terminal states keep
  // their truth (executed happened; rejected was decided).
  if (lifecycle === "denied") return "rejected";
  if (lifecycle === "consumed") return "executed";
  if (lifecycle === "expired" || expiredAt(expiresAt, now)) return "expired";
  if (lifecycle === "approved") return "approved";
  return "pending";
}

/**
 * Map a canonical approval to ApprovalCard props. Expired records render as
 * expired even if the stored lifecycle lags; denied/consumed never render
 * actionable controls (no actions attached — the shell adds none).
 */
export function toApprovalCardProps(
  approval: CanonicalStudioApproval,
  options?: { now?: number },
): { payload: ApprovalCardPayload; status: ApprovalCardProps["status"] } {
  const now = options?.now ?? Date.now();
  return {
    payload: {
      title: approval.title,
      description: approval.description,
      riskLevel: approval.riskCategories.join(", ") || "unspecified",
      action: approval.action,
      resource: approval.resource,
      affectedEntities: approval.affectedEntities,
      expiresAt: approval.expiresAt,
      payloadHash: approval.promptHash,
    },
    status: approvalStatusForCard(approval.lifecycle, approval.expiresAt, now),
  };
}

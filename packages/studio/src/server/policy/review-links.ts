/**
 * Studio V5 policy — review-link presentation checks (STUDIO_03).
 *
 * Review-link issuance/storage schema belongs to STUDIO_18; this module owns
 * only the policy question "may this token be presented in this scope".
 * Links are scoped capabilities: a copied token presented outside its bound
 * scope denies, and presentation never enumerates other links or assets.
 */
import "server-only";
import { serializeScope, type ProjectScope } from "../../contracts/scope";
import type { PolicyReasonCode } from "./reason-codes";

export interface ReviewLinkCapability {
  linkId: string;
  /** SHA-256 of the token. The raw token is never stored or logged. */
  tokenHash: string;
  scope: ProjectScope;
  assetIds: readonly string[];
  expiresAt: string;
  revokedAt: string | null;
}

export interface ReviewLinkPresentation {
  ok: boolean;
  reasonCode: PolicyReasonCode;
  linkId: string | null;
}

/**
 * Authorize presenting a review-link token in a scope. Pure and fail-closed:
 * unknown/expired/revoked/cross-scope presentations all deny. No enumeration:
 * the result reveals nothing beyond allow/deny for the presented hash.
 */
export function authorizeReviewLinkPresentation(
  links: readonly ReviewLinkCapability[],
  tokenHash: string,
  presentationScope: ProjectScope,
  nowMs: number,
): ReviewLinkPresentation {
  const normalized = tokenHash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    return { ok: false, reasonCode: "REVIEW_LINK_UNKNOWN", linkId: null };
  }
  const link = links.find((l) => l.tokenHash.toLowerCase() === normalized) ?? null;
  if (!link) return { ok: false, reasonCode: "REVIEW_LINK_UNKNOWN", linkId: null };
  if (serializeScope(link.scope) !== serializeScope(presentationScope)) {
    return { ok: false, reasonCode: "REVIEW_LINK_SCOPE_MISMATCH", linkId: link.linkId };
  }
  if (link.revokedAt) return { ok: false, reasonCode: "REVIEW_LINK_REVOKED", linkId: link.linkId };
  if (Date.parse(link.expiresAt) <= nowMs) {
    return { ok: false, reasonCode: "REVIEW_LINK_EXPIRED", linkId: link.linkId };
  }
  return { ok: true, reasonCode: "ALLOWED", linkId: link.linkId };
}

/** Test-only capability registry. STUDIO_18 owns durable review storage. */
export class MemoryReviewLinkStore {
  private readonly links: ReviewLinkCapability[] = [];

  register(link: ReviewLinkCapability): ReviewLinkCapability {
    this.links.push(link);
    return link;
  }

  list(): readonly ReviewLinkCapability[] {
    return [...this.links];
  }
}

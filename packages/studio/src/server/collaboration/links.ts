/**
 * Studio V5 collaboration — revocable public review links (STUDIO_18).
 *
 * Bearer tokens are 256-bit random; only the SHA-256 hash is stored.
 * Resolution re-checks expiry, revocation, and asset scope, and fails
 * with an identical NOT_FOUND for unknown, expired, or revoked tokens
 * so tokens cannot be enumerated. Legacy links import by reference with
 * verified scope/expiry only.
 */
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { collaborationError } from "./types";
import { assertCapability } from "./roles";
import type { PublicReviewLink, ReviewRequest, StudioRole } from "./types";
import type { ProjectScope } from "../../contracts/scope";

const TOKEN_HASH_RE = /^[0-9a-f]{64}$/;
const MAX_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashReviewToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time token comparison against a stored hash. */
export function tokenMatches(token: string, storedHash: string): boolean {
  if (!TOKEN_HASH_RE.test(storedHash)) return false;
  const candidate = hashReviewToken(token);
  return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(storedHash, "hex"));
}

export function mintReviewToken(): string {
  return randomBytes(32).toString("base64url");
}

function assertScope(scope: ProjectScope, owner: ProjectScope, noun: string): void {
  if (scope.tenantId !== owner.tenantId || scope.projectId !== owner.projectId) {
    throw collaborationError("FORBIDDEN", `${noun} belongs to another project scope.`);
  }
}

export function createPublicLink(input: {
  scope: ProjectScope;
  role: StudioRole;
  actorId: string;
  review?: ReviewRequest | null;
  assetIds: readonly string[];
  note?: string;
  ttlMs: number;
  idEmitted?: string;
  tokenEmitted?: string;
  now: string;
}): { link: PublicReviewLink; token: string } {
  assertCapability(input.role, "links.manage");
  if (input.review) assertScope(input.scope, input.review.scope, "Review");
  if (!input.actorId.trim()) throw collaborationError("BAD_REQUEST", "Creator identity is required.");
  if (input.assetIds.length === 0) throw collaborationError("BAD_REQUEST", "Links need at least one asset.");
  if (!Number.isInteger(input.ttlMs) || input.ttlMs <= 0 || input.ttlMs > MAX_LINK_TTL_MS) {
    throw collaborationError("BAD_REQUEST", "Link TTL must be a positive duration up to 30 days.");
  }
  if (input.review) {
    const pinned = new Set(input.review.pinnedAssets.map((pin) => pin.assetId));
    const outside = input.assetIds.filter((id) => !pinned.has(id));
    if (outside.length > 0) {
      throw collaborationError("BAD_REQUEST", `Link scope exceeds the review pins: ${outside.join(", ")}.`);
    }
  }
  const token = input.tokenEmitted ?? mintReviewToken();
  const nowMs = Date.parse(input.now);
  return {
    link: {
      linkId: input.idEmitted ?? `${Date.now().toString(36)}-${token.slice(0, 8)}`,
      scope: input.scope,
      reviewId: input.review ? input.review.reviewId : null,
      tokenHash: hashReviewToken(token),
      assetIds: [...input.assetIds],
      note: input.note?.trim() ?? "",
      expiresAt: new Date(nowMs + input.ttlMs).toISOString(),
      revokedAt: null,
      createdBy: input.actorId,
      origin: "collaboration",
      legacyLinkId: null,
      createdAt: input.now,
    },
    token,
  };
}

export type LinkResolution =
  | { ok: true; link: PublicReviewLink }
  | { ok: false; error: "NOT_FOUND" };

/**
 * Resolve a bearer token to its link. Unknown, expired, revoked, and
 * out-of-scope tokens all resolve to the same NOT_FOUND.
 */
export function resolvePublicLink(input: {
  token: string;
  candidates: readonly PublicReviewLink[];
  now: string;
}): LinkResolution {
  if (!input.token) return { ok: false, error: "NOT_FOUND" };
  const nowMs = Date.parse(input.now);
  for (const link of input.candidates) {
    if (!tokenMatches(input.token, link.tokenHash)) continue;
    if (link.revokedAt) return { ok: false, error: "NOT_FOUND" };
    if (Date.parse(link.expiresAt) <= nowMs) return { ok: false, error: "NOT_FOUND" };
    if (link.assetIds.length === 0) return { ok: false, error: "NOT_FOUND" };
    return { ok: true, link };
  }
  return { ok: false, error: "NOT_FOUND" };
}

/** Revoke a link. Revocation is immediate and permanent. */
export function revokePublicLink(input: {
  link: PublicReviewLink;
  scope: ProjectScope;
  role: StudioRole;
  now: string;
}): PublicReviewLink {
  assertScope(input.scope, input.link.scope, "Link");
  assertCapability(input.role, "links.manage");
  if (input.link.revokedAt) return input.link;
  return { ...input.link, revokedAt: input.now };
}

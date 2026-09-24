/**
 * Studio V2 Job 07 — token-gated review links with expiry and revocation.
 * Links are project-bound, read-only, and short-lived. Resolution re-checks
 * expiry, revocation, asset presence, and recorded consent snapshots, so
 * expired links, revoked links, removed consent, and deleted assets all
 * deny with explicit reasons. Cross-tenant access is impossible by
 * construction: tokens resolve within exactly one project.
 */

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createServiceClient } from "@ethen/database/service";
import { generateSignedUrl } from "@ethen/database/storage/tenant-object-storage";
import type { StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";

export const REVIEW_LINK_DEFAULT_TTL_SECONDS = 7 * 24 * 3600;
export const REVIEW_LINK_MAX_TTL_SECONDS = 30 * 24 * 3600;
export const REVIEW_LINK_URL_TTL_SECONDS = 600;

export interface ReviewLinkScope {
  assetIds: string[];
}

export interface CreatedReviewLink {
  id: string;
  /** Returned exactly once at creation; only the hash is stored. */
  token: string;
  expiresAt: string;
}

export interface ResolvedReviewLink {
  projectId: string;
  note: string;
  expiresAt: string;
  assets: Array<{
    assetId: string;
    title: string;
    kind: string;
    contentHash: string | null;
    signedUrl: string | null;
  }>;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Job 12B: canonical token hash for shell bindings (same function the resolver uses). */
export function hashReviewToken(token: string): string {
  return hashToken(token.trim());
}

/**
 * Create a review link. Assets must all live in the scope project;
 * consent snapshots are verified granted and unexpired now, and re-checked
 * on every resolve.
 */
export async function createReviewLink(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: { assetIds: string[]; ttlSeconds?: number; note?: string; consentIds?: string[]; idempotencyKey: string },
): Promise<CreatedReviewLink> {
  if (input.assetIds.length === 0) throw new Error("REVIEW_INVALID: at least one asset is required.");
  if (input.assetIds.length > 50) throw new Error("REVIEW_INVALID: at most 50 assets per link.");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey)) {
    throw new Error("REVIEW_INVALID: idempotency key must be 8-128 chars.");
  }
  const ttl = input.ttlSeconds ?? REVIEW_LINK_DEFAULT_TTL_SECONDS;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > REVIEW_LINK_MAX_TTL_SECONDS) {
    throw new Error("REVIEW_INVALID: ttl must be 1s..30d.");
  }
  for (const assetId of input.assetIds) {
    const row = await repo.get(scope, "studio_assets", assetId);
    if (!row) throw new Error(`REVIEW_NOT_FOUND: asset ${assetId.slice(0, 8)}… is not in this project.`);
  }
  const consentIds = [...new Set(input.consentIds ?? [])];
  for (const consentId of consentIds) {
    const row = await repo.get(scope, "studio_consents", consentId).catch(() => null);
    const data = (row?.payload ?? {}) as Record<string, unknown>;
    const lifecycle = String(data.lifecycle ?? "");
    const expiresAt = typeof data.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
    if (!row || (lifecycle !== "active" && lifecycle !== "granted" && lifecycle !== "approved")) {
      throw new Error(`REVIEW_CONSENT: consent ${consentId.slice(0, 8)}… is not granted.`);
    }
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      throw new Error(`REVIEW_CONSENT: consent ${consentId.slice(0, 8)}… expired.`);
    }
  }
  const existing = (await repo.list(scope, "studio_review_links")).find(
    (row) => ((row.payload as Record<string, unknown>).idempotency_key as string) === input.idempotencyKey,
  );
  if (existing) {
    throw new Error("REVIEW_REPLAY: this creation key was already used; tokens are returned exactly once and never re-displayed.");
  }
  const token = randomBytes(32).toString("hex");
  const at = new Date().toISOString();
  const id = `rev-${token.slice(0, 12)}`;
  await repo.insert(scope, "studio_review_links", {
    id,
    payload: {
      scope: { assetIds: [...input.assetIds] },
      token_hash: hashToken(token),
      note: input.note?.slice(0, 500) ?? "",
      consent_snapshot: consentIds,
      idempotency_key: input.idempotencyKey,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      revoked_at: null,
    },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  const created = await repo.get(scope, "studio_review_links", id);
  const data = (created?.payload ?? {}) as Record<string, unknown>;
  return { id, token, expiresAt: String(data.expires_at ?? "") };
}

export interface ReviewResolveDeps {
  findByTokenHash?(tokenHash: string): Promise<{
    id: string; organizationId: string; projectId: string;
    scope: { assetIds: string[] }; note: string;
    consentSnapshot: string[]; expiresAt: string; revokedAt: string | null;
  } | null>;
  loadConsent?(projectId: string, consentId: string): Promise<{ lifecycle: string; expiresAt: string | null } | null>;
  loadAsset?(projectId: string, assetId: string): Promise<{
    id: string; kind: string; title: string; contentHash: string | null; objectKey: string;
  } | null>;
  signUrl?(objectKey: string): Promise<string | null>;
}

/**
 * Job 12B: the canonical service-backed resolve dependencies, factored out
 * so shell bindings read through the same loaders the resolver uses. No
 * behavior change: resolveReviewLink merges these under caller overrides.
 */
export function defaultReviewResolveDeps(): Required<ReviewResolveDeps> {
  const client = createServiceClient();
  return {
    findByTokenHash: async (hash: string) => {
      if (!client) throw new Error("Review resolution requires a configured service client.");
      const { data, error } = await client.from("studio_review_links")
        .select("id,organization_id,project_id,scope,note,consent_snapshot,expires_at,revoked_at")
        .eq("token_hash", hash).is("deleted_at", null).maybeSingle();
      if (error) throw new Error(`Review resolution failed: ${error.message}`);
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return {
        id: String(row.id),
        organizationId: String(row.organization_id ?? ""),
        projectId: String(row.project_id ?? ""),
        scope: (row.scope ?? { assetIds: [] }) as { assetIds: string[] },
        note: String(row.note ?? ""),
        consentSnapshot: (Array.isArray(row.consent_snapshot) ? row.consent_snapshot : []) as string[],
        expiresAt: String(row.expires_at ?? ""),
        revokedAt: row.revoked_at ? String(row.revoked_at) : null,
      };
    },
    loadConsent: async (projectId: string, consentId: string) => {
      if (!client) throw new Error("Review resolution requires a configured service client.");
      const { data } = await client.from("studio_consents")
        .select("lifecycle,expires_at").eq("id", consentId).eq("project_id", projectId)
        .is("deleted_at", null).maybeSingle();
      const row = data as { lifecycle?: string; expires_at?: string } | null;
      return row ? { lifecycle: String(row.lifecycle ?? ""), expiresAt: row.expires_at ?? null } : null;
    },
    loadAsset: async (projectId: string, assetId: string) => {
      if (!client) throw new Error("Review resolution requires a configured service client.");
      const { data } = await client.from("studio_assets")
        .select("id,asset_kind,content_hash,metadata").eq("id", assetId).eq("project_id", projectId)
        .is("deleted_at", null).maybeSingle();
      if (!data) return null;
      const row = data as { id: string; asset_kind: string; content_hash: string; metadata: Record<string, unknown> };
      return {
        id: String(row.id),
        kind: String(row.asset_kind ?? "unknown"),
        title: typeof row.metadata?.name === "string" ? (row.metadata.name as string) : String(row.id),
        contentHash: typeof row.content_hash === "string" ? row.content_hash : null,
        objectKey: typeof row.metadata?.objectKey === "string" ? (row.metadata.objectKey as string) : "",
      };
    },
    signUrl: async (objectKey: string) => generateSignedUrl(objectKey, REVIEW_LINK_URL_TTL_SECONDS).catch(() => null),
  };
}

/** Resolve a review token without a session. Denials carry explicit reasons. */
export async function resolveReviewLink(
  token: string,
  deps: ReviewResolveDeps = {},
  nowMs: number = Date.now(),
): Promise<ResolvedReviewLink> {
  if (!/^[0-9a-f]{64}$/i.test(token?.trim() ?? "")) throw new Error("REVIEW_DENIED: unknown review link.");
  const tokenHash = hashToken(token.trim());
  const defaults = defaultReviewResolveDeps();
  const findByTokenHash = deps.findByTokenHash ?? defaults.findByTokenHash;
  const link = await findByTokenHash(tokenHash);
  if (!link) throw new Error("REVIEW_DENIED: unknown review link.");
  if (link.revokedAt) throw new Error("REVIEW_DENIED: link revoked.");
  if (Date.parse(link.expiresAt) <= nowMs) throw new Error("REVIEW_DENIED: link expired.");
  if (!link.projectId) throw new Error("REVIEW_DENIED: link has no project binding.");

  const loadConsent = deps.loadConsent ?? defaults.loadConsent;
  // Consent snapshots re-checked live: removed consent denies the link.
  for (const consentId of link.consentSnapshot) {
    const consent = await loadConsent(link.projectId, consentId);
    const expiresAt = consent?.expiresAt ? Date.parse(consent.expiresAt) : NaN;
    if (!consent || !["active", "granted", "approved"].includes(consent.lifecycle) || (Number.isFinite(expiresAt) && expiresAt <= nowMs)) {
      throw new Error("REVIEW_DENIED: recorded consent was removed.");
    }
  }
  const loadAsset = deps.loadAsset ?? defaults.loadAsset;
  const signUrl = deps.signUrl ?? defaults.signUrl;
  const assets: ResolvedReviewLink["assets"] = [];
  for (const assetId of link.scope.assetIds.slice(0, 50)) {
    const asset = await loadAsset(link.projectId, assetId);
    if (!asset) throw new Error("REVIEW_DENIED: linked asset was removed.");
    assets.push({
      assetId: asset.id,
      title: asset.title,
      kind: asset.kind,
      contentHash: asset.contentHash,
      signedUrl: asset.objectKey ? await signUrl(asset.objectKey) : null,
    });
  }
  return { projectId: link.projectId, note: link.note, expiresAt: link.expiresAt, assets };
}

/** Revoke a review link. Members only; idempotent. */
export async function revokeReviewLink(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  linkId: string,
): Promise<{ id: string; revoked: boolean }> {
  const row = await repo.get(scope, "studio_review_links", linkId);
  if (!row) throw new Error("REVIEW_NOT_FOUND: no such link in this project.");
  const data = row.payload as Record<string, unknown>;
  if (data.revoked_at) return { id: linkId, revoked: true };
  const patched = await repo.patchSystemRecord(scope, "studio_review_links", linkId, { revoked_at: new Date().toISOString() });
  if (!patched) throw new Error("REVIEW_NOT_FOUND: no such link in this project.");
  return { id: linkId, revoked: true };
}

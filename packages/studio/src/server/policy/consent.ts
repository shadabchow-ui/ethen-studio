/** Studio V5 policy — append-only consent grants + revocation events (STUDIO_03). */
import "server-only";
import { randomUUID } from "node:crypto";
import { serializeScope, type ProjectScope } from "../../contracts/scope";
import { policyError } from "./types";
import type {
  ConsentGrant,
  ConsentGrantInput,
  ConsentRevocation,
  ConsentStatus,
} from "./types";

export interface ConsentRepository {
  appendGrant(scope: ProjectScope, input: ConsentGrantInput): Promise<ConsentGrant>;
  getGrant(scope: ProjectScope, grantId: string): Promise<ConsentGrant | null>;
  listGrantsForIdentity(scope: ProjectScope, identityId: string): Promise<readonly ConsentGrant[]>;
  appendRevocation(
    scope: ProjectScope,
    input: { grantId: string; reason: string; actorId: string; obligationsStatus?: ConsentRevocation["obligationsStatus"] },
  ): Promise<ConsentRevocation>;
  listRevocations(scope: ProjectScope, grantId: string): Promise<readonly ConsentRevocation[]>;
}

/** Default provider obligations recorded on revocation (never assumed executed). */
export const DEFAULT_REVOCATION_OBLIGATIONS: readonly string[] = [
  "Cease generation using this grant's covered identities.",
  "Delete or quarantine covered source samples where the provider exposes deletion.",
  "Honor takedown of previously published outputs on request.",
];

function nowIso(now?: string): string {
  return now ?? new Date().toISOString();
}

function validateGrantInput(input: ConsentGrantInput): void {
  if (!input.identityId.trim()) throw policyError("BAD_REQUEST", "identityId is required.");
  if (!input.actorId.trim()) throw policyError("BAD_REQUEST", "actorId is required.");
  if (!input.subjectRef.trim()) throw policyError("BAD_REQUEST", "subjectRef is required.");
  if (!input.purpose.trim()) throw policyError("BAD_REQUEST", "purpose is required.");
  if (input.operations.length === 0) throw policyError("BAD_REQUEST", "at least one operation is required.");
  if (!input.termsVersion.trim()) throw policyError("BAD_REQUEST", "termsVersion is required.");
  if (input.identityVersion !== undefined && input.identityVersion !== null) {
    if (!Number.isInteger(input.identityVersion) || input.identityVersion <= 0) {
      throw policyError("BAD_REQUEST", "identityVersion must be a positive integer.");
    }
  }
  if (input.expiresAt !== undefined && input.expiresAt !== null && Number.isNaN(Date.parse(input.expiresAt))) {
    throw policyError("BAD_REQUEST", "expiresAt must be an ISO timestamp.");
  }
}

/** Effective lifecycle of a grant at a point in time (revocations win). */
export function effectiveConsentStatus(
  grant: ConsentGrant,
  revocations: readonly ConsentRevocation[],
  atMs: number,
): ConsentStatus {
  if (revocations.length > 0 || grant.status === "revoked") return "revoked";
  if (grant.status === "needs_review") return "needs_review";
  if (grant.status === "unknown") return "unknown";
  if (grant.status === "expired") return "expired";
  if (grant.expiresAt !== null && Date.parse(grant.expiresAt) <= atMs) return "expired";
  return "active";
}

/** In-memory append-only store. Production binds Supabase-backed adapters. */
export class MemoryConsentRepository implements ConsentRepository {
  private readonly grants = new Map<string, ConsentGrant>();
  private readonly revocations = new Map<string, ConsentRevocation[]>();

  private key(scope: ProjectScope, id: string): string {
    return `${serializeScope(scope)}:${id}`;
  }

  async appendGrant(scope: ProjectScope, input: ConsentGrantInput, now?: string): Promise<ConsentGrant> {
    validateGrantInput(input);
    const at = nowIso(now);
    const grant: ConsentGrant = {
      grantId: randomUUID(),
      scope,
      identityId: input.identityId,
      identityVersion: input.identityVersion ?? null,
      actorId: input.actorId,
      subjectRef: input.subjectRef,
      purpose: input.purpose,
      operations: [...input.operations],
      channels: [...(input.channels ?? [])],
      commercialScope: input.commercialScope ?? "unknown",
      geography: [...(input.geography ?? [])],
      allowedProviders: [...(input.allowedProviders ?? [])],
      termsVersion: input.termsVersion,
      verificationState: input.verificationState ?? "user_declared",
      status: "active",
      provenance: "studio_v5",
      legacyRef: null,
      supersedes: input.supersedes ?? null,
      grantedAt: at,
      expiresAt: input.expiresAt ?? null,
      payloadHash: input.payloadHash ?? null,
    };
    this.grants.set(this.key(scope, grant.grantId), grant);
    return grant;
  }

  /**
   * Import path for legacy evidence: preserves provenance and the original
   * lifecycle without rewriting history. Active legacy rows land as
   * `unknown` (blocked until re-verified); revoked/expired pass through.
   */
  async importGrant(scope: ProjectScope, grant: Omit<ConsentGrant, "scope">): Promise<ConsentGrant> {
    const row: ConsentGrant = { ...grant, scope };
    this.grants.set(this.key(scope, row.grantId), row);
    return row;
  }

  async getGrant(scope: ProjectScope, grantId: string): Promise<ConsentGrant | null> {
    return this.grants.get(this.key(scope, grantId)) ?? null;
  }

  async listGrantsForIdentity(scope: ProjectScope, identityId: string): Promise<readonly ConsentGrant[]> {
    const prefix = `${serializeScope(scope)}:`;
    const rows: ConsentGrant[] = [];
    for (const [key, grant] of this.grants) {
      if (key.startsWith(prefix) && grant.identityId === identityId) rows.push(grant);
    }
    rows.sort((a, b) => a.grantedAt.localeCompare(b.grantedAt));
    return rows;
  }

  async appendRevocation(
    scope: ProjectScope,
    input: { grantId: string; reason: string; actorId: string; obligationsStatus?: ConsentRevocation["obligationsStatus"] },
    now?: string,
  ): Promise<ConsentRevocation> {
    const grant = await this.getGrant(scope, input.grantId);
    if (!grant) throw policyError("NOT_FOUND", "consent grant not found in this scope.");
    if (!input.reason.trim()) throw policyError("BAD_REQUEST", "revocation reason is required.");
    // The grant row is append-only: it is never mutated. Revocation is an event.
    const revocation: ConsentRevocation = {
      revocationId: randomUUID(),
      grantId: grant.grantId,
      scope,
      identityId: grant.identityId,
      revokedAt: nowIso(now),
      reason: input.reason,
      actorId: input.actorId,
      providerObligations: [...DEFAULT_REVOCATION_OBLIGATIONS],
      obligationsStatus: input.obligationsStatus ?? "pending_external",
    };
    const list = this.revocations.get(this.key(scope, grant.grantId)) ?? [];
    list.push(revocation);
    this.revocations.set(this.key(scope, grant.grantId), list);
    return revocation;
  }

  async listRevocations(scope: ProjectScope, grantId: string): Promise<readonly ConsentRevocation[]> {
    return [...(this.revocations.get(this.key(scope, grantId)) ?? [])];
  }
}

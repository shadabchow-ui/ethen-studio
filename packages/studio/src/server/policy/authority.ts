/** Studio V5 policy — publish authorities + delivery grants (STUDIO_03). */
import "server-only";
import { randomUUID } from "node:crypto";
import { serializeScope, type ProjectScope } from "../../contracts/scope";
import { policyError } from "./types";
import type { DeliveryGrant, PublishAuthority, PublishAuthorityInput } from "./types";

export interface AuthorityRepository {
  grantAuthority(scope: ProjectScope, input: PublishAuthorityInput): Promise<PublishAuthority>;
  getAuthority(scope: ProjectScope, authorityId: string): Promise<PublishAuthority | null>;
  listAuthoritiesForActor(scope: ProjectScope, actorId: string): Promise<readonly PublishAuthority[]>;
  consumeAuthority(scope: ProjectScope, authorityId: string): Promise<PublishAuthority>;
  revokeAuthority(scope: ProjectScope, authorityId: string): Promise<PublishAuthority>;
}

export interface DeliveryGrantStore {
  issueGrant(
    scope: ProjectScope,
    input: { assetId: string; assetVersion: number; grantedTo: string; decisionId: string; ttlSeconds: number; maxUses?: number },
  ): Promise<DeliveryGrant>;
  consumeGrant(scope: ProjectScope, grantId: string): Promise<DeliveryGrant | null>;
  getGrant(scope: ProjectScope, grantId: string): Promise<DeliveryGrant | null>;
}

/** In-memory store. Production binds Supabase-backed adapters. */
export class MemoryAuthorityRepository implements AuthorityRepository {
  private readonly rows = new Map<string, PublishAuthority>();

  private key(scope: ProjectScope, id: string): string {
    return `${serializeScope(scope)}:${id}`;
  }

  async grantAuthority(
    scope: ProjectScope,
    input: PublishAuthorityInput,
    now?: string,
  ): Promise<PublishAuthority> {
    if (!input.channel.trim()) throw policyError("BAD_REQUEST", "channel is required.");
    if (!input.grantedBy.trim()) throw policyError("BAD_REQUEST", "grantedBy is required.");
    if (!input.grantedTo.trim()) throw policyError("BAD_REQUEST", "grantedTo is required.");
    if (Number.isNaN(Date.parse(input.expiresAt))) {
      throw policyError("BAD_REQUEST", "expiresAt must be an ISO timestamp.");
    }
    if (input.maxUses !== undefined && input.maxUses !== null) {
      if (!Number.isInteger(input.maxUses) || input.maxUses <= 0) {
        throw policyError("BAD_REQUEST", "maxUses must be a positive integer.");
      }
    }
    const row: PublishAuthority = {
      authorityId: randomUUID(),
      scope,
      channel: input.channel,
      assetClass: input.assetClass,
      grantedBy: input.grantedBy,
      grantedTo: input.grantedTo,
      grantedAt: now ?? new Date().toISOString(),
      expiresAt: input.expiresAt,
      maxUses: input.maxUses ?? null,
      usedCount: 0,
      revokedAt: null,
      limits: { ...(input.limits ?? {}) },
    };
    this.rows.set(this.key(scope, row.authorityId), row);
    return row;
  }

  async getAuthority(scope: ProjectScope, authorityId: string): Promise<PublishAuthority | null> {
    return this.rows.get(this.key(scope, authorityId)) ?? null;
  }

  async listAuthoritiesForActor(scope: ProjectScope, actorId: string): Promise<readonly PublishAuthority[]> {
    const prefix = `${serializeScope(scope)}:`;
    const rows: PublishAuthority[] = [];
    for (const [key, row] of this.rows) {
      if (key.startsWith(prefix) && row.grantedTo === actorId) rows.push(row);
    }
    rows.sort((a, b) => a.grantedAt.localeCompare(b.grantedAt));
    return rows;
  }

  async consumeAuthority(scope: ProjectScope, authorityId: string): Promise<PublishAuthority> {
    const row = await this.getAuthority(scope, authorityId);
    if (!row) throw policyError("NOT_FOUND", "publish authority not found in this scope.");
    if (row.revokedAt) throw policyError("FORBIDDEN", "publish authority was revoked.");
    if (row.maxUses !== null && row.usedCount >= row.maxUses) {
      throw policyError("FORBIDDEN", "publish authority use limit reached.");
    }
    const next: PublishAuthority = { ...row, usedCount: row.usedCount + 1 };
    this.rows.set(this.key(scope, row.authorityId), next);
    return next;
  }

  async revokeAuthority(scope: ProjectScope, authorityId: string, now?: string): Promise<PublishAuthority> {
    const row = await this.getAuthority(scope, authorityId);
    if (!row) throw policyError("NOT_FOUND", "publish authority not found in this scope.");
    if (row.revokedAt) return row;
    const next: PublishAuthority = { ...row, revokedAt: now ?? new Date().toISOString() };
    this.rows.set(this.key(scope, row.authorityId), next);
    return next;
  }
}

/** Single-use delivery capabilities: already-downloaded bytes cannot be recalled. */
export class MemoryDeliveryGrantStore implements DeliveryGrantStore {
  private readonly rows = new Map<string, DeliveryGrant>();

  private key(scope: ProjectScope, id: string): string {
    return `${serializeScope(scope)}:${id}`;
  }

  async issueGrant(
    scope: ProjectScope,
    input: { assetId: string; assetVersion: number; grantedTo: string; decisionId: string; ttlSeconds: number; maxUses?: number },
    now?: string,
  ): Promise<DeliveryGrant> {
    if (!input.assetId.trim()) throw policyError("BAD_REQUEST", "assetId is required.");
    if (!Number.isInteger(input.assetVersion) || input.assetVersion <= 0) {
      throw policyError("BAD_REQUEST", "assetVersion must be a positive integer.");
    }
    if (!Number.isFinite(input.ttlSeconds) || input.ttlSeconds <= 0) {
      throw policyError("BAD_REQUEST", "ttlSeconds must be positive.");
    }
    const at = Date.parse(now ?? new Date().toISOString());
    const grant: DeliveryGrant = {
      grantId: randomUUID(),
      scope,
      assetId: input.assetId,
      assetVersion: input.assetVersion,
      grantedTo: input.grantedTo,
      grantedAt: new Date(at).toISOString(),
      expiresAt: new Date(at + input.ttlSeconds * 1000).toISOString(),
      maxUses: input.maxUses ?? 1,
      usedCount: 0,
      decisionId: input.decisionId,
    };
    this.rows.set(this.key(scope, grant.grantId), grant);
    return grant;
  }

  async consumeGrant(scope: ProjectScope, grantId: string): Promise<DeliveryGrant | null> {
    const row = await this.getGrant(scope, grantId);
    if (!row) return null;
    if (row.usedCount >= row.maxUses) return null;
    const next: DeliveryGrant = { ...row, usedCount: row.usedCount + 1 };
    this.rows.set(this.key(scope, grantId), next);
    return next;
  }

  async getGrant(scope: ProjectScope, grantId: string): Promise<DeliveryGrant | null> {
    return this.rows.get(this.key(scope, grantId)) ?? null;
  }
}

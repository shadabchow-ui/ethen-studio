import "server-only";

/**
 * STUDIO_03 route-adapter policy access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed repositories over the j03 schema + decision audit writes.
 * Service-role bypasses RLS, so every query binds explicit project scope.
 * Review-link durable storage belongs to STUDIO_18; durable review checks
 * arrive with j18, so this adapter carries an empty capability registry.
 */
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import {
  MemoryReviewLinkStore,
  PolicyError,
  type AuthorityRepository,
  type ConsentGrant,
  type ConsentRepository,
  type ConsentRevocation,
  type PolicyStores,
  type PublishAuthority,
  type RightsAssertion,
  type RightsRepository,
} from "@ethen/studio-core/server/policy";
import type { PolicyDecision } from "@ethen/studio-core/contracts";
import type { ProjectScope } from "@ethen/studio-core/contracts";

export { PolicyError };

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function strArray(row: Row, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function iso(value: unknown): string {
  return typeof value === "string" ? value : new Date().toISOString();
}

function nullableIso(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numOrNull(row: Row, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function boolOrNull(row: Row, key: string): boolean | null {
  const value = row[key];
  return typeof value === "boolean" ? value : null;
}

function toGrant(scope: ProjectScope, row: Row): ConsentGrant {
  return {
    grantId: str(row, "grant_id"),
    scope,
    identityId: str(row, "identity_id"),
    identityVersion: numOrNull(row, "identity_version"),
    actorId: str(row, "actor_id"),
    subjectRef: str(row, "subject_ref"),
    purpose: str(row, "purpose"),
    operations: strArray(row, "operations"),
    channels: strArray(row, "channels"),
    commercialScope: str(row, "commercial_scope") || "unknown",
    geography: strArray(row, "geography"),
    allowedProviders: strArray(row, "allowed_providers"),
    termsVersion: str(row, "terms_version"),
    verificationState: (str(row, "verification_state") || "unknown") as ConsentGrant["verificationState"],
    status: (str(row, "status") || "unknown") as ConsentGrant["status"],
    provenance: (str(row, "provenance") || "imported_unknown") as ConsentGrant["provenance"],
    legacyRef: nullableStr(row, "legacy_ref"),
    supersedes: nullableStr(row, "supersedes"),
    grantedAt: iso(row.granted_at),
    expiresAt: nullableIso(row.expires_at),
    payloadHash: nullableStr(row, "payload_hash"),
  };
}

function toRevocation(scope: ProjectScope, row: Row): ConsentRevocation {
  return {
    revocationId: str(row, "revocation_id"),
    grantId: str(row, "grant_id"),
    scope,
    identityId: str(row, "identity_id"),
    revokedAt: iso(row.revoked_at),
    reason: str(row, "reason"),
    actorId: str(row, "actor_id"),
    providerObligations: strArray(row, "provider_obligations"),
    obligationsStatus: (str(row, "obligations_status") || "pending_external") as ConsentRevocation["obligationsStatus"],
  };
}

function toAssertion(scope: ProjectScope, row: Row): RightsAssertion {
  return {
    assertionId: str(row, "assertion_id"),
    scope,
    assetId: str(row, "asset_id"),
    assetVersion: numOrNull(row, "asset_version"),
    assetClass: (str(row, "asset_class") || "image") as RightsAssertion["assetClass"],
    status: (str(row, "status") || "unknown") as RightsAssertion["status"],
    commercialUse: boolOrNull(row, "commercial_use"),
    exportAllowed: boolOrNull(row, "export_allowed"),
    channels: strArray(row, "channels"),
    licenseRef: nullableStr(row, "license_ref"),
    assertedBy: str(row, "asserted_by"),
    assertedAt: iso(row.asserted_at),
    expiresAt: nullableIso(row.expires_at),
    provenance: (str(row, "provenance") || "studio_v5") as RightsAssertion["provenance"],
    note: nullableStr(row, "note"),
  };
}

function toAuthority(scope: ProjectScope, row: Row): PublishAuthority {
  const limits = row.limits;
  return {
    authorityId: str(row, "authority_id"),
    scope,
    channel: str(row, "channel"),
    assetClass: (str(row, "asset_class") || "*") as PublishAuthority["assetClass"],
    grantedBy: str(row, "granted_by"),
    grantedTo: str(row, "granted_to"),
    grantedAt: iso(row.granted_at),
    expiresAt: iso(row.expires_at),
    maxUses: numOrNull(row, "max_uses"),
    usedCount: typeof row.used_count === "number" ? row.used_count : 0,
    revokedAt: nullableIso(row.revoked_at),
    limits: limits && typeof limits === "object" ? (limits as Record<string, unknown>) : {},
  };
}

export class SupabaseConsentRepository implements ConsentRepository {
  async appendGrant(scope: ProjectScope, input: Parameters<ConsentRepository["appendGrant"]>[1]): Promise<ConsentGrant> {
    const client = requireServiceClient();
    const resolved = scope as ProjectScope;
    void resolved;
    const { data, error } = await client
      .from("studio_v5_consent_grants")
      .insert({
        tenant_id: (scope.tenantId as string) || null,
        workspace_id: scope.workspaceId as string,
        project_id: scope.projectId as string,
        identity_id: input.identityId,
        identity_version: input.identityVersion ?? null,
        actor_id: input.actorId,
        subject_ref: input.subjectRef,
        purpose: input.purpose,
        operations: [...input.operations],
        channels: [...(input.channels ?? [])],
        commercial_scope: input.commercialScope ?? "unknown",
        geography: [...(input.geography ?? [])],
        allowed_providers: [...(input.allowedProviders ?? [])],
        terms_version: input.termsVersion,
        verification_state: input.verificationState ?? "user_declared",
        status: "active",
        provenance: "studio_v5",
        supersedes: input.supersedes ?? null,
        expires_at: input.expiresAt ?? null,
        payload_hash: input.payloadHash ?? null,
      })
      .select()
      .single();
    if (error) throw new PolicyError("INTERNAL", `Failed to record consent grant: ${error.message}`);
    return toGrant(scope, data as Row);
  }

  async getGrant(scope: ProjectScope, grantId: string): Promise<ConsentGrant | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_consent_grants")
      .select()
      .eq("grant_id", grantId)
      .eq("project_id", scope.projectId as string)
      .maybeSingle();
    if (error) throw new PolicyError("INTERNAL", `Failed to load consent grant: ${error.message}`);
    return data ? toGrant(scope, data as Row) : null;
  }

  async listGrantsForIdentity(scope: ProjectScope, identityId: string): Promise<readonly ConsentGrant[]> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_consent_grants")
      .select()
      .eq("project_id", scope.projectId as string)
      .eq("identity_id", identityId)
      .order("granted_at", { ascending: true });
    if (error) throw new PolicyError("INTERNAL", `Failed to list consent grants: ${error.message}`);
    return ((data ?? []) as Row[]).map((row) => toGrant(scope, row));
  }

  async appendRevocation(
    scope: ProjectScope,
    input: Parameters<ConsentRepository["appendRevocation"]>[1],
  ): Promise<ConsentRevocation> {
    const client = requireServiceClient();
    const grant = await this.getGrant(scope, input.grantId);
    if (!grant) throw new PolicyError("NOT_FOUND", "consent grant not found in this scope.");
    const { data, error } = await client
      .from("studio_v5_consent_revocations")
      .insert({
        grant_id: input.grantId,
        project_id: scope.projectId as string,
        reason: input.reason,
        actor_id: input.actorId,
        obligations_status: input.obligationsStatus ?? "pending_external",
      })
      .select()
      .single();
    if (error) throw new PolicyError("INTERNAL", `Failed to record revocation: ${error.message}`);
    return toRevocation(scope, data as Row);
  }

  async listRevocations(scope: ProjectScope, grantId: string): Promise<readonly ConsentRevocation[]> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_consent_revocations")
      .select()
      .eq("project_id", scope.projectId as string)
      .eq("grant_id", grantId)
      .order("revoked_at", { ascending: true });
    if (error) throw new PolicyError("INTERNAL", `Failed to list revocations: ${error.message}`);
    return ((data ?? []) as Row[]).map((row) => toRevocation(scope, row));
  }
}

export class SupabaseRightsRepository implements RightsRepository {
  async assertRights(
    scope: ProjectScope,
    input: Parameters<RightsRepository["assertRights"]>[1],
  ): Promise<RightsAssertion> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_rights_assertions")
      .insert({
        tenant_id: (scope.tenantId as string) || null,
        workspace_id: scope.workspaceId as string,
        project_id: scope.projectId as string,
        asset_id: input.assetId,
        asset_version: input.assetVersion ?? null,
        asset_class: input.assetClass,
        status: input.status,
        commercial_use: input.commercialUse ?? null,
        export_allowed: input.exportAllowed ?? null,
        channels: [...(input.channels ?? [])],
        license_ref: input.licenseRef ?? null,
        asserted_by: input.assertedBy,
        expires_at: input.expiresAt ?? null,
        provenance: input.provenance ?? "studio_v5",
        note: input.note ?? null,
      })
      .select()
      .single();
    if (error) throw new PolicyError("INTERNAL", `Failed to record rights assertion: ${error.message}`);
    return toAssertion(scope, data as Row);
  }

  async getAssertion(scope: ProjectScope, assertionId: string): Promise<RightsAssertion | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_rights_assertions")
      .select()
      .eq("assertion_id", assertionId)
      .eq("project_id", scope.projectId as string)
      .maybeSingle();
    if (error) throw new PolicyError("INTERNAL", `Failed to load rights assertion: ${error.message}`);
    return data ? toAssertion(scope, data as Row) : null;
  }

  async listAssertionsForAsset(scope: ProjectScope, assetId: string): Promise<readonly RightsAssertion[]> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_rights_assertions")
      .select()
      .eq("project_id", scope.projectId as string)
      .eq("asset_id", assetId)
      .order("asserted_at", { ascending: true });
    if (error) throw new PolicyError("INTERNAL", `Failed to list rights assertions: ${error.message}`);
    return ((data ?? []) as Row[]).map((row) => toAssertion(scope, row));
  }
}

export class SupabaseAuthorityRepository implements AuthorityRepository {
  async grantAuthority(
    scope: ProjectScope,
    input: Parameters<AuthorityRepository["grantAuthority"]>[1],
  ): Promise<PublishAuthority> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_publish_authorities")
      .insert({
        tenant_id: (scope.tenantId as string) || null,
        workspace_id: scope.workspaceId as string,
        project_id: scope.projectId as string,
        channel: input.channel,
        asset_class: input.assetClass,
        granted_by: input.grantedBy,
        granted_to: input.grantedTo,
        expires_at: input.expiresAt,
        max_uses: input.maxUses ?? null,
        limits: { ...(input.limits ?? {}) },
      })
      .select()
      .single();
    if (error) throw new PolicyError("INTERNAL", `Failed to record publish authority: ${error.message}`);
    return toAuthority(scope, data as Row);
  }

  async getAuthority(scope: ProjectScope, authorityId: string): Promise<PublishAuthority | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_publish_authorities")
      .select()
      .eq("authority_id", authorityId)
      .eq("project_id", scope.projectId as string)
      .maybeSingle();
    if (error) throw new PolicyError("INTERNAL", `Failed to load publish authority: ${error.message}`);
    return data ? toAuthority(scope, data as Row) : null;
  }

  async listAuthoritiesForActor(scope: ProjectScope, actorId: string): Promise<readonly PublishAuthority[]> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_publish_authorities")
      .select()
      .eq("project_id", scope.projectId as string)
      .eq("granted_to", actorId)
      .order("granted_at", { ascending: true });
    if (error) throw new PolicyError("INTERNAL", `Failed to list publish authorities: ${error.message}`);
    return ((data ?? []) as Row[]).map((row) => toAuthority(scope, row));
  }

  async consumeAuthority(scope: ProjectScope, authorityId: string): Promise<PublishAuthority> {
    const client = requireServiceClient();
    const existing = await this.getAuthority(scope, authorityId);
    if (!existing) throw new PolicyError("NOT_FOUND", "publish authority not found in this scope.");
    const { error } = await client.rpc("studio_v5_consume_publish_authority", { p_authority: authorityId });
    if (error) throw new PolicyError("FORBIDDEN", `Publish authority cannot be consumed: ${error.message}`);
    const next = await this.getAuthority(scope, authorityId);
    if (!next) throw new PolicyError("NOT_FOUND", "publish authority not found in this scope.");
    return next;
  }

  async revokeAuthority(scope: ProjectScope, authorityId: string): Promise<PublishAuthority> {
    const client = requireServiceClient();
    const existing = await this.getAuthority(scope, authorityId);
    if (!existing) throw new PolicyError("NOT_FOUND", "publish authority not found in this scope.");
    if (existing.revokedAt) return existing;
    const { data, error } = await client
      .from("studio_v5_publish_authorities")
      .update({ revoked_at: new Date().toISOString() })
      .eq("authority_id", authorityId)
      .eq("project_id", scope.projectId as string)
      .select()
      .single();
    if (error) throw new PolicyError("INTERNAL", `Failed to revoke publish authority: ${error.message}`);
    return toAuthority(scope, data as Row);
  }
}

/** Append a decision to the audit log. Audit failures never flip a decision. */
export async function recordDecision(
  resolved: ResolvedScope,
  actorId: string,
  decision: PolicyDecision,
): Promise<void> {
  const client = requireServiceClient();
  const { error } = await client.from("studio_v5_policy_decisions").insert({
    decision_id: decision.decisionId,
    tenant_id: resolved.tenantId || null,
    project_id: resolved.projectId,
    actor_id: actorId,
    task_name: decision.task,
    action: decision.action,
    allowed: decision.allowed,
    reason_code: decision.reasonCode,
    remediation: decision.remediation,
    evidence_ids: [...decision.evidenceIds],
    policy_version: decision.policyVersion,
    decided_at: decision.decidedAt,
  });
  if (error) throw new PolicyError("INTERNAL", `Failed to audit policy decision: ${error.message}`);
}

/** Production stores for route adapters (review capabilities arrive with j18). */
export function buildSupabasePolicyStores(): PolicyStores {
  return {
    consents: new SupabaseConsentRepository(),
    rights: new SupabaseRightsRepository(),
    authorities: new SupabaseAuthorityRepository(),
    reviewLinks: new MemoryReviewLinkStore(),
  };
}

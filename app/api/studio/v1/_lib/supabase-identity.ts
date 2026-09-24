import "server-only";

/**
 * STUDIO_10 route-adapter identity access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed reads/writes over the j10 schema. Service-role bypasses
 * RLS, so every scoped call binds explicit tenant/project scope and stock
 * rows (null project) are readable but never tenant-writable.
 */
import { buildScope, type ProjectScope } from "@ethen/studio-core/contracts";
import {
  buildProviderBinding,
  hashIdentityContent,
  IdentityStoreError,
  type IdentityConsentSnapshot,
  type IdentityFavoriteRecord,
  type IdentityRecentRecord,
  type IdentityRecord,
  type IdentityVersionRecord,
  type ProviderBindingRecord,
} from "@ethen/studio-core/server/identity";
import { requireServiceClient, type ResolvedScope } from "./supabase-data";

export class IdentityError extends Error {
  readonly status: "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | "FORBIDDEN";
  constructor(status: IdentityError["status"], message: string) {
    super(message);
    this.name = "IdentityError";
    this.status = status;
  }
}

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function strArray(row: Row, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function obj(row: Row, key: string): Readonly<Record<string, unknown>> {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function iso(row: Row, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : new Date().toISOString();
}

function num(row: Row, key: string, fallback: number): number {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rowScope(tenantId: string | null, projectId: string | null, workspaceId: string): ProjectScope | null {
  if (!tenantId || !projectId) return null;
  return buildScope(tenantId, workspaceId, projectId);
}

function toIdentity(row: Row, workspaceId: string): IdentityRecord {
  return {
    identityId: str(row, "identity_id"),
    scope: rowScope(nullableStr(row, "tenant_id"), nullableStr(row, "project_id"), workspaceId),
    kind: str(row, "kind") as IdentityRecord["kind"],
    origin: str(row, "origin") as IdentityRecord["origin"],
    name: str(row, "name"),
    currentVersion: num(row, "current_version", 1),
    status: (str(row, "status") || "active") as IdentityRecord["status"],
    createdAt: iso(row, "created_at"),
    updatedAt: iso(row, "updated_at"),
  };
}

function toVersion(row: Row): IdentityVersionRecord {
  return {
    identityId: str(row, "identity_id"),
    version: num(row, "version", 1),
    contentHash: str(row, "content_hash"),
    payload: obj(row, "payload"),
    consentGrantId: nullableStr(row, "consent_grant_id"),
    revokedAt: nullableStr(row, "revoked_at"),
    createdAt: iso(row, "created_at"),
  };
}

function toBinding(row: Row, workspaceId: string): ProviderBindingRecord {
  return {
    bindingId: str(row, "binding_id"),
    scope: rowScope(nullableStr(row, "tenant_id"), nullableStr(row, "project_id"), workspaceId),
    identityId: str(row, "identity_id"),
    identityVersion: num(row, "identity_version", 1),
    providerId: str(row, "provider_id"),
    providerVoiceId: str(row, "provider_voice_id"),
    endpointId: nullableStr(row, "endpoint_id"),
    adapterVersion: str(row, "adapter_version"),
    compatibleModelIds: strArray(row, "compatible_model_ids"),
    loraRefs: strArray(row, "lora_refs"),
    revokedAt: nullableStr(row, "revoked_at"),
    createdAt: iso(row, "created_at"),
  };
}

/** Project rows plus global stock, newest heads first. */
export async function listIdentities(
  resolved: ResolvedScope,
  kind?: string,
): Promise<IdentityRecord[]> {
  const client = requireServiceClient();
  let query = client
    .from("studio_v5_identities")
    .select("*")
    .or(`project_id.eq.${resolved.projectId},project_id.is.null`)
    .order("created_at", { ascending: false });
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw new IdentityError("INTERNAL_ERROR", `Failed to list identities: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => toIdentity(row, resolved.workspaceId));
}

/** Scoped head read: foreign-project rows are invisible (null), stock is global. */
export async function getIdentityHead(
  resolved: ResolvedScope,
  identityId: string,
): Promise<IdentityRecord | null> {
  const client = requireServiceClient();
  const { data, error } = await client.from("studio_v5_identities").select("*").eq("identity_id", identityId).maybeSingle();
  if (error) throw new IdentityError("INTERNAL_ERROR", `Failed to read identity: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  const projectId = nullableStr(row, "project_id");
  if (projectId !== null && projectId !== resolved.projectId) return null;
  return toIdentity(row, resolved.workspaceId);
}

export async function listIdentityVersions(
  resolved: ResolvedScope,
  identityId: string,
): Promise<IdentityVersionRecord[]> {
  const head = await getIdentityHead(resolved, identityId);
  if (!head) return [];
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_identity_versions")
    .select("*")
    .eq("identity_id", identityId)
    .order("version", { ascending: true });
  if (error) throw new IdentityError("INTERNAL_ERROR", `Failed to list versions: ${error.message}`);
  return ((data ?? []) as Row[]).map(toVersion);
}

export async function createIdentityWithVersion1(input: {
  resolved: ResolvedScope;
  kind: IdentityRecord["kind"];
  origin: Exclude<IdentityRecord["origin"], "stock">;
  name: string;
  payload: Readonly<Record<string, unknown>>;
  consentGrantId?: string | null;
}): Promise<{ record: IdentityRecord; version: IdentityVersionRecord }> {
  const name = input.name.trim();
  if (!name) throw new IdentityError("VALIDATION_ERROR", "Identity name is required.");
  if (name.length > 120) throw new IdentityError("VALIDATION_ERROR", "Identity name exceeds 120 characters.");
  const client = requireServiceClient();
  const head = await client
    .from("studio_v5_identities")
    .insert({
      tenant_id: input.resolved.tenantId,
      project_id: input.resolved.projectId,
      kind: input.kind,
      origin: input.origin,
      name,
      current_version: 1,
      status: "active",
    })
    .select("*")
    .single();
  if (head.error || !head.data) throw new IdentityError("INTERNAL_ERROR", `Failed to create identity: ${head.error?.message ?? "unknown"}`);
  const record = toIdentity(head.data as Row, input.resolved.workspaceId);
  const version = await client
    .from("studio_v5_identity_versions")
    .insert({
      identity_id: record.identityId,
      version: 1,
      tenant_id: input.resolved.tenantId,
      project_id: input.resolved.projectId,
      content_hash: hashIdentityContent(input.payload),
      payload: input.payload,
      consent_grant_id: input.consentGrantId ?? null,
    })
    .select("*")
    .single();
  if (version.error || !version.data) {
    throw new IdentityError("INTERNAL_ERROR", `Failed to create identity version: ${version.error?.message ?? "unknown"}`);
  }
  return { record, version: toVersion(version.data as Row) };
}

/** Append-only version write with CAS on the head pointer. */
export async function appendIdentityVersion(input: {
  resolved: ResolvedScope;
  identityId: string;
  payload: Readonly<Record<string, unknown>>;
  consentGrantId?: string | null;
}): Promise<{ record: IdentityRecord; version: IdentityVersionRecord }> {
  const head = await getIdentityHead(input.resolved, input.identityId);
  if (!head) throw new IdentityError("NOT_FOUND", `Identity ${input.identityId} was not found.`);
  if (!head.scope) throw new IdentityError("FORBIDDEN", "Stock identities are curated; versions cannot be appended by tenants.");
  const next = head.currentVersion + 1;
  const client = requireServiceClient();
  const version = await client
    .from("studio_v5_identity_versions")
    .insert({
      identity_id: head.identityId,
      version: next,
      tenant_id: input.resolved.tenantId,
      project_id: input.resolved.projectId,
      content_hash: hashIdentityContent(input.payload),
      payload: input.payload,
      consent_grant_id: input.consentGrantId ?? null,
    })
    .select("*")
    .single();
  if (version.error || !version.data) {
    if (version.error?.message.includes("duplicate")) {
      throw new IdentityError("CONFLICT", `Identity version ${next} already exists; reload and retry.`);
    }
    throw new IdentityError("INTERNAL_ERROR", `Failed to append version: ${version.error?.message ?? "unknown"}`);
  }
  const bumped = await client
    .from("studio_v5_identities")
    .update({ current_version: next, updated_at: new Date().toISOString() })
    .eq("identity_id", head.identityId)
    .eq("current_version", head.currentVersion)
    .select("*")
    .maybeSingle();
  if (bumped.error) throw new IdentityError("INTERNAL_ERROR", `Failed to advance identity head: ${bumped.error.message}`);
  if (!bumped.data) throw new IdentityError("CONFLICT", "Identity head moved concurrently; reload and retry.");
  return { record: toIdentity(bumped.data as Row, input.resolved.workspaceId), version: toVersion(version.data as Row) };
}

export async function listVoiceBindings(
  resolved: ResolvedScope,
  identityId: string,
  version: number | null,
): Promise<ProviderBindingRecord[]> {
  const head = await getIdentityHead(resolved, identityId);
  if (!head) return [];
  const client = requireServiceClient();
  let query = client.from("studio_v5_voice_bindings").select("*").eq("identity_id", identityId);
  if (version !== null) query = query.eq("identity_version", version);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw new IdentityError("INTERNAL_ERROR", `Failed to list bindings: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => toBinding(row, resolved.workspaceId));
}

export async function createVoiceBinding(input: {
  resolved: ResolvedScope;
  identityId: string;
  identityVersion: number;
  providerId: string;
  providerVoiceId: string;
  endpointId: string | null;
  adapterVersion: string;
  compatibleModelIds?: readonly string[];
  loraRefs?: readonly string[];
}): Promise<ProviderBindingRecord> {
  const head = await getIdentityHead(input.resolved, input.identityId);
  if (!head) throw new IdentityError("NOT_FOUND", `Identity ${input.identityId} was not found.`);
  if (!head.scope) throw new IdentityError("FORBIDDEN", "Stock bindings are curated; tenants cannot attach new provider bindings.");
  if (head.kind !== "voice") throw new IdentityError("VALIDATION_ERROR", "Provider voice bindings attach to voice identities only.");
  for (const [label, value] of [["Provider id", input.providerId], ["Provider voice id", input.providerVoiceId], ["Adapter version", input.adapterVersion]] as const) {
    if (!value.trim()) throw new IdentityError("VALIDATION_ERROR", `${label} is required.`);
  }
  try {
    buildProviderBinding({
      scope: head.scope,
      identityId: head.identityId,
      identityVersion: input.identityVersion,
      providerId: input.providerId,
      providerVoiceId: input.providerVoiceId,
      endpointId: input.endpointId,
      adapterVersion: input.adapterVersion,
      compatibleModelIds: input.compatibleModelIds,
      loraRefs: input.loraRefs,
    });
  } catch (error) {
    if (error instanceof IdentityStoreError) throw new IdentityError("VALIDATION_ERROR", error.message);
    throw error;
  }
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_voice_bindings")
    .insert({
      tenant_id: input.resolved.tenantId,
      project_id: input.resolved.projectId,
      identity_id: head.identityId,
      identity_version: input.identityVersion,
      provider_id: input.providerId.trim(),
      provider_voice_id: input.providerVoiceId.trim(),
      endpoint_id: input.endpointId?.trim() ? input.endpointId.trim() : null,
      adapter_version: input.adapterVersion.trim(),
      compatible_model_ids: [...(input.compatibleModelIds ?? [])],
      lora_refs: [...(input.loraRefs ?? [])],
    })
    .select("*")
    .single();
  if (error || !data) {
    if (error?.message.includes("duplicate")) {
      throw new IdentityError("CONFLICT", "This provider voice is already bound to the identity version.");
    }
    throw new IdentityError("INTERNAL_ERROR", `Failed to create binding: ${error?.message ?? "unknown"}`);
  }
  return toBinding(data as Row, input.resolved.workspaceId);
}

/** Latest j03 grant for an identity, with revocation folded in. Null = unknown, therefore blocked. */
export async function resolveConsentSnapshot(identityId: string): Promise<IdentityConsentSnapshot | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_consent_grants")
    .select("grant_id, status, verification_state, expires_at")
    .eq("identity_id", identityId)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new IdentityError("INTERNAL_ERROR", `Failed to resolve consent: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  const grantId = str(row, "grant_id");
  const revoked = await client.from("studio_v5_consent_revocations").select("grant_id").eq("grant_id", grantId).limit(1);
  if (revoked.error) throw new IdentityError("INTERNAL_ERROR", `Failed to check revocation: ${revoked.error.message}`);
  const status = ((revoked.data ?? []).length > 0 ? "revoked" : str(row, "status")) as IdentityConsentSnapshot["status"];
  return {
    identityId,
    status,
    verification: (str(row, "verification_state") || "unknown") as IdentityConsentSnapshot["verification"],
    grantId,
    expiresAt: nullableStr(row, "expires_at"),
  };
}

export async function resolveIdentityAlias(alias: string): Promise<string | null> {
  const client = requireServiceClient();
  const { data, error } = await client.from("studio_v5_identity_aliases").select("identity_id").eq("alias", alias).maybeSingle();
  if (error) throw new IdentityError("INTERNAL_ERROR", `Failed to resolve alias: ${error.message}`);
  if (!data) return null;
  return str(data as Row, "identity_id") || null;
}

export async function listFavorites(resolved: ResolvedScope, actorId: string): Promise<IdentityFavoriteRecord[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_identity_favorites")
    .select("*")
    .eq("project_id", resolved.projectId)
    .eq("actor_id", actorId);
  if (error) throw new IdentityError("INTERNAL_ERROR", `Failed to list favorites: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => ({
    scope: buildScope(resolved.tenantId, resolved.workspaceId, resolved.projectId),
    actorId: str(row, "actor_id"),
    identityId: str(row, "identity_id"),
    createdAt: iso(row, "created_at"),
  }));
}

export async function setFavorite(
  resolved: ResolvedScope,
  actorId: string,
  identityId: string,
  favorite: boolean,
): Promise<void> {
  const head = await getIdentityHead(resolved, identityId);
  if (!head) throw new IdentityError("NOT_FOUND", `Identity ${identityId} was not found.`);
  const client = requireServiceClient();
  if (!favorite) {
    const { error } = await client
      .from("studio_v5_identity_favorites")
      .delete()
      .eq("project_id", resolved.projectId)
      .eq("actor_id", actorId)
      .eq("identity_id", identityId);
    if (error) throw new IdentityError("INTERNAL_ERROR", `Failed to remove favorite: ${error.message}`);
    return;
  }
  const { error } = await client.from("studio_v5_identity_favorites").upsert(
    { project_id: resolved.projectId, actor_id: actorId, identity_id: identityId },
    { onConflict: "project_id,actor_id,identity_id" },
  );
  if (error) throw new IdentityError("INTERNAL_ERROR", `Failed to add favorite: ${error.message}`);
}

export async function listRecents(resolved: ResolvedScope, actorId: string): Promise<IdentityRecentRecord[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_identity_recents")
    .select("*")
    .eq("project_id", resolved.projectId)
    .eq("actor_id", actorId)
    .order("viewed_at", { ascending: false })
    .limit(20);
  if (error) throw new IdentityError("INTERNAL_ERROR", `Failed to list recents: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => ({
    scope: buildScope(resolved.tenantId, resolved.workspaceId, resolved.projectId),
    actorId: str(row, "actor_id"),
    identityId: str(row, "identity_id"),
    viewedAt: iso(row, "viewed_at"),
  }));
}

export async function recordRecentView(resolved: ResolvedScope, actorId: string, identityId: string): Promise<void> {
  const head = await getIdentityHead(resolved, identityId);
  if (!head) return;
  const client = requireServiceClient();
  const { error } = await client.from("studio_v5_identity_recents").upsert(
    { project_id: resolved.projectId, actor_id: actorId, identity_id: identityId, viewed_at: new Date().toISOString() },
    { onConflict: "project_id,actor_id,identity_id" },
  );
  if (error) throw new IdentityError("INTERNAL_ERROR", `Failed to record recent: ${error.message}`);
}

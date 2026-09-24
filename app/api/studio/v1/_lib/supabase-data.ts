import "server-only";

/**
 * STUDIO_02 route-adapter data access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed reads/writes over the j02 schema. Service-role bypasses
 * RLS, so every query binds explicit tenant/project scope. Throws DataError
 * for typed failures; routes project them onto Studio API error codes.
 */
import { createServiceClient } from "@ethen/database/service";
import { StudioSetupError, isStudioSetupError } from "@/lib/media/studio-setup";
import { DataError } from "@ethen/studio-core/server/data";
import type { ProjectScope } from "@ethen/studio-core/contracts";
import { asProjectId, asTenantId, asWorkspaceId, buildScope } from "@ethen/studio-core/contracts";
import { hasStudioLocalProject, isStudioLocalRequest, STUDIO_LOCAL_TENANT_ID, STUDIO_LOCAL_USER_ID, STUDIO_LOCAL_WORKSPACE_ID } from "@/lib/studio-local-project";

export { DataError };
export type { ProjectScope };

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function num(row: Row, key: string): number {
  return typeof row[key] === "number" ? (row[key] as number) : Number(row[key] ?? 0);
}

function iso(value: unknown): string {
  return typeof value === "string" ? value : new Date().toISOString();
}

function obj(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function requireServiceClient() {
  const client = createServiceClient();
  if (!client) {
    // P03 (RC-6): missing data-service client is a setup condition, not
    // an internal error. Every family mapper converts this to 503.
    throw new StudioSetupError("supabase");
  }
  return client;
}

export function isSetupError(error: unknown): boolean {
  if (isStudioSetupError(error)) return true;
  return error instanceof DataError && (error.details as Row).setup === true;
}

export interface ResolvedScope {
  scope: ProjectScope;
  tenantId: string;
  workspaceId: string;
  projectId: string;
}

/** Resolve canonical V5 scope for a platform project id. Null when unknown. */
export async function resolveProjectScope(projectId: string): Promise<ResolvedScope | null> {
  if (await isStudioLocalRequest()) {
    if (!hasStudioLocalProject(projectId)) return null;
    return { scope: buildScope(STUDIO_LOCAL_TENANT_ID, STUDIO_LOCAL_WORKSPACE_ID, projectId), tenantId: STUDIO_LOCAL_TENANT_ID, workspaceId: STUDIO_LOCAL_WORKSPACE_ID, projectId };
  }
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_project_ext")
    .select("project_id, tenant_id, workspace_id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new DataError("INTERNAL", `Failed to resolve project scope: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  const tenantId = str(row, "tenant_id");
  if (!tenantId) return null;
  const workspaceId = str(row, "workspace_id") || "default";
  return {
    scope: buildScope(tenantId, workspaceId, projectId),
    tenantId,
    workspaceId,
    projectId,
  };
}

/** First tenant membership for an actor (default-project creation context). */
export async function resolveActorTenant(actorId: string): Promise<string | null> {
  if (await isStudioLocalRequest()) return actorId === STUDIO_LOCAL_USER_ID ? STUDIO_LOCAL_TENANT_ID : null;
  const client = requireServiceClient();
  const { data, error } = await client.from("tenant_members").select("tenant_id").eq("user_id", actorId).limit(1);
  if (error) throw new DataError("INTERNAL", `Failed to resolve actor tenant: ${error.message}`);
  const rows = (data ?? []) as Row[];
  return rows.length > 0 ? str(rows[0], "tenant_id") : null;
}

export interface ProjectListItem {
  projectId: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  revision: number;
  isDefault: boolean;
  createdAt: string;
}

/** Actor-visible projects (owned or member), newest first, offset-paged. */
export async function listActorProjects(
  actorId: string,
  limit: number,
  offset: number,
): Promise<{ items: ProjectListItem[]; total: number }> {
  const client = requireServiceClient();
  const { data: owned, error: ownedError } = await client
    .from("projects")
    .select("id, tenant_id, name, created_at")
    .eq("owner_user_id", actorId);
  if (ownedError) throw new DataError("INTERNAL", `Failed to list owned projects: ${ownedError.message}`);
  const { data: memberships, error: memberError } = await client
    .from("project_members")
    .select("project_id")
    .eq("user_id", actorId);
  if (memberError) throw new DataError("INTERNAL", `Failed to list project memberships: ${memberError.message}`);
  const memberIds = ((memberships ?? []) as Row[])
    .map((m) => str(m, "project_id"))
    .filter((id) => id.length > 0);
  let memberProjects: Row[] = [];
  if (memberIds.length > 0) {
    const { data, error } = await client.from("projects").select("id, tenant_id, name, created_at").in("id", memberIds);
    if (error) throw new DataError("INTERNAL", `Failed to list member projects: ${error.message}`);
    memberProjects = (data ?? []) as Row[];
  }
  const merged = new Map<string, Row>();
  for (const row of [...((owned ?? []) as Row[]), ...memberProjects]) merged.set(str(row, "id"), row);
  const ids = [...merged.keys()];
  const ext = new Map<string, Row>();
  if (ids.length > 0) {
    const { data, error } = await client
      .from("studio_v5_project_ext")
      .select("project_id, workspace_id, revision, is_default")
      .in("project_id", ids);
    if (error) throw new DataError("INTERNAL", `Failed to list project extensions: ${error.message}`);
    for (const row of (data ?? []) as Row[]) ext.set(str(row, "project_id"), row);
  }
  const items: ProjectListItem[] = [...merged.values()]
    .map((row) => {
      const id = str(row, "id");
      const e = ext.get(id);
      return {
        projectId: id,
        tenantId: str(row, "tenant_id"),
        workspaceId: e ? str(e, "workspace_id") || "default" : "default",
        name: str(row, "name"),
        revision: e ? num(e, "revision") || 1 : 1,
        isDefault: e ? Boolean(e["is_default"]) : false,
        createdAt: iso(row["created_at"]),
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { items: items.slice(offset, offset + limit), total: items.length };
}

/** Idempotent default project creation via the j02 SQL function. */
export async function ensureDefaultProject(input: {
  ownerId: string;
  tenantId: string;
  workspaceId: string;
  key: string;
  name: string;
}): Promise<{ project: ProjectListItem; replayedHint: boolean }> {
  const client = requireServiceClient();
  const before = await client
    .from("studio_v5_project_ext")
    .select("project_id")
    .eq("tenant_id", input.tenantId)
    .eq("default_key", input.key)
    .maybeSingle();
  const { data, error } = await client.rpc("studio_v5_ensure_default_project", {
    p_owner: input.ownerId,
    p_tenant: input.tenantId,
    p_workspace: input.workspaceId,
    p_key: input.key,
    p_name: input.name,
  });
  if (error) throw new DataError("INTERNAL", `Default project creation failed: ${error.message}`);
  const projectId = String(data);
  const { data: project, error: projectError } = await client
    .from("projects")
    .select("id, tenant_id, name, created_at")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError || !project) {
    throw new DataError("INTERNAL", "Default project was created but is not readable.");
  }
  const row = project as Row;
  const { data: ext } = await client
    .from("studio_v5_project_ext")
    .select("workspace_id, revision, is_default")
    .eq("project_id", projectId)
    .maybeSingle();
  const e = (ext ?? {}) as Row;
  return {
    project: {
      projectId,
      tenantId: str(row, "tenant_id"),
      workspaceId: str(e, "workspace_id") || input.workspaceId,
      name: str(row, "name"),
      revision: num(e, "revision") || 1,
      isDefault: true,
      createdAt: iso(row["created_at"]),
    },
    replayedHint: Boolean((before.data as Row | null)?.["project_id"]),
  };
}

export interface AssetListItem {
  assetId: string;
  filename: string;
  kind: string;
  revision: number;
  latestVersion: number;
  createdAt: string;
}

const localAssets = new Map<string, AssetDetail>();

export async function listAssets(input: {
  scope: ResolvedScope;
  query: string;
  limit: number;
  offset: number;
}): Promise<{ items: AssetListItem[]; total: number }> {
  if (await isStudioLocalRequest()) {
    const all = [...localAssets.values()].filter((asset) =>
      asset.scope.projectId === input.scope.projectId && asset.scope.tenantId === input.scope.tenantId &&
      asset.tombstonedAt === null && asset.filename.toLowerCase().includes(input.query.trim().toLowerCase()));
    return { items: all.slice(input.offset, input.offset + input.limit), total: all.length };
  }
  const client = requireServiceClient();
  let builder = client
    .from("studio_v5_assets")
    .select("id, filename, kind, revision, created_at", { count: "exact" })
    .eq("project_id", input.scope.projectId)
    .eq("tenant_id", input.scope.tenantId)
    .is("tombstoned_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (input.query.trim().length > 0) builder = builder.ilike("filename", `%${input.query.trim()}%`);
  const { data, error, count } = await builder.range(input.offset, input.offset + input.limit - 1);
  if (error) throw new DataError("INTERNAL", `Failed to list assets: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const versions = new Map<string, number>();
  if (rows.length > 0) {
    const { data: vrows, error: verror } = await client
      .from("studio_v5_asset_versions")
      .select("asset_id, version")
      .eq("project_id", input.scope.projectId)
      .in(
        "asset_id",
        rows.map((r) => str(r, "id")),
      )
      .order("version", { ascending: false });
    if (verror) throw new DataError("INTERNAL", `Failed to list asset versions: ${verror.message}`);
    for (const v of (vrows ?? []) as Row[]) {
      const id = str(v, "asset_id");
      if (!versions.has(id)) versions.set(id, num(v, "version"));
    }
  }
  return {
    items: rows.map((row) => ({
      assetId: str(row, "id"),
      filename: str(row, "filename"),
      kind: str(row, "kind"),
      revision: num(row, "revision") || 1,
      latestVersion: versions.get(str(row, "id")) ?? 0,
      createdAt: iso(row["created_at"]),
    })),
    total: count ?? rows.length,
  };
}

export interface AssetDetail extends AssetListItem {
  scope: { tenantId: string; workspaceId: string; projectId: string };
  tombstonedAt: string | null;
  receipt: Readonly<Record<string, unknown>> | null;
  versions: ReadonlyArray<{
    version: number;
    storageKey: string;
    sha256: string;
    byteSize: number;
    origin: string;
    processingState: string;
    createdAt: string;
  }>;
  parents: ReadonlyArray<Readonly<Record<string, unknown>>>;
  children: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

export async function getAssetDetail(scope: ResolvedScope, assetId: string): Promise<AssetDetail | null> {
  if (await isStudioLocalRequest()) {
    const asset = localAssets.get(assetId);
    return asset?.scope.projectId === scope.projectId && asset.scope.tenantId === scope.tenantId ? asset : null;
  }
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_assets")
    .select("id, filename, kind, revision, receipt, created_at, tombstoned_at")
    .eq("id", assetId)
    .eq("project_id", scope.projectId)
    .eq("tenant_id", scope.tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new DataError("INTERNAL", `Failed to read asset: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  const { data: vrows, error: verror } = await client
    .from("studio_v5_asset_versions")
    .select("version, storage_key, sha256, byte_size, origin, processing_state, created_at")
    .eq("asset_id", assetId)
    .eq("project_id", scope.projectId)
    .order("version", { ascending: false });
  if (verror) throw new DataError("INTERNAL", `Failed to read asset versions: ${verror.message}`);
  const { data: prows, error: perror } = await client
    .from("studio_v5_lineage_edges")
    .select("parent_asset_id, parent_version, child_asset_id, child_version, transform, job_id")
    .eq("project_id", scope.projectId)
    .or(`child_asset_id.eq.${assetId},parent_asset_id.eq.${assetId}`);
  if (perror) throw new DataError("INTERNAL", `Failed to read lineage: ${perror.message}`);
  const edges = (prows ?? []) as Row[];
  const versions = ((vrows ?? []) as Row[]).map((v) => ({
    version: num(v, "version"),
    storageKey: str(v, "storage_key"),
    sha256: str(v, "sha256"),
    byteSize: num(v, "byte_size"),
    origin: str(v, "origin"),
    processingState: str(v, "processing_state"),
    createdAt: iso(v["created_at"]),
  }));
  return {
    assetId,
    filename: str(row, "filename"),
    kind: str(row, "kind"),
    revision: num(row, "revision") || 1,
    latestVersion: versions[0]?.version ?? 0,
    createdAt: iso(row["created_at"]),
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, projectId: scope.projectId },
    tombstonedAt: (row["tombstoned_at"] as string | null) ?? null,
    receipt: (row["receipt"] as Readonly<Record<string, unknown>> | null) ?? null,
    versions,
    parents: edges.filter((e) => str(e, "child_asset_id") === assetId).map((e) => ({ ...e })),
    children: edges.filter((e) => str(e, "parent_asset_id") === assetId).map((e) => ({ ...e })),
  };
}

export interface CreateAssetBody {
  filename: string;
  kind: string;
  storageKey: string;
  sha256: string;
  byteSize: number;
  origin: string;
  mediaMetadata: Readonly<Record<string, unknown>>;
}

export async function createAssetWithVersion(scope: ResolvedScope, body: CreateAssetBody): Promise<AssetDetail> {
  if (await isStudioLocalRequest()) {
    const assetId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const asset: AssetDetail = {
      assetId, filename: body.filename, kind: body.kind, revision: 1, latestVersion: 1, createdAt,
      scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, projectId: scope.projectId },
      tombstonedAt: null, receipt: null,
      versions: [{ version: 1, storageKey: body.storageKey, sha256: body.sha256, byteSize: body.byteSize,
        origin: body.origin, processingState: "QUARANTINED", createdAt }],
      parents: [], children: [],
    };
    localAssets.set(assetId, asset);
    return asset;
  }
  const client = requireServiceClient();
  const { data: created, error: createError } = await client
    .from("studio_v5_assets")
    .insert({
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      filename: body.filename,
      kind: body.kind,
    })
    .select("id")
    .maybeSingle();
  if (createError || !created) {
    throw new DataError("BAD_REQUEST", `Asset creation failed: ${createError?.message ?? "unknown error"}`);
  }
  const assetId = str(created as Row, "id");
  const { error: versionError } = await client.from("studio_v5_asset_versions").insert({
    asset_id: assetId,
    version: 1,
    project_id: scope.projectId,
    storage_key: body.storageKey,
    sha256: body.sha256,
    byte_size: body.byteSize,
    media_metadata: body.mediaMetadata,
    origin: body.origin,
    processing_state: "QUARANTINED",
  });
  if (versionError) {
    throw new DataError("BAD_REQUEST", `Asset version creation failed: ${versionError.message}`, { assetId });
  }
  const detail = await getAssetDetail(scope, assetId);
  if (!detail) throw new DataError("INTERNAL", "Created asset is not readable.");
  return detail;
}

/** Tombstone an asset; the receipt is retained on the row (never erased). */
export async function tombstoneAsset(
  scope: ResolvedScope,
  assetId: string,
  reason: string,
): Promise<Readonly<Record<string, unknown>> | null> {
  if (await isStudioLocalRequest()) {
    const detail = await getAssetDetail(scope, assetId);
    if (!detail) return null;
    if (detail.receipt) return detail.receipt;
    const tombstonedAt = new Date().toISOString();
    const receipt = { assetId, scope: detail.scope, finalVersion: detail.latestVersion,
      finalSha256: detail.versions[0]?.sha256 ?? "", finalByteSize: detail.versions[0]?.byteSize ?? 0,
      tombstonedAt, reason };
    localAssets.set(assetId, { ...detail, tombstonedAt, receipt });
    return receipt;
  }
  const client = requireServiceClient();
  const detail = await getAssetDetail(scope, assetId);
  if (!detail) return null;
  if (detail.tombstonedAt !== null) return detail.receipt;
  const latest = detail.versions[0] ?? null;
  const at = new Date().toISOString();
  const receipt = {
    assetId,
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, projectId: scope.projectId },
    finalVersion: latest?.version ?? 0,
    finalSha256: latest?.sha256 ?? "",
    finalByteSize: latest?.byteSize ?? 0,
    tombstonedAt: at,
    reason,
  };
  const { error } = await client
    .from("studio_v5_assets")
    .update({ tombstoned_at: at, receipt, updated_at: at })
    .eq("id", assetId)
    .eq("project_id", scope.projectId)
    .eq("tenant_id", scope.tenantId)
    .is("tombstoned_at", null);
  if (error) throw new DataError("INTERNAL", `Tombstone failed: ${error.message}`);
  return receipt;
}

export function validatedScopeIds(scope: ResolvedScope): { tenantId: string; workspaceId: string; projectId: string } {
  // Re-brand through the kernel to prove the wire shape matches ProjectScope.
  const branded = buildScope(
    asTenantId(scope.tenantId).valueOf(),
    asWorkspaceId(scope.workspaceId).valueOf(),
    asProjectId(scope.projectId).valueOf(),
  );
  void branded;
  return { tenantId: scope.tenantId, workspaceId: scope.workspaceId, projectId: scope.projectId };
}

export { obj as rowObject };

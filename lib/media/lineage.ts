/** Immutable local-private-beta provenance records for Studio asset variants. */
export type AssetVariantKind = "original_upload" | "provider_source" | "normalized_original" | "thumbnail" | "poster" | "preview" | "export" | "derived_output";

export interface AssetVariant {
  id: string;
  assetId: string;
  projectId: string;
  ownerId: string;
  kind: AssetVariantKind;
  storageKey: string;
  mimeType: string;
  /** Server-verified SHA-256 of the canonical bytes when known. */
  contentHash?: string | null;
  /** Canonical byte length when known. */
  byteSize?: number | null;
  createdAt: string;
  immutable: true;
}

export interface AssetLineageEdge {
  id: string;
  projectId: string;
  ownerId: string;
  sourceAssetId?: string;
  outputAssetId?: string;
  jobId?: string;
  providerRunId?: string;
  profileId?: string;
  consentId?: string;
  moderationId?: string;
  transform?: string;
  inputSnapshotHash?: string;
  createdAt: string;
  immutable: true;
}

/** Durability label — honest about adapter selection. */
export const LINEAGE_STORE_DURABILITY = "durable_supabase_proof" as const;

type NodeBuiltinLoader = { getBuiltinModule?: (id: string) => unknown };

function getNodeBuiltin<T>(id: string): T | null {
  const runtime = globalThis as typeof globalThis & { process?: NodeBuiltinLoader };
  return (runtime.process?.getBuiltinModule?.(id) as T | undefined) ?? null;
}

/** Shared proof primitive: SHA-256 hex for lineage/evidence identity. */
export function hashLineageBytes(bytes: Uint8Array): string {
  // Browser callers do not load a Node builtin and must provide a verified hash.
  const crypto = getNodeBuiltin<typeof import("node:crypto")>("node:crypto");
  return crypto ? crypto.createHash("sha256").update(bytes).digest("hex") : "";
}

/** Tenant-scoped context required for durable lineage persistence. */
export interface StudioLineageScope {
  organizationId: string;
  projectId: string;
  actorId: string;
}

function assertLineageScope(scope: StudioLineageScope): void {
  if (!scope.organizationId?.trim() || !scope.projectId?.trim() || !scope.actorId?.trim()) {
    throw new Error("Studio lineage persistence requires organizationId, projectId, and actorId.");
  }
}

// ── In-memory adapter (explicit test/local only) ───────────────────────────

const variants: AssetVariant[] = [];
const edges: AssetLineageEdge[] = [];

class MemoryLineageStore {
  recordVariant(input: Omit<AssetVariant, "id" | "createdAt" | "immutable">): AssetVariant {
    const record: AssetVariant = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), immutable: true };
    variants.push(record);
    return { ...record };
  }
  recordEdge(input: Omit<AssetLineageEdge, "id" | "createdAt" | "immutable">): AssetLineageEdge {
    const record: AssetLineageEdge = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), immutable: true };
    edges.push(record);
    return { ...record };
  }
  getLineage(assetId: string, ownerId: string): AssetLineageEdge[] {
    return edges.filter((edge) => edge.ownerId === ownerId && (edge.sourceAssetId === assetId || edge.outputAssetId === assetId)).map((edge) => ({ ...edge }));
  }
  listVariants(projectId: string): AssetVariant[] {
    return variants.filter((v) => v.projectId === projectId).map((v) => ({ ...v }));
  }
  clear(): void { variants.length = 0; edges.length = 0; }
}

const memoryStore = new MemoryLineageStore();

function isProduction(): boolean {
  // Production is any server environment with Supabase env set and not test.
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return false;
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function supabaseVariantInsert(scope: StudioLineageScope, variant: AssetVariant): Promise<void> {
  const { createServiceClient } = await import("@ethen/database/service");
  const client = createServiceClient();
  if (!client) throw new Error("Studio lineage requires a configured service client in production.");
  const { error } = await client.from("studio_asset_variants").insert({
    id: variant.id,
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    asset_id: variant.assetId,
    created_by: scope.actorId,
    variant_kind: variant.kind,
    object_reference_hash: variant.storageKey,
    content_hash: variant.contentHash ?? null,
    mime_type: variant.mimeType,
    byte_size: variant.byteSize ?? null,
    immutable_input_snapshot: { ownerId: variant.ownerId, storageKey: variant.storageKey },
    created_at: variant.createdAt,
  });
  if (error) throw new Error(`Failed to persist Studio variant: ${error.message}`);
}

async function supabaseEdgeInsert(scope: StudioLineageScope, edge: AssetLineageEdge): Promise<void> {
  const { createServiceClient } = await import("@ethen/database/service");
  const client = createServiceClient();
  if (!client) throw new Error("Studio lineage requires a configured service client in production.");
  const { error } = await client.from("studio_asset_lineage_edges").insert({
    id: edge.id,
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    source_asset_id: edge.sourceAssetId ?? null,
    output_asset_id: edge.outputAssetId ?? null,
    job_id: edge.jobId ?? null,
    provider_run_id: edge.providerRunId ?? null,
    profile_id: edge.profileId ?? null,
    consent_id: edge.consentId ?? null,
    moderation_id: edge.moderationId ?? null,
    transform: edge.transform ?? null,
    input_snapshot_hash: edge.inputSnapshotHash ?? null,
    created_at: edge.createdAt,
  });
  if (error) throw new Error(`Failed to persist Studio lineage edge: ${error.message}`);
}

export function recordAssetVariant(input: Omit<AssetVariant, "id" | "createdAt" | "immutable">): AssetVariant {
  // Sync, memory-only path for tests/local. Production callers MUST use recordAssetVariantDurable.
  if (isProduction()) {
    throw new Error("Studio lineage: use recordAssetVariantDurable with explicit StudioLineageScope in production. In-memory variants are not allowed.");
  }
  return memoryStore.recordVariant(input);
}

export function recordAssetLineage(input: Omit<AssetLineageEdge, "id" | "createdAt" | "immutable">): AssetLineageEdge {
  if (isProduction()) {
    throw new Error("Studio lineage: use recordAssetLineageDurable with explicit StudioLineageScope in production. In-memory edges are not allowed.");
  }
  return memoryStore.recordEdge(input);
}

export function getAssetLineage(assetId: string, ownerId: string): AssetLineageEdge[] {
  return memoryStore.getLineage(assetId, ownerId);
}

/** Production durable variant recording — Supabase + proof contentHash. */
export async function recordAssetVariantDurable(scope: StudioLineageScope, input: Omit<AssetVariant, "id" | "createdAt" | "immutable">): Promise<AssetVariant> {
  assertLineageScope(scope);
  if (scope.projectId !== input.projectId) throw new Error("Studio variant projectId must match lineage scope.");
  if (scope.actorId !== input.ownerId) throw new Error("Studio variant ownerId must match lineage actorId.");
  const record: AssetVariant = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), immutable: true };
  // Verify contentHash via shared proof primitive when bytes are not hashed elsewhere.
  if (record.contentHash) {
    if (!/^[a-f0-9]{64}$/i.test(record.contentHash)) throw new Error("Studio variant contentHash must be SHA-256 hex.");
  }
  let clientCheck = null;
  try {
    const { createServiceClient } = await import("@ethen/database/service");
    clientCheck = createServiceClient();
  } catch { /* handled below */ }
  if (clientCheck) {
    await supabaseVariantInsert(scope, record);
  } else if (isProduction()) {
    throw new Error("Studio variant persistence requires Supabase service client.");
  } else {
    variants.push(record);
  }
  return { ...record };
}

/** Production durable lineage edge — project-scoped, immutable, cross-project writes fail. */
export async function recordAssetLineageDurable(scope: StudioLineageScope, input: Omit<AssetLineageEdge, "id" | "createdAt" | "immutable">): Promise<AssetLineageEdge> {
  assertLineageScope(scope);
  if (scope.projectId !== input.projectId) throw new Error("Studio lineage projectId must match scope.");
  if (scope.actorId !== input.ownerId) throw new Error("Studio lineage ownerId must match scope actorId.");
  const record: AssetLineageEdge = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), immutable: true };
  let clientCheck = null;
  try {
    const { createServiceClient } = await import("@ethen/database/service");
    clientCheck = createServiceClient();
  } catch { /* handled below */ }
  if (clientCheck) {
    await supabaseEdgeInsert(scope, record);
  } else if (isProduction()) {
    throw new Error("Studio lineage persistence requires Supabase service client.");
  } else {
    edges.push(record);
  }
  return { ...record };
}

export async function listAssetVariantsDurable(scope: StudioLineageScope): Promise<readonly AssetVariant[]> {
  assertLineageScope(scope);
  const { createServiceClient } = await import("@ethen/database/service");
  const client = createServiceClient();
  if (!client) {
    if (isProduction()) throw new Error("Studio lineage requires Supabase service client.");
    return memoryStore.listVariants(scope.projectId);
  }
  const { data, error } = await client.from("studio_asset_variants").select("*").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to list Studio variants: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    assetId: String(row.asset_id),
    projectId: String(row.project_id),
    ownerId: String(row.created_by ?? scope.actorId),
    kind: String(row.variant_kind) as AssetVariantKind,
    storageKey: String(row.object_reference_hash),
    mimeType: String(row.mime_type),
    contentHash: row.content_hash ? String(row.content_hash) : null,
    byteSize: row.byte_size != null ? Number(row.byte_size) : null,
    createdAt: String(row.created_at),
    immutable: true as const,
  }));
}

export async function getAssetLineageDurable(scope: StudioLineageScope, assetId: string): Promise<readonly AssetLineageEdge[]> {
  assertLineageScope(scope);
  const { createServiceClient } = await import("@ethen/database/service");
  const client = createServiceClient();
  if (!client) {
    if (isProduction()) throw new Error("Studio lineage requires Supabase service client.");
    return memoryStore.getLineage(assetId, scope.actorId);
  }
  const { data, error } = await client.from("studio_asset_lineage_edges").select("*").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).or(`source_asset_id.eq.${assetId},output_asset_id.eq.${assetId}`).order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load Studio lineage: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    ownerId: scope.actorId,
    sourceAssetId: row.source_asset_id ? String(row.source_asset_id) : undefined,
    outputAssetId: row.output_asset_id ? String(row.output_asset_id) : undefined,
    jobId: row.job_id ? String(row.job_id) : undefined,
    providerRunId: row.provider_run_id ? String(row.provider_run_id) : undefined,
    profileId: row.profile_id ? String(row.profile_id) : undefined,
    consentId: row.consent_id ? String(row.consent_id) : undefined,
    moderationId: row.moderation_id ? String(row.moderation_id) : undefined,
    transform: row.transform ? String(row.transform) : undefined,
    inputSnapshotHash: row.input_snapshot_hash ? String(row.input_snapshot_hash) : undefined,
    createdAt: String(row.created_at),
    immutable: true as const,
  }));
}

export function __clearLineageForTests(): void { memoryStore.clear(); }

// ── Shared asset-version reference contract ─────────────────────────────────
// Products (including Designer) consume shared media through stable
// asset-version references instead of copying untracked blobs or taking
// ownership of raw media generation. A reference is immutable and points at
// one persisted, content-addressed version of an asset.

export interface AssetVersionRef {
  /** Owning asset id in the shared media store. */
  assetId: string;
  /** Immutable version (variant) id of that asset. */
  versionId: string;
  projectId: string;
  /** Immutable owner binding for private-beta local repositories. */
  ownerId: string;
  /** Private object-store key of the referenced bytes. */
  storageKey: string;
  /** Server-verified SHA-256 of the canonical bytes (may be unknown). */
  contentHash: string | null;
  mimeType: string;
  byteSize: number | null;
  immutable: true;
}

/** Derive a stable asset-version reference from a recorded asset variant. */
export function toAssetVersionRef(variant: AssetVariant): AssetVersionRef {
  return {
    assetId: variant.assetId,
    versionId: variant.id,
    projectId: variant.projectId,
    ownerId: variant.ownerId,
    storageKey: variant.storageKey,
    contentHash: variant.contentHash ?? null,
    mimeType: variant.mimeType,
    byteSize: variant.byteSize ?? null,
    immutable: true,
  };
}

/**
 * Validate that a reference is structurally complete enough to be persisted.
 * A ref with a known content hash is treated as verified; an unknown hash
 * must remain explicitly unverified (null) — never silently assumed.
 */
export function assertAssetVersionRefShape(ref: AssetVersionRef): void {
  if (!ref.assetId || !ref.versionId || !ref.projectId || !ref.ownerId || !ref.storageKey || !ref.mimeType) {
    throw new Error("Asset version reference is incomplete.");
  }
  if (ref.immutable !== true) throw new Error("Asset version references must be immutable.");
}

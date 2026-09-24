import "server-only";

/**
 * STUDIO_07 route-adapter media access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed media ledger over the j07 schema. Service-role bypasses
 * RLS, so every call binds explicit project scope. Heavy media work runs in
 * the studio-worker media-cpu queue — routes only claim, validate, and read.
 */
import { createHash } from "node:crypto";
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import { MediaError } from "@ethen/studio-core/server/media";
import type { IngestStage } from "@ethen/studio-core/server/media";

type Row = Record<string, unknown>;

function mediaFailure(message: string): never {
  throw new MediaError("INTERNAL", message);
}

export interface MediaProcessView {
  processId: string;
  stage: IngestStage;
  assetId: string | null;
  version: number | null;
  sha256: string | null;
  failureReason: string | null;
  detail: string | null;
  replayed: boolean;
}

function toProcessView(row: Row, replayed: boolean): MediaProcessView {
  return {
    processId: String(row.process_id ?? ""),
    stage: String(row.stage ?? "QUARANTINED") as IngestStage,
    assetId: typeof row.asset_id === "string" ? row.asset_id : null,
    version: typeof row.version === "number" ? row.version : null,
    sha256: typeof row.sha256 === "string" ? row.sha256 : null,
    failureReason: typeof row.failure_reason === "string" ? row.failure_reason : null,
    detail: typeof row.detail === "string" ? row.detail : null,
    replayed,
  };
}

/** Claim an idempotent ingest process. Provider URLs are never stored — host + hash only. */
export async function claimMediaProcess(
  resolved: ResolvedScope,
  input: { idempotencyKey: string; sourceUrl: string; expiresAt: string | null },
): Promise<MediaProcessView> {
  const client = requireServiceClient();
  let host: string;
  try {
    host = new URL(input.sourceUrl).hostname;
  } catch {
    throw new MediaError("BAD_REQUEST", "Source URL is not a valid absolute URL.");
  }
  const urlHash = createHash("sha256").update(input.sourceUrl).digest("hex");
  const { data, error } = await client.rpc("studio_v5_claim_media_process", {
    p_tenant: resolved.tenantId,
    p_workspace: resolved.workspaceId,
    p_project: resolved.projectId,
    p_key: input.idempotencyKey,
    p_host: host,
    p_url_hash: urlHash,
    p_expires: input.expiresAt,
  });
  if (error) mediaFailure(`Failed to claim media process: ${error.message}`);
  const rows = (Array.isArray(data) ? data : [data]) as Row[];
  const processId = String(rows[0]?.process_id ?? "");
  const replayed = rows[0]?.replayed === true;
  if (!processId) mediaFailure("Media process claim returned no id.");
  const { data: current, error: readError } = await client
    .from("studio_v5_media_processes")
    .select("process_id, stage, asset_id, version, sha256, failure_reason, detail")
    .eq("process_id", processId)
    .maybeSingle();
  if (readError) mediaFailure(`Failed to read media process: ${readError.message}`);
  if (!current) mediaFailure("Media process claim returned no row.");
  return toProcessView(current as Row, replayed);
}

export async function getMediaProcess(resolved: ResolvedScope, processId: string): Promise<MediaProcessView | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_media_processes")
    .select("process_id, stage, asset_id, version, sha256, failure_reason, detail")
    .eq("process_id", processId)
    .eq("project_id", resolved.projectId)
    .maybeSingle();
  if (error) mediaFailure(`Failed to read media process: ${error.message}`);
  if (!data) return null;
  return toProcessView(data as Row, false);
}

export interface MediaExportView {
  exportId: string;
  preset: string;
  presetVersion: string;
  title: string;
  lifecycle: string;
  manifestHash: string | null;
  decisionId: string | null;
  objectKey: string | null;
  replayed: boolean;
}

/** Claim an idempotent export. The worker packages bytes after policy re-check. */
export async function claimMediaExport(
  resolved: ResolvedScope,
  input: { idempotencyKey: string; preset: string; presetVersion: string; title: string; inputs: ReadonlyArray<Record<string, unknown>> },
): Promise<MediaExportView> {
  const client = requireServiceClient();
  const { data, error } = await client.rpc("studio_v5_record_media_export", {
    p_tenant: resolved.tenantId,
    p_workspace: resolved.workspaceId,
    p_project: resolved.projectId,
    p_key: input.idempotencyKey,
    p_preset: input.preset,
    p_preset_version: input.presetVersion,
    p_title: input.title,
    p_inputs: JSON.stringify(input.inputs),
  });
  if (error) mediaFailure(`Failed to claim media export: ${error.message}`);
  const rows = (Array.isArray(data) ? data : [data]) as Row[];
  const exportId = String(rows[0]?.export_id ?? "");
  const replayed = rows[0]?.replayed === true;
  if (!exportId) mediaFailure("Media export claim returned no id.");
  const view = await getMediaExport(resolved, exportId);
  if (!view) mediaFailure("Media export claim returned no row.");
  return { ...view, replayed };
}

export async function getMediaExport(resolved: ResolvedScope, exportId: string): Promise<MediaExportView | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_media_exports")
    .select("export_id, preset, preset_version, title, lifecycle, manifest_hash, decision_id, object_key")
    .eq("export_id", exportId)
    .eq("project_id", resolved.projectId)
    .maybeSingle();
  if (error) mediaFailure(`Failed to read media export: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  return {
    exportId: String(row.export_id ?? ""),
    preset: String(row.preset ?? ""),
    presetVersion: String(row.preset_version ?? ""),
    title: String(row.title ?? ""),
    lifecycle: String(row.lifecycle ?? "pending"),
    manifestHash: typeof row.manifest_hash === "string" ? row.manifest_hash : null,
    decisionId: typeof row.decision_id === "string" ? row.decision_id : null,
    objectKey: typeof row.object_key === "string" ? row.object_key : null,
    replayed: false,
  };
}

/** M5 exports console: newest-first export rows for this project. */
export async function listMediaExports(resolved: ResolvedScope): Promise<MediaExportView[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_media_exports")
    .select("export_id, preset, preset_version, title, lifecycle, manifest_hash, decision_id, object_key")
    .eq("project_id", resolved.projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) mediaFailure(`Failed to list media exports: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => ({
    exportId: String(row.export_id ?? ""),
    preset: String(row.preset ?? ""),
    presetVersion: String(row.preset_version ?? ""),
    title: String(row.title ?? ""),
    lifecycle: String(row.lifecycle ?? "pending"),
    manifestHash: typeof row.manifest_hash === "string" ? row.manifest_hash : null,
    decisionId: typeof row.decision_id === "string" ? row.decision_id : null,
    objectKey: typeof row.object_key === "string" ? row.object_key : null,
    replayed: false,
  }));
}

export interface MediaProxyView {
  derivativeId: string;
  assetId: string;
  version: number;
  kind: string;
  storageKey: string;
  sha256: string;
  expiresAt: string | null;
  expiredAt: string | null;
}

/** List live derivatives for an asset version (expired rows excluded). */
export async function listLiveDerivatives(
  resolved: ResolvedScope,
  assetId: string,
  version: number,
): Promise<MediaProxyView[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_media_proxies")
    .select("derivative_id, asset_id, version, kind, storage_key, sha256, expires_at, expired_at")
    .eq("project_id", resolved.projectId)
    .eq("asset_id", assetId)
    .eq("version", version)
    .is("expired_at", null);
  if (error) mediaFailure(`Failed to list derivatives: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => ({
    derivativeId: String(row.derivative_id ?? ""),
    assetId: String(row.asset_id ?? ""),
    version: Number(row.version ?? 0),
    kind: String(row.kind ?? ""),
    storageKey: String(row.storage_key ?? ""),
    sha256: String(row.sha256 ?? ""),
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    expiredAt: typeof row.expired_at === "string" ? row.expired_at : null,
  }));
}

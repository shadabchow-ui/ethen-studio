/**
 * lib/storage/tenant-object-storage.ts
 *
 * Server-only tenant-scoped object storage service.
 *
 * Provides:
 *  - Upload of binary data to the Supabase Storage project-objects bucket
 *  - Signed time-limited URLs for secure read access
 *  - Object metadata tracking (tenant_artifact_objects table)
 *  - Deletion (object + record)
 *  - Retention-driven cleanup via the cleanup_expired_tenant_objects DB function
 *
 * Used by: Computer Use screenshots, Studio assets, Voice audio, Code evidence bundles.
 * Proof/evidence objects use SupabaseProofObjectStore directly; this service
 * wraps the same bucket for non-proof tenant objects.
 *
 * Secret-storage note: No provider/connector secrets pass through this service.
 * Secrets live in the credential vault (lib/platform/credentials).
 */

import "server-only";
import { scanUpload } from "./scanning";

import { randomUUID } from "node:crypto";
import { createServiceClient } from "../service";
import { tenantObjectKey } from "./tenant-object-keys";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Exported types ─────────────────────────────────────────────────────────

export type TenantObjectSource =
  | "computer-use"
  | "studio"
  | "voice"
  | "code-evidence"
  | "designer"
  | "chat"
  | "console"
  | "unknown";

export interface TenantObjectRecord {
  id: string;
  projectId: string;
  objectKey: string;
  storagePath: string;
  bucketId: string;
  contentType: string | null;
  byteSize: number | null;
  createdBy: string | null;
  source: TenantObjectSource;
  retentionDays: number | null;
  expiresAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  sha256: string | null;
  scannerStatus: string | null;
  originalFilename: string | null;
  variantId: string | null;
  idempotencyKey: string | null;
}

export interface UploadTenantObjectInput {
  projectId: string;
  actorId: string;
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  source: TenantObjectSource;
  retentionDays?: number;
  sha256?: string;
  scannerStatus?: "clean" | "quarantined" | "rejected";
  originalFilename?: string;
  variantId?: string;
  idempotencyKey?: string;
}

export interface UploadTenantObjectResult {
  objectKey: string;
  signedUrl: string;
  record: TenantObjectRecord;
}

export interface SignedUrlOptions {
  /** Time-to-live in seconds (default: 3600 = 1 hour). Max 7 days (604800). */
  ttlSeconds?: number;
  /** If true, use download URL instead of signed URL (public reads only). */
  download?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const BUCKET_ID = "project-objects";
const DEFAULT_SIGNED_URL_TTL = 3600; // 1 hour

// ── Error types ────────────────────────────────────────────────────────────

export class TenantObjectStorageError extends Error {
  readonly status: number;
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TenantObjectStorageError";
    this.status = code === "STORAGE_QUOTA_EXCEEDED" ? 429 : code === "STORAGE_FORBIDDEN" ? 403 : code === "UPLOAD_QUARANTINED" ? 422 : 503;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getClient(): SupabaseClient {
  const client = createServiceClient({ reason: "tenant_object_storage", tables: ["tenant_artifact_objects", "storage.objects", "projects", "project_members"] });
  if (!client) {
    throw new TenantObjectStorageError(
      "STORAGE_UNAVAILABLE",
      "Supabase service client is not configured. Tenant object storage requires Supabase environment variables.",
    );
  }
  return client;
}

function nowIso(): string {
  return new Date().toISOString();
}

function computeExpiry(retentionDays?: number): string | null {
  if (!retentionDays) return null;
  const d = new Date();
  d.setDate(d.getDate() + retentionDays);
  return d.toISOString();
}

function rowToRecord(row: Record<string, unknown>): TenantObjectRecord {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    objectKey: row.object_key as string,
    storagePath: row.storage_path as string,
    bucketId: row.bucket_id as string,
    contentType: row.content_type as string | null,
    byteSize: row.byte_size as number | null,
    createdBy: row.created_by as string | null,
    source: row.source as TenantObjectSource,
    retentionDays: row.retention_days as number | null,
    expiresAt: row.expires_at as string | null,
    deletedAt: row.deleted_at as string | null,
    createdAt: row.created_at as string,
    sha256: row.sha256 as string | null,
    scannerStatus: row.scanner_status as string | null,
    originalFilename: row.original_filename as string | null,
    variantId: row.variant_id as string | null,
    idempotencyKey: row.idempotency_key as string | null,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Upload binary data to the tenant-scoped object store.
 *
 * The object is stored in the `project-objects` Supabase Storage bucket
 * under the path `projects/{projectId}/objects/{objectId}/{filename}`.
 * A tracking record is created in `tenant_artifact_objects`.
 *
 * Returns the object key and a signed read URL valid for the configured TTL.
 */
export async function uploadTenantObject(
  input: UploadTenantObjectInput,
  options?: SignedUrlOptions,
): Promise<UploadTenantObjectResult> {
  const client = getClient();
  const scan = scanUpload(input.bytes, input.contentType);
  if (scan.status !== "clean") throw new TenantObjectStorageError("UPLOAD_QUARANTINED", "Upload failed content admission checks.");
  const { data: owner, error: ownerError } = await client.from("projects").select("owner_user_id").eq("id", input.projectId).maybeSingle();
  if (ownerError || !owner) throw new TenantObjectStorageError("STORAGE_FORBIDDEN", "Project access denied.");
  if (owner.owner_user_id !== input.actorId) {
    const member = await client.from("project_members").select("id").eq("project_id", input.projectId).eq("user_id", input.actorId).maybeSingle();
    if (member.error || !member.data) throw new TenantObjectStorageError("STORAGE_FORBIDDEN", "Project access denied.");
  }
  const objectId = randomUUID();
  const objectKey = tenantObjectKey(input.projectId, objectId, input.filename);
  const ttl = options?.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL;

  // Insert metadata tracking record
  const expiresAt = computeExpiry(input.retentionDays ?? 30);
  const insertRow = {
    project_id: input.projectId,
    object_key: objectKey,
    storage_path: `storage/${BUCKET_ID}/${objectKey}`,
    bucket_id: BUCKET_ID,
    content_type: input.contentType,
    byte_size: input.bytes.byteLength,
    created_by: input.actorId,
    source: input.source,
    retention_days: input.retentionDays ?? 30,
    expires_at: expiresAt,
    sha256: input.sha256 ?? null,
    scanner_status: "clean",
    original_filename: input.originalFilename ?? input.filename,
    variant_id: input.variantId ?? null,
    idempotency_key: input.idempotencyKey ?? null,
  };

  const { data: inserted, error: insertError } = await client
    .from("tenant_artifact_objects")
    .insert(insertRow)
    .select("*")
    .single();

  if (insertError) {
    // No bytes were uploaded; failed admission cannot consume blob storage.
    throw new TenantObjectStorageError(
      insertError.message.includes("STORAGE_QUOTA_EXCEEDED") ? "STORAGE_QUOTA_EXCEEDED" : "METADATA_INSERT_FAILED",
      "Failed to create tracking record.",
    );
  }

  // Upload to Supabase Storage
  const { error: uploadError } = await client.storage
    .from(BUCKET_ID)
    .upload(objectKey, input.bytes, {
      contentType: input.contentType,
      upsert: false,
    });

  if (uploadError) {
    await client.from("tenant_artifact_objects").update({ deleted_at: nowIso() }).eq("id", inserted.id);
    throw new TenantObjectStorageError(
      "UPLOAD_FAILED",
      "Failed to upload object.",
    );
  }

  // Generate signed URL for secure read access
  const signedUrl = await generateSignedUrl(objectKey, ttl);

  return {
    objectKey,
    signedUrl,
    record: rowToRecord(inserted as Record<string, unknown>),
  };
}

/** Retrieve a live object record only within its owning project. */
export async function getTenantObjectForProject(projectId: string, objectId: string): Promise<TenantObjectRecord | null> {
  const client = getClient();
  const { data, error } = await client
    .from("tenant_artifact_objects")
    .select("*")
    .eq("id", objectId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  return error || !data ? null : rowToRecord(data as Record<string, unknown>);
}

/** Retrieve an idempotent upload result without exposing objects across projects. */
export async function getTenantObjectByIdempotencyKey(projectId: string, idempotencyKey: string): Promise<TenantObjectRecord | null> {
  const client = getClient();
  const { data, error } = await client
    .from("tenant_artifact_objects")
    .select("*")
    .eq("project_id", projectId)
    .eq("idempotency_key", idempotencyKey)
    .is("deleted_at", null)
    .maybeSingle();
  return error || !data ? null : rowToRecord(data as Record<string, unknown>);
}

/** Server-side read; callers must authorize project ownership before proxying bytes. */
export async function downloadTenantObject(record: TenantObjectRecord): Promise<Uint8Array> {
  if (record.scannerStatus !== "clean" || record.deletedAt || (record.expiresAt && Date.parse(record.expiresAt) <= Date.now())) throw new TenantObjectStorageError("STORAGE_FORBIDDEN", "Object is not admitted for download.");
  const client = getClient();
  const { data, error } = await client.storage.from(record.bucketId).download(record.objectKey);
  if (error || !data) throw new TenantObjectStorageError("DOWNLOAD_FAILED", "Stored object could not be read.");
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Generate a signed time-limited URL for reading an object.
 *
 * The URL is valid for `ttlSeconds` (default: 3600, max: 604800).
 * Only admitted metadata records can receive a service-signed URL; callers must authorize the project.
 */
export async function generateSignedUrl(
  objectKey: string,
  ttlSeconds: number = DEFAULT_SIGNED_URL_TTL,
): Promise<string> {
  const client = getClient();
  const admitted = await client.from("tenant_artifact_objects").select("id,expires_at").eq("object_key", objectKey).eq("scanner_status", "clean").is("deleted_at", null).maybeSingle();
  if (admitted.error || !admitted.data || (admitted.data.expires_at && Date.parse(admitted.data.expires_at) <= Date.now())) throw new TenantObjectStorageError("STORAGE_FORBIDDEN", "Object is not admitted for download.");
  const remaining = admitted.data.expires_at ? Math.floor((Date.parse(admitted.data.expires_at) - Date.now()) / 1000) : 604800;
  if (remaining < 1) throw new TenantObjectStorageError("STORAGE_FORBIDDEN", "Object retention has expired.");
  const clampedTtl = Math.min(Math.max(ttlSeconds, 60), 604800, remaining); // 1 min – 7 days

  const { data, error } = await client.storage
    .from(BUCKET_ID)
    .createSignedUrl(objectKey, clampedTtl);

  if (error) {
    throw new TenantObjectStorageError(
      "SIGNED_URL_FAILED",
      "Failed to create signed URL.",
    );
  }

  return data.signedUrl;
}

/**
 * Delete an object from the store: removes the blob from the bucket
 * and soft-deletes the tracking record.
 *
 * Returns the deleted record, or null if not found or already deleted.
 */
export async function deleteTenantObject(
  projectId: string,
  objectId: string,
): Promise<TenantObjectRecord | null> {
  const client = getClient();

  // Find the tracking record
  const { data: existing, error: findError } = await client
    .from("tenant_artifact_objects")
    .select("*")
    .eq("id", objectId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (findError || !existing) return null;
  const record = existing as Record<string, unknown>;

  // Already deleted
  if (record.deleted_at) return rowToRecord(record);

  // Remove from storage bucket (idempotent)
  const { error: removeError } = await client.storage
    .from(BUCKET_ID)
    .remove([record.object_key as string]);

  if (removeError) {
    throw new TenantObjectStorageError(
      "DELETE_FAILED",
      "Failed to remove object from storage.",
    );
  }

  // Soft-delete tracking record
  const now = nowIso();
  const { data: updated, error: updateError } = await client
    .from("tenant_artifact_objects")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", objectId)
    .eq("project_id", projectId)
    .select("*")
    .single();

  if (updateError || !updated) return rowToRecord(record); // return original if update fails

  return rowToRecord(updated as Record<string, unknown>);
}

/**
 * List tenant objects for a project.
 */
export async function listTenantObjects(
  projectId: string,
  options?: {
    source?: TenantObjectSource;
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<TenantObjectRecord[]> {
  const client = getClient();
  let query = client
    .from("tenant_artifact_objects")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (options?.source) {
    query = query.eq("source", options.source);
  }

  if (!options?.includeDeleted) {
    query = query.is("deleted_at", null);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 20) - 1);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((r: Record<string, unknown>) => rowToRecord(r));
}

/**
 * Run the retention cleanup job.
 *
 * Calls the DB function cleanup_expired_tenant_objects() which deletes
 * expired objects from the storage bucket and soft-deletes tracking records.
 * Returns the count of objects cleaned up.
 */
export async function runRetentionCleanup(): Promise<number> {
  const client = getClient();

  const { data, error } = await client.rpc("cleanup_expired_tenant_objects");

  if (error) {
    throw new TenantObjectStorageError(
      "RETENTION_CLEANUP_FAILED",
      `Retention cleanup failed: ${error.message}`,
    );
  }

  return (data as number) ?? 0;
}

/**
 * Health check: verify the bucket and tracking table are reachable.
 */
export async function getTenantObjectStorageHealth(): Promise<{
  configured: boolean;
  bucketReachable: boolean;
  tableReachable: boolean;
}> {
  try {
    const client = getClient();

    // Try to list the bucket (checks Supabase Storage is reachable)
    const { data: buckets } = await client.storage.listBuckets();
    const bucketReachable = (buckets ?? []).some((b) => b.id === BUCKET_ID);

    // Try to query the tracking table
    const { error: tableError } = await client
      .from("tenant_artifact_objects")
      .select("id")
      .limit(1);

    return {
      configured: true,
      bucketReachable,
      tableReachable: !tableError,
    };
  } catch {
    return {
      configured: false,
      bucketReachable: false,
      tableReachable: false,
    };
  }
}

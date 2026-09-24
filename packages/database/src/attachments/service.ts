/**
 * lib/attachments/service.ts
 *
 * JOB 7 — Chat/Console attachment pipeline over private tenant object storage.
 *
 * Bytes land in the private `project-objects` Supabase bucket (source
 * `chat` or `console`) only after validation, magic-byte admission, and a
 * clean scanner verdict. Reads go through project-scoped authorization;
 * browsers use the same-origin authorized proxy or a short-TTL signed URL —
 * never a public bucket URL. Membership is enforced by callers through
 * `requireProject`; every method below additionally scopes records to the
 * owning project and refuses revoked, expired, or unscaned objects.
 *
 * The object store is injectable so tests run without Supabase; routes use
 * the default Supabase-backed store.
 */

import "server-only";

import { scanUpload } from "../storage/scanning";
import {
  TenantObjectStorageError,
  deleteTenantObject,
  downloadTenantObject,
  generateSignedUrl,
  getTenantObjectByIdempotencyKey,
  getTenantObjectForProject,
  uploadTenantObject,
} from "../storage/tenant-object-storage";
import type { TenantObjectRecord } from "../storage/tenant-object-storage";
import type { GatewayContentPart } from "@ethen/models/gateway/types";
import {
  ATTACHMENT_MODEL_TEXT_LIMIT,
  ATTACHMENT_RETENTION_DAYS,
  AttachmentValidationError,
  isImageAttachmentMimeType,
  safeAttachmentFilename,
  validateAttachmentUpload,
} from "./validation";

export type AttachmentSource = "chat" | "console";

export interface AttachmentAssetView {
  id: string;
  projectId: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  sha256: string | null;
  downloadPath: string;
  signedUrl: string;
}

export interface AttachmentReference {
  assetId: string;
  projectId: string;
}

export interface AttachmentObjectStore {
  upload(input: {
    projectId: string;
    actorId: string;
    bytes: Uint8Array;
    contentType: string;
    filename: string;
    originalFilename: string;
    source: AttachmentSource;
    retentionDays: number;
    sha256: string;
    idempotencyKey?: string;
  }): Promise<{ objectKey: string; signedUrl: string; record: TenantObjectRecord }>;
  recordForProject(projectId: string, objectId: string): Promise<TenantObjectRecord | null>;
  recordByIdempotencyKey(projectId: string, idempotencyKey: string): Promise<TenantObjectRecord | null>;
  download(record: TenantObjectRecord): Promise<Uint8Array>;
  signedUrl(objectKey: string, ttlSeconds: number): Promise<string>;
  remove(projectId: string, objectId: string): Promise<unknown>;
}

export const defaultAttachmentObjectStore: AttachmentObjectStore = {
  async upload(input) {
    return uploadTenantObject(
      {
        projectId: input.projectId,
        actorId: input.actorId,
        bytes: input.bytes,
        contentType: input.contentType,
        filename: input.filename,
        originalFilename: input.originalFilename,
        source: input.source,
        retentionDays: input.retentionDays,
        sha256: input.sha256,
        scannerStatus: "clean",
        idempotencyKey: input.idempotencyKey,
      },
      { ttlSeconds: 300 },
    );
  },
  recordForProject(projectId, objectId) {
    return getTenantObjectForProject(projectId, objectId);
  },
  recordByIdempotencyKey(projectId, idempotencyKey) {
    return getTenantObjectByIdempotencyKey(projectId, idempotencyKey);
  },
  download(record) {
    return downloadTenantObject(record);
  },
  signedUrl(objectKey, ttlSeconds) {
    return generateSignedUrl(objectKey, ttlSeconds);
  },
  remove(projectId, objectId) {
    return deleteTenantObject(projectId, objectId);
  },
};

export type AttachmentScanner = (input: {
  bytes: Uint8Array;
  sha256: string;
  mimeType: string;
  filename: string;
}) => Promise<{ clean: boolean }>;

export class AttachmentScannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentScannerError";
  }
}

export class AttachmentQuarantinedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentQuarantinedError";
  }
}

export class AttachmentStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentStorageError";
  }
}

export class AttachmentNotFoundError extends Error {
  constructor() {
    super("Attachment not found.");
    this.name = "AttachmentNotFoundError";
  }
}

export class AttachmentResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentResolutionError";
  }
}

/**
 * External malware/media scanner. Fail-closed by design: a missing,
 * malformed, or unavailable scanner blocks the upload. There is deliberately
 * no allow fallback.
 */
export async function requireCleanAttachment(input: {
  bytes: Uint8Array;
  sha256: string;
  mimeType: string;
  filename: string;
}): Promise<{ clean: boolean }> {
  const endpoint = process.env.ATTACHMENT_SCANNER_URL;
  if (!endpoint || !endpoint.startsWith("https://")) {
    throw new AttachmentScannerError("Attachment scanning is unavailable; the file was not accepted.");
  }
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-content-sha256": input.sha256,
        "x-content-type": input.mimeType,
        "x-original-filename": input.filename,
      },
      body: Uint8Array.from(input.bytes).buffer,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new AttachmentScannerError("Attachment scanning is unavailable; the file was not accepted.");
  }
  const result = (await response.json().catch(() => null)) as { clean?: unknown } | null;
  if (!response.ok || result?.clean !== true) {
    throw new AttachmentScannerError("The attachment was not approved by the scanner.");
  }
  return { clean: true };
}

export function attachmentDownloadPath(record: { id: string; projectId: string }): string {
  return `/api/attachments/${record.id}?projectId=${encodeURIComponent(record.projectId)}`;
}

function toAssetView(record: TenantObjectRecord, signedUrl: string): AttachmentAssetView {
  return {
    id: record.id,
    projectId: record.projectId,
    mimeType: record.contentType,
    fileSizeBytes: record.byteSize,
    sha256: record.sha256,
    downloadPath: attachmentDownloadPath(record),
    signedUrl,
  };
}

function isLiveRecord(record: TenantObjectRecord, projectId: string): boolean {
  if (record.projectId !== projectId) return false;
  if (record.source !== "chat" && record.source !== "console") return false;
  if (record.scannerStatus !== "clean") return false;
  if (record.deletedAt) return false;
  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return false;
  return true;
}

export class AttachmentService {
  constructor(private readonly store: AttachmentObjectStore = defaultAttachmentObjectStore) {}

  async ingest(input: {
    projectId: string;
    actorId: string;
    bytes: Uint8Array;
    declaredMimeType: string;
    originalFilename: string;
    source: AttachmentSource;
    idempotencyKey?: string;
    scanner?: AttachmentScanner;
  }): Promise<AttachmentAssetView> {
    const metadata = validateAttachmentUpload(input.bytes, input.declaredMimeType, input.originalFilename);
    const admission = scanUpload(input.bytes, metadata.mimeType);
    if (admission.status !== "clean") {
      throw new AttachmentQuarantinedError("Attachment failed content admission checks.");
    }
    const filename = safeAttachmentFilename(input.originalFilename, metadata.extension);
    const scan = input.scanner ?? requireCleanAttachment;
    const verdict = await scan({
      bytes: input.bytes,
      sha256: metadata.sha256,
      mimeType: metadata.mimeType,
      filename,
    }).catch((error) => {
      if (error instanceof AttachmentScannerError) throw error;
      throw new AttachmentScannerError("Attachment scanning is unavailable; the file was not accepted.");
    });
    if (!verdict.clean) throw new AttachmentScannerError("The attachment was not approved by the scanner.");

    try {
      if (input.idempotencyKey) {
        const existing = await this.store.recordByIdempotencyKey(input.projectId, input.idempotencyKey);
        if (existing && isLiveRecord(existing, input.projectId)) {
          const signedUrl = await this.store.signedUrl(existing.objectKey, 300);
          return toAssetView(existing, signedUrl);
        }
      }
      const stored = await this.store.upload({
        projectId: input.projectId,
        actorId: input.actorId,
        bytes: input.bytes,
        contentType: metadata.mimeType,
        filename,
        originalFilename: input.originalFilename,
        source: input.source,
        retentionDays: ATTACHMENT_RETENTION_DAYS,
        sha256: metadata.sha256,
        idempotencyKey: input.idempotencyKey,
      });
      return toAssetView(stored.record, stored.signedUrl);
    } catch (error) {
      if (
        error instanceof AttachmentValidationError ||
        error instanceof AttachmentQuarantinedError ||
        error instanceof AttachmentScannerError
      ) {
        throw error;
      }
      if (error instanceof TenantObjectStorageError) {
        throw new AttachmentStorageError("Secure attachment storage is unavailable.");
      }
      throw new AttachmentStorageError("Attachment could not be processed.");
    }
  }

  /** Project-scoped authorization for a stored attachment. Never throws the reason. */
  async authorizeDownload(projectId: string, assetId: string): Promise<TenantObjectRecord> {
    try {
      const record = await this.store.recordForProject(projectId, assetId);
      if (!record || !isLiveRecord(record, projectId)) throw new AttachmentNotFoundError();
      return record;
    } catch (error) {
      if (error instanceof AttachmentNotFoundError) throw error;
      throw new AttachmentStorageError("Secure attachment storage is unavailable.");
    }
  }

  async downloadAuthorized(record: TenantObjectRecord): Promise<Uint8Array> {
    try {
      return await this.store.download(record);
    } catch {
      throw new AttachmentStorageError("Attachment content is unavailable.");
    }
  }

  async remove(projectId: string, assetId: string): Promise<boolean> {
    await this.authorizeDownload(projectId, assetId);
    try {
      await this.store.remove(projectId, assetId);
      return true;
    } catch {
      throw new AttachmentStorageError("Attachment deletion failed.");
    }
  }

  /**
   * Resolve durable attachment references into model-ready content. Images
   * become vision parts; text documents become bounded context blocks. Any
   * unresolvable reference fails the whole message closed — silent context
   * loss is worse than a visible error.
   */
  async resolveModelContent(
    refs: AttachmentReference[],
    options?: { textLimit?: number },
  ): Promise<{ parts: GatewayContentPart[]; textBlocks: Array<{ name: string; text: string }> }> {
    const parts: GatewayContentPart[] = [];
    const textBlocks: Array<{ name: string; text: string }> = [];
    const textLimit = options?.textLimit ?? ATTACHMENT_MODEL_TEXT_LIMIT;
    for (const ref of refs) {
      let record: TenantObjectRecord;
      try {
        record = await this.authorizeDownload(ref.projectId, ref.assetId);
      } catch {
        throw new AttachmentResolutionError("An attachment could not be authorized for this request.");
      }
      const bytes = await this.downloadAuthorized(record).catch(() => {
        throw new AttachmentResolutionError("An attachment could not be read for this request.");
      });
      const mimeType = record.contentType ?? "application/octet-stream";
      const name = record.originalFilename ?? record.objectKey;
      if (isImageAttachmentMimeType(mimeType)) {
        parts.push({
          type: "image",
          mediaType: mimeType as "image/png" | "image/jpeg" | "image/webp",
          data: Buffer.from(bytes).toString("base64"),
        });
      } else {
        const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        const text = decoded.length > textLimit ? `${decoded.slice(0, textLimit)}\n…[truncated]` : decoded;
        textBlocks.push({ name, text });
      }
    }
    return { parts, textBlocks };
  }
}

import "server-only";

import { isVaultConfigured } from "../vault";
import { microsoftGraphGet } from "./graph-client";
import type {
  MicrosoftResult,
  MicrosoftError,
  DriveFileSummary,
  DriveFileDetail,
  DriveSearchParams,
} from "./types";

const NOT_CONFIGURED: MicrosoftError = {
  code: "NOT_CONFIGURED",
  message: "SharePoint connector is not configured. Token vault is unavailable.",
  status: 503,
};

const SITE_REQUIRED: MicrosoftError = {
  code: "VALIDATION_ERROR",
  message: "A SharePoint site ID or server-relative path is required.",
  status: 400,
};

function notConfigured<T>(): MicrosoftResult<T> {
  return { ok: false, error: NOT_CONFIGURED };
}

/**
 * List files in a SharePoint document library.
 * Read-only — no approval required.
 */
export async function listSharePointFiles(
  connectionId: string,
  siteId: string,
  driveId: string,
  params: DriveSearchParams = {}
): Promise<MicrosoftResult<DriveFileSummary[]>> {
  if (!isVaultConfigured()) return notConfigured();
  if (!siteId) return { ok: false, error: SITE_REQUIRED };

  const root = params.folder ? `:/${params.folder}:/children` : "/root/children";

  const queryParams: Record<string, string> = {
    $top: String(params.maxResults || 50),
    $select: "id,name,parentReference,size,lastModifiedDateTime,createdByUser,file,folder,webUrl",
  };

  if (params.query) {
    queryParams.$filter = `contains(name,'${params.query}')`;
  }

  const result = await microsoftGraphGet<{ value: Record<string, unknown>[] }>(
    connectionId,
    `/sites/${siteId}/drives/${driveId}${root}`,
    queryParams
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  return { ok: true, data: (result.data.value || []).map((raw) => normalizeSharePointSummary(raw)) };
}

/**
 * Search across a SharePoint site.
 * Read-only — no approval required.
 */
export async function searchSharePoint(
  connectionId: string,
  siteId: string,
  query: string,
  maxResults = 25
): Promise<MicrosoftResult<DriveFileSummary[]>> {
  if (!isVaultConfigured()) return notConfigured();

  const result = await microsoftGraphGet<{ value: Array<Record<string, unknown>> }>(
    connectionId,
    `/sites/${siteId}/drive/root/search(q='${encodeURIComponent(query)}')`,
    { $top: String(maxResults) }
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  return { ok: true, data: (result.data.value || []).map((raw) => normalizeSharePointSummary(raw)) };
}

/**
 * Get SharePoint file metadata.
 * Read-only — no approval required.
 */
export async function getSharePointFileDetail(
  connectionId: string,
  siteId: string,
  fileId: string
): Promise<MicrosoftResult<DriveFileDetail>> {
  if (!isVaultConfigured()) return notConfigured();

  const result = await microsoftGraphGet<Record<string, unknown>>(
    connectionId,
    `/sites/${siteId}/drive/items/${fileId}`,
    { $select: "id,name,parentReference,size,lastModifiedDateTime,createdByUser,file,folder,webUrl,eTag" }
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  return { ok: true, data: normalizeSharePointDetail(result.data) };
}

/**
 * Get a SharePoint site by hostname and server-relative path.
 * Returns the site ID and display name needed for file access operations.
 * Read-only — no approval required.
 */
export async function getSharePointSite(
  connectionId: string,
  hostname: string,
  serverRelativePath: string
): Promise<MicrosoftResult<{ id: string; name: string; url: string }>> {
  if (!isVaultConfigured()) return notConfigured();

  const encodedPath = serverRelativePath.startsWith("/") ? serverRelativePath : `/${serverRelativePath}`;
  const result = await microsoftGraphGet<Record<string, unknown>>(
    connectionId,
    `/sites/${hostname}:${encodedPath}`
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  return {
    ok: true,
    data: {
      id: String(result.data.id || ""),
      name: String(result.data.displayName || ""),
      url: String(result.data.webUrl || ""),
    },
  };
}

// ── Normalizers ────────────────────────────────────────────────────────────

function normalizeSharePointSummary(raw: Record<string, unknown>): DriveFileSummary {
  const parentRef = raw.parentReference as Record<string, unknown> | undefined;
  const createdBy = raw.createdByUser as Record<string, unknown> | undefined;
  return {
    id: String(raw.id || ""),
    name: String(raw.name || ""),
    path: String(parentRef?.path || ""),
    size: Number(raw.size || 0),
    lastModifiedAt: String(raw.lastModifiedDateTime || ""),
    createdBy: String(createdBy?.displayName || ""),
    fileType: raw.file ? String((raw.file as Record<string, unknown>).mimeType || "unknown") : raw.folder ? "folder" : "unknown",
    isFolder: Boolean(raw.folder),
    webUrl: String(raw.webUrl || ""),
  };
}

function normalizeSharePointDetail(raw: Record<string, unknown>): DriveFileDetail {
  const summary = normalizeSharePointSummary(raw);
  return {
    ...summary,
    mimeType: raw.file
      ? String((raw.file as Record<string, unknown>).mimeType || "application/octet-stream")
      : "inode/directory",
    etag: String(raw.eTag || ""),
    parentPath: String((raw.parentReference as Record<string, unknown> | undefined)?.path || ""),
    children: undefined,
    shareLink: null,
  };
}

import "server-only";

import { isVaultConfigured } from "../vault";
import { microsoftGraphGet } from "./graph-client";
import type {
  MicrosoftResult,
  MicrosoftError,
  DriveFileSummary,
  DriveFileDetail,
  DriveSearchParams,
  DocumentExport,
} from "./types";

const NOT_CONFIGURED: MicrosoftError = {
  code: "NOT_CONFIGURED",
  message: "OneDrive connector is not configured. Token vault is unavailable.",
  status: 503,
};

const UNSUPPORTED_EXPORT: MicrosoftError = {
  code: "UNSUPPORTED_ACTION",
  message: "Document export for this file type is not supported.",
  status: 422,
};

function notConfigured<T>(): MicrosoftResult<T> {
  return { ok: false, error: NOT_CONFIGURED };
}

/**
 * Search / list files in OneDrive.
 * Read-only — no approval required.
 */
export async function searchOneDriveFiles(
  connectionId: string,
  params: DriveSearchParams = {}
): Promise<MicrosoftResult<DriveFileSummary[]>> {
  if (!isVaultConfigured()) return notConfigured();

  const root = params.folder ? `/root:/${params.folder}:/children` : "/root/children";

  const queryParams: Record<string, string> = {
    $top: String(params.maxResults || 50),
    $select: "id,name,parentReference,size,lastModifiedDateTime,createdByUser,file,folder,webUrl",
  };

  if (params.query) {
    queryParams.$filter = `contains(name,'${params.query}')`;
  }

  const result = await microsoftGraphGet<{ value: Record<string, unknown>[] }>(
    connectionId,
    `/me/drive${root}`,
    queryParams
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  let files = (result.data.value || []).map(normalizeDriveSummary);

  if (params.fileTypes && params.fileTypes.length > 0) {
    files = files.filter((f) => params.fileTypes!.some((t) => f.name.toLowerCase().endsWith(t.toLowerCase())));
  }

  return { ok: true, data: files };
}

/**
 * Get full file metadata by ID.
 * Read-only — no approval required.
 */
export async function getOneDriveFileDetail(
  connectionId: string,
  fileId: string
): Promise<MicrosoftResult<DriveFileDetail>> {
  if (!isVaultConfigured()) return notConfigured();

  const result = await microsoftGraphGet<Record<string, unknown>>(
    connectionId,
    `/me/drive/items/${fileId}`,
    {
      $select: "id,name,parentReference,size,lastModifiedDateTime,createdByUser,file,folder,webUrl,eTag",
      $expand: "children($select=id,name,size,lastModifiedDateTime,webUrl)",
    }
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  return { ok: true, data: normalizeDriveDetail(result.data) };
}

/**
 * Read/export document content in a safe format.
 * Only supports text-based file types.
 * Read-only — no approval required.
 */
export async function exportOneDriveDocument(
  connectionId: string,
  fileId: string,
  format: "text" | "markdown" | "json" = "text"
): Promise<MicrosoftResult<DocumentExport>> {
  if (!isVaultConfigured()) return notConfigured();

  const meta = await getOneDriveFileDetail(connectionId, fileId);
  if (!meta.ok || !meta.data) {
    return { ok: false, error: meta.error! };
  }

  const exportableTypes = [".txt", ".md", ".json", ".csv", ".xml", ".html", ".htm", ".log", ".yaml", ".yml"];
  const fileName = meta.data.name.toLowerCase();
  if (!exportableTypes.some((ext) => fileName.endsWith(ext)) && meta.data.mimeType !== "text/plain") {
    return { ok: false, error: UNSUPPORTED_EXPORT };
  }

  const result = await microsoftGraphGet<Record<string, unknown>>(
    connectionId,
    `/me/drive/items/${fileId}/content`
  );

  if (!result.ok) {
    return { ok: false, error: result.error! };
  }

  return {
    ok: true,
    data: {
      id: fileId,
      name: meta.data.name,
      format,
      content: typeof result.data === "string" ? result.data : JSON.stringify(result.data),
      exportedAt: new Date().toISOString(),
    },
  };
}

// ── Normalizers ────────────────────────────────────────────────────────────

function normalizeDriveSummary(raw: Record<string, unknown>): DriveFileSummary {
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

function normalizeDriveDetail(raw: Record<string, unknown>): DriveFileDetail {
  const summary = normalizeDriveSummary(raw);
  const children = raw.children as Array<Record<string, unknown>> | undefined;
  return {
    ...summary,
    mimeType: raw.file
      ? String((raw.file as Record<string, unknown>).mimeType || "application/octet-stream")
      : "inode/directory",
    etag: String(raw.eTag || ""),
    parentPath: String((raw.parentReference as Record<string, unknown> | undefined)?.path || ""),
    children: Array.isArray(children) ? children.map(normalizeDriveSummary) : undefined,
    shareLink: null,
  };
}

import "server-only";

export class StudioUploadScannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioUploadScannerError";
  }
}

/**
 * Calls the configured malware/media scanner. There is deliberately no local
 * allow fallback: a missing, malformed, or unavailable scanner blocks approval.
 */
export async function requireCleanStudioUpload(input: {
  bytes: Uint8Array;
  sha256: string;
  mimeType: string;
  filename: string;
}): Promise<void> {
  const endpoint = process.env.STUDIO_UPLOAD_SCANNER_URL;
  if (!endpoint || !endpoint.startsWith("https://")) {
    throw new StudioUploadScannerError("Studio upload scanning is unavailable; the reference was not accepted.");
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
    throw new StudioUploadScannerError("Studio upload scanning is unavailable; the reference was not accepted.");
  }
  const result = await response.json().catch(() => null) as { clean?: unknown } | null;
  if (!response.ok || result?.clean !== true) {
    throw new StudioUploadScannerError("The upload was not approved by the media scanner.");
  }
}

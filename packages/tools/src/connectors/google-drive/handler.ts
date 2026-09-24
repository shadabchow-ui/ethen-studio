import "server-only";

import type { GoogleResult, GoogleFile, GoogleFileList, GoogleDocContent, GoogleSearchQuery, GoogleWorkspaceProvider } from "../google/types";

export async function handleDriveSearch(
  provider: GoogleWorkspaceProvider,
  query: GoogleSearchQuery,
): Promise<GoogleResult<GoogleFileList>> {
  return provider.driveSearch(query);
}

export async function handleDriveGetFile(
  provider: GoogleWorkspaceProvider,
  fileId: string,
): Promise<GoogleResult<GoogleFile>> {
  return provider.driveGetFile(fileId);
}

export async function handleDriveReadDoc(
  provider: GoogleWorkspaceProvider,
  fileId: string,
): Promise<GoogleResult<GoogleDocContent>> {
  return provider.driveReadDoc(fileId);
}

export async function handleDriveDraftWrite(
  _provider: GoogleWorkspaceProvider,
  _name: string,
  _content: string,
  _mimeType?: string,
): Promise<GoogleResult<{ draftId: string; name: string; preview: string }>> {
  return {
    meta: {
      ok: true,
      source: "mock",
      generatedAt: new Date().toISOString(),
    },
    data: {
      draftId: `draft-${Date.now()}`,
      name: _name,
      preview: _content.slice(0, 200),
    },
  };
}

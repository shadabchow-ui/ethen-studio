import "server-only";

import type { GoogleDocContent, GoogleResult, GoogleWorkspaceProvider } from "../google/types";

export async function handleDocsRead(
  provider: GoogleWorkspaceProvider,
  fileId: string,
): Promise<GoogleResult<GoogleDocContent>> {
  return provider.driveReadDoc(fileId);
}

export async function handleDocsDraftCreate(
  _provider: GoogleWorkspaceProvider,
  title: string,
  body: string,
): Promise<GoogleResult<{ draftId: string; title: string; preview: string }>> {
  return {
    meta: {
      ok: true,
      source: "mock",
      generatedAt: new Date().toISOString(),
    },
    data: {
      draftId: `doc-draft-${Date.now()}`,
      title,
      preview: body.slice(0, 200),
    },
  };
}

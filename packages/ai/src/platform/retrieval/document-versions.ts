import type {
  RetrievalDocumentVersion,
  RetrievalDocument,
  RetrievalChunk,
} from "./types";

export function createDocumentVersion(
  documentId: string,
  projectId: string,
  versionNumber: number,
  content: string,
): RetrievalDocumentVersion {
  const now = new Date().toISOString();
  return {
    id: `ver-${documentId}-v${versionNumber}`,
    documentId,
    projectId,
    versionNumber,
    content,
    contentHash: `v${versionNumber}-hash`,
    byteLength: Buffer.byteLength(content, "utf-8"),
    charCount: content.length,
    estimatedTokens: Math.ceil(content.length / 4),
    chunkCount: 0,
    createdAt: now,
  };
}

export function bumpDocumentVersion(
  doc: RetrievalDocument,
  newContent: string,
): { document: RetrievalDocument; version: RetrievalDocumentVersion } {
  const newVersion = doc.latestVersion + 1;
  const updated: RetrievalDocument = {
    ...doc,
    latestVersion: newVersion,
    updatedAt: new Date().toISOString(),
  };

  const version = createDocumentVersion(doc.id, doc.projectId, newVersion, newContent);
  return { document: updated, version };
}

export function getActiveChunks(
  chunks: RetrievalChunk[],
  versionId?: string,
): RetrievalChunk[] {
  let filtered = chunks.filter((c) => !c.isDeleted);
  if (versionId) {
    filtered = filtered.filter((c) => c.documentVersionId === versionId);
  }
  return filtered.sort((a, b) => a.ordinal - b.ordinal);
}

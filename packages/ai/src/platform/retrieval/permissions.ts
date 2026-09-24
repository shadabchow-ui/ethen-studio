import type { RetrievalChunk, RetrievalDocument } from "./types";

/**
 * Project-scoped permission checks for retrieval operations.
 * Service-level filters — RLS should be verified separately at the DB level.
 */

export function canAccessDocument(
  document: RetrievalDocument,
  targetProjectId: string,
): boolean {
  return document.projectId === targetProjectId;
}

export function filterChunksByProject(
  chunks: RetrievalChunk[],
  projectId: string,
): RetrievalChunk[] {
  return chunks.filter((c) => c.projectId === projectId);
}

export function denyCrossProjectRetrieval(
  requestedProjectId: string,
  chunk: RetrievalChunk,
  document: RetrievalDocument,
): void {
  if (chunk.projectId !== requestedProjectId) {
    throw new Error(
      `Cross-project retrieval denied: chunk ${chunk.id} belongs to project ${chunk.projectId}, requested ${requestedProjectId}`,
    );
  }
  if (document.projectId !== requestedProjectId) {
    throw new Error(
      `Cross-project retrieval denied: document ${document.id} belongs to project ${document.projectId}, requested ${requestedProjectId}`,
    );
  }
}

export function validateProjectScoping(
  projectId: string,
  ...resources: { projectId?: string }[]
): boolean {
  return resources.every((r) => !r.projectId || r.projectId === projectId);
}

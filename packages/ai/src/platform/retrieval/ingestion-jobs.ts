import type {
  IngestionJob,
  IngestionJobStatus,
  RetrievalDocument,
  RetrievalDocumentVersion,
  RetrievalChunk,
  RetrievalChunkEmbedding,
} from "./types";
import { chunkContent } from "./chunking";
import { generateDeterministicEmbedding } from "./embeddings";

const now = () => new Date().toISOString();
let jobCounter = 0;
function uid(prefix: string): string {
  jobCounter++;
  return `${prefix}-${Date.now().toString(36)}-${String(jobCounter).padStart(4, "0")}`;
}

export function createIngestionJob(
  projectId: string,
  documentId: string | null = null,
): IngestionJob {
  return {
    id: uid("job"),
    projectId,
    documentId,
    status: "pending",
    progressPercent: 0,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

export function transitionIngestionJob(
  job: IngestionJob,
  status: IngestionJobStatus,
  progressPercent?: number,
  errorMessage?: string,
): IngestionJob {
  const updated: IngestionJob = {
    ...job,
    status,
    progressPercent: progressPercent ?? job.progressPercent,
    errorMessage: errorMessage ?? job.errorMessage,
    updatedAt: now(),
  };

  if (status === "chunking" && !updated.startedAt) {
    updated.startedAt = now();
  }
  if (status === "completed" || status === "failed") {
    updated.completedAt = now();
  }

  return updated;
}

/**
 * Execute ingestion synchronously (for test/validator fixtures).
 * Returns the updated job with the ingested document data attached.
 */
export function executeIngestionFixture(
  projectId: string,
  title: string,
  content: string,
): {
  job: IngestionJob;
  document: RetrievalDocument;
  version: RetrievalDocumentVersion;
  chunks: RetrievalChunk[];
  embeddings: RetrievalChunkEmbedding[];
} {
  let job = createIngestionJob(projectId);
  job = transitionIngestionJob(job, "chunking", 20);

  const docId = uid("doc");
  const document: RetrievalDocument = {
    id: docId,
    projectId,
    title,
    sourceKind: "text",
    sourceName: null,
    contentHash: `fj-${title}`,
    latestVersion: 1,
    isDeleted: false,
    createdAt: now(),
    updatedAt: now(),
  };

  const version: RetrievalDocumentVersion = {
    id: uid("ver"),
    documentId: docId,
    projectId,
    versionNumber: 1,
    content,
    contentHash: document.contentHash,
    byteLength: Buffer.byteLength(content, "utf-8"),
    charCount: content.length,
    estimatedTokens: Math.ceil(content.length / 4),
    chunkCount: 0,
    createdAt: now(),
  };

  const chunkResults = chunkContent(content);
  version.chunkCount = chunkResults.length;

  job = transitionIngestionJob(job, "chunking", 60);

  const chunks: RetrievalChunk[] = chunkResults.map((cr, i) => ({
    id: uid("ch"),
    documentId: docId,
    documentVersionId: version.id,
    projectId,
    ordinal: i,
    content: cr.text,
    contentHash: cr.hash,
    charCount: cr.text.length,
    estimatedTokens: Math.ceil(cr.text.length / 4),
    isDeleted: false,
    deletedAt: null,
    deletedReason: null,
    createdAt: now(),
  }));

  job = transitionIngestionJob(job, "embedding", 80);

  const embeddings: RetrievalChunkEmbedding[] = chunks.map((ch) => ({
    id: uid("emb"),
    chunkId: ch.id,
    projectId,
    embedding: generateDeterministicEmbedding(ch.content, ch.contentHash),
    modelId: "deterministic-test-v1",
    dimensions: 384,
    isStale: false,
    staleReason: null,
    contentHashAtEmbedding: ch.contentHash,
    generatedAt: now(),
    createdAt: now(),
  }));

  job = transitionIngestionJob(job, "completed", 100);
  job = { ...job, documentId: docId };

  return { job, document, version, chunks, embeddings };
}

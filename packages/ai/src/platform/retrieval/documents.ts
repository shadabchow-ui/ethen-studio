import type {
  IngestDocumentInput,
  IngestDocumentOutput,
  RetrievalDocument,
  RetrievalDocumentVersion,
  RetrievalChunk,
  RetrievalChunkEmbedding,
} from "./types";
import { chunkContent, computeStaleChunks, isEmbeddingStale } from "./chunking";
import { generateDeterministicEmbedding } from "./embeddings";

const now = () => new Date().toISOString();

let ingestCounter = 0;
function uid(prefix: string): string {
  ingestCounter++;
  return `${prefix}-${Date.now().toString(36)}-${String(ingestCounter).padStart(4, "0")}`;
}

export interface IngestContext {
  existingDocument?: RetrievalDocument;
  existingVersion?: RetrievalDocumentVersion;
  existingChunks?: RetrievalChunk[];
  existingEmbeddings?: RetrievalChunkEmbedding[];
}

export function ingestDocument(
  input: IngestDocumentInput,
  context?: IngestContext,
): IngestDocumentOutput {
  const projectId = input.projectId;
  const contentHash = hashContent(input.content);
  const versionNumber = context?.existingDocument
    ? (context.existingDocument.latestVersion + 1)
    : 1;

  const document: RetrievalDocument = context?.existingDocument
    ? {
        ...context.existingDocument,
        latestVersion: versionNumber,
        contentHash,
        isDeleted: false,
        updatedAt: now(),
      }
    : {
        id: uid("doc"),
        projectId,
        title: input.title,
        sourceKind: input.sourceKind ?? "text",
        sourceName: input.sourceName ?? null,
        contentHash,
        latestVersion: 1,
        isDeleted: false,
        createdAt: now(),
        updatedAt: now(),
      };

  const version: RetrievalDocumentVersion = {
    id: uid("ver"),
    documentId: document.id,
    projectId,
    versionNumber,
    content: input.content,
    contentHash,
    byteLength: Buffer.byteLength(input.content, "utf-8"),
    charCount: input.content.length,
    estimatedTokens: Math.ceil(input.content.length / 4),
    chunkCount: 0,
    createdAt: now(),
  };

  const chunkResults = chunkContent(input.content);
  version.chunkCount = chunkResults.length;

  const existingHashSet = new Set(
    (context?.existingChunks ?? []).map((c) => c.contentHash),
  );
  const newHashSet = new Set(chunkResults.map((c) => c.hash));
  const staleHashes = computeStaleChunks(existingHashSet, newHashSet);

  const chunks: RetrievalChunk[] = [];

  for (let i = 0; i < chunkResults.length; i++) {
    const cr = chunkResults[i];
    chunks.push({
      id: uid("ch"),
      documentId: document.id,
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
    });
  }

  if (context?.existingChunks) {
    for (const ec of context.existingChunks) {
      if (staleHashes.has(ec.contentHash) && !ec.isDeleted) {
        chunks.push({
          ...ec,
          isDeleted: true,
          deletedAt: now(),
          deletedReason: "stale_chunk_no_longer_in_source",
        });
      }
    }
  }

  const embeddings: RetrievalChunkEmbedding[] = [];
  for (const ch of chunks) {
    if (ch.isDeleted) {
      const existingEmb = (context?.existingEmbeddings ?? []).find(
        (e) => e.chunkId === ch.id,
      );
      if (existingEmb) {
        embeddings.push({
          ...existingEmb,
          isStale: isEmbeddingStale(ch.contentHash, existingEmb.contentHashAtEmbedding),
          staleReason: existingEmb.isStale ? existingEmb.staleReason : "stale_embedding_deleted_chunk",
        });
      }
      continue;
    }

    const existingEmb = (context?.existingEmbeddings ?? []).find(
      (e) => e.chunkId === ch.id && !e.isStale,
    );

    if (existingEmb && existingEmb.contentHashAtEmbedding === ch.contentHash) {
      embeddings.push(existingEmb);
    } else {
      embeddings.push({
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
      });
    }
  }

  return {
    document,
    version,
    chunks,
    embeddings,
    job: {
      id: uid("job"),
      projectId,
      documentId: document.id,
      status: "completed",
      progressPercent: 100,
      errorMessage: null,
      startedAt: now(),
      completedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    },
  };
}

function hashContent(content: string): string {
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) - h + content.charCodeAt(i)) | 0;
  }
  return `ci-${(h >>> 0).toString(36)}-${content.length}`;
}

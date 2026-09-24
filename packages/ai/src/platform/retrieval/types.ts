/** Retrieval data model types — project-scoped RAG spine. */

export type DocumentSourceKind =
  | "text"
  | "markdown"
  | "project_note"
  | "workflow_spec"
  | "repo_doc";

export interface RetrievalDocument {
  id: string;
  projectId: string;
  title: string;
  sourceKind: DocumentSourceKind;
  sourceName: string | null;
  contentHash: string;
  latestVersion: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RetrievalDocumentVersion {
  id: string;
  documentId: string;
  projectId: string;
  versionNumber: number;
  content: string;
  contentHash: string;
  byteLength: number;
  charCount: number;
  estimatedTokens: number;
  chunkCount: number;
  createdAt: string;
}

export interface RetrievalChunk {
  id: string;
  documentId: string;
  documentVersionId: string;
  projectId: string;
  ordinal: number;
  content: string;
  contentHash: string;
  charCount: number;
  estimatedTokens: number;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedReason: string | null;
  createdAt: string;
}

export interface ChunkEmbeddingPayload {
  vector: number[];
  model: string;
  dimensions: number;
  generatedAt: string;
}

export interface RetrievalChunkEmbedding {
  id: string;
  chunkId: string;
  projectId: string;
  embedding: ChunkEmbeddingPayload;
  modelId: string;
  dimensions: number;
  isStale: boolean;
  staleReason: string | null;
  contentHashAtEmbedding: string | null;
  generatedAt: string;
  createdAt: string;
}

export type QueryStrategy = "keyword" | "vector" | "hybrid";

export interface RetrievalQuery {
  id: string;
  projectId: string;
  queryText: string;
  queryEmbedding: ChunkEmbeddingPayload | null;
  queryStrategy: QueryStrategy;
  topK: number;
  filters: Record<string, unknown> | null;
  resultCount: number;
  traceId: string | null;
  runId: string | null;
  createdAt: string;
}

export interface RetrievalResult {
  id: string;
  retrievalQueryId: string;
  projectId: string;
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  rank: number;
  score: number;
  scoreBreakdown: Record<string, unknown> | null;
  createdAt: string;
}

export interface RankedChunkResult {
  chunk: RetrievalChunk;
  document: RetrievalDocument;
  version: RetrievalDocumentVersion;
  score: number;
  rank: number;
  scoreBreakdown: Record<string, unknown> | null;
}

export type CitationConfidence = "high" | "medium" | "low";

export interface RetrievalCitation {
  id: string;
  projectId: string;
  documentId: string;
  documentVersionId: string;
  chunkId: string;
  retrievalQueryId: string | null;
  traceId: string | null;
  runId: string | null;
  sourceSpan: string | null;
  targetSpan: string | null;
  excerpt: string | null;
  confidence: CitationConfidence;
  createdAt: string;
}

export type GroundingStatus =
  | "grounded"
  | "partially_grounded"
  | "unsupported"
  | "not_enough_evidence"
  | "retrieval_failed"
  | "not_checked";

export interface GroundingCheck {
  id: string;
  projectId: string;
  traceId: string | null;
  runId: string | null;
  answerText: string;
  answerHash: string;
  groundingStatus: GroundingStatus;
  citedChunkIds: string[];
  supportedClaimCount: number;
  unsupportedClaimCount: number;
  totalClaimCount: number;
  evidence: Record<string, unknown> | null;
  notes: string | null;
  createdAt: string;
}

export interface GroundingCheckResult {
  status: GroundingStatus;
  supportedClaimCount: number;
  unsupportedClaimCount: number;
  totalClaimCount: number;
  citedChunkIds: string[];
  notes: string[];
}

export type IngestionJobStatus =
  | "pending"
  | "chunking"
  | "embedding"
  | "completed"
  | "failed";

export interface IngestionJob {
  id: string;
  projectId: string;
  documentId: string | null;
  status: IngestionJobStatus;
  progressPercent: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ReindexJobStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export interface ReindexJob {
  id: string;
  projectId: string;
  documentId: string;
  fromVersion: number;
  toVersion: number;
  status: ReindexJobStatus;
  chunksReindexed: number;
  embeddingsRebuilt: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IngestDocumentInput {
  projectId: string;
  title: string;
  content: string;
  sourceKind?: DocumentSourceKind;
  sourceName?: string;
}

export interface IngestDocumentOutput {
  document: RetrievalDocument;
  version: RetrievalDocumentVersion;
  chunks: RetrievalChunk[];
  embeddings: RetrievalChunkEmbedding[];
  job: IngestionJob;
}

export interface RetrievalQueryInput {
  projectId: string;
  queryText: string;
  topK?: number;
  strategy?: QueryStrategy;
  filters?: Record<string, unknown>;
  traceId?: string;
  runId?: string;
}

export interface RetrievalQueryOutput {
  query: RetrievalQuery;
  results: RankedChunkResult[];
}

export interface ChunkingOptions {
  maxChunkChars?: number;
  overlapChars?: number;
  minChunkChars?: number;
}

export const DEFAULT_CHUNKING_OPTIONS: Required<ChunkingOptions> = {
  maxChunkChars: 800,
  overlapChars: 80,
  minChunkChars: 50,
};

export const DEFAULT_EMBEDDING_DIMENSIONS = 384;
export const DETERMINISTIC_TEST_MODEL_ID = "deterministic-test-v1";

export const GROUNDING_STATUS_LABELS: Record<GroundingStatus, string> = {
  grounded: "Grounded",
  partially_grounded: "Partially Grounded",
  unsupported: "Unsupported",
  not_enough_evidence: "Not Enough Evidence",
  retrieval_failed: "Retrieval Failed",
  not_checked: "Not Checked",
};

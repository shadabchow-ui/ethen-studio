import type {
  RetrievalDocument,
  RetrievalDocumentVersion,
  RetrievalChunk,
  RetrievalChunkEmbedding,
  RetrievalQuery,
  RetrievalCitation,
  GroundingCheck,
  IngestionJob,
  ReindexJob,
  RankedChunkResult,
  IngestDocumentOutput,
  RetrievalQueryOutput,
} from "./types";
import { chunkContent } from "./chunking";
import { generateDeterministicEmbedding } from "./embeddings";

let fixtureCounter = 0;
function uid(prefix: string): string {
  fixtureCounter++;
  return `${prefix}-fixture-${String(fixtureCounter).padStart(4, "0")}`;
}

const FIXTURE_PROJECT_A = "00000000-0000-0000-0000-0000000000a1";
const FIXTURE_PROJECT_B = "00000000-0000-0000-0000-0000000000b2";

export { FIXTURE_PROJECT_A, FIXTURE_PROJECT_B };

/** Create deterministic test documents for project A (used for single-project tests). */
export function createFixtureDocuments(projectId: string): RetrievalDocument[] {
  if (!projectId) throw new Error("projectId is required");
  return [
    {
      id: uid("doc"),
      projectId,
      title: "Fixture Doc — Ethen Architecture Overview",
      sourceKind: "project_note",
      sourceName: "architecture.md",
      contentHash: "sha256-fixture-aa",
      latestVersion: 1,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uid("doc"),
      projectId,
      title: "Fixture Doc — Gateway Routing Spec",
      sourceKind: "workflow_spec",
      sourceName: "gateway-routing.md",
      contentHash: "sha256-fixture-bb",
      latestVersion: 1,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

/** Ingest fixture content and return full ingest output. */
export function ingestFixtureDocument(
  projectId: string,
  title: string,
  content: string,
  sourceKind?: string,
): IngestDocumentOutput {
  const now = new Date().toISOString();
  const doc: RetrievalDocument = {
    id: uid("doc"),
    projectId,
    title,
    sourceKind: (sourceKind as RetrievalDocument["sourceKind"]) ?? "text",
    sourceName: null,
    contentHash: `fixture-hash-${title.replace(/\s+/g, "-").toLowerCase()}`,
    latestVersion: 1,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };

  const version: RetrievalDocumentVersion = {
    id: uid("ver"),
    documentId: doc.id,
    projectId,
    versionNumber: 1,
    content,
    contentHash: doc.contentHash,
    byteLength: Buffer.byteLength(content, "utf-8"),
    charCount: content.length,
    estimatedTokens: Math.ceil(content.length / 4),
    chunkCount: 0,
    createdAt: now,
  };

  const chunkResults = chunkContent(content);
  version.chunkCount = chunkResults.length;

  const chunks: RetrievalChunk[] = chunkResults.map((cr, i) => ({
    id: uid("ch"),
    documentId: doc.id,
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
    createdAt: now,
  }));

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
    generatedAt: now,
    createdAt: now,
  }));

  const job: IngestionJob = {
    id: uid("job"),
    projectId,
    documentId: doc.id,
    status: "completed",
    progressPercent: 100,
    errorMessage: null,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  return { document: doc, version, chunks, embeddings, job };
}

/** Create a search fixture with ranked results. */
export function createFixtureQueryResults(
  projectId: string,
  queryText: string,
  chunks: RetrievalChunk[],
  documents: RetrievalDocument[],
  versions: RetrievalDocumentVersion[],
  topK: number = 10,
): RetrievalQueryOutput {
  const now = new Date().toISOString();
  const query: RetrievalQuery = {
    id: uid("qry"),
    projectId,
    queryText,
    queryEmbedding: generateDeterministicEmbedding(queryText, `q-${queryText}`),
    queryStrategy: "hybrid",
    topK,
    filters: null,
    resultCount: Math.min(chunks.length, topK),
    traceId: null,
    runId: null,
    createdAt: now,
  };

  const results: RankedChunkResult[] = chunks
    .filter((c) => !c.isDeleted)
    .slice(0, topK)
    .map((chunk, i) => {
      const doc = documents.find((d) => d.id === chunk.documentId)!;
      const ver = versions.find((v) => v.id === chunk.documentVersionId)!;
      return {
        chunk,
        document: doc,
        version: ver,
        score: 1 - i * 0.08,
        rank: i + 1,
        scoreBreakdown: { keyword: 0.5 - i * 0.04, vector: 0.5 - i * 0.04 },
      };
    });

  query.resultCount = results.length;
  return { query, results };
}

/** Create a fixture citation. */
export function createFixtureCitation(
  projectId: string,
  documentId: string,
  documentVersionId: string,
  chunkId: string,
  retrievalQueryId: string | null = null,
): RetrievalCitation {
  return {
    id: uid("cit"),
    projectId,
    documentId,
    documentVersionId,
    chunkId,
    retrievalQueryId,
    traceId: null,
    runId: null,
    sourceSpan: null,
    targetSpan: null,
    excerpt: null,
    confidence: "medium",
    createdAt: new Date().toISOString(),
  };
}

/** Create a fixture grounding check. */
export function createFixtureGroundingCheck(
  projectId: string,
  answerText: string,
  citedChunkIds: string[],
  status?: GroundingCheck["groundingStatus"],
): GroundingCheck {
  const now = new Date().toISOString();
  const claimCount = Math.max(1, Math.ceil(answerText.split(".").length / 2));
  const supported = status === "grounded" ? claimCount : Math.floor(claimCount / 3);

  return {
    id: uid("gnd"),
    projectId,
    traceId: null,
    runId: null,
    answerText,
    answerHash: `fixture-answer-${answerText.slice(0, 20).replace(/\s+/g, "-")}`,
    groundingStatus: status ?? "not_checked",
    citedChunkIds,
    supportedClaimCount: supported,
    unsupportedClaimCount: claimCount - supported,
    totalClaimCount: claimCount,
    evidence: null,
    notes: null,
    createdAt: now,
  };
}

/** Create a fixture reindex job. */
export function createFixtureReindexJob(
  projectId: string,
  documentId: string,
  fromVersion: number,
  toVersion: number,
  status: ReindexJob["status"] = "pending",
): ReindexJob {
  const now = new Date().toISOString();
  return {
    id: uid("rex"),
    projectId,
    documentId,
    fromVersion,
    toVersion,
    status,
    chunksReindexed: 0,
    embeddingsRebuilt: 0,
    errorMessage: null,
    startedAt: status !== "pending" ? now : null,
    completedAt: status === "completed" ? now : null,
    createdAt: now,
    updatedAt: now,
  };
}

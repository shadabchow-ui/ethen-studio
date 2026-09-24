import type {
  RetrievalCitation,
  CitationConfidence,
  RetrievalQuery,
  RankedChunkResult,
} from "./types";

const now = () => new Date().toISOString();
let citationCounter = 0;
function uid(prefix: string): string {
  citationCounter++;
  return `${prefix}-${Date.now().toString(36)}-${String(citationCounter).padStart(4, "0")}`;
}

export interface CreateCitationInput {
  projectId: string;
  documentId: string;
  documentVersionId: string;
  chunkId: string;
  retrievalQueryId?: string;
  traceId?: string;
  runId?: string;
  sourceSpan?: string;
  targetSpan?: string;
  excerpt?: string;
  confidence?: CitationConfidence;
}

export function createCitation(input: CreateCitationInput): RetrievalCitation {
  return {
    id: uid("cit"),
    projectId: input.projectId,
    documentId: input.documentId,
    documentVersionId: input.documentVersionId,
    chunkId: input.chunkId,
    retrievalQueryId: input.retrievalQueryId ?? null,
    traceId: input.traceId ?? null,
    runId: input.runId ?? null,
    sourceSpan: input.sourceSpan ?? null,
    targetSpan: input.targetSpan ?? null,
    excerpt: input.excerpt ?? null,
    confidence: input.confidence ?? "medium",
    createdAt: now(),
  };
}

/**
 * Bind citations from a retrieval result set to a query.
 */
export function bindCitationsFromResults(
  query: RetrievalQuery,
  results: RankedChunkResult[],
): RetrievalCitation[] {
  return results
    .filter((r) => r.score > 0.1)
    .map((r, i) => {
      const confidence: CitationConfidence =
        i < 3 ? "high" : i < 5 ? "medium" : "low";
      return createCitation({
        projectId: r.chunk.projectId,
        documentId: r.document.id,
        documentVersionId: r.version.id,
        chunkId: r.chunk.id,
        retrievalQueryId: query.id,
        traceId: query.traceId ?? undefined,
        runId: query.runId ?? undefined,
        confidence,
      });
    });
}

/**
 * Verify citations reference valid chunk IDs within the given set.
 * Returns true if all citations point to known chunks.
 */
export function verifyCitations(
  citations: RetrievalCitation[],
  knownChunkIds: Set<string>,
): { valid: boolean; invalid: RetrievalCitation[] } {
  const invalid = citations.filter((c) => !knownChunkIds.has(c.chunkId));
  return { valid: invalid.length === 0, invalid };
}

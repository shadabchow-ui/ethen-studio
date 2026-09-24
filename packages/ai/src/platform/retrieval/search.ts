import "server-only";

import type {
  RetrievalChunk,
  RetrievalQueryInput,
  RetrievalQueryOutput,
  RankedChunkResult,
  RetrievalDocument,
  RetrievalDocumentVersion,
  RetrievalChunkEmbedding,
} from "./types";
import { generateDeterministicEmbedding, cosineSimilarity } from "./embeddings";
import { getEmbeddingProviderMetadata } from "./embeddings-provider";

export interface SearchIndex {
  chunks: RetrievalChunk[];
  documents: RetrievalDocument[];
  versions: RetrievalDocumentVersion[];
  embeddings: RetrievalChunkEmbedding[];
}

export type SearchBackend = "in-memory" | "pgvector";

export interface SearchBackendStatus {
  backend: SearchBackend;
  available: boolean;
  reason: string | null;
}

export function getSearchBackendStatus(): SearchBackendStatus {
  const meta = getEmbeddingProviderMetadata();
  const isProdProvider = meta.providerId !== "deterministic-test" && meta.available;

  if (isProdProvider) {
    const hasSupabase = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    if (hasSupabase) {
      return { backend: "pgvector", available: true, reason: null };
    }
    return {
      backend: "in-memory",
      available: false,
      reason: "Production embedding provider configured but Supabase is not available for pgvector search. Using in-memory fallback.",
    };
  }

  return {
    backend: "in-memory",
    available: true,
    reason: "No production embedding provider configured. Using deterministic in-memory search.",
  };
}

/**
 * Project-scoped keyword search over active chunks.
 */
export function keywordSearch(
  queryText: string,
  index: SearchIndex,
  topK: number = 10,
): RankedChunkResult[] {
  const terms = queryText.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const activeChunks = index.chunks.filter((c) => !c.isDeleted);
  const scored = activeChunks.map((chunk) => {
    const lowerContent = chunk.content.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const count = (lowerContent.match(new RegExp(escapeRegExp(term), "g")) ?? []).length;
      score += count * (1 / terms.length);
      if (chunk.content.includes(term)) {
        score += 0.3;
      }
    }
    score = score / (1 + Math.log(chunk.content.length / 100 + 1));
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const ranked = scored.slice(0, topK).map((sc, i) => {
    const doc = index.documents.find((d) => d.id === sc.chunk.documentId)!;
    const ver = index.versions.find((v) => v.id === sc.chunk.documentVersionId)!;
    return {
      chunk: sc.chunk,
      document: doc,
      version: ver,
      score: sc.score,
      rank: i + 1,
      scoreBreakdown: { keyword: sc.score },
    };
  });

  return ranked;
}

/**
 * Project-scoped vector search using deterministic test embeddings.
 */
export function vectorSearch(
  queryText: string,
  index: SearchIndex,
  topK: number = 10,
): RankedChunkResult[] {
  const queryEmbedding = generateDeterministicEmbedding(queryText, `q-${queryText}`);
  const activeChunks = index.chunks.filter((c) => !c.isDeleted);
  const embMap = new Map(index.embeddings.map((e) => [e.chunkId, e]));

  const scored = activeChunks
    .map((chunk) => {
      const emb = embMap.get(chunk.id);
      if (!emb) return { chunk, score: 0 };
      const sim = cosineSimilarity(queryEmbedding, emb.embedding);
      return { chunk, score: sim };
    })
    .filter((sc) => sc.score > 0);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((sc, i) => {
    const doc = index.documents.find((d) => d.id === sc.chunk.documentId)!;
    const ver = index.versions.find((v) => v.id === sc.chunk.documentVersionId)!;
    return {
      chunk: sc.chunk,
      document: doc,
      version: ver,
      score: sc.score,
      rank: i + 1,
      scoreBreakdown: { vector: sc.score },
    };
  });
}

/**
 * Hybrid search combining keyword and vector scores.
 */
export function search(
  input: RetrievalQueryInput,
  index: SearchIndex,
): RetrievalQueryOutput {
  const projectId = input.projectId;
  const strategy = input.strategy ?? "hybrid";
  const topK = input.topK ?? 10;

  const backendStatus = getSearchBackendStatus();

  if (strategy === "keyword") {
    const results = keywordSearch(input.queryText, index, topK);
    return {
      query: {
        id: `q-${Date.now().toString(36)}`,
        projectId,
        queryText: input.queryText,
        queryEmbedding: null,
        queryStrategy: strategy,
        topK,
        filters: input.filters ?? null,
        resultCount: results.length,
        traceId: input.traceId ?? null,
        runId: input.runId ?? null,
        createdAt: new Date().toISOString(),
      },
      results,
    };
  }

  if (strategy === "vector") {
    const results = vectorSearch(input.queryText, index, topK);
    return {
      query: {
        id: `q-${Date.now().toString(36)}`,
        projectId,
        queryText: input.queryText,
        queryEmbedding: generateDeterministicEmbedding(input.queryText, `q-${input.queryText}`),
        queryStrategy: strategy,
        topK,
        filters: input.filters ?? null,
        resultCount: results.length,
        traceId: input.traceId ?? null,
        runId: input.runId ?? null,
        createdAt: new Date().toISOString(),
      },
      results,
    };
  }

  const kwResults = keywordSearch(input.queryText, index, topK * 3);
  const vecResults = vectorSearch(input.queryText, index, topK * 3);

  const merged = new Map<string, { chunk: RetrievalChunk; kwScore: number; vecScore: number }>();
  for (const r of kwResults) {
    merged.set(r.chunk.id, { chunk: r.chunk, kwScore: r.score, vecScore: 0 });
  }
  for (const r of vecResults) {
    const existing = merged.get(r.chunk.id);
    if (existing) {
      existing.vecScore = r.score;
    } else {
      merged.set(r.chunk.id, { chunk: r.chunk, kwScore: 0, vecScore: r.score });
    }
  }

  const scored = Array.from(merged.values()).map((m) => ({
    ...m,
    combined: m.kwScore * 0.4 + m.vecScore * 0.6,
  }));
  scored.sort((a, b) => b.combined - a.combined);

  const results = scored.slice(0, topK).map((sc, i) => {
    const doc = index.documents.find((d) => d.id === sc.chunk.documentId)!;
    const ver = index.versions.find((v) => v.id === sc.chunk.documentVersionId)!;
    return {
      chunk: sc.chunk,
      document: doc,
      version: ver,
      score: sc.combined,
      rank: i + 1,
      scoreBreakdown: { keyword: sc.kwScore, vector: sc.vecScore },
    };
  });

  return {
    query: {
      id: `q-${Date.now().toString(36)}`,
      projectId,
      queryText: input.queryText,
      queryEmbedding: generateDeterministicEmbedding(input.queryText, `q-${input.queryText}`),
      queryStrategy: strategy,
      topK,
      filters: {
        ...(input.filters ?? {}),
        search_backend: backendStatus.backend,
        search_backend_available: backendStatus.available,
        search_backend_reason: backendStatus.reason ?? undefined,
      },
      resultCount: results.length,
      traceId: input.traceId ?? null,
      runId: input.runId ?? null,
      createdAt: new Date().toISOString(),
    },
    results,
  };
}

/**
 * Pgvector-backed vector search. Requires Supabase service client and the
 * vector extension to be enabled. Falls back to in-memory search if unavailable.
 */
export async function pgvectorSearch(
  input: RetrievalQueryInput,
  index: SearchIndex,
): Promise<RetrievalQueryOutput & { backend: SearchBackendStatus }> {
  const backendStatus = getSearchBackendStatus();

  if (backendStatus.backend !== "pgvector" || !backendStatus.available) {
    const fallback = search(input, index);
    return { ...fallback, backend: backendStatus };
  }

  try {
    const { createServiceClient } = await import("@ethen/database/service");
    const service = createServiceClient();
    if (!service) {
      const fallback = search(input, index);
      return { ...fallback, backend: { backend: "in-memory", available: false, reason: "Supabase service client unavailable." } };
    }

    const { createEmbedding } = await import("./embeddings-provider");
    const embResult = await createEmbedding({ text: input.queryText, hash: `pq-${input.queryText}` });
    if (!embResult.ok && !embResult.fallbackProvided) {
      const fallback = search(input, index);
      return { ...fallback, backend: { backend: "in-memory", available: false, reason: `Embedding generation failed: ${embResult.error}` } };
    }

    const queryVector = embResult.ok ? embResult.payload.vector : embResult.fallbackPayload?.vector;
    if (!queryVector) {
      const fallback = search(input, index);
      return { ...fallback, backend: { backend: "in-memory", available: false, reason: "No query vector produced." } };
    }

    const topK = input.topK ?? 10;
    const projectId = input.projectId;

    const { data, error } = await service.rpc("pgvector_search_chunks", {
      p_project_id: projectId,
      p_query_vector: JSON.stringify(queryVector),
      p_top_k: topK,
    });

    if (error || !data) {
      const fallback = search(input, index);
      return {
        ...fallback,
        backend: {
          backend: "in-memory",
          available: false,
          reason: `pgvector RPC call failed: ${error?.message ?? "no data returned"}. Using in-memory fallback.`,
        },
      };
    }

    const rows = data as Array<{
      chunk_id: string;
      similarity: number;
    }>;
    const chunkMap = new Map(index.chunks.map((c) => [c.id, c]));
    const docMap = new Map(index.documents.map((d) => [d.id, d]));
    const verMap = new Map(index.versions.map((v) => [v.id, v]));

    const results: RankedChunkResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const chunk = chunkMap.get(row.chunk_id);
      if (!chunk || chunk.isDeleted) continue;
      if (chunk.projectId !== projectId) continue;
      const doc = docMap.get(chunk.documentId);
      const ver = verMap.get(chunk.documentVersionId);
      if (!doc || !ver) continue;
      results.push({
        chunk,
        document: doc,
        version: ver,
        score: row.similarity,
        rank: results.length + 1,
        scoreBreakdown: { pgvector_cosine: row.similarity },
      });
    }

    const kwResults = keywordSearch(input.queryText, index, topK * 2);
    const mergedMap = new Map<string, RankedChunkResult>();
    for (const r of results) mergedMap.set(r.chunk.id, r);
    for (const r of kwResults) {
      if (!mergedMap.has(r.chunk.id)) mergedMap.set(r.chunk.id, r);
    }

    const merged = Array.from(mergedMap.values());
    merged.sort((a, b) => b.score - a.score);
    const final = merged.slice(0, topK);

    return {
      query: {
        id: `q-${Date.now().toString(36)}`,
        projectId,
        queryText: input.queryText,
        queryEmbedding: embResult.ok ? embResult.payload : (embResult.fallbackPayload ?? null),
        queryStrategy: input.strategy ?? "vector",
        topK,
        filters: {
          ...(input.filters ?? {}),
          search_backend: backendStatus.backend,
          search_backend_available: true,
        },
        resultCount: final.length,
        traceId: input.traceId ?? null,
        runId: input.runId ?? null,
        createdAt: new Date().toISOString(),
      },
      results: final,
      backend: backendStatus,
    };
  } catch {
    const fallback = search(input, index);
    return {
      ...fallback,
      backend: {
        backend: "in-memory",
        available: false,
        reason: "pgvector search threw an exception. Using in-memory fallback.",
      },
    };
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

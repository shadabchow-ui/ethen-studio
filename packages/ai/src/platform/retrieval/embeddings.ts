import type { ChunkEmbeddingPayload } from "./types";

const DIMENSIONS = 384;

/**
 * Deterministic embedding generator — produces a fixed-length float vector
 * from input text + hash. For test/validation purposes only.
 *
 * Production embedding provider is NOT configured; report as blocker if
 * live embedding search is required.
 */
export function generateDeterministicEmbedding(
  text: string,
  hash: string,
): ChunkEmbeddingPayload {
  const seed = hashStringToSeed(hash);
  const rng = createSeededRng(seed);

  const vector = new Array<number>(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i++) {
    vector[i] = (rng() * 2 - 1) * 0.5;
  }

  const length = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  for (let i = 0; i < DIMENSIONS; i++) {
    vector[i] = vector[i] / (length || 1);
  }

  return {
    vector,
    model: "deterministic-test-v1",
    dimensions: DIMENSIONS,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Cosine similarity between two embedding payloads.
 */
export function cosineSimilarity(
  a: ChunkEmbeddingPayload,
  b: ChunkEmbeddingPayload,
): number {
  if (a.dimensions !== b.dimensions) return 0;
  let dot = 0;
  let norma = 0;
  let normb = 0;
  for (let i = 0; i < a.dimensions; i++) {
    dot += a.vector[i] * b.vector[i];
    norma += a.vector[i] * a.vector[i];
    normb += b.vector[i] * b.vector[i];
  }
  const denom = Math.sqrt(norma) * Math.sqrt(normb);
  return denom === 0 ? 0 : dot / denom;
}

function hashStringToSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0) + 1;
}

function createSeededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

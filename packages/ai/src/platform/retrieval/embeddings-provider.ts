import type { ChunkEmbeddingPayload } from "./types";
import {
  generateDeterministicEmbedding,
} from "./embeddings";
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DETERMINISTIC_TEST_MODEL_ID,
} from "./types";

export type EmbeddingProviderId = "deterministic-test" | "openai" | "openai-compatible";

export interface EmbeddingProviderMetadata {
  providerId: EmbeddingProviderId;
  model: string;
  dimensions: number;
  available: boolean;
  reason: string | null;
}

export interface LiveEmbeddingResult {
  vector: number[];
  model: string;
  dimensions: number;
  providerId: EmbeddingProviderId;
  generatedAt: string;
}

export interface EmbeddingRequest {
  text: string;
  hash: string;
}

export type EmbeddingResponse =
  | { ok: true; payload: ChunkEmbeddingPayload; providerMetadata: EmbeddingProviderMetadata }
  | { ok: false; error: string; fallbackProvided: boolean; fallbackPayload?: ChunkEmbeddingPayload; providerMetadata: EmbeddingProviderMetadata };

function getConfiguredProvider(): { id: EmbeddingProviderId; reason: string | null } {
  const env = process.env.EMBEDDING_PROVIDER?.trim().toLowerCase();
  if (!env || env === "deterministic" || env === "deterministic-test") {
    return { id: "deterministic-test", reason: null };
  }
  if (env === "openai") {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key || key.startsWith("your-")) {
      return { id: "deterministic-test", reason: "OPENAI_API_KEY is not configured." };
    }
    return { id: "openai", reason: null };
  }
  if (env === "openai-compatible") {
    const baseUrl = process.env.OPENAI_EMBEDDING_BASE_URL?.trim();
    const key = process.env.OPENAI_EMBEDDING_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
    if (!baseUrl) {
      return { id: "deterministic-test", reason: "OPENAI_EMBEDDING_BASE_URL is not configured for openai-compatible provider." };
    }
    if (!key || key.startsWith("your-")) {
      return { id: "deterministic-test", reason: "OPENAI_EMBEDDING_API_KEY or OPENAI_API_KEY is not configured." };
    }
    return { id: "openai-compatible", reason: null };
  }
  return { id: "deterministic-test", reason: `Unknown EMBEDDING_PROVIDER: ${env}. Falling back to deterministic.` };
}

export function getEmbeddingProviderMetadata(): EmbeddingProviderMetadata {
  const configured = getConfiguredProvider();
  const isProd = configured.id !== "deterministic-test";
  const isLive = isProd && !configured.reason;

  if (isLive && configured.id === "openai") {
    const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
    const dimensions = model === "text-embedding-3-large" ? 3072
      : model === "text-embedding-ada-002" ? 1536
      : 1536;
    return { providerId: "openai", model, dimensions, available: true, reason: null };
  }

  if (isLive && configured.id === "openai-compatible") {
    const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
    const dimensions = parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS?.trim() || "1536", 10) || 1536;
    return { providerId: "openai-compatible", model, dimensions, available: true, reason: null };
  }

  return {
    providerId: "deterministic-test",
    model: DETERMINISTIC_TEST_MODEL_ID,
    dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
    available: false,
    reason: configured.reason || "No production embedding provider configured. Using deterministic test embeddings.",
  };
}

export async function createEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
  const configured = getConfiguredProvider();
  const deterministic = generateDeterministicEmbedding(request.text, request.hash);
  const meta = getEmbeddingProviderMetadata();

  if (configured.id === "deterministic-test") {
    return {
      ok: true,
      payload: { ...deterministic, model: meta.model },
      providerMetadata: meta,
    };
  }

  if (configured.id === "openai") {
    try {
      const key = process.env.OPENAI_API_KEY!.trim();
      const model = meta.model;
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: request.text, model }),
      });
      if (!res.ok) {
        return {
          ok: false,
          error: `OpenAI embeddings API error: ${res.status}`,
          fallbackProvided: true,
          fallbackPayload: deterministic,
          providerMetadata: meta,
        };
      }
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      const vector = json.data?.[0]?.embedding;
      if (!vector) {
        return {
          ok: false,
          error: "OpenAI embeddings API returned empty response.",
          fallbackProvided: true,
          fallbackPayload: deterministic,
          providerMetadata: meta,
        };
      }
      return {
        ok: true,
        payload: { vector, model, dimensions: vector.length, generatedAt: new Date().toISOString() },
        providerMetadata: { ...meta, dimensions: vector.length },
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error calling OpenAI embeddings.",
        fallbackProvided: true,
        fallbackPayload: deterministic,
        providerMetadata: meta,
      };
    }
  }

  if (configured.id === "openai-compatible") {
    try {
      const baseUrl = process.env.OPENAI_EMBEDDING_BASE_URL!.trim().replace(/\/$/, "");
      const key = process.env.OPENAI_EMBEDDING_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
      const model = meta.model;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) headers.Authorization = `Bearer ${key}`;
      const res = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ input: request.text, model }),
      });
      if (!res.ok) {
        return {
          ok: false,
          error: `OpenAI-compatible embeddings API error: ${res.status}`,
          fallbackProvided: true,
          fallbackPayload: deterministic,
          providerMetadata: meta,
        };
      }
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      const vector = json.data?.[0]?.embedding;
      if (!vector) {
        return {
          ok: false,
          error: "OpenAI-compatible embeddings API returned empty response.",
          fallbackProvided: true,
          fallbackPayload: deterministic,
          providerMetadata: meta,
        };
      }
      return {
        ok: true,
        payload: { vector, model, dimensions: vector.length, generatedAt: new Date().toISOString() },
        providerMetadata: { ...meta, dimensions: vector.length },
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error calling embedding provider.",
        fallbackProvided: true,
        fallbackPayload: deterministic,
        providerMetadata: meta,
      };
    }
  }

  return {
    ok: true,
    payload: deterministic,
    providerMetadata: meta,
  };
}

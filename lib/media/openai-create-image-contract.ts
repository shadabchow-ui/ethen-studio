import { createHash } from "node:crypto";

export const OPENAI_CREATE_IMAGE_ADAPTER_VERSION = "studio-openai-image-v1";
export const OPENAI_CREATE_IMAGE_CAPABILITY = "image-generation";
export const OPENAI_CREATE_IMAGE_MODEL = "gpt-image-1";
export const OPENAI_CREATE_IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;

export type OpenAiCreateImageSize = (typeof OPENAI_CREATE_IMAGE_SIZES)[number];
export type OpenAiCreateImageQuality = "low" | "medium" | "high";

export interface OpenAiCreateImageInput {
  prompt: string;
  model: string;
  size: string;
  quality: string;
  n?: number;
}

export interface ValidatedOpenAiImageOutput {
  bytes: Uint8Array;
  sha256: string;
  mimeType: "image/png";
}

export function validateOpenAiCreateImageInput(input: OpenAiCreateImageInput): asserts input is OpenAiCreateImageInput & { model: typeof OPENAI_CREATE_IMAGE_MODEL; size: OpenAiCreateImageSize; quality: OpenAiCreateImageQuality } {
  if (!input.prompt.trim()) throw new Error("OPENAI_IMAGE_INVALID_PROMPT");
  if (input.model !== OPENAI_CREATE_IMAGE_MODEL) throw new Error("OPENAI_IMAGE_MODEL_NOT_ALLOWED");
  if (!OPENAI_CREATE_IMAGE_SIZES.includes(input.size as OpenAiCreateImageSize)) throw new Error("OPENAI_IMAGE_SIZE_NOT_ALLOWED");
  if (!(["low", "medium", "high"] as const).includes(input.quality as OpenAiCreateImageQuality)) throw new Error("OPENAI_IMAGE_QUALITY_NOT_ALLOWED");
  if (input.n !== undefined && input.n !== 1) throw new Error("OPENAI_IMAGE_VARIANTS_NOT_SUPPORTED");
}

/**
 * Validates an OpenAI image response before storage ingestion. The caller must
 * write these bytes to tenant-controlled object storage and never persist the
 * base64 source or a provider URL as the durable asset.
 */
export function validateOpenAiImageOutput(output: unknown, maxBytes = 20 * 1024 * 1024): ValidatedOpenAiImageOutput {
  const candidate = output as { data?: Array<{ b64_json?: unknown }> };
  const encoded = candidate?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || encoded.length === 0) throw new Error("OPENAI_IMAGE_OUTPUT_MISSING");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new Error("OPENAI_IMAGE_OUTPUT_MALFORMED");
  const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) throw new Error("OPENAI_IMAGE_OUTPUT_SIZE_INVALID");
  // PNG signature. Do not trust provider-declared content types.
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => bytes[index] === byte)) throw new Error("OPENAI_IMAGE_OUTPUT_CONTENT_MISMATCH");
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png" };
}

export function classifyOpenAiImageFailure(status: number): "invalid_credentials" | "model_inaccessible" | "rate_limited" | "provider_unavailable" | "provider_rejected" {
  if (status === 401) return "invalid_credentials";
  if (status === 403 || status === 404) return "model_inaccessible";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_rejected";
}

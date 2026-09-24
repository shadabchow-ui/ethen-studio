/**
 * Studio V2 Job 02 — versioned Create Image capability + quote.
 * Pure contract logic (no I/O except the injected pricing lookup):
 * exactly one model family, three sizes, two qualities, n constrained to 1
 * so billed outputs can never be silently discarded.
 */

export const IMAGE_CAPABILITY_VERSION = "openai-image-v1" as const;
export const IMAGE_PRICING_VERSION_ID = "a1000000-0000-4000-8000-000000000001";
export const IMAGE_PROVIDER_ID = "openai" as const;
export const IMAGE_MODEL_ID = "gpt-image-1" as const;
export const IMAGE_CAPABILITY = "text-to-image" as const;

export const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];
export const IMAGE_QUALITIES = ["standard", "hd"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

export const IMAGE_CREDITS_STANDARD = 6;
export const IMAGE_CREDITS_HD = 10;

export interface ImageCommandInput {
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  imageCount?: number;
}

export interface NormalizedImageCommand {
  prompt: string;
  model: typeof IMAGE_MODEL_ID;
  size: ImageSize;
  quality: ImageQuality;
}

export interface ImagePricingRow {
  id: string;
  version: string;
  standardCredits: number;
  hdCredits: number;
}

export interface ImageQuote {
  capabilityVersion: typeof IMAGE_CAPABILITY_VERSION;
  pricingVersionId: string;
  credits: number;
  breakdown: { model: string; size: ImageSize; quality: ImageQuality; images: 1 };
}

/** Validate + normalize a raw image command. Rejects anything unbillable-or-ambiguous. */
export function validateImageCommand(input: ImageCommandInput): NormalizedImageCommand {
  const prompt = input.prompt?.trim() ?? "";
  if (!prompt) throw new Error("IMAGE_COMMAND_INVALID: prompt is required.");
  if (prompt.length > 4000) throw new Error("IMAGE_COMMAND_INVALID: prompt exceeds 4000 characters.");
  if (input.model !== undefined && input.model !== IMAGE_MODEL_ID) {
    throw new Error(`IMAGE_COMMAND_INVALID: model must be ${IMAGE_MODEL_ID}.`);
  }
  if (input.size !== undefined && !(IMAGE_SIZES as readonly string[]).includes(input.size)) {
    throw new Error(`IMAGE_COMMAND_INVALID: size must be one of ${IMAGE_SIZES.join(", ")}.`);
  }
  if (input.quality !== undefined && !(IMAGE_QUALITIES as readonly string[]).includes(input.quality)) {
    throw new Error(`IMAGE_COMMAND_INVALID: quality must be one of ${IMAGE_QUALITIES.join(", ")}.`);
  }
  if (input.imageCount !== undefined && input.imageCount !== 1) {
    throw new Error("IMAGE_COMMAND_INVALID: this slice constrains requests to exactly one image so no billed output is discarded.");
  }
  return {
    prompt,
    model: IMAGE_MODEL_ID,
    size: (input.size as ImageSize | undefined) ?? "1024x1024",
    quality: (input.quality as ImageQuality | undefined) ?? "standard",
  };
}

/**
 * Quote a normalized command against a pricing row. The pricing row is
 * required: without the seeded version the command fails closed
 * (SETUP_REQUIRED) rather than billing against floating code constants.
 */
export function quoteImageCommand(normalized: NormalizedImageCommand, pricing: ImagePricingRow | null): ImageQuote {
  if (!pricing) throw new Error("IMAGE_QUOTE_UNAVAILABLE: pricing version is not configured.");
  const credits = normalized.quality === "hd" ? pricing.hdCredits : pricing.standardCredits;
  if (!Number.isFinite(credits) || credits < 0) throw new Error("IMAGE_QUOTE_UNAVAILABLE: pricing row carries invalid credits.");
  return {
    capabilityVersion: IMAGE_CAPABILITY_VERSION,
    pricingVersionId: pricing.id,
    credits,
    breakdown: { model: normalized.model, size: normalized.size, quality: normalized.quality, images: 1 },
  };
}

/** Admit a quote against a caller-approved ceiling. */
export function admitImageQuote(quote: ImageQuote, approvedCeiling: number): void {
  if (!Number.isFinite(approvedCeiling) || approvedCeiling < 0) {
    throw new Error("IMAGE_ADMISSION_INVALID: approved ceiling must be >= 0.");
  }
  if (quote.credits > approvedCeiling) {
    throw new Error("IMAGE_APPROVAL_REQUIRED: quote exceeds the approved ceiling.");
  }
}

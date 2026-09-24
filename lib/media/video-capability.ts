/**
 * Studio V2 Job 04 — qualified video capabilities + routing receipts.
 *
 * Empirically qualified against the fal client in this repo (poll-by-id
 * recovery, best-effort cancel, single model fal-ai/wan-i2v):
 * - image-to-video: QUALIFIED
 * - first-frame: QUALIFIED as a semantic role over the I2V mechanism
 *   (the reference image IS the first frame; role preserved in payload)
 * - text-to-video: DISABLED (route 410, no provider path)
 * - last-frame: RESTRICTED (no end_image support in the client; a provider
 *   that cannot support safe reconciliation gets restricted eligibility)
 *
 * Routing receipts bind what the router selected to what the worker must
 * execute. The worker asserts receipt agreement and fails closed on drift —
 * hardcoded selection that disagrees with the receipt is replaced.
 */

export const VIDEO_PROVIDER_ID = "fal" as const;
export const VIDEO_MODEL_ID = "fal-ai/wan-i2v" as const;
export const VIDEO_ADAPTER_VERSION = "2026-08-02" as const;
export const VIDEO_PRICING_VERSION_ID = "b2000000-0000-4000-8000-000000000002";
export const VIDEO_CAPABILITY_VERSION = "fal-video-v1" as const;
export const VIDEO_FLAT_CREDITS = 20;

export type QualifiedVideoCapability = "image-to-video" | "first-frame";
export type VideoCapability = QualifiedVideoCapability | "text-to-video" | "last-frame";

export interface VideoRoutingReceipt {
  providerId: typeof VIDEO_PROVIDER_ID;
  modelId: typeof VIDEO_MODEL_ID;
  adapterVersion: typeof VIDEO_ADAPTER_VERSION;
  capability: QualifiedVideoCapability;
}

export interface VideoPricingRow {
  id: string;
  version: string;
  flatCredits: number;
}

export interface VideoQuote {
  capabilityVersion: typeof VIDEO_CAPABILITY_VERSION;
  pricingVersionId: string;
  credits: number;
  breakdown: { providerId: string; modelId: string; capability: QualifiedVideoCapability; unit: "credits_per_request" };
}

export interface NormalizedVideoCommand {
  prompt: string;
  capability: QualifiedVideoCapability;
  /** Semantic role of the reference: the I2V input image, or the labeled first frame. */
  referenceRole: "i2v-reference" | "first-frame";
  /** Direct https URL when the caller supplies provider-fetchable bytes. */
  referenceUrl: string | null;
  /** Tenant asset id resolved to a fresh signed URL at worker time (preferred). */
  referenceAssetId: string | null;
  resolution: "480p" | "720p";
}

/**
 * Qualify a requested capability. T2V is disabled (not a Studio capability);
 * last-frame is restricted (unsupported by the provider client). Neither is
 * routable — callers surface the code instead of a fake queue.
 */
export function qualifyVideoCapability(capability: string): QualifiedVideoCapability {
  if (capability === "image-to-video" || capability === "first-frame") return capability;
  if (capability === "text-to-video") {
    throw new Error("VIDEO_CAPABILITY_DISABLED: direct text-to-video is not a Studio capability.");
  }
  if (capability === "last-frame") {
    throw new Error("VIDEO_CAPABILITY_RESTRICTED: last-frame control is not supported by the qualified provider; restricted eligibility.");
  }
  throw new Error(`VIDEO_COMMAND_INVALID: unknown video capability ${capability}.`);
}

/** Validate a raw video command into normalized form. A reference is mandatory for I2V. */
export function validateVideoCommand(input: {
  prompt?: string;
  capability?: string;
  referenceUrl?: string;
  referenceAssetId?: string;
  referenceRole?: string;
  resolution?: string;
}): NormalizedVideoCommand {
  const capability = qualifyVideoCapability(input.capability ?? "");
  const prompt = input.prompt?.trim() ?? "";
  if (!prompt) throw new Error("VIDEO_COMMAND_INVALID: prompt is required.");
  if (prompt.length > 1500) throw new Error("VIDEO_COMMAND_INVALID: prompt exceeds 1500 characters.");
  const referenceUrl = input.referenceUrl?.trim() ? input.referenceUrl.trim() : null;
  const referenceAssetId = input.referenceAssetId?.trim() ? input.referenceAssetId.trim() : null;
  if (!referenceUrl && !referenceAssetId) throw new Error("VIDEO_COMMAND_INVALID: a reference image is required for image-to-video.");
  if (referenceUrl && !/^https:\/\//i.test(referenceUrl)) throw new Error("VIDEO_COMMAND_INVALID: reference must be an https URL (tenant-signed or provider-hosted).");
  const referenceRole = capability === "first-frame" ? "first-frame" : "i2v-reference";
  if (input.referenceRole !== undefined && input.referenceRole !== referenceRole) {
    throw new Error(`VIDEO_COMMAND_INVALID: reference role must be ${referenceRole} for ${capability}.`);
  }
  const resolution = input.resolution === "720p" ? "720p" : "480p";
  return { prompt, capability, referenceRole, referenceUrl, referenceAssetId, resolution };
}

/**
 * Resolve the routing receipt for a normalized command. The receipt is the
 * single agreement between router selection and worker execution: any
 * router output naming a different provider/model is rejected here, never
 * silently overridden by a hardcoded payload.
 */
export function resolveVideoRoute(command: { prompt: string; capability: QualifiedVideoCapability }, routerSelection?: { providerId?: string; modelId?: string }): VideoRoutingReceipt {
  const receipt: VideoRoutingReceipt = {
    providerId: VIDEO_PROVIDER_ID, modelId: VIDEO_MODEL_ID, adapterVersion: VIDEO_ADAPTER_VERSION, capability: command.capability,
  };
  if (routerSelection !== undefined) {
    if (routerSelection.providerId !== undefined && routerSelection.providerId !== receipt.providerId) {
      throw new Error(`VIDEO_ROUTE_MISMATCH: router selected ${routerSelection.providerId}, qualified route is ${receipt.providerId}.`);
    }
    if (routerSelection.modelId !== undefined && routerSelection.modelId !== receipt.modelId) {
      throw new Error(`VIDEO_ROUTE_MISMATCH: router selected ${routerSelection.modelId}, qualified route is ${receipt.modelId}.`);
    }
  }
  return receipt;
}

/** Flat per-request quote against the seeded pricing row. Fails closed without it. */
export function quoteVideoCommand(receipt: VideoRoutingReceipt, pricing: VideoPricingRow | null): VideoQuote {
  if (!pricing) throw new Error("VIDEO_QUOTE_UNAVAILABLE: video pricing version is not configured.");
  if (!Number.isFinite(pricing.flatCredits) || pricing.flatCredits < 0) {
    throw new Error("VIDEO_QUOTE_UNAVAILABLE: pricing row carries invalid credits.");
  }
  return {
    capabilityVersion: VIDEO_CAPABILITY_VERSION,
    pricingVersionId: pricing.id,
    credits: pricing.flatCredits,
    breakdown: { providerId: receipt.providerId, modelId: receipt.modelId, capability: receipt.capability, unit: "credits_per_request" },
  };
}

/** Admit a video quote against a caller-approved ceiling. */
export function admitVideoQuote(quote: VideoQuote, approvedCeiling: number): void {
  if (!Number.isFinite(approvedCeiling) || approvedCeiling < 0) {
    throw new Error("VIDEO_ADMISSION_INVALID: approved ceiling must be >= 0.");
  }
  if (quote.credits > approvedCeiling) {
    throw new Error("VIDEO_APPROVAL_REQUIRED: quote exceeds the approved ceiling.");
  }
}

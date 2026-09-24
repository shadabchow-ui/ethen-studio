/**
 * Studio V2 Job 05 — shared model catalog with Studio capability projections.
 *
 * One stable ID namespace (`provider/model`) for qualified execution routes.
 * Legacy namespaces (MEDIA_MODELS ids, provider entries, Studio cards) map
 * onto it explicitly; anything unmapped resolves to unknown with a reason —
 * never an invented ranking. Unmeasured models have no projection.
 */

export const STUDIO_CATALOG_VERSION = "studio-catalog-v1" as const;

export interface CanonicalModelRef {
  /** Stable shared id. */
  catalogId: string;
  providerId: string;
  modelId: string;
  capability: "text-to-image" | "image-to-video";
  adapterVersion: string;
  pricingVersionId: string;
}

export const QUALIFIED_CATALOG: Readonly<Record<string, CanonicalModelRef>> = {
  "text-to-image": {
    catalogId: "openai/gpt-image-1", providerId: "openai", modelId: "gpt-image-1",
    capability: "text-to-image", adapterVersion: "2026-08-02",
    pricingVersionId: "a1000000-0000-4000-8000-000000000001",
  },
  "image-to-video": {
    catalogId: "fal/fal-ai/wan-i2v", providerId: "fal", modelId: "fal-ai/wan-i2v",
    capability: "image-to-video", adapterVersion: "2026-08-02",
    pricingVersionId: "b2000000-0000-4000-8000-000000000002",
  },
};

/** Legacy MEDIA_MODELS id -> shared catalog id (only measured routes map). */
const MEDIA_MODEL_ID_MAP: Readonly<Record<string, string>> = {
  "gpt-image-1": "openai/gpt-image-1",
  "fal-ai/wan-i2v": "fal/fal-ai/wan-i2v",
};

/** Legacy Studio card id -> shared catalog id (stale display copies excluded). */
const STUDIO_CARD_ID_MAP: Readonly<Record<string, string>> = {
  // NOTE: openai-image-standard carries a stale DALL-E 3 display copy and is
  // deliberately unmapped until its copy is corrected.
};

export type CatalogResolution =
  | { readonly known: true; readonly ref: CanonicalModelRef }
  | { readonly known: false; readonly reason: string };

/** Resolve any legacy identifier onto the shared catalog, or unknown with reason. */
export function resolveCatalogId(input: {
  providerId?: string;
  modelId?: string;
  mediaModelId?: string;
  studioCardId?: string;
}): CatalogResolution {
  if (input.providerId && input.modelId) {
    const direct = Object.values(QUALIFIED_CATALOG).find(
      (ref) => ref.providerId === input.providerId && ref.modelId === input.modelId,
    );
    if (direct) return { known: true, ref: direct };
    return { known: false, reason: `unqualified route ${input.providerId}/${input.modelId}: no measured outcomes` };
  }
  if (input.mediaModelId) {
    const mapped = MEDIA_MODEL_ID_MAP[input.mediaModelId];
    if (mapped) {
      const ref = Object.values(QUALIFIED_CATALOG).find((entry) => entry.catalogId === mapped);
      if (ref) return { known: true, ref };
    }
    return { known: false, reason: `media model ${input.mediaModelId} has no qualified projection` };
  }
  if (input.studioCardId) {
    const mapped = STUDIO_CARD_ID_MAP[input.studioCardId];
    if (mapped) {
      const ref = Object.values(QUALIFIED_CATALOG).find((entry) => entry.catalogId === mapped);
      if (ref) return { known: true, ref };
    }
    return { known: false, reason: `studio card ${input.studioCardId} has no qualified projection` };
  }
  return { known: false, reason: "no identifier supplied" };
}

/** Studio capability projection: the qualified routes for a capability, if any. */
export function projectCapability(capability: string): CanonicalModelRef[] {
  const ref = QUALIFIED_CATALOG[capability];
  return ref ? [ref] : [];
}

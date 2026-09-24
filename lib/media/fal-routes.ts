/**
 * Studio V3 Job 3 — verified fal execution routes (Studio qualification).
 *
 * The four durable workflows and their verified fal endpoints. Verification
 * evidence: official OpenAPI schema snapshots (Job 2 importer) + Chat video
 * spec cross-checks where they exist. Source catalog disposition does NOT
 * gate execution (the pinned Wan lane is source-quarantined yet
 * production-qualified); Studio qualification here is the gate, and every
 * refusal names its reason. Image-to-video stays on the pinned fal-video
 * handler; this table addresses it for routing/quote parity only.
 */

export type FalMediaWorkflow = "text-to-image" | "image-editing" | "text-to-video" | "image-to-video";

export interface FalVerifiedRoute {
  workflow: FalMediaWorkflow;
  providerId: "fal";
  /** Exact fal queue endpoint id. */
  endpointId: string;
  /** Job 2 schema snapshot, relative to the repo root. */
  schemaSnapshot: string;
  /** Chat video catalog id when a verified Chat mapping exists. */
  chatSpecId: string | null;
  /** Handler kind that executes this route. */
  handlerKind: "fal-media" | "fal-video";
  adapterVersion: "fal-media/1";
}

export const FAL_MEDIA_ADAPTER_VERSION = "fal-media/1" as const;

export const FAL_VERIFIED_ROUTES: Readonly<Record<FalMediaWorkflow, FalVerifiedRoute>> = {
  "text-to-image": {
    workflow: "text-to-image",
    providerId: "fal",
    endpointId: "fal-ai/flux/dev",
    schemaSnapshot: "data/media-models/schema-snapshots/fal-ai-flux-dev.json",
    chatSpecId: null,
    handlerKind: "fal-media",
    adapterVersion: FAL_MEDIA_ADAPTER_VERSION,
  },
  "image-editing": {
    workflow: "image-editing",
    providerId: "fal",
    endpointId: "alibaba/qwen-image-3/edit",
    schemaSnapshot: "data/media-models/schema-snapshots/alibaba-qwen-image-3-edit.json",
    chatSpecId: null,
    handlerKind: "fal-media",
    adapterVersion: FAL_MEDIA_ADAPTER_VERSION,
  },
  "text-to-video": {
    workflow: "text-to-video",
    providerId: "fal",
    endpointId: "wan/v2.6/text-to-video",
    schemaSnapshot: "data/media-models/schema-snapshots/wan-v2-6-text-to-video.json",
    chatSpecId: "wan/v2-6",
    handlerKind: "fal-media",
    adapterVersion: FAL_MEDIA_ADAPTER_VERSION,
  },
  "image-to-video": {
    workflow: "image-to-video",
    providerId: "fal",
    endpointId: "fal-ai/wan-i2v",
    schemaSnapshot: "data/media-models/schema-snapshots/fal-ai-wan-i2v.json",
    chatSpecId: null,
    handlerKind: "fal-video",
    adapterVersion: FAL_MEDIA_ADAPTER_VERSION,
  },
};

export function getFalVerifiedRoute(workflow: string): FalVerifiedRoute | null {
  const route = (FAL_VERIFIED_ROUTES as Readonly<Record<string, FalVerifiedRoute>>)[workflow];
  return route ?? null;
}

export function getFalVerifiedRouteByEndpoint(endpointId: string): FalVerifiedRoute | null {
  return (
    (Object.values(FAL_VERIFIED_ROUTES) as FalVerifiedRoute[]).find(
      (route) => route.endpointId === endpointId,
    ) ?? null
  );
}

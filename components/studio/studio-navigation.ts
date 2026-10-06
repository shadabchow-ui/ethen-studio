import { STUDIO_CANONICAL_ROUTES } from "@/lib/studio-v5/route-map";

/**
 * Canonical Studio routes for LAB_APPS ids.
 *
 * RC5 — every value is a canonical destination built from the route map
 * (retired `/studio/apps/*` aliases, `/studio/image|video|audio|canvas`
 * singles, and nested project generator paths all converge here).
 * Anything missing falls back to the workbench entry point.
 */
const APP_ROUTE_OVERRIDES: Record<string, string> = {
  "create-image": STUDIO_CANONICAL_ROUTES.createImage,
  "create-video": STUDIO_CANONICAL_ROUTES.createVideo,
  "text-to-video": STUDIO_CANONICAL_ROUTES.createVideo,
  "image-to-video": `${STUDIO_CANONICAL_ROUTES.createVideo}?mode=image-to-video`,
  "video-upscale": STUDIO_CANONICAL_ROUTES.createVideo,
  relight: STUDIO_CANONICAL_ROUTES.createImage,
  inpaint: STUDIO_CANONICAL_ROUTES.createImage,
  "image-upscale": STUDIO_CANONICAL_ROUTES.createImage,
  "product-url-to-ad": STUDIO_CANONICAL_ROUTES.marketing,
  "marketing-studio": STUDIO_CANONICAL_ROUTES.marketing,
  "ai-influencer": STUDIO_CANONICAL_ROUTES.influencer,
  "soul-id-character": STUDIO_CANONICAL_ROUTES.influencer,
  canvas: STUDIO_CANONICAL_ROUTES.canvas,
  moodboard: STUDIO_CANONICAL_ROUTES.canvas,
  storyboard: STUDIO_CANONICAL_ROUTES.canvas,
  "campaign-board": STUDIO_CANONICAL_ROUTES.canvas,
  "brand-kit": STUDIO_CANONICAL_ROUTES.canvas,
  "cinema-studio": STUDIO_CANONICAL_ROUTES.cinema,
  "cinema-shot": STUDIO_CANONICAL_ROUTES.cinema,
  "cinema-story": STUDIO_CANONICAL_ROUTES.cinema,
  "game-asset-generator": `${STUDIO_CANONICAL_ROUTES.createImage}?preset=game-assets`,
  "game-sprite-sheet": `${STUDIO_CANONICAL_ROUTES.createImage}?preset=game-assets`,
  "game-world-builder": `${STUDIO_CANONICAL_ROUTES.createImage}?preset=game-assets`,
  "character-motion": `${STUDIO_CANONICAL_ROUTES.createVideo}?mode=image-to-video&preset=character-motion`,
  "voice-clone": STUDIO_CANONICAL_ROUTES.createVoice,
  "voice-changer": STUDIO_CANONICAL_ROUTES.createVoice,
  voiceover: STUDIO_CANONICAL_ROUTES.createVoice,
  "provider-status": STUDIO_CANONICAL_ROUTES.models,
  "credit-ledger": STUDIO_CANONICAL_ROUTES.models,
  "safety-review": STUDIO_CANONICAL_ROUTES.models,
};

export function getStudioRouteForAppId(appId: string): string {
  return APP_ROUTE_OVERRIDES[appId] ?? "/studio";
}

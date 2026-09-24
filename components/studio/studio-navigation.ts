/**
 * Studio V2 Job 13 — studio route map (pruned).
 *
 * Only the app-id route resolver remains live (home directory links).
 * Top-nav items, mega menus, tab routes, and nav classes were retired with
 * the forked Studio shell: sidebar/topbar/palette navigation now derives
 * from the canonical portfolio registry via `@ethen/navigation/studio`.
 */

const APP_ROUTE_OVERRIDES: Record<string, string> = {
  "create-image": "/studio/apps/create-image",
  relight: "/studio/image",
  inpaint: "/studio/image",
  "image-upscale": "/studio/image",
  "image-to-video": "/studio/apps/image-to-video",
  "text-to-video": "/studio/apps/text-to-video",
  "create-video": "/studio/video",
  "video-upscale": "/studio/video",
  "product-url-to-ad": "/studio/apps/product-ad",
  "marketing-studio": "/studio/apps/marketing",
  "ai-influencer": "/studio/apps/ai-influencer",
  "soul-id-character": "/studio/apps/ai-influencer",
  canvas: "/studio/canvas",
  moodboard: "/studio/canvas",
  storyboard: "/studio/canvas",
  "campaign-board": "/studio/canvas",
  "brand-kit": "/studio/canvas",
  "game-asset-generator": "/studio/apps/game-assets",
  "sprite-pack-generator": "/studio/apps/game-assets",
  "character-pack-generator": "/studio/apps/game-assets",
  "game-ui-mockup-generator": "/studio/apps/game-assets",
  "tileset-generator": "/studio/apps/game-assets",
  "icon-pack-generator": "/studio/apps/game-assets",
  "background-generator": "/studio/apps/game-assets",
  "cinema-studio": "/studio/apps/cinematic-scene",
  "cinema-shot-builder": "/studio/apps/cinematic-scene",
  "cinematic-cameras": "/studio/apps/cinematic-scene",
  "character-motion": "/studio/apps/character-motion",
  voiceover: "/studio/audio",
  "voice-change": "/studio/audio",
  "speech-translation": "/studio/audio",
  "sound-effects": "/studio/audio",
  "music-bed": "/studio/audio",
  "audio-for-video": "/studio/audio",
  "provider-status": "/studio/models",
  "credit-ledger": "/studio/models",
  "safety-review": "/studio/models",
};

export function getStudioRouteForAppId(appId: string): string {
  return APP_ROUTE_OVERRIDES[appId] ?? "/studio/apps";
}

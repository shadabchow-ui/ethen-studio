import type { NextConfig } from "next";

/**
 * Ethen Studio — STUDIO deployable (standalone Next.js application).
 * Serves the canonical Studio product surface (`/studio/*`, `/api/studio/v1/*`)
 * with the same dependency versions as the certified baseline (Job 10 is a
 * boundary migration, not a framework upgrade).
 */
/**
 * V5 M1 (Owner Lock O) — canonical Studio route table. Lives here because
 * next.config.ts cannot import local TypeScript modules on a cold start;
 * `lib/studio-v5/route-map.ts` re-exports it for navigation and tests.
 */
export interface StudioLegacyRedirect {
  source: string;
  destination: string;
}

export const STUDIO_CANONICAL_ROUTES = {
  home: "/studio",
  projects: "/studio/work/projects",
  assets: "/studio/work/assets",
  history: "/studio/work/jobs",
  reviews: "/studio/work/reviews",
  canvas: "/studio/workflows",
  apps: "/studio/apps",
  models: "/studio/models",
  cinema: "/studio/pro/cinema",
} as const;

export const STUDIO_LEGACY_REDIRECTS: readonly StudioLegacyRedirect[] = [
  { source: "/studio/projects", destination: STUDIO_CANONICAL_ROUTES.projects },
  { source: "/studio/assets", destination: STUDIO_CANONICAL_ROUTES.assets },
  { source: "/studio/jobs", destination: STUDIO_CANONICAL_ROUTES.history },
  { source: "/studio/canvas", destination: STUDIO_CANONICAL_ROUTES.canvas },
  { source: "/studio/cinema", destination: STUDIO_CANONICAL_ROUTES.cinema },
  { source: "/studio/image", destination: "/studio/create/image" },
  { source: "/studio/video", destination: "/studio/create/video" },
  { source: "/studio/audio", destination: "/studio/create/voice" },
  { source: "/studio/projects/:projectId/characters", destination: "/studio/identities/characters?projectId=:projectId" },
  { source: "/studio/projects/:projectId/products", destination: "/studio/identities/products?projectId=:projectId" },
  { source: "/studio/projects/:projectId/brands", destination: "/studio/identities/brands?projectId=:projectId" },
  // V5 M5 — project generators converge on the canonical create runtime (one hop).
  { source: "/studio/projects/:projectId/create/image", destination: "/studio/create/image?projectId=:projectId" },
  { source: "/studio/projects/:projectId/create/video", destination: "/studio/create/video?projectId=:projectId" },
  { source: "/studio/projects/:projectId/edit/image", destination: "/studio/create/edit?projectId=:projectId" },
  // V5 M5 — legacy /studio/apps/* panels converge on canonical surfaces (one hop).
  { source: "/studio/apps/create-image", destination: "/studio/create/image" },
  { source: "/studio/apps/text-to-video", destination: "/studio/create/video" },
  { source: "/studio/apps/image-to-video", destination: "/studio/create/video?mode=image-to-video" },
  { source: "/studio/apps/marketing", destination: "/studio/marketing" },
  { source: "/studio/apps/product-ad", destination: "/studio/marketing" },
  { source: "/studio/apps/ai-influencer", destination: "/studio/influencer" },
  { source: "/studio/apps/cinematic-scene", destination: "/studio/pro/cinema" },
  { source: "/studio/apps/game-assets", destination: "/studio/create/image?preset=game-assets" },
  { source: "/studio/apps/character-motion", destination: "/studio/create/video?mode=image-to-video&preset=character-motion" },
  // V5 M5 — legacy beta consoles converge on their V5 adapter routes (one hop).
  { source: "/studio/campaigns", destination: "/studio/marketing" },
  { source: "/studio/director", destination: "/studio/agent" },
  // V5 M5 — project assets converge on the canonical work surface (one hop).
  { source: "/studio/projects/:projectId/assets", destination: "/studio/work/assets?projectId=:projectId" },
  // V5 M5 — project review converges on the canonical work surface (one hop).
  { source: "/studio/projects/:projectId/review", destination: "/studio/work/reviews?projectId=:projectId" },
  // V5 M5 D3 — legacy public review token resolve moves to V1 (one hop, method-preserving 307).
  { source: "/api/media/reviews/:token", destination: "/api/studio/v1/collaboration/public/reviews/:token" },
];

const nextConfig: NextConfig = {
  // Shared workspace packages ship TypeScript sources; Next must compile them.
  transpilePackages: ["@ethen/ui","@ethen/app-shell","@ethen/contracts","@ethen/config","@ethen/auth","@ethen/security","@ethen/database","@ethen/account","@ethen/billing","@ethen/usage","@ethen/navigation","@ethen/studio-core"],
  reactStrictMode: true,
  /**
   * V5 M1 (Owner Lock O) — one canonical route per concept. Legacy Studio
   * URLs redirect in ONE hop; Next passes the incoming query (projectId,
   * category, …) through to the destination. See
   * `lib/studio-v5/route-map.ts` for the same table used by tests.
   */
  async redirects() {
    return STUDIO_LEGACY_REDIRECTS.map((entry) => ({ ...entry, permanent: false }));
  },
};

export default nextConfig;

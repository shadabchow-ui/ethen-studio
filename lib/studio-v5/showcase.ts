/**
 * Studio V5 — showcase media + destination seam for the restored original
 * Studio home and generator stage.
 *
 * V5 presentation reads Studio showcase media and route destinations from
 * this one module. Media still resolves through the versioned local fixture
 * manifest (R2-ready: swapping to R2 objects is a base-path change inside
 * the manifest), so the page never ships placeholder network images.
 * Destinations are the canonical V5 routes; capabilities without a live
 * runtime carry their registry status instead of a fake enabled action.
 */

import { labMedia, labMediaById, type LabMediaPlacement, type LabWorkflowId, type ResolvedLabMedia } from "./media-manifest";
import { LAB_APPS, LAB_MENUS, LAB_RECIPES, type LabMenuId } from "./workflows";
import { studioAppHref, studioWorkflowHref } from "./live-destinations";
export type StudioAppPanelId =
  | "create-image"
  | "text-to-video"
  | "image-to-video"
  | "product-ad"
  | "ai-influencer"
  | "cinematic-scene"
  | "character-motion"
  | "game-assets"
  | "marketing";

export type StudioShowcaseMedia = ResolvedLabMedia;
export type StudioShowcaseWorkflow = LabWorkflowId;
export type StudioMenuId = LabMenuId;

export const STUDIO_MENUS = LAB_MENUS;
export const STUDIO_SHOWCASE_APPS = LAB_APPS;
export const STUDIO_RECIPES = LAB_RECIPES;
export { studioWorkflowHref };

/**
 * The V5 Canvas workspace lives at /studio/workflows (graphs open at
 * /studio/workflows/[graphId]); /studio/canvas is a certified redirect to
 * /studio, so Canvas actions never link there.
 */
export const STUDIO_CANVAS_HREF = "/studio/workflows";

function withProject(path: string, projectId: string | null): string {
  return projectId ? `${path}?projectId=${encodeURIComponent(projectId)}` : path;
}

/** Canonical V5 simple-create route; project scope rides the query. */
export function studioCreateHref(tool: "image" | "edit" | "video" | "voice" | "music" | "sfx" | "transcribe" | "dub" | "changer" | "3d", projectId: string | null): string {
  return withProject(`/studio/create/${tool}`, projectId);
}

export function studioShowcaseAppHref(id: string, projectId: string | null): string {
  if (id === "canvas") return STUDIO_CANVAS_HREF;
  if (id === "marketing-studio") return withProject("/studio/marketing", projectId);
  if (id === "ai-influencer") return withProject("/studio/influencer", projectId);
  return studioAppHref(id, projectId);
}

/** V5 destinations shared by the home, the workspace nav and the generator tabs. */
export function studioDestinations(projectId: string | null) {
  return {
    createImage: studioCreateHref("image", projectId),
    createVideo: studioCreateHref("video", projectId),
    canvas: STUDIO_CANVAS_HREF,
    agent: withProject("/studio/agent", projectId),
    marketing: withProject("/studio/marketing", projectId),
    influencer: withProject("/studio/influencer", projectId),
    cinema: "/studio/cinema",
    characters: "/studio/identities/characters",
    models: "/studio/models",
  } as const;
}

export interface StudioLegacyAppStatus {
  href: string;
  statusLabel: string;
  live: boolean;
}

/**
 * M5: retired /studio/apps/* panels link straight at their canonical
 * destinations (the config redirect stays as the backstop). Readiness
 * truth is unchanged: sample-preview or setup-required, never live.
 */
const LEGACY_APP_STATUS: Record<StudioAppPanelId, StudioLegacyAppStatus> = {
  "create-image": { href: "/studio/create/image", statusLabel: "Preview", live: false },
  "text-to-video": { href: "/studio/create/video", statusLabel: "Not wired yet", live: false },
  "image-to-video": { href: "/studio/create/video?mode=image-to-video", statusLabel: "Setup Required", live: false },
  "product-ad": { href: "/studio/marketing", statusLabel: "Setup Required", live: false },
  "ai-influencer": { href: "/studio/influencer", statusLabel: "Sample Preview", live: false },
  "cinematic-scene": { href: "/studio/pro/cinema", statusLabel: "Setup Required", live: false },
  "character-motion": { href: "/studio/create/video?mode=image-to-video&preset=character-motion", statusLabel: "Setup Required", live: false },
  "game-assets": { href: "/studio/create/image?preset=game-assets", statusLabel: "Sample Preview", live: false },
  marketing: { href: "/studio/marketing", statusLabel: "Setup Required", live: false },
};

export function studioLegacyAppStatus(id: StudioAppPanelId): StudioLegacyAppStatus {
  return LEGACY_APP_STATUS[id];
}

export function showcase(placement: LabMediaPlacement): StudioShowcaseMedia[] {
  return labMedia(placement);
}

/** Resolve an ordered list of manifest ids, dropping unknown ids. */
export function showcaseByIds(ids: readonly string[]): StudioShowcaseMedia[] {
  return ids.map((id) => labMediaById(id)).filter((media): media is StudioShowcaseMedia => media !== null);
}

/** Posters that ship as optimized V5 stills instead of manifest plates. */
const V5_POSTERS: Readonly<Record<string, string>> = {
  "home-hero": "/studio-v5/media/home-hero.webp",
  "mosaic-01": "/studio-v5/media/featured-portrait.webp",
  "mosaic-02": "/studio-v5/media/featured-product.webp",
};

function withV5Poster(media: StudioShowcaseMedia): StudioShowcaseMedia {
  return V5_POSTERS[media.id] ? { ...media, kind: "image" as const, poster: V5_POSTERS[media.id]!, src: null } : media;
}

/** Featured picks: V5 stills first, then a live manifest clip. */
export function studioFeaturedPicks(): StudioShowcaseMedia[] {
  return showcaseByIds(["home-hero", "mosaic-01", "mosaic-02", "mosaic-04"]).map(withV5Poster);
}

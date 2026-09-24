/**
 * Studio discovery — media slot catalog (THE R2 swap point).
 *
 * Every visual slot on /studio and /studio/explore is fed from this list.
 * Slots marked `placeholder: true` hold temporary layout media generated
 * locally (artifacts/studio-media-discovery-design/placeholders/
 * generate-placeholders.sh: slow pans over the three approved Studio stills
 * and abstract gradient motion). They are not customer work, not Ethen
 * benchmark outputs, and not third-party media.
 *
 * Replacing a placeholder with final media is a data edit on one entry:
 *
 *   src:         "/studio-v5/placeholders/video-01.mp4"  → "https://<r2>/showcase/video-01.mp4"
 *   poster:      "/studio-v5/placeholders/video-01.jpg"  → "https://<r2>/showcase/video-01.jpg"
 *   placeholder: true                                    → false
 *   sourceType:  "approved-fixture"                      → "owner-showcase" | "licensed-showcase" | …
 *   (optional)   title / promptExcerpt / modelFamilyId / allowPromptReuse
 *
 * Keep `id`, `type`, `aspectRatio` and `sections` so geometry is unchanged.
 * `NEXT_PUBLIC_STUDIO_PLACEHOLDER_BASE` can point every placeholder at a
 * CDN copy without touching entries.
 */

import type { LabWorkflowId } from "./media-manifest";

export type DiscoveryAspect = "16:9" | "9:16" | "1:1" | "4:5" | "3:2" | "21:9";

export type DiscoverySourceType = "owner-showcase" | "owner-output" | "project-output" | "approved-fixture" | "licensed-showcase";

/** Explore filter categories. */
export type ShowcaseCategory =
  | "cinematic"
  | "product"
  | "advertising"
  | "fashion"
  | "character"
  | "animation"
  | "3d"
  | "experimental"
  | "editorial"
  | "environment"
  | "concept"
  | "brand";

/** Home / Explore slots a media item fills (Explore also takes every item by type). */
export type DiscoverySection =
  | "home-video"
  | "home-image"
  | "flagship-cinema"
  | "spotlight-marketing"
  | "spotlight-influencer"
  | "specialized-product"
  | "feature-rail";

export interface DiscoveryMediaItem {
  id: string;
  type: "video" | "image";
  /** Video file for type "video"; the image itself for type "image". */
  src: string;
  /** Poster frame for videos (required for poster-first rendering). */
  poster?: string;
  width?: number;
  height?: number;
  aspectRatio: DiscoveryAspect;
  durationSeconds?: number;
  sections: readonly DiscoverySection[];
  appId?: string;
  modelFamilyId?: string;
  templateId?: string;
  workflow?: LabWorkflowId;
  categories?: readonly ShowcaseCategory[];
  title?: string;
  promptExcerpt?: string;
  allowPromptReuse?: boolean;
  /** Temporary layout media awaiting final showcase media. */
  placeholder: boolean;
  sourceType: DiscoverySourceType;
}

function placeholderBase(): string {
  const configured = process.env.NEXT_PUBLIC_STUDIO_PLACEHOLDER_BASE;
  return (configured && configured.trim() ? configured : "/studio-v5/placeholders").replace(/\/$/, "");
}

/** Placeholder video slot: poster-first, 4s muted preview clip. */
function pv(n: number, aspectRatio: DiscoveryAspect, sections: readonly DiscoverySection[], extra: Partial<DiscoveryMediaItem> = {}): DiscoveryMediaItem {
  const id = `video-${String(n).padStart(2, "0")}`;
  return {
    id,
    type: "video",
    src: `${placeholderBase()}/${id}.mp4`,
    poster: `${placeholderBase()}/${id}.jpg`,
    aspectRatio,
    durationSeconds: 4,
    sections,
    workflow: "text-to-video",
    placeholder: true,
    sourceType: "approved-fixture",
    ...extra,
  };
}

/** Placeholder image slot. */
function pi(n: number, aspectRatio: DiscoveryAspect, sections: readonly DiscoverySection[], extra: Partial<DiscoveryMediaItem> = {}): DiscoveryMediaItem {
  const id = `image-${String(n).padStart(2, "0")}`;
  return {
    id,
    type: "image",
    src: `${placeholderBase()}/${id}.jpg`,
    aspectRatio,
    sections,
    workflow: "text-to-image",
    placeholder: true,
    sourceType: "approved-fixture",
    ...extra,
  };
}

const CINEMA = { appId: "cinema-studio" } as const;
const MARKETING = { appId: "marketing-studio" } as const;
const INFLUENCER = { appId: "ai-influencer" } as const;

export const DISCOVERY_MEDIA: readonly DiscoveryMediaItem[] = [
  // ── Real approved Studio stills (final media, not placeholders) ──────────
  { id: "still-hero", type: "image", src: "/studio-v5/media/home-hero.webp", aspectRatio: "16:9", sections: ["home-image", "feature-rail"], title: "Rain-lit city promenade at night", categories: ["cinematic", "environment"], placeholder: false, sourceType: "approved-fixture", ...CINEMA },
  { id: "still-portrait", type: "image", src: "/studio-v5/media/featured-portrait.webp", aspectRatio: "4:5", sections: ["home-image", "feature-rail"], title: "Portrait in an ochre wool coat", categories: ["fashion", "character", "editorial"], placeholder: false, sourceType: "approved-fixture", ...INFLUENCER },
  { id: "still-product", type: "image", src: "/studio-v5/media/featured-product.webp", aspectRatio: "3:2", sections: ["home-image", "feature-rail"], title: "Amber glass bottle on travertine", categories: ["product", "advertising"], placeholder: false, sourceType: "approved-fixture", ...MARKETING },

  // ── Video slots (20) ────────────────────────────────────────────────────
  pv(1, "16:9", ["home-video", "flagship-cinema"], { categories: ["cinematic"], ...CINEMA }),
  pv(2, "9:16", ["home-video", "spotlight-influencer"], { categories: ["fashion", "character"], ...INFLUENCER }),
  pv(3, "16:9", ["home-video", "spotlight-marketing"], { categories: ["product", "advertising"], ...MARKETING }),
  pv(4, "9:16", ["home-video", "spotlight-influencer"], { categories: ["character", "fashion"], workflow: "image-to-video", ...INFLUENCER }),
  pv(5, "21:9", ["home-video", "flagship-cinema"], { categories: ["cinematic"], ...CINEMA }),
  pv(6, "4:5", ["home-video", "spotlight-marketing", "specialized-product"], { categories: ["advertising"], ...MARKETING }),
  pv(7, "1:1", ["home-video", "spotlight-influencer"], { categories: ["character"], workflow: "image-to-video", ...INFLUENCER }),
  pv(8, "9:16", ["home-video", "spotlight-marketing", "specialized-product"], { categories: ["product"], ...MARKETING }),
  pv(9, "3:2", ["home-video"], { categories: ["cinematic"], ...CINEMA }),
  pv(10, "3:2", ["home-video", "spotlight-influencer"], { categories: ["character", "fashion"], ...INFLUENCER }),
  pv(11, "16:9", ["home-video", "spotlight-marketing"], { categories: ["product", "advertising"], ...MARKETING }),
  pv(12, "4:5", ["home-video"], { categories: ["cinematic"], ...CINEMA }),
  pv(13, "16:9", ["home-video", "flagship-cinema"], { categories: ["experimental", "cinematic"], appId: "text-to-video" }),
  pv(14, "9:16", ["home-video", "flagship-cinema"], { categories: ["animation", "experimental"] }),
  pv(15, "16:9", ["spotlight-marketing"], { categories: ["3d", "experimental"] }),
  pv(16, "4:5", ["spotlight-influencer"], { categories: ["fashion", "animation"] }),
  pv(17, "21:9", ["flagship-cinema"], { categories: ["cinematic", "experimental"] }),
  pv(18, "9:16", ["specialized-product", "spotlight-marketing"], { categories: ["advertising", "animation"] }),
  pv(19, "1:1", ["feature-rail"], { categories: ["3d", "animation"], appId: "image-to-video", workflow: "image-to-video" }),
  pv(20, "3:2", ["flagship-cinema"], { categories: ["3d", "experimental"] }),

  // ── Image slots (26) ────────────────────────────────────────────────────
  pi(1, "16:9", ["home-image"], { categories: ["environment", "cinematic"], appId: "create-image" }),
  pi(2, "9:16", ["home-image", "spotlight-influencer"], { categories: ["fashion"] }),
  pi(3, "1:1", ["home-image"], { categories: ["environment"] }),
  pi(4, "4:5", ["home-image"], { categories: ["environment", "editorial"] }),
  pi(5, "4:5", ["home-image", "spotlight-influencer"], { categories: ["character", "fashion"], ...INFLUENCER }),
  pi(6, "9:16", ["home-image", "spotlight-influencer"], { categories: ["character"], ...INFLUENCER }),
  pi(7, "1:1", ["home-image", "spotlight-influencer"], { categories: ["editorial", "character"] }),
  pi(8, "3:2", ["home-image"], { categories: ["editorial"] }),
  pi(9, "16:9", ["spotlight-marketing"], { categories: ["product", "advertising"], ...MARKETING }),
  pi(10, "1:1", ["specialized-product", "home-image", "spotlight-marketing"], { categories: ["product"], ...MARKETING }),
  pi(11, "4:5", ["specialized-product", "home-image", "spotlight-marketing"], { categories: ["advertising"], ...MARKETING }),
  pi(12, "9:16", ["specialized-product", "spotlight-marketing"], { categories: ["product"], ...MARKETING }),
  pi(13, "3:2", ["home-image"], { categories: ["environment"] }),
  pi(14, "1:1", ["home-image"], { categories: ["environment", "cinematic"] }),
  pi(15, "16:9", ["home-image"], { categories: ["editorial", "fashion"] }),
  pi(16, "4:5", ["home-image", "spotlight-influencer"], { categories: ["fashion"] }),
  pi(17, "3:2", ["spotlight-marketing"], { categories: ["product", "brand"], ...MARKETING }),
  pi(18, "1:1", ["specialized-product"], { categories: ["product", "brand"], ...MARKETING }),
  pi(19, "4:5", ["home-image"], { categories: ["concept"] }),
  pi(20, "16:9", ["home-image"], { categories: ["concept"] }),
  pi(21, "1:1", [], { categories: ["concept", "brand"] }),
  pi(22, "9:16", [], { categories: ["concept"] }),
  pi(23, "3:2", [], { categories: ["concept", "brand"] }),
  pi(24, "4:5", [], { categories: ["concept"] }),
  pi(25, "1:1", [], { categories: ["concept"] }),
  pi(26, "16:9", [], { categories: ["concept"] }),
];

/** Visible tile counts per home section (placeholders fill what real media does not). */
export const DISCOVERY_SECTION_SIZE: Readonly<Record<DiscoverySection, number>> = {
  "home-video": 14,
  "home-image": 16,
  "flagship-cinema": 6,
  "spotlight-marketing": 10,
  "spotlight-influencer": 10,
  "specialized-product": 5,
  "feature-rail": 3,
};

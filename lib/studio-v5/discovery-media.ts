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

  // ── Licensed showcase reels (S4D: owner-supplied, 8s 720p previews) ──────
  // Creator-credited licensed media (NOT Ethen outputs, NOT model claims:
  // modelFamilyId stays null). Served from local demo paths today; swap
  // src/poster to R2 URLs later with no other change.
  { id: "cinema-story-01", type: "video", src: "/studio-v5/showcase/cinema-story-01.mp4", poster: "/studio-v5/showcase/cinema-story-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "flagship-cinema"], title: "Cinematic short story — @harboriis", categories: ["cinematic"], placeholder: false, sourceType: "licensed-showcase", ...CINEMA },
  { id: "influencer-beauty-ad-01", type: "video", src: "/studio-v5/showcase/influencer-beauty-ad-01.mp4", poster: "/studio-v5/showcase/influencer-beauty-ad-01.jpg", width: 720, height: 1280, aspectRatio: "9:16", durationSeconds: 8, sections: ["home-video", "spotlight-influencer", "specialized-product", "spotlight-marketing"], title: "Rare Beauty influencer ad — @venturetwins", categories: ["fashion", "character", "product"], placeholder: false, sourceType: "licensed-showcase", workflow: "image-to-video", ...INFLUENCER },
  { id: "marketing-automotive-01", type: "video", src: "/studio-v5/showcase/marketing-automotive-01.mp4", poster: "/studio-v5/showcase/marketing-automotive-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "spotlight-marketing"], title: "Wet-road automotive spot — @AI_VideoLab", categories: ["product", "advertising"], placeholder: false, sourceType: "licensed-showcase", ...MARKETING },
  { id: "influencer-couture-01", type: "video", src: "/studio-v5/showcase/influencer-couture-01.mp4", poster: "/studio-v5/showcase/influencer-couture-01.jpg", width: 720, height: 1280, aspectRatio: "9:16", durationSeconds: 8, sections: ["home-video", "spotlight-influencer"], title: "Haute couture fashion film — @TaliaAariz", categories: ["fashion", "character"], placeholder: false, sourceType: "licensed-showcase", ...INFLUENCER },
  { id: "cinema-fantasy-01", type: "video", src: "/studio-v5/showcase/cinema-fantasy-01.mp4", poster: "/studio-v5/showcase/cinema-fantasy-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "flagship-cinema"], title: "Princess and dragon fantasy — @StevieMac03", categories: ["cinematic", "animation"], placeholder: false, sourceType: "licensed-showcase", ...CINEMA },
  { id: "marketing-luxury-01", type: "video", src: "/studio-v5/showcase/marketing-luxury-01.mp4", poster: "/studio-v5/showcase/marketing-luxury-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "spotlight-marketing"], title: "Vogue-level luxury commercial — @shmidtqq", categories: ["fashion", "advertising"], placeholder: false, sourceType: "licensed-showcase", ...MARKETING },
  { id: "showcase-human-motion-01", type: "video", src: "/studio-v5/showcase/showcase-human-motion-01.mp4", poster: "/studio-v5/showcase/showcase-human-motion-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video"], title: "Lifelike human motion study — @Diplomeme", categories: ["character", "cinematic"], placeholder: false, sourceType: "licensed-showcase", appId: "text-to-video" },
  { id: "influencer-street-01", type: "video", src: "/studio-v5/showcase/influencer-street-01.mp4", poster: "/studio-v5/showcase/influencer-street-01.jpg", width: 864, height: 1080, aspectRatio: "4:5", durationSeconds: 8, sections: ["home-video", "spotlight-influencer"], title: "City-commute fashion film — @AI_VideoLab", categories: ["fashion"], placeholder: false, sourceType: "licensed-showcase", ...INFLUENCER },
  { id: "marketing-beauty-01", type: "video", src: "/studio-v5/showcase/marketing-beauty-01.mp4", poster: "/studio-v5/showcase/marketing-beauty-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "spotlight-marketing", "spotlight-influencer"], title: "Beauty close-up with studio headphones", categories: ["product", "advertising"], placeholder: false, sourceType: "licensed-showcase", ...MARKETING },
  { id: "influencer-skincare-01", type: "video", src: "/studio-v5/showcase/influencer-skincare-01.mp4", poster: "/studio-v5/showcase/influencer-skincare-01.jpg", width: 720, height: 1280, aspectRatio: "9:16", durationSeconds: 8, sections: ["home-video", "spotlight-influencer", "spotlight-marketing", "specialized-product"], title: "Skincare talk-to-camera reel", categories: ["fashion", "character"], placeholder: false, sourceType: "licensed-showcase", ...INFLUENCER },
  { id: "influencer-lifestyle-01", type: "video", src: "/studio-v5/showcase/influencer-lifestyle-01.mp4", poster: "/studio-v5/showcase/influencer-lifestyle-01.jpg", width: 720, height: 1280, aspectRatio: "9:16", durationSeconds: 8, sections: ["home-video", "spotlight-influencer"], title: "Luxury lifestyle car selfie", categories: ["character", "fashion"], placeholder: false, sourceType: "licensed-showcase", workflow: "image-to-video", ...INFLUENCER },
  { id: "influencer-editorial-01", type: "video", src: "/studio-v5/showcase/influencer-editorial-01.mp4", poster: "/studio-v5/showcase/influencer-editorial-01.jpg", width: 1080, height: 1080, aspectRatio: "1:1", durationSeconds: 8, sections: ["home-video", "spotlight-influencer"], title: "Pink convertible editorial", categories: ["character"], placeholder: false, sourceType: "licensed-showcase", workflow: "image-to-video", ...INFLUENCER },
  { id: "showcase-fitness-01", type: "video", src: "/studio-v5/showcase/showcase-fitness-01.mp4", poster: "/studio-v5/showcase/showcase-fitness-01.jpg", width: 1080, height: 720, aspectRatio: "3:2", durationSeconds: 8, sections: ["home-video"], title: "Gym training session", categories: ["cinematic"], placeholder: false, sourceType: "licensed-showcase", ...CINEMA },
  { id: "influencer-cooking-01", type: "video", src: "/studio-v5/showcase/influencer-cooking-01.mp4", poster: "/studio-v5/showcase/influencer-cooking-01.jpg", width: 1080, height: 720, aspectRatio: "3:2", durationSeconds: 8, sections: ["home-video", "spotlight-influencer"], title: "Night-kitchen cooking selfie", categories: ["character", "fashion"], placeholder: false, sourceType: "licensed-showcase", ...INFLUENCER },
  { id: "influencer-dogwalk-01", type: "video", src: "/studio-v5/showcase/owner-batch-02/videos/influencer-dogwalk-01.mp4", poster: "/studio-v5/showcase/owner-batch-02/posters/influencer-dogwalk-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "spotlight-influencer"], title: "Golden-hour dog walk selfie", categories: ["character"], placeholder: false, sourceType: "owner-showcase", ...INFLUENCER },
  { id: "influencer-gym-vlog-01", type: "video", src: "/studio-v5/showcase/owner-batch-02/videos/influencer-gym-vlog-01.mp4", poster: "/studio-v5/showcase/owner-batch-02/posters/influencer-gym-vlog-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "spotlight-influencer"], title: "Gym vlog workout selfie", categories: ["character", "fashion"], placeholder: false, sourceType: "owner-showcase", ...INFLUENCER },
  { id: "cinema-trailer-01", type: "video", src: "/studio-v5/showcase/cinema-trailer-01.mp4", poster: "/studio-v5/showcase/cinema-trailer-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "flagship-cinema"], title: "Summer blockbuster trailer — @CharaspowerAI", categories: ["cinematic"], placeholder: false, sourceType: "licensed-showcase", ...CINEMA },
  { id: "showcase-beauty-film-01", type: "video", src: "/studio-v5/showcase/showcase-beauty-film-01.mp4", poster: "/studio-v5/showcase/showcase-beauty-film-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "spotlight-marketing"], title: "30-second beauty product film — @ImaStudio_ai", categories: ["product", "advertising"], placeholder: false, sourceType: "licensed-showcase", ...MARKETING },
  { id: "product-tech-01", type: "video", src: "/studio-v5/showcase/product-tech-01.mp4", poster: "/studio-v5/showcase/product-tech-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "specialized-product", "spotlight-marketing"], title: "iPhone 18 Pro day-in-life ad — @Diplomeme", categories: ["product", "advertising"], placeholder: false, sourceType: "licensed-showcase", ...MARKETING },
  { id: "marketing-sneaker-01", type: "video", src: "/studio-v5/showcase/marketing-sneaker-01.mp4", poster: "/studio-v5/showcase/marketing-sneaker-01.jpg", width: 864, height: 1080, aspectRatio: "4:5", durationSeconds: 8, sections: ["home-video", "spotlight-marketing", "specialized-product"], title: "Adidas trail campaign concept — @ibexdream", categories: ["product", "advertising"], placeholder: false, sourceType: "licensed-showcase", workflow: "image-to-video", ...MARKETING },
  { id: "cinema-scifi-01", type: "video", src: "/studio-v5/showcase/cinema-scifi-01.mp4", poster: "/studio-v5/showcase/cinema-scifi-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "flagship-cinema"], title: "Star Wars-style adventure — @FynCas", categories: ["cinematic", "experimental"], placeholder: false, sourceType: "licensed-showcase", ...CINEMA },
  { id: "showcase-fashion-01", type: "video", src: "/studio-v5/showcase/showcase-fashion-01.mp4", poster: "/studio-v5/showcase/showcase-fashion-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "spotlight-marketing"], title: "Cinematic fashion magic — @Noor_ul_ain43", categories: ["fashion", "advertising"], placeholder: false, sourceType: "licensed-showcase", ...MARKETING },
  { id: "cinema-oneshot-01", type: "video", src: "/studio-v5/showcase/cinema-oneshot-01.mp4", poster: "/studio-v5/showcase/cinema-oneshot-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "flagship-cinema"], title: "Continuous one-shot sequence — @umesh_ai", categories: ["cinematic"], placeholder: false, sourceType: "licensed-showcase", ...CINEMA },
  { id: "showcase-nature-01", type: "video", src: "/studio-v5/showcase/showcase-nature-01.mp4", poster: "/studio-v5/showcase/showcase-nature-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "flagship-cinema"], title: "Hidden jungle river — @SyntheSarah", categories: ["cinematic"], placeholder: false, sourceType: "licensed-showcase", appId: "text-to-video" },
  { id: "product-hero-01", type: "video", src: "/studio-v5/showcase/product-hero-01.mp4", poster: "/studio-v5/showcase/product-hero-01.jpg", width: 1276, height: 718, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video", "specialized-product", "spotlight-marketing"], title: "10-second product video — @AI_VideoLab", categories: ["product"], placeholder: false, sourceType: "licensed-showcase", ...MARKETING },
  { id: "showcase-imagine-01", type: "video", src: "/studio-v5/showcase/showcase-imagine-01.mp4", poster: "/studio-v5/showcase/showcase-imagine-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video"], title: "Imagine anything reel — @johnAGI168", categories: ["cinematic", "experimental"], placeholder: false, sourceType: "licensed-showcase", appId: "text-to-video" },
  { id: "showcase-masterpiece-01", type: "video", src: "/studio-v5/showcase/showcase-masterpiece-01.mp4", poster: "/studio-v5/showcase/showcase-masterpiece-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video"], title: "Cinematic AI reel — @xmliisu", categories: ["cinematic"], placeholder: false, sourceType: "licensed-showcase", appId: "text-to-video" },
  { id: "showcase-reel-01", type: "video", src: "/studio-v5/showcase/showcase-reel-01.mp4", poster: "/studio-v5/showcase/showcase-reel-01.jpg", width: 1280, height: 720, aspectRatio: "16:9", durationSeconds: 8, sections: ["home-video"], title: "AI motion reel — @xEmiliayy", categories: ["cinematic", "experimental"], placeholder: false, sourceType: "licensed-showcase", appId: "text-to-video" },

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
  { id: "owner-pavilion-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-pavilion-01.webp", width: 1600, height: 902, aspectRatio: "16:9", sections: ["home-image"], title: "Modern pavilion over reflecting pool", categories: ["environment", "cinematic"], placeholder: false, sourceType: "owner-showcase", appId: "create-image" },
  { id: "owner-beauty-selfie-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-beauty-selfie-01.webp", width: 896, height: 1600, aspectRatio: "9:16", sections: ["home-image", "spotlight-influencer"], title: "Beauty selfie in green", categories: ["fashion"], placeholder: false, sourceType: "owner-showcase" },
  { id: "still-fantasy-dragon-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/still-fantasy-dragon-01.webp", width: 1080, height: 1080, aspectRatio: "1:1", sections: ["home-image"], title: "Dragon vista film still", categories: ["environment"], placeholder: false, sourceType: "owner-showcase" },
  { id: "owner-beauty-portrait-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-beauty-portrait-01.webp", width: 1122, height: 1402, aspectRatio: "4:5", sections: ["home-image"], title: "Blonde beauty portrait", categories: ["environment", "editorial"], placeholder: false, sourceType: "owner-showcase" },
  { id: "still-lifestyle-car-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/still-lifestyle-car-01.webp", width: 720, height: 900, aspectRatio: "4:5", sections: ["home-image", "spotlight-influencer"], title: "Luxury car lifestyle still", categories: ["character", "fashion"], placeholder: false, sourceType: "owner-showcase", ...INFLUENCER },
  { id: "owner-headphones-turf-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-headphones-turf-01.webp", width: 900, height: 1600, aspectRatio: "9:16", sections: ["home-image", "spotlight-influencer"], title: "Headphones selfie on turf", categories: ["character"], placeholder: false, sourceType: "owner-showcase", ...INFLUENCER },
  { id: "owner-makeup-selfie-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-makeup-selfie-01.webp", width: 714, height: 714, aspectRatio: "1:1", sections: ["home-image", "spotlight-influencer"], title: "Makeup application selfie", categories: ["editorial", "character"], placeholder: false, sourceType: "owner-showcase" },
  { id: "owner-dance-studio-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-dance-studio-01.webp", width: 1280, height: 853, aspectRatio: "3:2", sections: ["home-image"], title: "Empty dance studio", categories: ["editorial"], placeholder: false, sourceType: "owner-showcase" },
  { id: "still-beauty-product-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/still-beauty-product-01.webp", width: 1600, height: 900, aspectRatio: "16:9", sections: ["spotlight-marketing"], title: "Lip product commercial still", categories: ["product", "advertising"], placeholder: false, sourceType: "owner-showcase", ...MARKETING },
  { id: "still-supercar-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/still-supercar-01.webp", width: 720, height: 720, aspectRatio: "1:1", sections: ["specialized-product", "home-image", "spotlight-marketing"], title: "Supercar front film still", categories: ["product"], placeholder: false, sourceType: "owner-showcase", ...MARKETING },
  { id: "owner-watch-ad-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-watch-ad-01.webp", width: 896, height: 1152, aspectRatio: "4:5", sections: ["specialized-product", "home-image", "spotlight-marketing"], title: "Apple Watch tennis ad", categories: ["advertising"], placeholder: false, sourceType: "owner-showcase", ...MARKETING },
  { id: "owner-coffee-ad-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-coffee-ad-01.webp", width: 832, height: 1248, aspectRatio: "9:16", sections: ["specialized-product", "spotlight-marketing"], title: "THE GOAT coffee product still", categories: ["product"], placeholder: false, sourceType: "owner-showcase", ...MARKETING },
  { id: "still-dogwalk-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/still-dogwalk-01.webp", width: 1080, height: 720, aspectRatio: "3:2", sections: ["home-image"], title: "Dog walk film still", categories: ["environment"], placeholder: false, sourceType: "owner-showcase" },
  { id: "owner-evening-portrait-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-evening-portrait-01.webp", width: 700, height: 700, aspectRatio: "1:1", sections: ["home-image"], title: "Evening beauty portrait", categories: ["environment", "cinematic"], placeholder: false, sourceType: "owner-showcase" },
  { id: "still-headphones-film-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/still-headphones-film-01.webp", width: 1280, height: 720, aspectRatio: "16:9", sections: ["home-image"], title: "Headphone beauty film still", categories: ["editorial", "fashion"], placeholder: false, sourceType: "owner-showcase" },
  { id: "owner-orchid-ad-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-orchid-ad-01.webp", width: 1067, height: 1600, aspectRatio: "4:5", sections: ["home-image", "spotlight-influencer"], title: "Orchid Bloom product collage", categories: ["fashion"], placeholder: false, sourceType: "owner-showcase" },
  { id: "still-laundromat-story-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/still-laundromat-story-01.webp", width: 1440, height: 960, aspectRatio: "3:2", sections: ["spotlight-marketing"], title: "Laundromat story still", categories: ["product", "brand"], placeholder: false, sourceType: "owner-showcase", ...MARKETING },
  { id: "still-gym-vlog-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/still-gym-vlog-01.webp", width: 1080, height: 1080, aspectRatio: "1:1", sections: ["specialized-product"], title: "Gym vlog still", categories: ["product", "brand"], placeholder: false, sourceType: "owner-showcase", ...MARKETING },
  { id: "owner-travel-collage-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-travel-collage-01.webp", width: 1067, height: 1600, aspectRatio: "4:5", sections: ["home-image"], title: "Italy travel collage", categories: ["concept"], placeholder: false, sourceType: "owner-showcase" },
  { id: "owner-snow-village-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-snow-village-01.webp", width: 1600, height: 900, aspectRatio: "16:9", sections: ["home-image"], title: "Snowy Nordic village", categories: ["concept"], placeholder: false, sourceType: "owner-showcase" },
  { id: "owner-corgi-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-corgi-01.webp", width: 1080, height: 1080, aspectRatio: "1:1", sections: [], title: "Corgi in cowboy hat", categories: ["concept", "brand"], placeholder: false, sourceType: "owner-showcase" },
  { id: "still-skincare-talk-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/still-skincare-talk-01.webp", width: 720, height: 1280, aspectRatio: "9:16", sections: [], title: "Skincare talk still", categories: ["concept"], placeholder: false, sourceType: "owner-showcase" },
  { id: "still-gym-training-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/still-gym-training-01.webp", width: 1080, height: 720, aspectRatio: "3:2", sections: [], title: "Gym training still", categories: ["concept", "brand"], placeholder: false, sourceType: "owner-showcase" },
  { id: "still-mascara-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/still-mascara-01.webp", width: 720, height: 900, aspectRatio: "4:5", sections: [], title: "Mascara tutorial still", categories: ["concept"], placeholder: false, sourceType: "owner-showcase" },
  { id: "owner-gym-stretch-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-gym-stretch-01.webp", width: 772, height: 772, aspectRatio: "1:1", sections: [], title: "Gym stretch with headphones", categories: ["concept"], placeholder: false, sourceType: "owner-showcase" },
  { id: "owner-rocket-launch-01", type: "image", src: "/studio-v5/showcase/owner-batch-02/images/owner-rocket-launch-01.webp", width: 1600, height: 902, aspectRatio: "16:9", sections: [], title: "Rocket launch over dirt road", categories: ["concept"], placeholder: false, sourceType: "owner-showcase" },
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

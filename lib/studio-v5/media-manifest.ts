/**
 * Studio V4 lab — versioned media manifest (R2-ready adapter).
 *
 * Presentation components never see a URL. They ask for a placement and get
 * resolved items back, so swapping these local fixtures for real R2 objects
 * later is a base-path + `file` change in this module and nothing else
 * (§22/§23). The item shape is deliberately the R2 shape from the blueprint:
 * src, poster, aspect ratio, title, modelFamilyId, workflow, placement,
 * badge, CTA.
 *
 * The fixtures themselves are synthesized plates (see
 * `artifacts/studio-v4-lab/tools/generate-fixture-media.mjs`): the existing
 * Studio R2 bucket 404s for every object, and competitor screenshots are not
 * product media, so the lab ships neutral generated stills/clips instead of
 * pretending to have footage.
 */

export type LabAspectRatio = "21/9" | "16/9" | "3/2" | "4/5" | "1/1" | "9/16";

export type LabMediaPlacement =
  | "home-hero"
  | "home-mosaic"
  | "continue"
  | "cinematic"
  | "image"
  | "apps"
  | "ugc"
  | "canvas"
  | "entities"
  | "vfx"
  | "recipes"
  | "model-demo";

/** Lab workflow ids — every one resolves to a real lab create-surface state. */
export type LabWorkflowId =
  | "text-to-image"
  | "image-to-video"
  | "text-to-video"
  | "edit-image"
  | "edit-video"
  | "reference-to-video"
  | "text-to-audio"
  | "image-to-3d"
  | "upscale"
  | "restyle"
  | "background"
  | "compare";

/** M6A provenance: only non-synthetic origins may render on discovery surfaces. */
export type LabMediaOrigin = "synthetic" | "fixture-still" | "owner-showcase" | "owner-output";

export interface LabMediaItem {
  id: string;
  kind: "video" | "image";
  /** File stem inside the media base (extension added by the resolver). */
  file: string;
  /** Full URL override; when set, the media base is not used. */
  href?: string;
  /** Provenance; generator-built plates are "synthetic" (default). */
  origin?: LabMediaOrigin;
  aspectRatio: LabAspectRatio;
  title: string;
  placement: LabMediaPlacement;
  order: number;
  modelFamilyId: string | null;
  workflow: LabWorkflowId | null;
  badge: string | null;
  ctaLabel: string | null;
  /** Category tag used when a model demo is resolved by family category. */
  demoCategory?: "image" | "video" | "audio" | "3d" | "utility";
  /** Generator hints — consumed by the fixture tool, ignored at runtime. */
  palette?: string;
  seconds?: number;
}

export interface ResolvedLabMedia extends LabMediaItem {
  /** Poster URL — always present, always painted first. */
  poster: string;
  /** Video URL — null for stills. */
  src: string | null;
  /** Resolved provenance (defaults to "synthetic"). */
  resolvedOrigin: LabMediaOrigin;
}

export const STUDIO_V4_LAB_MEDIA_VERSION = 1;

const DEFAULT_MEDIA_BASE = "/studio-v4-lab/media";

/**
 * Base for every lab media URL. Pointing this at an R2 public base is the
 * whole migration: the manifest keys, placements and family bindings are
 * already the shape §56 specifies.
 */
export function labMediaBase(): string {
  const configured = process.env.NEXT_PUBLIC_STUDIO_V4_LAB_MEDIA_BASE;
  return (configured && configured.trim() ? configured : DEFAULT_MEDIA_BASE).replace(/\/$/, "");
}

function item(
  id: string,
  kind: LabMediaItem["kind"],
  aspectRatio: LabAspectRatio,
  title: string,
  placement: LabMediaPlacement,
  order: number,
  extra: Partial<LabMediaItem> = {},
): LabMediaItem {
  return {
    id,
    kind,
    file: id,
    aspectRatio,
    title,
    placement,
    order,
    modelFamilyId: null,
    workflow: null,
    badge: null,
    ctaLabel: null,
    ...(kind === "video" ? { seconds: 4 } : {}),
    ...extra,
  };
}

export const STUDIO_V4_LAB_MEDIA_ITEMS: readonly LabMediaItem[] = [
  // ── Home hero + featured mosaic ────────────────────────────────────────
  item("home-hero", "video", "21/9", "Night city drift", "home-hero", 0, {
    workflow: "text-to-video",
    modelFamilyId: "falfam/bytedance-seedance-2-5",
    ctaLabel: "Create video",
    palette: "ember",
    seconds: 5,
  }),
  item("mosaic-01", "video", "3/2", "Studio portrait in motion", "home-mosaic", 0, {
    workflow: "image-to-video",
    ctaLabel: "Animate image",
    palette: "sand",
  }),
  item("mosaic-02", "image", "4/5", "Product still — amber glass", "home-mosaic", 1, {
    workflow: "text-to-image",
    palette: "ember",
  }),
  item("mosaic-03", "image", "1/1", "Fabric macro", "home-mosaic", 2, { workflow: "text-to-image", palette: "rose" }),
  item("mosaic-04", "video", "4/5", "Vertical fashion loop", "home-mosaic", 3, {
    workflow: "reference-to-video",
    palette: "violet",
  }),
  item("mosaic-05", "image", "16/9", "Landscape plate", "home-mosaic", 4, { workflow: "text-to-image", palette: "teal" }),
  item("mosaic-06", "image", "1/1", "Relit portrait", "home-mosaic", 5, { workflow: "edit-image", palette: "steel" }),
  item("mosaic-07", "image", "3/2", "Set lighting study", "home-mosaic", 6, { workflow: "text-to-image", palette: "moss" }),

  // ── Continue creating ──────────────────────────────────────────────────
  item("continue-01", "image", "1/1", "Campaign key art", "continue", 0, { workflow: "text-to-image", palette: "rose" }),
  item("continue-02", "image", "4/5", "Character sheet", "continue", 1, { workflow: "edit-image", palette: "indigo" }),
  item("continue-03", "video", "16/9", "Establishing shot", "continue", 2, { workflow: "text-to-video", palette: "teal" }),
  item("continue-04", "image", "9/16", "Social cutdown", "continue", 3, { workflow: "image-to-video", palette: "ember" }),

  // ── Cinematic showcase ─────────────────────────────────────────────────
  item("cinema-01", "video", "16/9", "Slow dolly through fog", "cinematic", 0, {
    workflow: "text-to-video",
    palette: "steel",
    seconds: 5,
  }),
  item("cinema-02", "image", "16/9", "Anamorphic flare", "cinematic", 1, { workflow: "text-to-video", palette: "ember" }),
  item("cinema-03", "video", "16/9", "Handheld follow", "cinematic", 2, { workflow: "image-to-video", palette: "moss" }),
  item("cinema-04", "image", "16/9", "Rain-lit street", "cinematic", 3, { workflow: "text-to-video", palette: "indigo" }),
  item("cinema-05", "image", "21/9", "Wide desert plate", "cinematic", 4, { workflow: "text-to-video", palette: "sand" }),
  item("cinema-06", "image", "4/5", "Close-up, shallow depth", "cinematic", 5, { workflow: "image-to-video", palette: "rose" }),

  // ── Image showcase ─────────────────────────────────────────────────────
  item("image-01", "image", "4/5", "Editorial portrait", "image", 0, { workflow: "text-to-image", palette: "rose" }),
  item("image-02", "image", "16/9", "Studio table-top", "image", 1, { workflow: "text-to-image", palette: "sand" }),
  item("image-03", "image", "1/1", "Colour study", "image", 2, { workflow: "text-to-image", palette: "violet" }),
  item("image-04", "image", "1/1", "Texture pass", "image", 3, { workflow: "edit-image", palette: "moss" }),
  item("image-05", "image", "4/5", "Product on set", "image", 4, { workflow: "text-to-image", palette: "teal" }),

  // ── Apps ───────────────────────────────────────────────────────────────
  item("app-ai-influencer", "video", "16/9", "AI Influencer", "apps", 0, { palette: "rose" }),
  item("app-marketing-studio", "image", "16/9", "Marketing Studio", "apps", 1, { palette: "ember" }),
  item("app-cinema", "video", "3/2", "Cinema", "apps", 2, { palette: "steel" }),
  item("app-canvas", "image", "3/2", "Canvas", "apps", 3, { palette: "indigo" }),
  item("app-compare-models", "image", "3/2", "Compare Models", "apps", 4, { palette: "teal" }),
  item("app-image-editor", "image", "1/1", "Image Editor", "apps", 5, { palette: "sand" }),
  item("app-characters", "image", "1/1", "Characters", "apps", 6, { palette: "violet" }),
  item("app-products", "image", "1/1", "Products", "apps", 7, { palette: "moss" }),
  item("app-brands", "image", "1/1", "Brands", "apps", 8, { palette: "rose" }),

  // ── Marketing / UGC ────────────────────────────────────────────────────
  item("ugc-01", "video", "9/16", "Unboxing beat", "ugc", 0, { workflow: "image-to-video", palette: "sand" }),
  item("ugc-02", "image", "9/16", "Testimonial frame", "ugc", 1, { workflow: "reference-to-video", palette: "rose" }),
  item("ugc-03", "video", "9/16", "Product hold", "ugc", 2, { workflow: "image-to-video", palette: "ember" }),
  item("ugc-04", "image", "9/16", "Street cutaway", "ugc", 3, { workflow: "text-to-video", palette: "teal" }),
  item("ugc-05", "image", "9/16", "Closing card", "ugc", 4, { workflow: "edit-video", palette: "violet" }),

  // ── Canvas / workflow chain ────────────────────────────────────────────
  item("canvas-01", "image", "1/1", "Image", "canvas", 0, { workflow: "text-to-image", palette: "steel" }),
  item("canvas-02", "image", "1/1", "Edit", "canvas", 1, { workflow: "edit-image", palette: "moss" }),
  item("canvas-03", "video", "1/1", "Animate", "canvas", 2, { workflow: "image-to-video", palette: "ember" }),
  item("canvas-04", "image", "1/1", "Upscale", "canvas", 3, { workflow: "upscale", palette: "indigo" }),

  // ── Characters / Products / Brands ─────────────────────────────────────
  item("entity-characters", "image", "4/5", "Characters", "entities", 0, { palette: "violet" }),
  item("entity-products", "image", "4/5", "Products", "entities", 1, { palette: "sand" }),
  item("entity-brands", "image", "4/5", "Brands", "entities", 2, { palette: "teal" }),

  // ── VFX / transformations (before → after pairs) ───────────────────────
  item("vfx-background-before", "image", "16/9", "Original plate", "vfx", 0, { workflow: "background", palette: "steel" }),
  item("vfx-background-after", "image", "16/9", "Background replaced", "vfx", 1, { workflow: "background", palette: "ember" }),
  item("vfx-restyle-before", "image", "16/9", "Original grade", "vfx", 2, { workflow: "restyle", palette: "moss" }),
  item("vfx-restyle-after", "image", "16/9", "Restyled", "vfx", 3, { workflow: "restyle", palette: "violet" }),
  item("vfx-upscale-before", "image", "16/9", "Source resolution", "vfx", 4, { workflow: "upscale", palette: "sand" }),
  item("vfx-upscale-after", "image", "16/9", "Upscaled", "vfx", 5, { workflow: "upscale", palette: "teal" }),
  item("vfx-motion-before", "image", "16/9", "Still frame", "vfx", 6, { workflow: "image-to-video", palette: "indigo" }),
  item("vfx-motion-after", "video", "16/9", "In motion", "vfx", 7, { workflow: "image-to-video", palette: "rose" }),

  // ── Templates / recipes ────────────────────────────────────────────────
  item("recipe-product-commercial", "image", "3/2", "Product commercial", "recipes", 0, { palette: "ember" }),
  item("recipe-establishing-shot", "image", "3/2", "Cinematic establishing shot", "recipes", 1, { palette: "steel" }),
  item("recipe-ugc-testimonial", "image", "3/2", "UGC testimonial", "recipes", 2, { palette: "rose" }),
  item("recipe-fashion-campaign", "image", "3/2", "Fashion campaign", "recipes", 3, { palette: "violet" }),
  item("recipe-character-sheet", "image", "3/2", "Character sheet", "recipes", 4, { palette: "indigo" }),
  item("recipe-image-to-video", "image", "3/2", "Image → Video", "recipes", 5, { palette: "teal" }),
  item("recipe-logo-reveal", "image", "3/2", "Logo reveal", "recipes", 6, { palette: "sand" }),
  item("recipe-social-vertical", "image", "3/2", "Social vertical ad", "recipes", 7, { palette: "moss" }),
  item("recipe-before-after", "image", "3/2", "Before / after", "recipes", 8, { palette: "steel" }),
  item("recipe-voiceover-cut", "image", "3/2", "Voiceover cut", "recipes", 9, { palette: "ember" }),

  // ── Model demo media ───────────────────────────────────────────────────
  // Bound demos: an explicit editorial family ↔ media binding (§58).
  item("demo-seedance", "video", "16/9", "Seedance demo", "model-demo", 0, {
    modelFamilyId: "falfam/bytedance-seedance-2-5",
    demoCategory: "video",
    palette: "ember",
  }),
  item("demo-kling", "video", "16/9", "Kling demo", "model-demo", 1, {
    modelFamilyId: "falfam/fal-ai-kling-video",
    demoCategory: "video",
    palette: "steel",
  }),
  item("demo-veo", "image", "16/9", "Veo demo", "model-demo", 2, {
    modelFamilyId: "falfam/fal-ai-veo3-1",
    demoCategory: "video",
    palette: "teal",
  }),
  item("demo-wan", "image", "16/9", "Wan demo", "model-demo", 3, {
    modelFamilyId: "falfam/alibaba-wan-3-0",
    demoCategory: "video",
    palette: "moss",
  }),
  item("demo-minimax", "image", "16/9", "MiniMax demo", "model-demo", 4, {
    modelFamilyId: "falfam/minimax-h3",
    demoCategory: "video",
    palette: "violet",
  }),
  item("demo-luma", "image", "16/9", "Luma demo", "model-demo", 5, {
    modelFamilyId: "falfam/fal-ai-luma-dream-machine",
    demoCategory: "video",
    palette: "indigo",
  }),
  item("demo-nano-banana", "image", "3/2", "Nano Banana demo", "model-demo", 6, {
    modelFamilyId: "falfam/fal-ai-nano-banana-pro",
    demoCategory: "image",
    palette: "sand",
  }),
  item("demo-flux", "image", "3/2", "Flux demo", "model-demo", 7, {
    modelFamilyId: "falfam/fal-ai-flux-2",
    demoCategory: "image",
    palette: "ember",
  }),
  // Category pool: families without an explicit binding resolve here, so a
  // full-family library still shows media without hand-placed assets per family.
  item("demo-pool-image-1", "image", "3/2", "Image model demo", "model-demo", 8, { demoCategory: "image", palette: "rose" }),
  item("demo-pool-image-2", "image", "3/2", "Image model demo", "model-demo", 9, { demoCategory: "image", palette: "violet" }),
  item("demo-pool-image-3", "image", "3/2", "Image model demo", "model-demo", 10, { demoCategory: "image", palette: "teal" }),
  item("demo-pool-video-1", "image", "3/2", "Video model demo", "model-demo", 11, { demoCategory: "video", palette: "steel" }),
  item("demo-pool-video-2", "image", "3/2", "Video model demo", "model-demo", 12, { demoCategory: "video", palette: "indigo" }),
  item("demo-pool-audio-1", "image", "3/2", "Audio model demo", "model-demo", 13, { demoCategory: "audio", palette: "moss" }),
  item("demo-pool-audio-2", "image", "3/2", "Audio model demo", "model-demo", 14, { demoCategory: "audio", palette: "violet" }),
  item("demo-pool-3d-1", "image", "3/2", "3D model demo", "model-demo", 15, { demoCategory: "3d", palette: "sand" }),
  item("demo-pool-3d-2", "image", "3/2", "3D model demo", "model-demo", 16, { demoCategory: "3d", palette: "steel" }),
  item("demo-pool-utility-1", "image", "3/2", "Utility model demo", "model-demo", 17, { demoCategory: "utility", palette: "ember" }),

  // ── M6A fixture stills (real files; the only non-synthetic manifest media) ─
  { ...item("still-portrait", "image", "4/5", "Portrait in an ochre wool coat", "image", 100), href: "/studio-v5/media/featured-portrait.webp", origin: "fixture-still" as const },
  { ...item("still-product", "image", "3/2", "Amber glass bottle on travertine", "ugc", 100), href: "/studio-v5/media/featured-product.webp", origin: "fixture-still" as const },
  { ...item("still-hero", "image", "16/9", "Rain-lit city promenade at night", "cinematic", 100), href: "/studio-v5/media/home-hero.webp", origin: "fixture-still" as const },
];

/**
 * M6A home sections and the manifest placements backing them. A section
 * renders only when it has non-synthetic media (owner outputs first,
 * then owner showcase, then fixture stills); otherwise it collapses.
 * Synthetic plates never render on discovery surfaces.
 */
export type HomeMediaSection = "image" | "video" | "audio" | "cinematic" | "marketing" | "characters";

export const HOME_MEDIA_SECTIONS: Readonly<Record<HomeMediaSection, { placement: LabMediaPlacement; title: string; viewAllHref: string }>> = {
  image: { placement: "image", title: "Image", viewAllHref: "/studio/create/image" },
  // Video/audio map to placements with no fixture stills: owner outputs
  // only, otherwise the sections collapse.
  video: { placement: "home-mosaic", title: "Video", viewAllHref: "/studio/create/video" },
  audio: { placement: "home-mosaic", title: "Audio", viewAllHref: "/studio/create/music" },
  cinematic: { placement: "cinematic", title: "Cinematic", viewAllHref: "/studio/pro/cinema" },
  marketing: { placement: "ugc", title: "Marketing", viewAllHref: "/studio/marketing" },
  characters: { placement: "entities", title: "Characters", viewAllHref: "/studio/identities/characters" },
};

const REAL_ORIGINS: ReadonlySet<LabMediaOrigin> = new Set(["owner-output", "owner-showcase", "fixture-still"]);

/** Non-synthetic manifest items for a home section, in manifest order. */
export function homeSectionMedia(section: HomeMediaSection): ResolvedLabMedia[] {
  const placement = HOME_MEDIA_SECTIONS[section].placement;
  return labMedia(placement).filter((media) => REAL_ORIGINS.has(media.resolvedOrigin));
}

/** True when the item may render on a discovery surface. */
export function isDiscoveryMedia(media: ResolvedLabMedia): boolean {
  return REAL_ORIGINS.has(media.resolvedOrigin);
}

function resolve(item: LabMediaItem): ResolvedLabMedia {
  const base = labMediaBase();
  return {
    ...item,
    poster: item.href ?? `${base}/${item.file}.jpg`,
    src: item.kind === "video" ? (item.href ?? `${base}/${item.file}.mp4`) : null,
    resolvedOrigin: item.origin ?? "synthetic",
  };
}

/** Every item in a placement, in manifest order. */
export function labMedia(placement: LabMediaPlacement): ResolvedLabMedia[] {
  return STUDIO_V4_LAB_MEDIA_ITEMS.filter((entry) => entry.placement === placement)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(resolve);
}

export function labMediaById(id: string): ResolvedLabMedia | null {
  const found = STUDIO_V4_LAB_MEDIA_ITEMS.find((entry) => entry.id === id);
  return found ? resolve(found) : null;
}

function stableIndex(key: string, length: number): number {
  let value = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    value ^= key.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value) % Math.max(length, 1);
}

/**
 * Demo media for a family: the explicit binding when one exists, otherwise a
 * stable pick from that category's pool. Never random — the same family shows
 * the same plate on every render, so the library does not shimmer.
 */
export function labModelDemo(
  familyId: string,
  category: "image" | "video" | "audio" | "3d" | "utility",
): ResolvedLabMedia | null {
  const bound = STUDIO_V4_LAB_MEDIA_ITEMS.find(
    (entry) => entry.placement === "model-demo" && entry.modelFamilyId === familyId,
  );
  if (bound) return resolve(bound);
  const pool = STUDIO_V4_LAB_MEDIA_ITEMS.filter(
    (entry) => entry.placement === "model-demo" && entry.demoCategory === category && !entry.modelFamilyId,
  );
  if (pool.length === 0) return null;
  return resolve(pool[stableIndex(familyId, pool.length)]);
}

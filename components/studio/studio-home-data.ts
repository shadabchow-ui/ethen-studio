import {
  MEDIA_APPS,
  MEDIA_APP_SECTION_LABELS,
  MEDIA_APP_SECTION_ORDER,
  filterMediaApps,
} from "@/lib/media";
import {
  STUDIO_SHOWCASE_ASSETS,
  getShowcaseAssetUrl,
  getShowcaseAssetsBySection,
  type StudioShowcaseAsset,
  type StudioShowcaseAspectRatio,
  type StudioShowcaseSection,
} from "@/lib/media/showcase";
import { getStudioRouteForAppId } from "./studio-navigation";
import { isStudioV1Candidate } from "./studio-capability-truth";

export type StudioPreviewTile = {
  id: string;
  title: string;
  subtitle?: string;
  aspect: "wide" | "square" | "portrait" | "ultrawide";
  tone: string;
  accent?: string;
  badge?: string;
  imageUrl?: string;
  videoUrl?: string;
  posterUrl?: string;
  imageAlt: string;
  mediaType: "image" | "video";
};

export type StudioQuickLaunchItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: "image" | "video" | "link" | "person" | "grid" | "box" | "audio" | "film";
  href: string;
};

export type StudioAppDirectoryGroup = {
  label: string;
  items: Array<{
    label: string;
    href: string;
  }>;
};

const APP_TITLE_BY_KEY = new Map(
  MEDIA_APPS.flatMap((app) => [
    [app.id, app.title] as const,
    [app.slug, app.title] as const,
  ]),
);

const SECTION_LABEL_BY_KEY: Partial<Record<StudioShowcaseSection, string>> = {
  hero: "Studio",
  cinema: "Cinema Studio",
  image: "Create Image",
  marketing: "Marketing Studio",
  video: "Create Video",
  influencer: "AI Influencer",
  games: "Game Assets",
  canvas: "Canvas",
  supercomputer: "Supercomputer",
};

const SECTION_TONES: Record<StudioShowcaseSection, string[]> = {
  hero: [
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
  ],
  featured: [
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
  ],
  cinema: [
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
  ],
  image: [
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
  ],
  marketing: [
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
  ],
  video: [
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
  ],
  influencer: [
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
  ],
  games: [
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
  ],
  canvas: [
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
  ],
  supercomputer: [
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
    "bg-[var(--bg-inset)]",
  ],
};

const FEATURED_ACCENTS = ["bg-[var(--text-secondary)]", "bg-[var(--text-secondary)]", "bg-[var(--text-secondary)]", "bg-[var(--text-secondary)]"];
const GENERIC_TAGS = new Set([
  "hero",
  "cinema",
  "video",
  "image",
  "marketing",
  "influencer",
  "games",
  "canvas",
  "supercomputer",
]);

function toAspect(aspectRatio: StudioShowcaseAspectRatio): StudioPreviewTile["aspect"] {
  if (aspectRatio === "21/9") return "ultrawide";
  if (aspectRatio === "1/1") return "square";
  if (aspectRatio === "4/5" || aspectRatio === "9/16") return "portrait";
  return "wide";
}

function toTitleCase(input: string): string {
  return input
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveSubtitle(asset: StudioShowcaseAsset): string | undefined {
  if (asset.appSlug) {
    return APP_TITLE_BY_KEY.get(asset.appSlug) ?? toTitleCase(asset.appSlug);
  }

  return SECTION_LABEL_BY_KEY[asset.section];
}

function resolvePreviewMediaUrls(asset: StudioShowcaseAsset): {
  imageUrl?: string;
  videoUrl?: string;
  posterUrl?: string;
} {
  if (asset.type === "image") {
    return {
      imageUrl: getShowcaseAssetUrl(asset.filename),
    };
  }

  const videoUrl = getShowcaseAssetUrl(asset.filename);

  if (asset.posterFilename) {
    const posterUrl = getShowcaseAssetUrl(asset.posterFilename);

    return {
      imageUrl: posterUrl,
      videoUrl,
      posterUrl,
    };
  }

  return {
    videoUrl,
  };
}

function hasRenderablePreview(asset: StudioShowcaseAsset): boolean {
  const { imageUrl, videoUrl } = resolvePreviewMediaUrls(asset);
  return Boolean(imageUrl || videoUrl);
}

function selectAssets(section: StudioShowcaseSection, count: number): StudioShowcaseAsset[] {
  return [...getShowcaseAssetsBySection(section)]
    .sort((left, right) => {
      const previewDelta = Number(hasRenderablePreview(right)) - Number(hasRenderablePreview(left));
      if (previewDelta !== 0) return previewDelta;

      return Number(Boolean(right.priority)) - Number(Boolean(left.priority));
    })
    .slice(0, count);
}

function buildPreviewTile(
  asset: StudioShowcaseAsset,
  index: number,
  section: StudioShowcaseSection,
  accent?: string,
): StudioPreviewTile {
  const { imageUrl, videoUrl, posterUrl } = resolvePreviewMediaUrls(asset);
  const tones = SECTION_TONES[section];

  return {
    id: asset.id,
    title: asset.title,
    subtitle: resolveSubtitle(asset),
    aspect: toAspect(asset.aspectRatio),
    tone: tones[index % tones.length],
    accent,
    badge: asset.type === "video" ? "Video" : undefined,
    imageUrl,
    videoUrl,
    posterUrl,
    imageAlt: asset.title,
    mediaType: asset.type,
  };
}

function buildPreviewTiles(
  section: StudioShowcaseSection,
  count: number,
  accents?: string[],
): StudioPreviewTile[] {
  return selectAssets(section, count).map((asset, index) =>
    buildPreviewTile(asset, index, section, accents?.[index]),
  );
}

function buildViralPresets(): string[] {
  const specificTags = Array.from(
    new Set(
      STUDIO_SHOWCASE_ASSETS.flatMap((asset) => asset.tags).filter((tag) => !GENERIC_TAGS.has(tag)),
    ),
  ).map(toTitleCase);

  if (specificTags.length >= 8) {
    return specificTags.sort((left, right) => left.localeCompare(right));
  }

  return Array.from(new Set(STUDIO_SHOWCASE_ASSETS.flatMap((asset) => asset.tags)))
    .map(toTitleCase)
    .sort((left, right) => left.localeCompare(right));
}

export const FEATURED_TILES = buildPreviewTiles("hero", 4, FEATURED_ACCENTS);

export const QUICK_LAUNCH_ITEMS: StudioQuickLaunchItem[] = [
  { id: "create-image", title: "Create Image", subtitle: "Text to still", icon: "image", href: "/studio/apps/create-image" },
  { id: "image-to-video", title: "Image to Video", subtitle: "Animate any frame", icon: "video", href: "/studio/apps/image-to-video" },
];

export const CINEMATIC_TILES = buildPreviewTiles("cinema", 8);
export const IMAGE_EXPERIMENT_TILES = buildPreviewTiles("image", 9);
export const VIDEO_WORLD_TILES = buildPreviewTiles("video", 8);
export const CHARACTER_TILES = buildPreviewTiles("influencer", 4);
export const GAME_WORLD_TILES = buildPreviewTiles("games", 6);

export const SUPERCOMPUTER_BANNER_TILES = buildPreviewTiles("supercomputer", 3);
export const MARKETING_BANNER_TILES = buildPreviewTiles("marketing", 6);
export const CANVAS_BANNER_TILES = buildPreviewTiles("canvas", 6);

export const VIRAL_PRESETS = buildViralPresets();

export const APP_DIRECTORY_GROUPS: StudioAppDirectoryGroup[] = MEDIA_APP_SECTION_ORDER.map((section) => ({
  label: MEDIA_APP_SECTION_LABELS[section].title,
  items: filterMediaApps({ section }).slice(0, 4).map((app) => ({
    label: app.title,
    href: isStudioV1Candidate(app.id) ? getStudioRouteForAppId(app.id) : "/studio/apps",
  })),
})).filter((group) => group.items.length > 0);

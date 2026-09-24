/**
 * Studio discovery — showcase feed (pure, server- and client-safe).
 *
 * Adapts the discovery slot catalog (discovery-media.ts, the R2 swap
 * point) into view items for the home, Explore and creation detail.
 * Every section always renders at its full tile count: real media fills
 * slots first and placeholder media holds the remaining geometry until
 * final showcase media replaces it (a data edit, no layout change).
 * Placeholders are marked in data (`placeholder: true`); the UI never
 * attributes them as creations.
 */

import type { LabAspectRatio, LabWorkflowId } from "./media-manifest";
import {
  DISCOVERY_MEDIA,
  DISCOVERY_SECTION_SIZE,
  type DiscoveryAspect,
  type DiscoveryMediaItem,
  type DiscoverySection,
  type DiscoverySourceType,
  type ShowcaseCategory,
} from "./discovery-media";

export type { DiscoverySection, ShowcaseCategory } from "./discovery-media";

export interface StudioShowcaseItem {
  id: string;
  mediaType: "video" | "image";
  sourceType: DiscoverySourceType;
  title: string | null;
  posterUrl: string;
  videoUrl: string | null;
  aspectRatio: LabAspectRatio;
  durationSeconds: number | null;
  appId: string | null;
  templateId: string | null;
  modelFamilyId: string | null;
  workflow: LabWorkflowId | null;
  categories: readonly ShowcaseCategory[];
  sections: readonly DiscoverySection[];
  promptExcerpt: string | null;
  allowRemix: boolean;
  allowPromptReuse: boolean;
  /** Temporary layout media (replaced by final R2 media later). */
  placeholder: boolean;
}

export const VIDEO_CATEGORIES: readonly { id: ShowcaseCategory; label: string }[] = [
  { id: "cinematic", label: "Cinematic" },
  { id: "product", label: "Product" },
  { id: "advertising", label: "Advertising" },
  { id: "fashion", label: "Fashion" },
  { id: "character", label: "Character" },
  { id: "animation", label: "Animation" },
  { id: "3d", label: "3D" },
  { id: "experimental", label: "Experimental" },
];

export const IMAGE_CATEGORIES: readonly { id: ShowcaseCategory; label: string }[] = [
  { id: "product", label: "Product" },
  { id: "advertising", label: "Advertising" },
  { id: "character", label: "Character" },
  { id: "fashion", label: "Fashion" },
  { id: "editorial", label: "Editorial" },
  { id: "environment", label: "Environment" },
  { id: "concept", label: "Concept" },
  { id: "brand", label: "Brand" },
];

/** Explore page sizes (posters only; previews load on intent). */
export const EXPLORE_PAGE_SIZE = { video: 24, images: 30 } as const;

const ASPECT: Readonly<Record<DiscoveryAspect, LabAspectRatio>> = {
  "16:9": "16/9",
  "9:16": "9/16",
  "1:1": "1/1",
  "4:5": "4/5",
  "3:2": "3/2",
  "21:9": "21/9",
};

function toItem(media: DiscoveryMediaItem): StudioShowcaseItem {
  const video = media.type === "video";
  const workflow = media.workflow ?? null;
  return {
    id: media.id,
    mediaType: media.type,
    sourceType: media.sourceType,
    title: media.placeholder ? null : (media.title ?? null),
    posterUrl: video ? (media.poster ?? media.src) : media.src,
    videoUrl: video ? media.src : null,
    aspectRatio: ASPECT[media.aspectRatio],
    durationSeconds: video ? (media.durationSeconds ?? null) : null,
    appId: media.appId ?? null,
    templateId: media.templateId ?? null,
    modelFamilyId: media.modelFamilyId ?? null,
    workflow,
    categories: media.categories ?? [],
    sections: media.sections,
    // Placeholders never carry prompt truth.
    promptExcerpt: media.placeholder ? null : (media.promptExcerpt ?? null),
    // Approved stills have no recorded prompt/model; a placeholder can still
    // open its tool (tool + project, no carried settings).
    allowRemix: workflow !== null && (media.placeholder || media.sourceType !== "approved-fixture"),
    allowPromptReuse: !media.placeholder && (media.allowPromptReuse ?? false),
    placeholder: media.placeholder,
  };
}

/** Every discovery item: final media first, then placeholders (catalog order). */
export function showcaseFeed(): StudioShowcaseItem[] {
  const items = DISCOVERY_MEDIA.map(toItem);
  return [...items.filter((item) => !item.placeholder), ...items.filter((item) => item.placeholder)];
}

export function showcaseById(id: string): StudioShowcaseItem | null {
  return showcaseFeed().find((item) => item.id === id) ?? null;
}

/**
 * A section's tiles at its fixed size: real media tagged for the section
 * first, then placeholders. The count never shrinks for lack of media.
 */
export function sectionItems(items: readonly StudioShowcaseItem[], section: DiscoverySection, size: number = DISCOVERY_SECTION_SIZE[section]): StudioShowcaseItem[] {
  const tagged = items.filter((item) => item.sections.includes(section));
  return [...tagged.filter((item) => !item.placeholder), ...tagged.filter((item) => item.placeholder)].slice(0, size);
}

export function showcaseVideos(items: readonly StudioShowcaseItem[]): StudioShowcaseItem[] {
  return items.filter((item) => item.mediaType === "video");
}

export function showcaseImages(items: readonly StudioShowcaseItem[]): StudioShowcaseItem[] {
  return items.filter((item) => item.mediaType === "image");
}

export function showcaseForApp(items: readonly StudioShowcaseItem[], appId: string): StudioShowcaseItem[] {
  return items.filter((item) => item.appId === appId);
}

export function showcaseInCategory(items: readonly StudioShowcaseItem[], category: ShowcaseCategory | null): StudioShowcaseItem[] {
  return category ? items.filter((item) => item.categories.includes(category)) : [...items];
}

/** Categories with at least one item (placeholders count until R2 data is live). */
export function populatedCategories(
  items: readonly StudioShowcaseItem[],
  categories: readonly { id: ShowcaseCategory; label: string }[],
): { id: ShowcaseCategory; label: string; count: number }[] {
  return categories
    .map((category) => ({ ...category, count: items.filter((item) => item.categories.includes(category.id)).length }))
    .filter((category) => category.count > 0);
}

/* ── Remix / routing ─────────────────────────────────────────────────── */

export type ShowcaseTool = "image" | "edit" | "video" | "3d" | "music";

/** The canonical create tool that reproduces a workflow; null when none. */
export function workflowTool(workflow: LabWorkflowId | null): ShowcaseTool | null {
  switch (workflow) {
    case "text-to-image":
      return "image";
    case "edit-image":
    case "restyle":
    case "background":
      return "edit";
    case "text-to-video":
    case "image-to-video":
    case "reference-to-video":
      return "video";
    case "image-to-3d":
      return "3d";
    case "text-to-audio":
      return "music";
    default:
      return null;
  }
}

/**
 * Remix handoff over the existing create-route contract: tool + active
 * project + prompt (only when the item shares it). Model and settings are
 * not carried — the create route has no seed contract for them yet.
 */
export function remixHref(item: StudioShowcaseItem, projectId: string | null): string | null {
  if (!item.allowRemix) return null;
  const tool = workflowTool(item.workflow);
  if (!tool) return null;
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (item.allowPromptReuse && item.promptExcerpt) params.set("prompt", item.promptExcerpt);
  const query = params.toString();
  return `/studio/create/${tool}${query ? `?${query}` : ""}`;
}

export function creationHref(item: StudioShowcaseItem): string {
  return `/studio/explore/creation/${encodeURIComponent(item.id)}`;
}

export function provenanceLabel(item: StudioShowcaseItem): string {
  if (item.placeholder) return "Sample media — final showcase media will replace this slot";
  switch (item.sourceType) {
    case "owner-showcase":
      return "Ethen showcase";
    case "owner-output":
    case "project-output":
      return "From your project";
    case "licensed-showcase":
      return "Licensed showcase";
    case "approved-fixture":
      return "Studio sample";
  }
}

/** Display title; placeholders have none. */
export function itemTitle(item: StudioShowcaseItem): string {
  return item.title ?? (item.mediaType === "video" ? "Sample video" : "Sample image");
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function aspectLabel(aspect: LabAspectRatio): string {
  return aspect.replace("/", ":");
}

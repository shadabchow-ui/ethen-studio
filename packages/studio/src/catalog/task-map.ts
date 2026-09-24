/** Studio V5 M2 — the one FAL slug to canonical task authority. Pure, browser-safe. */
import type { TaskName } from "../contracts/tasks";

/** Bumped whenever the slug table changes; recorded on every projection. */
export const TASK_MAP_VERSION = "1.0.0" as const;

/** Browse-only reason for slugs with no canonical task. */
export const BLOCKED_UNMAPPED_TASK = "BLOCKED_UNMAPPED_TASK" as const;

export interface FalTaskMapping {
  /** Canonical tasks, in priority order. */
  tasks: readonly TaskName[];
  /** Static capability tags (schema-conditional tags are added by the source builder). */
  capabilityTags: readonly string[];
}

/**
 * Plan §M2 task table. Slugs absent here are fail-closed browse-only; the
 * exhaustiveness test forces them to be added explicitly instead of
 * silently passing through.
 */
export const FAL_TASK_MAP: Readonly<Record<string, FalTaskMapping>> = {
  "text-to-image": { tasks: ["image.generate"], capabilityTags: ["input:text"] },
  "image-generation": { tasks: ["image.generate"], capabilityTags: ["input:text"] },
  "image-to-image": { tasks: ["image.generate"], capabilityTags: ["input:image", "variation"] },
  "image-editing": { tasks: ["image.edit"], capabilityTags: ["input:image"] },
  "text-to-video": { tasks: ["video.generate"], capabilityTags: ["input:text"] },
  "image-to-video": { tasks: ["video.generate"], capabilityTags: ["input:image"] },
  "reference-to-video": { tasks: ["video.generate"], capabilityTags: ["input:image"] },
  "video-to-video": { tasks: ["video.edit"], capabilityTags: ["input:video"] },
  "video-editing": { tasks: ["video.edit"], capabilityTags: ["input:video"] },
  speech: { tasks: ["speech.synthesize"], capabilityTags: [] },
  "text-to-audio": { tasks: ["audio.generate"], capabilityTags: ["sfx"] },
  "music-generation": { tasks: ["music.generate"], capabilityTags: [] },
  "video-to-audio": { tasks: ["audio.generate"], capabilityTags: ["input:video"] },
  "3d-generation": { tasks: ["mesh.generate"], capabilityTags: ["input:text"] },
};

/** Slugs deliberately browse-only (no canonical task exists). */
export const BROWSE_ONLY_SLUGS: ReadonlySet<string> = new Set([
  "lora-training",
  "language-model",
  "unknown",
]);

export interface MappedFalTask {
  tasks: readonly TaskName[];
  capabilityTags: readonly string[];
  /** Set when the slug has no canonical task. */
  blockedCode: typeof BLOCKED_UNMAPPED_TASK | null;
}

/**
 * Map one FAL task slug. Unknown slugs fail closed to browse-only; use
 * isMappedFalSlug in the exhaustiveness test to force explicit coverage.
 */
export function mapFalSlug(slug: string): MappedFalTask {
  const entry = FAL_TASK_MAP[slug];
  if (entry) return { tasks: entry.tasks, capabilityTags: entry.capabilityTags, blockedCode: null };
  return { tasks: [], capabilityTags: [], blockedCode: BLOCKED_UNMAPPED_TASK };
}

/** True when the slug is explicitly covered (mapped or deliberately browse-only). */
export function isCoveredFalSlug(slug: string): boolean {
  return slug in FAL_TASK_MAP || BROWSE_ONLY_SLUGS.has(slug);
}

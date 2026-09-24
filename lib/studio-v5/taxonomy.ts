/**
 * Studio V4 lab — stable user-facing taxonomy over the live fal registry.
 *
 * The generated catalog is honest but inconsistent: over a third of endpoints
 * carry `task: "unknown"`, a share of families carry `category: "unknown"`,
 * `developer` is literally "unknown" on every row, and a handful of families
 * carry a category that contradicts their own endpoints (Veo 3.1 is filed
 * under `speech`). This module is the ONLY place that turns those source
 * labels into the product vocabulary the spec fixes:
 *
 *   IMAGE · VIDEO · AUDIO · 3D · EDIT · UTILITY / EFFECTS
 *
 * Two rules hold everywhere below:
 * - Normalize, never invent. A family whose endpoints say nothing keeps a
 *   derivation source of "catalog" or "modality" so expert surfaces can say
 *   where the label came from, and unknown stays unknown.
 * - EDIT is a capability, not a bucket. Editing families keep their media
 *   category (an image editor is still IMAGE) and additionally answer the
 *   Edit filter, which is what "preserve 3D/edit taxonomy" means without
 *   collapsing everything into image/video/audio.
 *
 * Pure and client-safe: no catalog import, no server-only dependency.
 */

/** Primary media category shown to users. */
export type LabCategory = "image" | "video" | "audio" | "3d" | "utility";

/** Where a family's category came from (surfaced in expert detail). */
export type LabCategorySource = "tasks" | "catalog" | "modality" | "unresolved";

/** Normalized task ids — the source task vocabulary, kept 1:1 and stable. */
export type LabTaskId =
  | "text-to-image"
  | "image-generation"
  | "image-to-image"
  | "image-editing"
  | "text-to-video"
  | "image-to-video"
  | "reference-to-video"
  | "video-to-video"
  | "video-editing"
  | "video-to-audio"
  | "text-to-audio"
  | "speech"
  | "music-generation"
  | "3d-generation"
  | "lora-training"
  | "language-model"
  | "unspecified";

export const LAB_CATEGORY_LABELS: Readonly<Record<LabCategory, string>> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  "3d": "3D",
  utility: "Utility",
};

interface TaskMeta {
  /** Short product label used in menus, chips and cards. */
  label: string;
  /** Category this task contributes to when deriving a family category. */
  category: LabCategory;
  /** True when the task is an editing/transformation capability. */
  edit: boolean;
  /** Input media the task consumes (drives Recommended in the switcher). */
  consumes: "none" | "image" | "video" | "audio";
}

const TASK_META: Readonly<Record<LabTaskId, TaskMeta>> = {
  "text-to-image": { label: "Text → Image", category: "image", edit: false, consumes: "none" },
  "image-generation": { label: "Image Generation", category: "image", edit: false, consumes: "none" },
  "image-to-image": { label: "Image → Image", category: "image", edit: true, consumes: "image" },
  "image-editing": { label: "Edit Image", category: "image", edit: true, consumes: "image" },
  "text-to-video": { label: "Text → Video", category: "video", edit: false, consumes: "none" },
  "image-to-video": { label: "Image → Video", category: "video", edit: false, consumes: "image" },
  "reference-to-video": { label: "Reference → Video", category: "video", edit: false, consumes: "image" },
  "video-to-video": { label: "Video → Video", category: "video", edit: true, consumes: "video" },
  "video-editing": { label: "Edit Video", category: "video", edit: true, consumes: "video" },
  "video-to-audio": { label: "Video → Audio", category: "audio", edit: false, consumes: "video" },
  "text-to-audio": { label: "Text → Audio", category: "audio", edit: false, consumes: "none" },
  speech: { label: "Speech", category: "audio", edit: false, consumes: "none" },
  "music-generation": { label: "Music", category: "audio", edit: false, consumes: "none" },
  "3d-generation": { label: "3D Generation", category: "3d", edit: false, consumes: "image" },
  "lora-training": { label: "Custom Training", category: "utility", edit: false, consumes: "image" },
  "language-model": { label: "Language", category: "utility", edit: false, consumes: "none" },
  unspecified: { label: "Unspecified", category: "utility", edit: false, consumes: "none" },
};

export const LAB_TASK_IDS = Object.keys(TASK_META) as LabTaskId[];

/** Source `task` strings map 1:1; anything unrecognized becomes `unspecified`. */
export function normalizeTaskId(raw: string | null | undefined): LabTaskId {
  const value = (raw ?? "").trim().toLowerCase();
  if (value && value !== "unknown" && value in TASK_META) return value as LabTaskId;
  return "unspecified";
}

export function taskLabel(task: LabTaskId): string {
  return TASK_META[task].label;
}

export function taskCategory(task: LabTaskId): LabCategory {
  return TASK_META[task].category;
}

export function isEditTask(task: LabTaskId): boolean {
  return TASK_META[task].edit;
}

export function taskConsumes(task: LabTaskId): TaskMeta["consumes"] {
  return TASK_META[task].consumes;
}

/** Tasks that belong to a category, in stable product order. */
export function tasksForCategory(category: LabCategory): LabTaskId[] {
  return LAB_TASK_IDS.filter((task) => TASK_META[task].category === category);
}

const CATALOG_CATEGORY_MAP: Readonly<Record<string, LabCategory>> = {
  image: "image",
  video: "video",
  audio: "audio",
  music: "audio",
  speech: "audio",
  "3d": "3d",
  utility: "utility",
  lora_training: "utility",
  language: "utility",
};

const MODALITY_MAP: Readonly<Record<string, LabCategory>> = {
  image: "image",
  video: "video",
  audio: "audio",
};

/** Deterministic tie-break when endpoint tasks are evenly split. */
const CATEGORY_PRIORITY: readonly LabCategory[] = ["3d", "video", "audio", "image", "utility"];

export interface CategoryDerivation {
  category: LabCategory;
  source: LabCategorySource;
}

/**
 * Category by weighted endpoint vote, then catalog category, then modality.
 *
 * The vote is what repairs the contradicted rows: a family whose endpoints
 * are image-to-video / reference-to-video / video-editing is VIDEO whatever
 * the source `category` column says. `utility` never wins the vote against a
 * media category, because a family that can also train a LoRA is still an
 * image or video family to a user.
 */
export function deriveCategory(input: {
  tasks: readonly LabTaskId[];
  catalogCategory?: string | null;
  modality?: string | null;
}): CategoryDerivation {
  const votes = new Map<LabCategory, number>();
  for (const task of input.tasks) {
    if (task === "unspecified") continue;
    const category = TASK_META[task].category;
    votes.set(category, (votes.get(category) ?? 0) + 1);
  }
  const mediaVotes = [...votes].filter(([category]) => category !== "utility");
  const pool = mediaVotes.length > 0 ? mediaVotes : [...votes];
  if (pool.length > 0) {
    pool.sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return CATEGORY_PRIORITY.indexOf(a[0]) - CATEGORY_PRIORITY.indexOf(b[0]);
    });
    return { category: pool[0][0], source: "tasks" };
  }
  const catalog = CATALOG_CATEGORY_MAP[(input.catalogCategory ?? "").toLowerCase()];
  if (catalog) return { category: catalog, source: "catalog" };
  const modality = MODALITY_MAP[(input.modality ?? "").toLowerCase()];
  if (modality) return { category: modality, source: "modality" };
  return { category: "utility", source: "unresolved" };
}

const ACRONYMS: Readonly<Record<string, string>> = {
  ai: "AI",
  "3d": "3D",
  hd: "HD",
  sd: "SD",
  tts: "TTS",
  stt: "STT",
  sdxl: "SDXL",
  lora: "LoRA",
  ugc: "UGC",
  vfx: "VFX",
  ltx: "LTX",
  xai: "xAI",
  gpt: "GPT",
  api: "API",
  hq: "HQ",
  pro: "Pro",
  max: "Max",
  mini: "Mini",
  lite: "Lite",
  // Proper-noun casing for vendors the source writes lower-case. Casing a
  // known brand correctly is normalization, not invented metadata.
  tripo3d: "Tripo3D",
  elevenlabs: "ElevenLabs",
  bytedance: "ByteDance",
  blackforestlabs: "Black Forest Labs",
  minimax: "MiniMax",
  openai: "OpenAI",
  rundiffusion: "RunDiffusion",
  imagineart: "ImagineArt",
  cassetteai: "CassetteAI",
  clarityai: "ClarityAI",
  playai: "PlayAI",
  hitem3d: "Hitem3D",
  veed: "VEED",
  nvidia: "NVIDIA",
};

/** The fal namespace prefix is plumbing, not a product name. */
const NAMESPACE_PREFIXES = ["fal-ai-", "falfam/"] as const;

/**
 * Product display name for a family slug.
 *
 * `falfam/fal-ai-kling-video-v2-6` → `Kling Video V2.6`. Version segments are
 * recombined (`v2`,`6` → `V2.6`) because the source splits them on hyphens,
 * which otherwise renders "V2 6".
 */
export function familyDisplayName(familyId: string): string {
  let slug = familyId;
  for (const prefix of NAMESPACE_PREFIXES) {
    if (slug.startsWith(prefix)) slug = slug.slice(prefix.length);
  }
  if (slug.startsWith("fal-ai-")) slug = slug.slice("fal-ai-".length);
  const segments = slug.split("-").filter(Boolean);
  const out: string[] = [];
  for (const segment of segments) {
    const version = /^v(\d+)$/.exec(segment);
    if (version) {
      out.push(`V${version[1]}`);
      continue;
    }
    const acronym = ACRONYMS[segment.toLowerCase()];
    if (acronym) {
      out.push(acronym);
      continue;
    }
    // `veo3` reads as a product plus a version, never as one word.
    const wordThenNumber = /^([a-z]+)(\d+)$/i.exec(segment);
    if (wordThenNumber && wordThenNumber[1].length > 2) {
      const word = wordThenNumber[1];
      out.push(
        (ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1)),
        wordThenNumber[2],
      );
      continue;
    }
    if (/^\d+[a-z]$/i.test(segment)) {
      out.push(segment.toUpperCase());
      continue;
    }
    out.push(segment.charAt(0).toUpperCase() + segment.slice(1));
  }
  // The source splits version numbers on hyphens ("v2","6" / "3","0"), so a
  // bare number that follows something already ending in a digit is a minor
  // version, not a separate word.
  const folded: string[] = [];
  for (const token of out) {
    const previous = folded[folded.length - 1];
    if (previous && /^\d+$/.test(token) && /\d$/.test(previous)) {
      folded[folded.length - 1] = `${previous}.${token}`;
      continue;
    }
    folded.push(token);
  }
  return folded.join(" ") || familyId;
}

/**
 * Developer from the source's `explore-link` clue (covers the sourced rows).
 * The `developer` column itself is "unknown" on every row, so claiming one
 * without a clue would be fabrication: callers render "Not published".
 */
export function developerFromClues(clues: readonly string[]): string | null {
  for (const clue of clues) {
    const value = clue.startsWith("explore-link:") ? clue.slice("explore-link:".length) : null;
    if (value && value !== "unknown") return familyDisplayName(value);
  }
  return null;
}

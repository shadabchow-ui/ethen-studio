import type { MediaModel, MediaMode, MediaModality, MediaCapability } from "./types";
import searchJson from "./generated/fal-catalog-search.json";
import {
  normalizeEndpointRow,
  searchEndpoints,
  type StudioEndpoint,
} from "./endpoint-registry";

export const MEDIA_MODELS: MediaModel[] = [
  // ─── Image ────────────────────────────────────────────────────────────────────
  {
    id: "sd-xl",
    name: "Stable Diffusion XL",
    displayName: "Stable Diffusion XL",
    provider: "Stability AI",
    modality: "image",
    tasks: ["Text to Image", "Image to Image", "Marketing", "Product"],
    maxOutput: "1024×1024",
    supportsFineTuning: false,
    estimatedCredits: 5,
    executionState: "contract_only",
    setupRequired: true,
  },
  {
    // STU-P0-01: current OpenAI image model line — gpt-image-1 (dall-e-3 retired).
    // Source: https://platform.openai.com/docs/guides/image-generation (2026-08-19).
    id: "gpt-image-1",
    name: "GPT Image 1",
    displayName: "GPT Image 1",
    provider: "OpenAI",
    modality: "image",
    tasks: ["Text to Image", "Marketing", "Product"],
    maxOutput: "1536×1024",
    supportsFineTuning: false,
    estimatedCredits: 8,
    executionState: "contract_only",
    setupRequired: true,
  },
  {
    id: "midjourney-v6",
    name: "Midjourney V6",
    displayName: "Midjourney V6",
    provider: "Midjourney",
    modality: "image",
    tasks: ["Text to Image", "Marketing", "Product", "Influencer"],
    maxOutput: "2048×2048",
    supportsFineTuning: true,
    estimatedCredits: 10,
    executionState: "contract_only",
    setupRequired: true,
  },
  // ─── Video ────────────────────────────────────────────────────────────────────
  {
    id: "generic-video-default",
    name: "Generic Text-to-Video",
    displayName: "Generic Text-to-Video",
    provider: "Generic Video",
    modality: "video",
    tasks: ["Text to Video", "Motion"],
    maxOutput: "not provided",
    supportsFineTuning: false,
    estimatedCredits: 25,
    executionState: "contract_only",
    setupRequired: true,
  },
  {
    id: "fal-ai/wan-i2v",
    name: "Wan I2V",
    displayName: "fal · wan-i2v",
    provider: "fal.ai",
    modality: "video",
    tasks: ["Image to Video"],
    maxOutput: "720p",
    supportsFineTuning: false,
    estimatedCredits: 18,
    executionState: "available",
    setupRequired: false,
  },
  // ─── Audio ────────────────────────────────────────────────────────────────────
  {
    id: "elevenlabs-tts",
    name: "ElevenLabs TTS",
    displayName: "ElevenLabs TTS",
    provider: "ElevenLabs",
    modality: "audio",
    tasks: ["Text to Speech", "Voiceover"],
    maxOutput: "N/A",
    supportsFineTuning: false,
    estimatedCredits: 3,
    executionState: "contract_only",
    setupRequired: true,
  },
  {
    id: "openai-tts",
    name: "OpenAI TTS",
    displayName: "OpenAI TTS",
    provider: "OpenAI",
    modality: "audio",
    tasks: ["Text to Speech", "Voiceover"],
    maxOutput: "N/A",
    supportsFineTuning: false,
    estimatedCredits: 2,
    executionState: "contract_only",
    setupRequired: true,
  },
  {
    id: "elevenlabs-voice-design",
    name: "ElevenLabs Voice Design",
    displayName: "ElevenLabs Voice Design",
    provider: "ElevenLabs",
    modality: "audio",
    tasks: ["Voice Change", "Voice Cloning"],
    maxOutput: "N/A",
    supportsFineTuning: true,
    estimatedCredits: 5,
    executionState: "contract_only",
    setupRequired: true,
  },
  // ─── Canvas ───────────────────────────────────────────────────────────────────
  {
    id: "ideogram",
    name: "Ideogram",
    displayName: "Ideogram",
    provider: "Ideogram",
    modality: "image",
    tasks: ["Text to Image", "Canvas", "Moodboard"],
    maxOutput: "1024×1024",
    supportsFineTuning: false,
    estimatedCredits: 6,
    executionState: "contract_only",
    setupRequired: true,
  },
  {
    id: "canva",
    name: "Canva Connect",
    displayName: "Canva Connect",
    provider: "Canva",
    modality: "image",
    tasks: ["Canvas", "Marketing"],
    maxOutput: "N/A",
    supportsFineTuning: false,
    estimatedCredits: 4,
    executionState: "contract_only",
    setupRequired: true,
  },
];

export function getModelsForMode(mode: MediaMode): MediaModel[] {
  return MEDIA_MODELS.filter((m) => m.tasks.some((t) =>
    t.toLowerCase().includes(mode) || mode === t.toLowerCase().replace(/\s+/g, "_"),
  ) || m.modality === modeToModality(mode));
}

export function getModelsForModality(modality: MediaModality): MediaModel[] {
  return MEDIA_MODELS.filter((m) => m.modality === modality);
}

export const getModelsByModality = getModelsForModality;

export function getDefaultModel(mode: MediaMode): MediaModel | undefined {
  const models = getModelsForMode(mode);
  return models[0];
}

export function getModelById(id: string): MediaModel | undefined {
  return MEDIA_MODELS.find((m) => m.id === id);
}

// ─── Shared catalog bridge (J03 + V3 Job 2) ───────────────────────────────────
// MEDIA_MODELS remain as compatibility aliases for runtime callers (jobs.ts:
// execution defaults unchanged until Job 3 re-qualifies). ACTIVE UI reads
// (composer, picker, models expert) use the registry selectors below: exact
// endpoint identities plus Auto, with honest support states. Nothing here is
// executable: only qualified routes execute (Job 3 gate).

/** Small tested adapter map: task slugs to display labels (projection parity). */
const TASK_LABELS: Readonly<Record<string, string>> = {
  "text-to-image": "Text to Image",
  "image-generation": "Image Generation",
  "image-editing": "Image Editing",
  "image-to-image": "Image to Image",
  "text-to-video": "Text to Video",
  "image-to-video": "Image to Video",
  "reference-to-video": "Reference to Video",
  "video-to-video": "Video to Video",
  "video-editing": "Video Editing",
  "3d-generation": "3D Generation",
  "lora-training": "LoRA Training",
  speech: "Speech",
  "text-to-audio": "Text to Audio",
  "music-generation": "Music Generation",
  "language-model": "Language Model",
  "video-to-audio": "Video to Audio",
};

function searchFamilies(): MediaModel[] {
  return (
    searchJson.records as unknown as {
      family_id: string;
      name: string;
      display_name: string;
      modality: string;
      task_ids: string[];
    }[]
  ).map((record) => ({
    id: record.family_id,
    provider: "fal.ai",
    name: record.name,
    displayName: record.display_name,
    modality: record.modality === "video" || record.modality === "audio" ? record.modality : "image",
    tasks: record.task_ids.map((task) => TASK_LABELS[task] ?? task),
    maxOutput: "not provided",
    supportsFineTuning: record.task_ids.includes("lora-training"),
    estimatedCredits: 0,
    executionState: "contract_only",
    setupRequired: true,
  }));
}

function searchEndpointsAsRegistry(): StudioEndpoint[] {
  const records = searchJson.records as unknown as {
    family_id: string;
    endpoints: { endpoint_id: string; task: string; disposition: string; schema_status: string }[];
  }[];
  return records.flatMap((record) =>
    record.endpoints.map((endpoint) =>
      normalizeEndpointRow(
        { endpoint_id: endpoint.endpoint_id, task: endpoint.task, disposition: endpoint.disposition },
        record.family_id,
        endpoint.schema_status === "supported"
          ? { endpoint_id: endpoint.endpoint_id, snapshot: "lazy", input: { required: [], properties: {} } }
          : null,
        endpoint.schema_status === "supported" ? null : "schema detail loads lazily",
      ),
    ),
  );
}

export function getCatalogMediaModels(): MediaModel[] {
  return searchFamilies();
}

export function getAllMediaModels(): MediaModel[] {
  const merged = new Map(MEDIA_MODELS.map((model) => [model.id, model]));
  for (const model of searchFamilies()) {
    if (!merged.has(model.id)) merged.set(model.id, model);
  }
  return [...merged.values()];
}

export function getCatalogModelById(id: string): MediaModel | undefined {
  return getModelById(id) ?? searchFamilies().find((model) => model.id === id);
}

// ─── Registry-backed selectors (V3 Job 2 — active UI reads) ─────────────────
// Small tested adapter maps (not hardcoded inventories): family/task labels
// for option display. Endpoints come from the generated registry.

export interface RegistryModelOption {
  /** "auto" or an exact endpoint id. */
  id: string;
  label: string;
  provider: string;
  capabilities: string[];
  disabled: boolean;
  unavailableReason?: string;
  recommended?: boolean;
}

export const AUTO_MODEL_OPTION: RegistryModelOption = {
  id: "auto",
  label: "Auto — Best match",
  provider: "Ethen",
  capabilities: [],
  disabled: false,
  recommended: true,
};

export function getRegistryModelOptions(filters?: {
  task?: string;
  disposition?: "eligible" | "quarantined" | "excluded";
}): RegistryModelOption[] {
  const endpoints = searchEndpoints(searchEndpointsAsRegistry(), {
    task: filters?.task,
    disposition: filters?.disposition,
  });
  const options = endpoints.map((endpoint) => {
    const blocked = endpoint.disposition !== "eligible" || endpoint.schema.status !== "supported";
    return {
      id: endpoint.endpointId,
      label: endpoint.familyId ?? endpoint.endpointId,
      provider: "fal.ai",
      capabilities: [...endpoint.capabilities.tasks],
      disabled: blocked,
      unavailableReason: blocked ? endpoint.supportReasons[0] : undefined,
    } satisfies RegistryModelOption;
  });
  options.sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.id.localeCompare(b.id));
  return [AUTO_MODEL_OPTION, ...options];
}

/** Registry default for UI: Auto (explicit choice overrides per surface). */
export function getRegistryAutoDefault(): RegistryModelOption {
  return AUTO_MODEL_OPTION;
}

function modeToModality(mode: MediaMode): MediaModality {
  if (mode === "video" || mode === "motion") return "video";
  if (mode === "audio") return "audio";
  return "image";
}

export function getDefaultCapability(mode: MediaMode): MediaCapability {
  switch (mode) {
    case "video":
    case "motion":
      return "text-to-video";
    case "audio":
      return "text-to-speech";
    default:
      return "text-to-image";
  }
}

// ─── Video Tab Capabilities ────────────────────────────────────────────────────

export const VIDEO_CAPABILITIES: { id: string; label: string; description: string; capability: string; mode: MediaMode }[] = [
  { id: "create-video", label: "Create Video", description: "Draft a text-to-video concept. No text-to-video adapter is wired yet.", capability: "text-to-video", mode: "video" },
  { id: "image-to-video", label: "Image to Video", description: "Animate a public image URL into a video", capability: "image-to-video", mode: "video" },
  { id: "cinema-mode", label: "Cinema Mode", description: "Cinematic video concepting. Real text-to-video runtime is not wired yet.", capability: "text-to-video", mode: "video" },
  { id: "product-animation", label: "Product Animation", description: "3D product showcase and animation", capability: "text-to-video", mode: "video" },
  { id: "ugc-video", label: "UGC Video", description: "User-generated content style video", capability: "image-to-video", mode: "video" },
  { id: "lipsync", label: "Lipsync", description: "Character lip-sync animation", capability: "text-to-video", mode: "video" },
  { id: "motion-graphics", label: "Motion Graphics", description: "Animated motion graphics and titles", capability: "text-to-video", mode: "video" },
  { id: "video-upscale", label: "Video Upscale", description: "Enhance video resolution and quality", capability: "image-to-video", mode: "video" },
];

// ─── Audio Tab Capabilities ────────────────────────────────────────────────────

export const AUDIO_CAPABILITIES: { id: string; label: string; description: string; capability: string; mode: MediaMode }[] = [
  { id: "voiceover", label: "Voiceover", description: "Generate professional voiceover from text", capability: "text-to-speech", mode: "audio" },
  { id: "voice-change", label: "Voice Change", description: "Transform and modify voice characteristics", capability: "voice-change", mode: "audio" },
  { id: "speech-translation", label: "Speech Translation", description: "Translate speech between languages", capability: "speech-translation", mode: "audio" },
  { id: "sound-effects", label: "Sound Effects", description: "Generate custom sound effects", capability: "sound-effects", mode: "audio" },
  { id: "music-bed", label: "Music Bed", description: "Generate background music and scores", capability: "music-bed", mode: "audio" },
  { id: "audio-for-video", label: "Audio for Video", description: "Generate audio synchronized to video", capability: "audio-for-video", mode: "audio" },
];

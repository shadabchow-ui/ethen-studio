/**
 * STUDIO_09 — canonical create tool registry.
 *
 * Eight tools, one framework. Image/edit/video/music/SFX/3D bind
 * qualified task registry tasks and real jobs; voice/transcribe are
 * typed extension slots that STUDIO_11 completes (the audio route
 * adapter overlays the executable binding; the 09 frame still renders
 * the slot copy when reached directly). Pure and browser-safe.
 */

import {
  CREATE_TOOL_IDS,
  type CreateExecutionBinding,
  type CreateToolDefinition,
  type CreateToolId,
} from "./types";

const TASK_BINDING: Record<string, CreateExecutionBinding> = {
  image: { kind: "task", task: "image.generate" },
  edit: { kind: "task", task: "image.edit" },
  video: { kind: "task", task: "video.generate" },
  music: { kind: "task", task: "music.generate" },
  sfx: { kind: "task", task: "audio.generate" },
  "3d": { kind: "task", task: "mesh.generate" },
  voice: { kind: "extension-slot", slot: "voice.synthesis", bound: false, completedBy: "STUDIO_11" },
  transcribe: { kind: "extension-slot", slot: "voice.transcription", bound: false, completedBy: "STUDIO_11" },
};

const DEFINITIONS: Record<CreateToolId, CreateToolDefinition> = {
  image: {
    id: "image",
    title: "Create image",
    route: "/studio/create/image",
    actionLabel: "Generate",
    inputVariant: "prompt",
    secondaryVariants: ["upload"],
    binding: TASK_BINDING.image!,
    referenceKinds: ["CHARACTER", "PRODUCT", "BRAND", "STYLE", "IMAGE", "MASK"],
    description: "Describe the image; generation runs as a durable job and the result stages below.",
  },
  edit: {
    id: "edit",
    title: "Edit image",
    route: "/studio/create/edit",
    actionLabel: "Generate",
    inputVariant: "prompt",
    secondaryVariants: ["upload"],
    binding: TASK_BINDING.edit!,
    referenceKinds: ["IMAGE", "MASK", "CHARACTER", "PRODUCT", "STYLE"],
    description: "Describe the edit; bind a source image and mask as references. Runs as a durable job.",
  },
  video: {
    id: "video",
    title: "Create video",
    route: "/studio/create/video",
    actionLabel: "Generate",
    inputVariant: "prompt",
    secondaryVariants: ["upload"],
    binding: TASK_BINDING.video!,
    referenceKinds: ["CHARACTER", "PRODUCT", "STYLE", "IMAGE", "START_FRAME", "END_FRAME"],
    description: "Describe the shot; one video job produces one shot and the result stages below.",
  },
  voice: {
    id: "voice",
    title: "Create voice",
    route: "/studio/create/voice",
    actionLabel: "Generate",
    inputVariant: "script",
    secondaryVariants: [],
    binding: TASK_BINDING.voice!,
    referenceKinds: [],
    description: "Script-to-speech with a separate voice identity and model. Batch voice arrives in the next milestone.",
  },
  music: {
    id: "music",
    title: "Create music",
    route: "/studio/create/music",
    actionLabel: "Generate",
    inputVariant: "prompt",
    secondaryVariants: [],
    binding: TASK_BINDING.music!,
    referenceKinds: ["STYLE"],
    description: "Describe the track; commercial and export rights are checked before delivery.",
  },
  sfx: {
    id: "sfx",
    title: "Create sound effect",
    route: "/studio/create/sfx",
    actionLabel: "Generate",
    inputVariant: "prompt",
    secondaryVariants: [],
    binding: TASK_BINDING.sfx!,
    referenceKinds: ["STYLE"],
    description: "Describe the sound; generation runs as a durable job and the result stages below.",
  },
  transcribe: {
    id: "transcribe",
    title: "Transcribe audio",
    route: "/studio/create/transcribe",
    actionLabel: "Transcribe",
    inputVariant: "upload",
    secondaryVariants: [],
    binding: TASK_BINDING.transcribe!,
    referenceKinds: [],
    description: "Upload audio to transcribe with timestamps. Batch transcription arrives in the next milestone.",
  },
  "3d": {
    id: "3d",
    title: "Create 3D model",
    route: "/studio/create/3d",
    actionLabel: "Generate",
    inputVariant: "prompt",
    secondaryVariants: ["upload"],
    binding: TASK_BINDING["3d"]!,
    referenceKinds: ["IMAGE", "STYLE"],
    description: "Describe the model; generation runs as a durable mesh job and the glb result stages below.",
  },
};

export function getCreateTool(id: string): CreateToolDefinition | null {
  if (!(CREATE_TOOL_IDS as readonly string[]).includes(id)) return null;
  return DEFINITIONS[id as CreateToolId];
}

export function listCreateTools(): readonly CreateToolDefinition[] {
  return CREATE_TOOL_IDS.map((id) => DEFINITIONS[id]);
}

export function isToolExecutable(tool: CreateToolDefinition): boolean {
  if (tool.binding.kind === "task") return true;
  return tool.binding.bound;
}

/** Honest unavailable reason for unbound extension slots; null when executable. */
export function toolUnavailableReason(tool: CreateToolDefinition): string | null {
  if (tool.binding.kind === "task") return null;
  if (tool.binding.bound) return null;
  return `${tool.title} is not available yet — batch audio arrives in the next milestone. Your script and settings are kept as a draft.`;
}

/** Task name for executable tools; null for unbound extension slots. */
export function toolTaskName(tool: CreateToolDefinition): string | null {
  return tool.binding.kind === "task" ? tool.binding.task : null;
}

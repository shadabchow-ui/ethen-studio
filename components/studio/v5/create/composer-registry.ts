/**
 * STUDIO_M3A — generator composer registry (pure, browser-safe).
 *
 * One registry keyed by generator tool id drives the one
 * GeneratorComposer: input variant + copy, action/busy labels, error
 * titles, estimate placement, the required-field map each composer
 * validates before estimate and submit, and the capability →
 * input/route mapping that binds dub/changer/edit/3d. Legacy project
 * task slugs stay external: their project routes one-hop redirect to
 * the create composer (M5 D1).
 */

export type GeneratorToolId =
  | "image"
  | "edit"
  | "video"
  | "voice"
  | "music"
  | "sfx"
  | "transcribe"
  | "dub"
  | "changer"
  | "3d";

export const GENERATOR_TOOL_IDS: readonly GeneratorToolId[] = [
  "image",
  "edit",
  "video",
  "voice",
  "music",
  "sfx",
  "transcribe",
  "dub",
  "changer",
  "3d",
];

export type GeneratorInputVariant = "prompt" | "script" | "upload";

export type RequiredFieldControl = "composer-input" | "inspector" | "model";

export interface GeneratorRequiredField {
  id: string;
  label: string;
  /** Where the input lives, or the default that stands in for it. */
  control: RequiredFieldControl;
  /** Documented default when the field has no visible control. */
  defaultNote: string | null;
  /** Submit tooltip while this field is empty. */
  emptyMessage: string;
}

export interface ComposerInputCopy {
  label: string;
  placeholder: string;
  rows: number;
  lockedPlaceholder: string;
  hint: string | null;
}

export interface ComposerToolEntry {
  id: GeneratorToolId;
  title: string;
  route: string;
  actionLabel: string;
  /** Busy submit label for staged audio tools; the create lane uses phase labels. */
  busyLabel: string | null;
  errorTitle: string;
  inputVariant: GeneratorInputVariant;
  input: ComposerInputCopy;
  /** Catalog task scope; null when the tool has no task binding. */
  task: string | null;
  requiredFields: readonly GeneratorRequiredField[];
  estimatePlacement: "row" | "below";
}

const PROMPT_INPUT: ComposerInputCopy = {
  label: "Prompt",
  placeholder: "Describe what you want to create…",
  rows: 2,
  lockedPlaceholder: "Describe what you want to create…",
  hint: null,
};

const SCRIPT_INPUT: ComposerInputCopy = {
  label: "Voice script",
  placeholder: "Write what the voice should say…",
  rows: 3,
  lockedPlaceholder: "Write what the voice should say…",
  hint: null,
};

const CREATE_SCRIPT_INPUT: ComposerInputCopy = {
  label: "Script",
  placeholder: "Write the script to speak…",
  rows: 4,
  lockedPlaceholder: "Write the script to speak…",
  hint: null,
};

const UPLOAD_INPUT: ComposerInputCopy = {
  label: "Source audio asset id",
  placeholder: "Project audio asset id (asset_…)",
  rows: 1,
  lockedPlaceholder: "Project audio asset id (asset_…)",
  hint: "Only project assets are accepted — uploads are scanned before they become sources.",
};

const CREATE_UPLOAD_INPUT: ComposerInputCopy = {
  label: "Source audio asset id",
  placeholder: "Source audio asset id (asset_…)",
  rows: 1,
  lockedPlaceholder: "Source audio asset id (asset_…)",
  hint: null,
};

const COMPOSER_TOOLS: Record<GeneratorToolId, ComposerToolEntry> = {
  image: {
    id: "image",
    title: "Create image",
    route: "/studio/create/image",
    actionLabel: "Generate",
    busyLabel: null,
    errorTitle: "Generation failed",
    inputVariant: "prompt",
    input: PROMPT_INPUT,
    task: "image.generate",
    requiredFields: [{ id: "prompt", label: "Prompt", control: "composer-input", defaultNote: null, emptyMessage: "Write a prompt first." }],
    estimatePlacement: "below",
  },
  edit: {
    id: "edit",
    title: "Edit image",
    route: "/studio/create/edit",
    actionLabel: "Generate",
    busyLabel: null,
    errorTitle: "Edit failed",
    inputVariant: "prompt",
    input: PROMPT_INPUT,
    task: "image.edit",
    requiredFields: [{ id: "prompt", label: "Prompt", control: "composer-input", defaultNote: null, emptyMessage: "Describe the edit first." }],
    estimatePlacement: "below",
  },
  video: {
    id: "video",
    title: "Create video",
    route: "/studio/create/video",
    actionLabel: "Generate",
    busyLabel: null,
    errorTitle: "Generation failed",
    inputVariant: "prompt",
    input: PROMPT_INPUT,
    task: "video.generate",
    requiredFields: [{ id: "prompt", label: "Prompt", control: "composer-input", defaultNote: null, emptyMessage: "Write a prompt first." }],
    estimatePlacement: "below",
  },
  voice: {
    id: "voice",
    title: "Create voice",
    route: "/studio/create/voice",
    actionLabel: "Generate",
    busyLabel: "Generating…",
    errorTitle: "Voice generation failed",
    inputVariant: "script",
    input: SCRIPT_INPUT,
    task: "speech.synthesize",
    requiredFields: [
      { id: "voiceIdentityId", label: "Voice identity", control: "inspector", defaultNote: null, emptyMessage: "Select a voice identity first." },
      { id: "script", label: "Script", control: "composer-input", defaultNote: null, emptyMessage: "Write a script first." },
    ],
    estimatePlacement: "row",
  },
  music: {
    id: "music",
    title: "Create music",
    route: "/studio/create/music",
    actionLabel: "Generate",
    busyLabel: null,
    errorTitle: "Generation failed",
    inputVariant: "prompt",
    input: PROMPT_INPUT,
    task: "music.generate",
    requiredFields: [{ id: "prompt", label: "Prompt", control: "composer-input", defaultNote: null, emptyMessage: "Write a prompt first." }],
    estimatePlacement: "below",
  },
  sfx: {
    id: "sfx",
    title: "Create sound effect",
    route: "/studio/create/sfx",
    actionLabel: "Generate",
    busyLabel: null,
    errorTitle: "Generation failed",
    inputVariant: "prompt",
    input: PROMPT_INPUT,
    task: "audio.generate",
    requiredFields: [{ id: "prompt", label: "Prompt", control: "composer-input", defaultNote: null, emptyMessage: "Write a prompt first." }],
    estimatePlacement: "below",
  },
  transcribe: {
    id: "transcribe",
    title: "Transcribe audio",
    route: "/studio/create/transcribe",
    actionLabel: "Transcribe",
    busyLabel: "Transcribing…",
    errorTitle: "Transcription failed",
    inputVariant: "upload",
    input: UPLOAD_INPUT,
    task: "speech.transcribe",
    requiredFields: [
      { id: "sourceAssetId", label: "Source audio asset", control: "composer-input", defaultNote: null, emptyMessage: "Select a source asset first." },
      { id: "language", label: "Transcript language", control: "inspector", defaultNote: "Auto-detect.", emptyMessage: "Pick a transcript language." },
      { id: "speakers", label: "Speaker count", control: "inspector", defaultNote: "Auto-detect.", emptyMessage: "Pick a speaker count." },
    ],
    estimatePlacement: "row",
  },
  dub: {
    id: "dub",
    title: "Dub audio",
    route: "/studio/create/dub",
    actionLabel: "Start dub",
    busyLabel: "Dubbing…",
    errorTitle: "Dubbing stage failed",
    inputVariant: "upload",
    input: UPLOAD_INPUT,
    task: "speech.transcribe",
    requiredFields: [
      { id: "sourceAssetId", label: "Source audio asset", control: "composer-input", defaultNote: null, emptyMessage: "Select a source asset first." },
      { id: "sourceLanguage", label: "Dub source language", control: "inspector", defaultNote: "Auto-detect.", emptyMessage: "Pick a source language." },
      { id: "targetLanguage", label: "Dub target language", control: "inspector", defaultNote: "Spanish.", emptyMessage: "Pick a target language." },
    ],
    estimatePlacement: "row",
  },
  changer: {
    id: "changer",
    title: "Change voice",
    route: "/studio/create/changer",
    actionLabel: "Transform",
    busyLabel: "Transforming…",
    errorTitle: "Voice change failed",
    inputVariant: "upload",
    input: UPLOAD_INPUT,
    task: "audio.transform",
    requiredFields: [
      { id: "voiceIdentityId", label: "Target voice", control: "inspector", defaultNote: null, emptyMessage: "Select a target voice first." },
      { id: "sourceAssetId", label: "Source audio asset", control: "composer-input", defaultNote: null, emptyMessage: "Select a source asset first." },
    ],
    estimatePlacement: "row",
  },
  "3d": {
    id: "3d",
    title: "Create 3D model",
    route: "/studio/create/3d",
    actionLabel: "Generate",
    busyLabel: null,
    errorTitle: "3D generation failed",
    inputVariant: "prompt",
    input: PROMPT_INPUT,
    task: "mesh.generate",
    requiredFields: [{ id: "prompt", label: "Prompt", control: "composer-input", defaultNote: null, emptyMessage: "Describe the model first." }],
    estimatePlacement: "below",
  },
};

/** Input copy the legacy create frame uses for its script/upload variants. */
export const LEGACY_CREATE_INPUT: Record<"script" | "upload", ComposerInputCopy> = {
  script: CREATE_SCRIPT_INPUT,
  upload: CREATE_UPLOAD_INPUT,
};

export function isGeneratorToolId(value: string): value is GeneratorToolId {
  return (GENERATOR_TOOL_IDS as readonly string[]).includes(value);
}

export function getComposerTool(id: string): ComposerToolEntry | null {
  if (!isGeneratorToolId(id)) return null;
  return COMPOSER_TOOLS[id];
}

export function listComposerTools(): readonly ComposerToolEntry[] {
  return GENERATOR_TOOL_IDS.map((id) => COMPOSER_TOOLS[id]);
}

/** Total lookup for statically known generator tool ids. */
export function composerToolFor(id: GeneratorToolId): ComposerToolEntry {
  return COMPOSER_TOOLS[id];
}

export type RequiredFieldValue = string | null;

/**
 * Required fields still missing a value. Text values must be
 * non-blank; identity values must be non-null. Fields with a
 * documented default are satisfied by that default.
 */
export function missingRequiredFields(
  toolId: GeneratorToolId,
  values: Readonly<Record<string, RequiredFieldValue>>,
): readonly GeneratorRequiredField[] {
  const entry = COMPOSER_TOOLS[toolId];
  return entry.requiredFields.filter((field) => {
    if (field.defaultNote !== null) return false;
    const value = values[field.id];
    if (value === null || value === undefined) return true;
    return value.trim().length === 0;
  });
}

/**
 * Submit tooltip: the first missing required field wins, so the
 * composer names exactly what to provide before estimate and submit.
 */
export function submitTitleFor(entry: ComposerToolEntry, missing: readonly GeneratorRequiredField[]): string {
  return missing.length > 0 ? (missing[0]?.emptyMessage ?? entry.actionLabel) : entry.actionLabel;
}

export type CapabilityBindingStatus = "bound" | "external" | "unbound";

export interface CapabilityRoute {
  capability: string;
  status: CapabilityBindingStatus;
  /** Generator tool id when bound; the external surface id otherwise. */
  toolId: GeneratorToolId | "edit-image" | "3d";
  /** Create route, project route template, or null when unbound. */
  route: string | null;
  inputVariant: GeneratorInputVariant;
  reason: string | null;
}

const CAPABILITY_ROUTES: Record<string, CapabilityRoute> = {
  "image.generate": { capability: "image.generate", status: "bound", toolId: "image", route: "/studio/create/image", inputVariant: "prompt", reason: null },
  "image.edit": { capability: "image.edit", status: "bound", toolId: "edit", route: "/studio/create/edit", inputVariant: "prompt", reason: null },
  "mesh.generate": { capability: "mesh.generate", status: "bound", toolId: "3d", route: "/studio/create/3d", inputVariant: "prompt", reason: null },
  "video.generate": { capability: "video.generate", status: "bound", toolId: "video", route: "/studio/create/video", inputVariant: "prompt", reason: null },
  "music.generate": { capability: "music.generate", status: "bound", toolId: "music", route: "/studio/create/music", inputVariant: "prompt", reason: null },
  "audio.generate": { capability: "audio.generate", status: "bound", toolId: "sfx", route: "/studio/create/sfx", inputVariant: "prompt", reason: null },
  "speech.synthesize": { capability: "speech.synthesize", status: "bound", toolId: "voice", route: "/studio/create/voice", inputVariant: "script", reason: null },
  "speech.transcribe": { capability: "speech.transcribe", status: "bound", toolId: "transcribe", route: "/studio/create/transcribe", inputVariant: "upload", reason: null },
  "text.translate": { capability: "text.translate", status: "bound", toolId: "dub", route: "/studio/create/dub", inputVariant: "upload", reason: "Dubbing stage; the dub composer owns the source input." },
  "speech.align": { capability: "speech.align", status: "bound", toolId: "dub", route: "/studio/create/dub", inputVariant: "upload", reason: "Dubbing stage; the dub composer owns the source input." },
  "audio.transform": { capability: "audio.transform", status: "bound", toolId: "changer", route: "/studio/create/changer", inputVariant: "upload", reason: "Dub reuses this task for its mix stage; the changer owns the direct transform." },
  "text-to-image": { capability: "text-to-image", status: "external", toolId: "image", route: "/studio/projects/[projectId]/create/image", inputVariant: "prompt", reason: "Legacy project slug; the project route one-hop redirects to the create composer." },
  "image-editing": { capability: "image-editing", status: "external", toolId: "edit-image", route: "/studio/projects/[projectId]/edit/image", inputVariant: "upload", reason: "Legacy project slug; the project route one-hop redirects to the create composer." },
  "text-to-video": { capability: "text-to-video", status: "external", toolId: "video", route: "/studio/projects/[projectId]/create/video", inputVariant: "prompt", reason: "Legacy project slug; the project route one-hop redirects to the create composer." },
};

/**
 * Capability → input/route mapping. Unknown capabilities return null —
 * never a guessed route.
 */
export function capabilityRouteFor(capability: string): CapabilityRoute | null {
  const direct = CAPABILITY_ROUTES[capability];
  if (direct) return direct;
  if (capability === "3d" || capability.startsWith("3d.")) {
    return {
      capability,
      status: "bound",
      toolId: "3d",
      route: "/studio/create/3d",
      inputVariant: "prompt",
      reason: null,
    };
  }
  return null;
}

/** Resolve a capability route template against a project scope. */
export function capabilityHref(binding: CapabilityRoute, projectId: string | null): string | null {
  if (!binding.route) return null;
  const scoped = binding.route.replace("[projectId]", projectId ?? "");
  if (!projectId) return scoped;
  const separator = scoped.includes("?") ? "&" : "?";
  return `${scoped}${separator}projectId=${encodeURIComponent(projectId)}`;
}

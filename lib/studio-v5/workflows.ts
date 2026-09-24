/**
 * Studio V4 lab — workflows, menu tasks, apps and recipes.
 *
 * Everything a user can click in this lab resolves through here to a real
 * lab-local create state (`/dev/ethen-studio-v4-lab/create?...`). There are no
 * placeholder destinations: a menu task, an app card and a recipe all produce
 * a concrete workflow + task filter + composition preset, and the create
 * surface reads that preset back out of the URL.
 */

import type { LabWorkflowId } from "./media-manifest";
import type { LabCategory, LabTaskId } from "./taxonomy";

export const LAB_ROUTE = "/dev/ethen-studio-v4-lab";

export interface LabWorkflowDefinition {
  id: LabWorkflowId;
  label: string;
  /** Category the workflow produces. */
  category: LabCategory;
  /** Registry tasks a model must offer to be compatible. */
  tasks: readonly LabTaskId[];
  /** Media the workflow expects the user to bring. */
  requires: "none" | "image" | "video" | "audio";
  /** Default output shape for the stage. */
  aspect: "16/9" | "9/16" | "1/1" | "4/5";
}

export const LAB_WORKFLOWS: Readonly<Record<LabWorkflowId, LabWorkflowDefinition>> = {
  "text-to-image": { id: "text-to-image", label: "Create image", category: "image", tasks: ["text-to-image", "image-generation"], requires: "none", aspect: "1/1" },
  "edit-image": { id: "edit-image", label: "Edit image", category: "image", tasks: ["image-editing", "image-to-image"], requires: "image", aspect: "1/1" },
  background: { id: "background", label: "Replace background", category: "image", tasks: ["image-editing", "image-to-image"], requires: "image", aspect: "1/1" },
  restyle: { id: "restyle", label: "Restyle", category: "image", tasks: ["image-to-image", "image-editing"], requires: "image", aspect: "1/1" },
  upscale: { id: "upscale", label: "Upscale", category: "image", tasks: ["image-editing", "video-editing"], requires: "image", aspect: "16/9" },
  "text-to-video": { id: "text-to-video", label: "Create video", category: "video", tasks: ["text-to-video"], requires: "none", aspect: "16/9" },
  "image-to-video": { id: "image-to-video", label: "Animate image", category: "video", tasks: ["image-to-video"], requires: "image", aspect: "16/9" },
  "reference-to-video": { id: "reference-to-video", label: "Reference → Video", category: "video", tasks: ["reference-to-video"], requires: "image", aspect: "9/16" },
  "edit-video": { id: "edit-video", label: "Edit video", category: "video", tasks: ["video-editing", "video-to-video"], requires: "video", aspect: "16/9" },
  "text-to-audio": { id: "text-to-audio", label: "Create audio", category: "audio", tasks: ["text-to-audio", "speech", "music-generation"], requires: "none", aspect: "16/9" },
  "image-to-3d": { id: "image-to-3d", label: "Create 3D", category: "3d", tasks: ["3d-generation"], requires: "image", aspect: "1/1" },
  compare: { id: "compare", label: "Compare models", category: "image", tasks: ["text-to-image", "image-generation", "text-to-video"], requires: "none", aspect: "1/1" },
};

export interface LabMenuTask {
  id: string;
  label: string;
  /** One honest line about what the task does in this lab. */
  detail: string;
  workflow: LabWorkflowId;
  /** Narrower registry task filter than the workflow default, when useful. */
  taskFilter?: readonly LabTaskId[];
}

export interface LabMenuColumn {
  label: string;
  tasks: readonly LabMenuTask[];
}

export type LabMenuId = "image" | "video" | "audio" | "3d" | "edit" | "apps";

export interface LabMenuDefinition {
  id: LabMenuId;
  label: string;
  /** Category whose live counts and library tab this menu points at. */
  category: LabCategory | null;
  columns: readonly LabMenuColumn[];
  /** Editorial placement feeding the featured-model column. */
  editorial: "menu-image" | "menu-video" | "menu-audio" | "menu-3d" | "menu-edit" | null;
}

const task = (
  id: string,
  label: string,
  detail: string,
  workflow: LabWorkflowId,
  taskFilter?: readonly LabTaskId[],
): LabMenuTask => ({ id, label, detail, workflow, taskFilter });

export const LAB_MENUS: readonly LabMenuDefinition[] = [
  {
    id: "image",
    label: "Image",
    category: "image",
    editorial: "menu-image",
    columns: [
      {
        label: "Create",
        tasks: [
          task("create-image", "Create image", "Prompt to still image", "text-to-image"),
          task("image-to-image", "Image → Image", "Re-generate from a source image", "edit-image", ["image-to-image"]),
          task("product-photography", "Product photography", "Product on a set, reference-led", "text-to-image"),
          task("character-image", "Character image", "Consistent character from references", "text-to-image"),
        ],
      },
      {
        label: "Edit",
        tasks: [
          task("edit-image", "Edit image", "Prompted edit over a source image", "edit-image", ["image-editing"]),
          task("background", "Background", "Remove or replace a background", "background"),
          task("restyle-image", "Restyle", "Apply a look to an existing image", "restyle"),
          task("upscale-image", "Upscale", "Increase resolution of a still", "upscale", ["image-editing"]),
        ],
      },
    ],
  },
  {
    id: "video",
    label: "Video",
    category: "video",
    editorial: "menu-video",
    columns: [
      {
        label: "Create",
        tasks: [
          task("create-video", "Create video", "Prompt to moving shot", "text-to-video"),
          task("image-to-video", "Image → Video", "Animate a still you already have", "image-to-video"),
          task("reference-to-video", "Reference → Video", "Carry a subject across a shot", "reference-to-video"),
          task("cinematic-shot", "Cinematic shot", "Camera-led shot, 16:9 stage", "text-to-video"),
        ],
      },
      {
        label: "Edit & transform",
        tasks: [
          task("edit-video", "Edit video", "Prompted edit over a clip", "edit-video", ["video-editing"]),
          task("video-to-video", "Video → Video", "Restyle or re-time a clip", "edit-video", ["video-to-video"]),
          task("upscale-video", "Upscale video", "Increase clip resolution", "upscale", ["video-editing"]),
          task("vertical-cutdown", "Vertical cutdown", "Reframe to 9:16 for social", "edit-video", ["video-editing"]),
        ],
      },
    ],
  },
  {
    id: "audio",
    label: "Audio",
    category: "audio",
    editorial: "menu-audio",
    columns: [
      {
        label: "Speech",
        tasks: [
          task("text-to-speech", "Text → Speech", "Read a script aloud", "text-to-audio", ["text-to-audio", "speech"]),
          task("speech-to-text", "Speech → Text", "Transcribe an audio track", "text-to-audio", ["speech"]),
        ],
      },
      {
        label: "Sound",
        tasks: [
          task("music", "Music", "Generate a music bed", "text-to-audio", ["music-generation"]),
          task("sound-design", "Sound design", "Generate an audio texture", "text-to-audio", ["text-to-audio"]),
        ],
      },
    ],
  },
  {
    id: "3d",
    label: "3D",
    category: "3d",
    editorial: "menu-3d",
    columns: [
      {
        label: "Create",
        tasks: [
          task("image-to-3d", "Image → 3D", "Build a mesh from one image", "image-to-3d"),
          task("text-to-3d", "Text → 3D", "Build a mesh from a prompt", "image-to-3d"),
        ],
      },
      {
        label: "Refine",
        tasks: [
          task("multiview-3d", "Multiview → 3D", "Combine several views into one mesh", "image-to-3d"),
          task("texture-3d", "Texture", "Generate surfaces for a mesh", "image-to-3d"),
        ],
      },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    category: null,
    editorial: "menu-edit",
    columns: [
      {
        label: "Image",
        tasks: [
          task("edit-image-2", "Edit image", "Prompted edit over a still", "edit-image", ["image-editing"]),
          task("background-2", "Background", "Remove or replace a background", "background"),
          task("relight", "Relight", "Change the lighting of a still", "restyle"),
          task("upscale-still", "Upscale", "Increase resolution of a still", "upscale", ["image-editing"]),
        ],
      },
      {
        label: "Video",
        tasks: [
          task("edit-clip", "Edit video", "Prompted edit over a clip", "edit-video", ["video-editing"]),
          task("restyle-clip", "Restyle video", "Apply a look to a clip", "edit-video", ["video-to-video"]),
          task("reframe-clip", "Reframe", "Change aspect ratio of a clip", "edit-video", ["video-editing"]),
          task("upscale-clip", "Upscale video", "Increase clip resolution", "upscale", ["video-editing"]),
        ],
      },
    ],
  },
  {
    id: "apps",
    label: "Apps",
    category: null,
    editorial: null,
    columns: [],
  },
];

export interface LabAppDefinition {
  id: string;
  name: string;
  /** Preset-descriptive, never a capability claim. */
  detail: string;
  mediaId: string;
  workflow: LabWorkflowId;
  aspect: "16/9" | "9/16" | "1/1" | "4/5";
  /** Reference chips the app preloads into the tray. */
  references: readonly string[];
  /** Extra inspector groups this app opens with. */
  inspector: readonly string[];
  /** Special create-surface mode. */
  mode?: "compare" | "canvas";
  /** Prompt the composer opens with. */
  prompt?: string;
}

export const LAB_APPS: readonly LabAppDefinition[] = [
  {
    id: "ai-influencer",
    name: "AI Influencer",
    detail: "Character reference locked, vertical stage, motion controls open",
    mediaId: "app-ai-influencer",
    workflow: "reference-to-video",
    aspect: "9/16",
    references: ["Character — Ava, front"],
    inspector: ["References", "Camera & motion", "Creative elements"],
    prompt: "Vertical talking-to-camera shot, soft window light, shallow depth",
  },
  {
    id: "marketing-studio",
    name: "Marketing Studio",
    detail: "Product reference, brand palette, square and vertical outputs",
    mediaId: "app-marketing-studio",
    workflow: "text-to-image",
    aspect: "1/1",
    references: ["Product — bottle, front", "Brand — palette"],
    inspector: ["Image", "References", "Creative elements"],
    prompt: "Product on a warm set, amber rim light, campaign still",
  },
  {
    id: "cinema",
    name: "Cinema",
    detail: "16:9 stage with camera and motion controls opened first",
    mediaId: "app-cinema",
    workflow: "text-to-video",
    aspect: "16/9",
    references: [],
    inspector: ["Video", "Camera & motion", "Output"],
    prompt: "Slow dolly through fog, anamorphic flare, night exterior",
  },
  {
    id: "compare-models",
    name: "Compare Models",
    detail: "One brief across two to four compatible models, side by side",
    mediaId: "app-compare-models",
    workflow: "compare",
    aspect: "1/1",
    references: [],
    inspector: ["Model", "Output"],
    mode: "compare",
    prompt: "Editorial portrait, hard key light, 85mm",
  },
  {
    id: "image-editor",
    name: "Image Editor",
    detail: "Source image on the stage, edit-capable models prefiltered",
    mediaId: "app-image-editor",
    workflow: "edit-image",
    aspect: "1/1",
    references: ["Source — portrait.jpg"],
    inspector: ["Image", "References", "Advanced"],
    prompt: "Replace the background with a dusk sky, keep the subject light",
  },
  {
    id: "canvas",
    name: "Canvas",
    detail: "Image → Edit → Animate → Upscale as one chained workspace",
    mediaId: "app-canvas",
    workflow: "image-to-video",
    aspect: "16/9",
    references: ["Step 1 — image"],
    inspector: ["Output", "Camera & motion"],
    mode: "canvas",
    prompt: "Chain: still, edit, animate, upscale",
  },
  {
    id: "characters",
    name: "Characters",
    detail: "Reusable character references applied to every generation",
    mediaId: "app-characters",
    workflow: "text-to-image",
    aspect: "4/5",
    references: ["Character — Ava, front", "Character — Ava, profile"],
    inspector: ["References", "Creative elements", "Image"],
    prompt: "Character sheet, neutral background, consistent face",
  },
  {
    id: "products",
    name: "Products",
    detail: "Reusable product references applied to every generation",
    mediaId: "app-products",
    workflow: "text-to-image",
    aspect: "1/1",
    references: ["Product — bottle, front", "Product — bottle, angle"],
    inspector: ["References", "Image", "Advanced"],
    prompt: "Product on seamless paper, studio softbox",
  },
  {
    id: "brands",
    name: "Brands",
    detail: "Palette and type rules carried into every generation",
    mediaId: "app-brands",
    workflow: "text-to-image",
    aspect: "16/9",
    references: ["Brand — palette", "Brand — type rule"],
    inspector: ["Creative elements", "Image", "Output"],
    prompt: "Campaign key visual in brand colours",
  },
];

export interface LabRecipe {
  id: string;
  name: string;
  detail: string;
  mediaId: string;
  workflow: LabWorkflowId;
  prompt: string;
  aspect: "16/9" | "9/16" | "1/1" | "4/5";
  quality: "fast" | "balanced" | "quality";
}

export const LAB_RECIPES: readonly LabRecipe[] = [
  { id: "product-commercial", name: "Product commercial", detail: "Product hero, 16:9, quality profile", mediaId: "recipe-product-commercial", workflow: "text-to-video", prompt: "Product commercial, rotating hero shot, warm studio light", aspect: "16/9", quality: "quality" },
  { id: "establishing-shot", name: "Cinematic establishing shot", detail: "Wide exterior, camera move", mediaId: "recipe-establishing-shot", workflow: "text-to-video", prompt: "Cinematic establishing shot, slow push in, dawn light", aspect: "16/9", quality: "quality" },
  { id: "ugc-testimonial", name: "UGC testimonial", detail: "Vertical, handheld, reference-led", mediaId: "recipe-ugc-testimonial", workflow: "reference-to-video", prompt: "Handheld testimonial to camera, natural light, vertical", aspect: "9/16", quality: "fast" },
  { id: "fashion-campaign", name: "Fashion campaign", detail: "Editorial stills, 4:5", mediaId: "recipe-fashion-campaign", workflow: "text-to-image", prompt: "Fashion editorial, hard light, clean background", aspect: "4/5", quality: "quality" },
  { id: "character-sheet", name: "Character sheet", detail: "Consistent character, multiple angles", mediaId: "recipe-character-sheet", workflow: "text-to-image", prompt: "Character sheet, three angles, neutral background", aspect: "1/1", quality: "balanced" },
  { id: "image-to-video", name: "Image → Video", detail: "Animate a still you already have", mediaId: "recipe-image-to-video", workflow: "image-to-video", prompt: "Gentle parallax, subtle camera drift", aspect: "16/9", quality: "balanced" },
  { id: "logo-reveal", name: "Logo reveal", detail: "Short motion beat, brand colours", mediaId: "recipe-logo-reveal", workflow: "text-to-video", prompt: "Logo reveal, light sweep, dark background", aspect: "16/9", quality: "fast" },
  { id: "social-vertical", name: "Social vertical ad", detail: "9:16, fast profile", mediaId: "recipe-social-vertical", workflow: "image-to-video", prompt: "Vertical product ad, quick cuts, bold light", aspect: "9/16", quality: "fast" },
  { id: "before-after", name: "Before / after", detail: "Edit pass over a source image", mediaId: "recipe-before-after", workflow: "edit-image", prompt: "Replace background, keep subject lighting", aspect: "1/1", quality: "balanced" },
  { id: "voiceover-cut", name: "Voiceover cut", detail: "Script to speech for a cut", mediaId: "recipe-voiceover-cut", workflow: "text-to-audio", prompt: "Warm narration, measured pace", aspect: "16/9", quality: "balanced" },
];

export function labAppById(id: string): LabAppDefinition | null {
  return LAB_APPS.find((app) => app.id === id) ?? null;
}

export function labRecipeById(id: string): LabRecipe | null {
  return LAB_RECIPES.find((recipe) => recipe.id === id) ?? null;
}

export function labMenuById(id: string): LabMenuDefinition | null {
  return LAB_MENUS.find((menu) => menu.id === id) ?? null;
}

export function labMenuTaskById(id: string): LabMenuTask | null {
  for (const menu of LAB_MENUS) {
    for (const column of menu.columns) {
      const found = column.tasks.find((entry) => entry.id === id);
      if (found) return found;
    }
  }
  return null;
}

/** Build the create-surface URL for any lab destination. */
export function labCreateHref(params: {
  workflow?: LabWorkflowId;
  task?: string;
  app?: string;
  recipe?: string;
  model?: string;
  endpoint?: string;
  mode?: "compare" | "canvas";
}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${LAB_ROUTE}/create?${query}` : `${LAB_ROUTE}/create`;
}

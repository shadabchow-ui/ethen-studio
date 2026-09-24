/**
 * STUDIO_14 — workbench UI types (client-safe: no server imports).
 * The pro frame edits timeline recipes; execution always goes through a
 * stored revision submitted to the V1 workbench routes.
 */

export type ProTool = "image" | "video" | "audio" | "dubbing" | "cinema";

export const PRO_TOOLS: readonly ProTool[] = ["image", "video", "audio", "dubbing", "cinema"];

export function isProTool(value: string): value is ProTool {
  return (PRO_TOOLS as readonly string[]).includes(value);
}

export interface WorkbenchClipView {
  clipId: string;
  trackId: string;
  assetId: string;
  version: number;
  sourceInTicks: number;
  durationTicks: number;
  timelineStartTicks: number;
  gainDb: number | null;
  captionTrackId: string | null;
  hasImageTransform: boolean;
}

export interface WorkbenchTrackView {
  trackId: string;
  kind: "video" | "audio" | "caption";
  clips: WorkbenchClipView[];
}

export interface WorkbenchCaptionCueView {
  cueId: string;
  startTicks: number;
  endTicks: number;
  text: string;
  speakerId: string | null;
}

export interface WorkbenchHeadView {
  timelineId: string;
  title: string;
  timescale: number;
  fpsNum: number;
  fpsDen: number;
  headRevision: number;
  lockedBy: string | null;
}

export interface WorkbenchRevisionView {
  revision: number;
  recipeHash: string;
  tracks: WorkbenchTrackView[];
  captionTracks: { captionTrackId: string; language: string; cues: WorkbenchCaptionCueView[] }[];
}

export interface WorkbenchRenderView {
  renderId: string;
  status: string;
  revision: number;
  revisionHash: string;
}

export interface CinemaSequenceView {
  sequenceId: string;
  title: string;
  status: string;
  fpsNum: number;
  fpsDen: number;
}

export interface CinemaSceneView {
  sceneId: string;
  sequenceId: string;
  orderIndex: number;
  title: string;
  status: string;
}

export interface CinemaShotView {
  shotId: string;
  sceneId: string;
  orderIndex: number;
  title: string;
  status: string;
  selectedTakeId: string | null;
  selectedTakeJobId: string | null;
}

export interface BinItemView {
  assetId: string;
  version: number;
  kind: string;
  label: string;
  durationMs: number | null;
  proxyUrl: string | null;
}

export type WorkbenchUiState =
  | { state: "loading" }
  | { state: "setup"; message: string; dependency?: string | null }
  | { state: "empty"; action: string }
  | { state: "error"; message: string }
  | { state: "ready" };

/** Studio V5 RC6 — human labels for every canonical task. Pure, browser-safe. */
import { TASK_NAMES, type TaskName } from "../contracts/tasks";

/** Product label for each canonical `<family>.<verb>` task. */
export const TASK_LABELS: Readonly<Record<TaskName, string>> = {
  "image.generate": "Image Generation",
  "image.edit": "Image Editing",
  "video.generate": "Video Generation",
  "video.edit": "Video Editing",
  "speech.synthesize": "Speech Synthesis",
  "speech.transcribe": "Speech Transcription",
  "speech.align": "Speech Alignment",
  "text.translate": "Text Translation",
  "music.generate": "Music Generation",
  "audio.generate": "Audio Generation",
  "audio.transform": "Audio Transformation",
  "mesh.generate": "3D Generation",
  "timeline.render": "Timeline Rendering",
  "agent.plan": "Agent Planning",
  "agent.investigate": "Agent Investigation",
  "agent.invoke": "Agent Invocation",
};

/** Label for endpoints the catalog could not classify. */
export const UNCLASSIFIED_TASK_LABEL = "Other / unclassified" as const;

/**
 * Label one task value from a catalog projection. Canonical tasks resolve
 * from TASK_LABELS; anything else (null, "unknown", future slugs) renders
 * as the explicit unclassified label instead of a raw token.
 */
export function taskLabel(task: string | null | undefined): string {
  if (task && (TASK_NAMES as readonly string[]).includes(task)) {
    return TASK_LABELS[task as TaskName];
  }
  return UNCLASSIFIED_TASK_LABEL;
}

/**
 * STUDIO_13 — Canvas starter templates (client-safe).
 * Small authoring graphs users can duplicate into their workspace. Every
 * template carries input/output bindings so Workflow→App stays available.
 */

import type { CanvasGraph, CanvasGraphNode, TypedPort } from "@ethen/studio-core/contracts";

function port(name: string, mediaType: string, required: boolean): TypedPort {
  return { name, mediaType, unit: null, required, label: `${name} (${mediaType})` };
}

function node(
  id: string,
  kind: CanvasGraphNode["kind"],
  label: string,
  task: string | null,
  inputs: TypedPort[],
  outputs: TypedPort[],
  params: Record<string, unknown> = {},
): CanvasGraphNode {
  return { id, kind, task, operator: kind === "task" ? null : "default", params, inputs, outputs, label, children: null, childEdges: null };
}

export interface CanvasTemplate {
  templateId: string;
  title: string;
  description: string;
  graph: CanvasGraph;
}

export const CANVAS_TEMPLATES: readonly CanvasTemplate[] = [
  {
    templateId: "image-variants",
    title: "Image variants",
    description: "One prompt, two styled image branches, one collected output.",
    graph: {
      nodes: [
        node("prompt", "input", "Prompt input", null, [], [port("prompt", "text", true)]),
        node("style-a", "task", "Style A", "image.generate", [port("prompt", "text", true)], [port("image", "image", true)]),
        node("style-b", "task", "Style B", "image.generate", [port("prompt", "text", true)], [port("image", "image", true)]),
        node("collect", "output", "Collected output", null, [port("image", "image", true)], []),
      ],
      edges: [
        { from: "prompt", fromPort: "prompt", to: "style-a", toPort: "prompt" },
        { from: "prompt", fromPort: "prompt", to: "style-b", toPort: "prompt" },
        { from: "style-a", fromPort: "image", to: "collect", toPort: "image" },
      ],
    },
  },
  {
    templateId: "video-storyboard",
    title: "Storyboard to shot",
    description: "Storyboard image plus narration script into one video shot.",
    graph: {
      nodes: [
        node("board", "input", "Storyboard input", null, [], [port("frame", "image", true)]),
        node("script", "input", "Script input", null, [], [port("script", "text", true)]),
        node("shot", "task", "Video shot", "video.generate", [port("frame", "image", true), port("script", "text", false)], [port("shot", "video", true)]),
        node("deliver", "output", "Shot output", null, [port("shot", "video", true)], []),
      ],
      edges: [
        { from: "board", fromPort: "frame", to: "shot", toPort: "frame" },
        { from: "script", fromPort: "script", to: "shot", toPort: "script" },
        { from: "shot", fromPort: "shot", to: "deliver", toPort: "shot" },
      ],
    },
  },
  {
    templateId: "voiceover-mix",
    title: "Voiceover mix",
    description: "Script to speech, then mixed under a music bed.",
    graph: {
      nodes: [
        node("script", "input", "Script input", null, [], [port("script", "text", true)]),
        node("voice", "task", "Voiceover", "speech.synthesize", [port("script", "text", true)], [port("voice", "speech", true)]),
        node("bed", "input", "Music bed input", null, [], [port("music", "music", true)]),
        node("mix", "transform", "Mix", null, [port("voice", "speech", true), port("music", "music", true)], [port("mix", "audio", true)]),
        node("deliver", "output", "Mixed output", null, [port("mix", "audio", true)], []),
      ],
      edges: [
        { from: "script", fromPort: "script", to: "voice", toPort: "script" },
        { from: "voice", fromPort: "voice", to: "mix", toPort: "voice" },
        { from: "bed", fromPort: "music", to: "mix", toPort: "music" },
        { from: "mix", fromPort: "mix", to: "deliver", toPort: "mix" },
      ],
    },
  },
];

export function canvasTemplate(templateId: string): CanvasTemplate | null {
  return CANVAS_TEMPLATES.find((entry) => entry.templateId === templateId) ?? null;
}

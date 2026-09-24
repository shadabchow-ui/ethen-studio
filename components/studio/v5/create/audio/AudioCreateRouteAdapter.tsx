/**
 * STUDIO_11 — audio route adapter (explicit 09 handoff).
 *
 * Binds /studio/create/[tool] for the audio tools: voice/transcribe
 * render the bound V5 audio frames (09 slots stay untouched), dub and
 * changer render the new upload-transform forms. Every other tool
 * delegates to the 09 CreateToolRouteAdapter unchanged.
 */

"use client";

import { CreateToolRouteAdapter } from "../CreateToolRouteAdapter";
import { getAudioTool } from "./audio-tool-bindings";
import { VoiceFrame } from "./VoiceFrame";
import { TranscribeFrame } from "./TranscribeFrame";
import { DubbingFrame } from "./DubbingFrame";
import { ChangerFrame } from "./ChangerFrame";

export function AudioCreateRouteAdapter({ toolId, projectId, initialPrompt = null }: { toolId: string; projectId: string | null; initialPrompt?: string | null }) {
  const audioTool = getAudioTool(toolId);
  if (!audioTool) {
    return <CreateToolRouteAdapter toolId={toolId} projectId={projectId} initialPrompt={initialPrompt} />;
  }
  const key = `${projectId}:${audioTool.id}`;
  switch (audioTool.id) {
    case "voice":
      return <VoiceFrame key={key} tool={audioTool} projectId={projectId} initialScript={initialPrompt} />;
    case "transcribe":
      return <TranscribeFrame key={key} tool={audioTool} projectId={projectId} />;
    case "dub":
      return <DubbingFrame key={key} tool={audioTool} projectId={projectId} />;
    case "changer":
      return <ChangerFrame key={key} tool={audioTool} projectId={projectId} />;
  }
}

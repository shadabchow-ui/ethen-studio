/**
 * STUDIO_09 — create route adapter.
 *
 * Binds /studio/create/[tool] to the V5 frame: transcribe uses the
 * upload-transform layout, every other tool uses the simple-create
 * frame. Unknown tools render a bounded error, never a guess.
 */

"use client";

import { StudioPageHeader } from "../shell/PageHeader";
import { StudioErrorState } from "../shell/states";
import { getCreateTool } from "./tool-definitions";
import { CreateToolFrame } from "./CreateToolFrame";
import { UploadTransformFrame } from "./UploadTransformFrame";

export function CreateToolRouteAdapter({ toolId, projectId, initialPrompt = null }: { toolId: string; projectId: string | null; initialPrompt?: string | null }) {
  const tool = getCreateTool(toolId);
  if (!tool) {
    return (
      <div className="mx-auto w-full max-w-[1200px] space-y-4 px-4 py-6">
        <StudioPageHeader
          eyebrow="CREATE"
          title="Unknown tool"
          description="This create tool does not exist."
          routeMarker="/studio/create/[tool]"
        />
        <StudioErrorState
          title="Unknown create tool"
          description={`“${toolId}” is not a Studio create tool. Image, edit, video, voice, music, SFX, transcribe, and 3D are available.`}
          secondaryLabel="Back to Studio home"
          secondaryHref="/studio"
          testId="create-unknown-tool"
        />
      </div>
    );
  }
  if (tool.id === "transcribe") {
    return <UploadTransformFrame key={`${projectId}:${tool.id}`} tool={tool} projectId={projectId} />;
  }
  return <CreateToolFrame key={`${projectId}:${tool.id}`} tool={tool} projectId={projectId} initialPrompt={initialPrompt} />;
}

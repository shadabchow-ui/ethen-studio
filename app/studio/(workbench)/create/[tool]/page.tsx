import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { GENERATOR_SURFACE_CLASS } from "@/components/studio/v5/create/generator-surface";
// STUDIO_11 handoff: audio adapter binds voice/transcribe slots and adds
// dub/changer; non-audio tools delegate to the 09 adapter unchanged.
import { AudioCreateRouteAdapter } from "@/components/studio/v5/create/audio/AudioCreateRouteAdapter";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "Create",
  description: "Simple creation tools in Ethen Studio.",
};

export default async function StudioCreateToolRoute({
  params,
  searchParams,
}: {
  params: Promise<{ tool: string }>;
  searchParams: Promise<{ projectId?: string; prompt?: string }>;
}) {
  const { tool } = await params;
  const query = await searchParams;
  const projectId = await resolvePageProjectId(query);
  const initialPrompt = typeof query.prompt === "string" && query.prompt.trim() ? query.prompt : null;
  return (
    <StudioShell dataSource="live" className={GENERATOR_SURFACE_CLASS}>
      <AudioCreateRouteAdapter toolId={tool} projectId={projectId} initialPrompt={initialPrompt} />
    </StudioShell>
  );
}

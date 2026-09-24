import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { CanvasRouteAdapter } from "@/components/studio/v5/canvas/CanvasRouteAdapter";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "Canvas Workspace",
  description: "First-class Canvas workspace: typed graph, compiled runs, and workflow apps.",
  alternates: {
    canonical: "/studio/workflows/[graphId]",
  },
};

/**
 * STUDIO_13 — first-class Canvas route. The certified /studio/canvas index
 * redirect stays untouched (j20 retires it after drain); the V5 workspace
 * lives here under /studio/workflows/[graphId].
 */
export default async function StudioCanvasWorkspaceRoute({
  params,
  searchParams,
}: {
  params: Promise<{ graphId: string }>;
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { graphId } = await params;
  const query = await searchParams;
  const projectId = await resolvePageProjectId(query);
  return (
    <StudioShell dataSource="live">
      <CanvasRouteAdapter graphId={graphId} projectId={projectId} />
    </StudioShell>
  );
}

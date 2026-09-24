import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { CanvasGraphsIndex } from "@/components/studio/v5/canvas/CanvasGraphsIndex";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "Canvas Workflows",
  description: "Dependency-aware incremental workflow runs over canonical Studio commands.",
  alternates: {
    canonical: "/studio/workflows",
  },
};

/** V5 M5 — the legacy workflows panel retired; this route serves the V5 Canvas index. */
export default async function StudioWorkflowsRoute({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const query = await searchParams;
  const projectId = await resolvePageProjectId(query);
  return (
    <StudioShell dataSource="live">
      <CanvasGraphsIndex projectId={projectId} />
    </StudioShell>
  );
}

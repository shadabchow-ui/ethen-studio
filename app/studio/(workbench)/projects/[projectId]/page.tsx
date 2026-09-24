import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { StudioPageFrame } from "@/components/studio/StudioPageFrame";
import { StudioProjectOverview } from "@/components/studio/StudioProjectWorkspace";

export const metadata: Metadata = {
  title: "Project workspace",
  description: "Project-scoped Studio workspace: create, assets, review and export.",
  alternates: {
    canonical: "/studio/projects",
  },
};

export default async function StudioProjectRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <StudioShell dataSource="live">
      <StudioPageFrame
        eyebrow="PROJECT"
        routeMarker="/studio/projects/[projectId]"
        title="Project workspace"
        description="Create, edit, review and export inside one durable project scope."
      >
        <div id="studio-project-main">
          <StudioProjectOverview projectId={projectId} />
        </div>
      </StudioPageFrame>
    </StudioShell>
  );
}

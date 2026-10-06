import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { StudioExportsPanel } from "@/components/studio/StudioExportsPanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  return {
    title: "Project export",
    description: "Verified export bytes with pinned provenance and review links.",
    alternates: {
      canonical: `/studio/projects/${projectId}/export`,
    },
  };
}

export default async function StudioProjectExportRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <StudioShell dataSource="live">
      <div id="studio-project-main">
        <StudioExportsPanel fixedProjectId={projectId} routeMarker="/studio/projects/[projectId]/export" />
      </div>
    </StudioShell>
  );
}

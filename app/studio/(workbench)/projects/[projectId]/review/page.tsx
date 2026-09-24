import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { StudioPageFrame } from "@/components/studio/StudioPageFrame";
import { StudioProjectTabs } from "@/components/studio/StudioProjectWorkspace";
import { StudioProjectReview } from "@/components/studio/StudioProjectReview";

export const metadata: Metadata = {
  title: "Project review",
  description: "Compare, accept, reject and comment on project outputs with job evidence.",
  alternates: {
    canonical: "/studio/projects",
  },
};

export default async function StudioProjectReviewRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <StudioShell dataSource="live">
      <StudioPageFrame
        eyebrow="REVIEW"
        routeMarker="/studio/projects/[projectId]/review"
        title="Review"
        description="Compare outputs, record verdicts with comments, and share consent-checked review links."
      >
        <div id="studio-project-main" className="space-y-4">
          <StudioProjectTabs projectId={projectId} active="review" />
          <StudioProjectReview projectId={projectId} />
        </div>
      </StudioPageFrame>
    </StudioShell>
  );
}

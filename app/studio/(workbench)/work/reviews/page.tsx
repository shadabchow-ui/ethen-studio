import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

import { ReviewsRouteAdapter } from "@/components/studio/v5/work/WorkRouteAdapters";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "Reviews",
  description: "Pinned review requests with comments, decisions, and public links.",
  alternates: {
    canonical: "/studio/work/reviews",
  },
};

/**
 * STUDIO_18 — first-class reviews route (project-scoped).
 */
export default async function StudioWorkReviewsRoute({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; reviewId?: string }>;
}) {
  const query = await searchParams;
  const projectId = await resolvePageProjectId(query);
  const reviewId = typeof query.reviewId === "string" && query.reviewId.trim() ? query.reviewId : null;
  return (
    <StudioShell dataSource="live">
      <div className={STUDIO_PAGE_CLASS}>
        <ReviewsRouteAdapter projectId={projectId} initialReviewId={reviewId} />
      </div>
    </StudioShell>
  );
}

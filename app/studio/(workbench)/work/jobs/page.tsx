import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

import { JobsRouteAdapter } from "@/components/studio/v5/work/WorkRouteAdapters";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Canonical jobs truth: stage, attempts, reconciliation, and charges.",
  alternates: {
    canonical: "/studio/work/jobs",
  },
};

/**
 * STUDIO_18 — first-class jobs-truth route. Legacy /studio/jobs stays
 * untouched (j20 retires it after drain).
 */
export default async function StudioWorkJobsRoute({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const query = await searchParams;
  const projectId = await resolvePageProjectId(query);
  return (
    <StudioShell dataSource="live">
      <div className={STUDIO_PAGE_CLASS}>
        <JobsRouteAdapter projectId={projectId} />
      </div>
    </StudioShell>
  );
}

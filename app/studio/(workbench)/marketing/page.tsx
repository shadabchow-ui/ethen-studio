import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

import { CompositesRouteAdapter } from "@/components/studio/v5/composites/CompositesRouteAdapter";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "Marketing Studio",
  description: "Brief-led product campaigns: versioned templates, pinned identities, format variants and review handoff.",
  alternates: {
    canonical: "/studio/marketing",
  },
};

/**
 * STUDIO_15 — first-class Marketing Studio route. The legacy
 * /studio/campaigns beta console stays untouched (j20 retires it after
 * drain); this route serves V5 campaigns over WorkflowApp compositions.
 */
export default async function StudioMarketingRoute({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const query = await searchParams;
  const projectId = await resolvePageProjectId(query);
  return (
    <StudioShell dataSource="live">
      <div className={STUDIO_PAGE_CLASS}>
        <CompositesRouteAdapter kind="marketing" projectId={projectId} />
      </div>
    </StudioShell>
  );
}

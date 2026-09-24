import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

import { CompositesRouteAdapter } from "@/components/studio/v5/composites/CompositesRouteAdapter";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "AI Influencer",
  description: "Character-led story episodes: pinned character and voice identities, format variants and review handoff.",
  alternates: {
    canonical: "/studio/influencer",
  },
};

/**
 * STUDIO_15 — first-class AI Influencer route. Versioned influencer
 * templates over the same composition kernel as Marketing Studio.
 */
export default async function StudioInfluencerRoute({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const query = await searchParams;
  const projectId = await resolvePageProjectId(query);
  return (
    <StudioShell dataSource="live">
      <div className={STUDIO_PAGE_CLASS}>
        <CompositesRouteAdapter kind="influencer" projectId={projectId} />
      </div>
    </StudioShell>
  );
}

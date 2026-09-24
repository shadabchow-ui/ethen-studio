import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { AgentRouteAdapter } from "@/components/studio/v5/agent/AgentRouteAdapter";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "Creative Agent",
  description: "Inspectable agent plans and Canvas edits: estimate, approval, receipt and operator-controlled execution tier.",
  alternates: {
    canonical: "/studio/agent",
  },
};

/**
 * STUDIO_17 — first-class Creative Agent route. The legacy /studio/director
 * console stays untouched (j20 retires it after drain); this route serves
 * V5 agent runs over typed Canvas patches.
 */
export default async function StudioAgentRoute({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const query = await searchParams;
  const projectId = await resolvePageProjectId(query);
  return (
    <StudioShell dataSource="live">
      <AgentRouteAdapter projectId={projectId} />
    </StudioShell>
  );
}

import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

import { NotificationsRouteAdapter } from "@/components/studio/v5/work/WorkRouteAdapters";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "Notifications",
  description: "In-app review and job notifications.",
  alternates: {
    canonical: "/studio/work/notifications",
  },
};

/**
 * STUDIO_18 — first-class notifications route (project-scoped).
 */
export default async function StudioWorkNotificationsRoute({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const query = await searchParams;
  const projectId = await resolvePageProjectId(query);
  return (
    <StudioShell dataSource="live">
      <div className={STUDIO_PAGE_CLASS}>
        <NotificationsRouteAdapter projectId={projectId} />
      </div>
    </StudioShell>
  );
}

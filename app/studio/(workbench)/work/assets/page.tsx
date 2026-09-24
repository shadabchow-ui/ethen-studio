import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

import { AssetsRouteAdapter } from "@/components/studio/v5/work/WorkRouteAdapters";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "Assets",
  description: "Project-scoped asset library with preview, selection, and review requests.",
  alternates: {
    canonical: "/studio/work/assets",
  },
};

/**
 * STUDIO_18 — first-class work assets route (project-scoped).
 */
export default async function StudioWorkAssetsRoute({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const query = await searchParams;
  const projectId = await resolvePageProjectId(query);
  return (
    <StudioShell dataSource="live">
      <div className={STUDIO_PAGE_CLASS}>
        <AssetsRouteAdapter projectId={projectId} />
      </div>
    </StudioShell>
  );
}

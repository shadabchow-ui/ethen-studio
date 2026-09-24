import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

import { CinemaRouteAdapter } from "@/components/studio/v5/workbench/CinemaRouteAdapter";
import { WorkbenchRouteAdapter } from "@/components/studio/v5/workbench/WorkbenchRouteAdapter";
import { isProTool } from "@/components/studio/v5/workbench/types";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "Pro Workbench",
  description: "Shared image, video, audio and dubbing pro frame with timeline and Cinema.",
  alternates: {
    canonical: "/studio/pro/[tool]",
  },
};

/**
 * STUDIO_14 — first-class pro workbench routes. image/video/audio/dubbing
 * share one pro frame; cinema serves the V5 editorial board. The legacy
 * /studio/cinema board stays untouched (j20 retires it after drain).
 */
export default async function StudioProWorkbenchRoute({
  params,
  searchParams,
}: {
  params: Promise<{ tool: string }>;
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { tool } = await params;
  const query = await searchParams;
  if (!isProTool(tool)) notFound();
  const projectId = await resolvePageProjectId(query);
  return (
    <StudioShell dataSource="live">
      <div className={STUDIO_PAGE_CLASS}>
        {tool === "cinema" ? (
          <CinemaRouteAdapter projectId={projectId} />
        ) : (
          <WorkbenchRouteAdapter tool={tool} projectId={projectId} />
        )}
      </div>
    </StudioShell>
  );
}

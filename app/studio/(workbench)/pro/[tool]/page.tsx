import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

import { CinemaRouteAdapter } from "@/components/studio/v5/workbench/CinemaRouteAdapter";
import { WorkbenchRouteAdapter } from "@/components/studio/v5/workbench/WorkbenchRouteAdapter";
import { isProTool } from "@/components/studio/v5/workbench/types";
import { studioProTitleForTool } from "@/components/studio/v5/shell/navigation-model";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

/**
 * RC5 — per-tool metadata derived from the nav registry, so the browser
 * tab and headers match sidebar/app naming (Cinema Studio, not the
 * generic "Pro Workbench").
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}): Promise<Metadata> {
  const { tool } = await params;
  const title = studioProTitleForTool(tool) ?? "Pro Workbench";
  return {
    title,
    description:
      tool === "cinema"
        ? "Cinema Studio editorial board: sequences, scenes and shots over canonical takes."
        : "Pro workbench: nondestructive timeline edits over pinned sources.",
    alternates: {
      canonical: `/studio/pro/${tool}`,
    },
  };
}

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

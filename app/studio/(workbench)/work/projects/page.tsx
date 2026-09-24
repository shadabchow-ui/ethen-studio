import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

import { ProjectsRouteAdapter } from "@/components/studio/v5/work/WorkRouteAdapters";

export const metadata: Metadata = {
  title: "Projects",
  description: "Studio work projects over the shared library frame.",
  alternates: {
    canonical: "/studio/work/projects",
  },
};

/**
 * STUDIO_18 — first-class work projects route. Legacy /studio/projects
 * stays untouched (j20 retires it after drain).
 */
export default function StudioWorkProjectsRoute() {
  return (
    <StudioShell dataSource="live">
      <div className={STUDIO_PAGE_CLASS}>
        <ProjectsRouteAdapter />
      </div>
    </StudioShell>
  );
}

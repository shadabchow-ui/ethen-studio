import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

import { StudioTemplatesRouteAdapter } from "@/components/studio/v5/discovery/TemplatesRouteAdapter";

export const metadata: Metadata = {
  title: "Templates",
  description: "Studio templates: curated starting points and personal templates.",
  alternates: {
    canonical: "/studio/templates",
  },
};

/**
 * STUDIO_08 — Templates route (new canonical discovery route).
 */
export default function StudioTemplatesRoute() {
  return (
    <StudioShell dataSource="live">
      <div className={STUDIO_PAGE_CLASS}>
        <StudioTemplatesRouteAdapter />
      </div>
    </StudioShell>
  );
}

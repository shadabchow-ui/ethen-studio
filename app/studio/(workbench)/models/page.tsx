import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

import { StudioModelsRouteAdapter } from "@/components/studio/v5/discovery/ModelsRouteAdapter";

export const metadata: Metadata = {
  title: "Models",
  description: "Studio model families with exact endpoints and honest availability.",
  alternates: {
    canonical: "/studio/models",
  },
};

/**
 * STUDIO_08 — Models route adapter. Family browse by default;
 * ?view=expert keeps the measured-health surface and its deep links.
 */
export default function StudioModelsRoute() {
  return (
    <StudioShell dataSource="live">
      <div className={STUDIO_PAGE_CLASS}>
        <StudioModelsRouteAdapter />
      </div>
    </StudioShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StudioModelsHealth } from "./StudioModelsHealth";
import { StudioPageHeader } from "../shell/PageHeader";
import { StudioProjectContextBar } from "../shell/ProjectContext";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import { StudioModelsBrowse } from "./ModelsBrowse";

/**
 * STUDIO_08 — Models route adapter. Family browse is the default;
 * ?view=expert shows measured provider health (M5: the legacy expert
 * panel retired; deep links keep working on the V5 health surface).
 * Project selection survives the switch.
 */
export function StudioModelsRouteAdapter() {
  const [expert, setExpert] = useState(false);

  useEffect(() => {
    const sync = () => setExpert(new URLSearchParams(window.location.search).get("view") === "expert");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return (
    <div className="space-y-6" data-testid="studio-models-route">
      <StudioProjectContextBar testId="studio-models-project-context" />
      <StudioPageHeader
        eyebrow="Models"
        routeMarker="/studio/models"
        title="Models"
        description={
          expert
            ? "Qualified execution routes with measured health, current quotes, and routing confidence."
            : "Model families with exact endpoints and honest availability. Cataloged is not executable."
        }
        actions={
          <Link
            href={expert ? "/studio/models" : "/studio/models?view=expert"}
            onClick={() => setExpert(!expert)}
            className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--studio-bg-selected)] ${STUDIO_FOCUS_RING_CLASS}`}
          >
            {expert ? "Family browse" : "Expert health"}
          </Link>
        }
      />
      {expert ? <StudioModelsHealth /> : <StudioModelsBrowse />}
    </div>
  );
}

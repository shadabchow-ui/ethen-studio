"use client";

import { StudioPageHeader } from "../shell/PageHeader";
import { StudioProjectContextBar } from "../shell/ProjectContext";
import { StudioTemplatesLibrary } from "./TemplatesLibrary";

/**
 * STUDIO_08 — Templates route adapter. Curated vs personal templates
 * with version and rights on every entry.
 */
export function StudioTemplatesRouteAdapter() {
  return (
    <div className="space-y-6" data-testid="studio-templates-route">
      <StudioProjectContextBar testId="studio-templates-project-context" />
      <StudioPageHeader
        eyebrow="Templates"
        routeMarker="/studio/templates"
        title="Templates"
        description="Curated starting points and your personal templates, with version and rights on every entry."
      />
      <StudioTemplatesLibrary />
    </div>
  );
}

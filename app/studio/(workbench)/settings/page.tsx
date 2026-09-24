import type { Metadata } from "next";

import { StudioSettingsClient } from "@/components/studio/StudioSettingsInner";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";

export const metadata: Metadata = {
  title: "Studio Settings",
  description: "Studio settings on the shared Ethen settings shell.",
  alternates: {
    canonical: "/studio/settings",
  },
};

/**
 * Studio V3 Job 1 — /studio/settings (authenticated workbench route).
 *
 * Inline settings page (not a dialog): the shared SettingsShell with Studio
 * section composition. Inherits the workbench chrome from the parent layout;
 * public review never reaches here (separate route group + guards).
 */
export default function StudioSettingsRoute() {
  return (
    <div className={STUDIO_PAGE_CLASS}>
      <StudioSettingsClient />
    </div>
  );
}

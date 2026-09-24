import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { STUDIO_PAGE_CLASS } from "@/components/studio/v5/shell/tokens";
import { StudioPageHeader } from "@/components/studio/v5/shell/PageHeader";

import { StudioAppsLibrary } from "@/components/studio/v5/discovery/AppsLibrary";

export const metadata: Metadata = {
  title: "Studio Apps",
  description: "Studio apps: purpose-built creative tools and compositions.",
  alternates: {
    canonical: "/studio/apps",
  },
};

/**
 * V5 M1 — canonical Apps destination (Owner Lock D, BUILD › Apps). Replaces
 * the earlier redirect to the home page: the sidebar links here, so it
 * renders the V5 Apps library instead of bouncing.
 */
export default function StudioAppsRoute() {
  return (
    <StudioShell dataSource="live">
      <div className={`${STUDIO_PAGE_CLASS} space-y-6`}>
        <StudioPageHeader eyebrow="Build" title="Apps" description="Purpose-built creative tools and compositions, with versions and rights on every entry." />
        <StudioAppsLibrary />
      </div>
    </StudioShell>
  );
}

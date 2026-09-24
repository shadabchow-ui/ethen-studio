import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { isLocalDesignPreviewEnabled } from "@/lib/platform/local-design-preview";
import {
  StudioAssetsPage,
  StudioJobsPage,
  StudioProjectsPage,
} from "@/components/studio/StudioStandalonePages";

export const metadata: Metadata = {
  title: "Studio Archive (Preview) — Ethen",
  description: "Archive-first studio composition for internal preview only.",
  robots: { index: false, follow: false },
};

/**
 * D15-J05 — Studio archive root, internal preview only.
 *
 * Archive-first order over LIVE studio state: selected work → artifact →
 * evidence → verification → export claim. Verification and export claims
 * come from live job and settlement states (verified/exportable vs pending
 * vs expired) — there is no universal export claim. "Phone state" in the
 * approved composition is the 390px viewport behaviour, carried by the
 * responsive sections below, not a separate surface. Public /studio keeps
 * redirecting; this page 404s without the local preview flag.
 */
export default function StudioArchivePage() {
  if (!isLocalDesignPreviewEnabled()) notFound();
  return (
    <StudioShell dataSource="live">
    <div className="flex flex-col gap-10">
      <section aria-label="Archive: selected work">
        <StudioProjectsPage routeMarker="/studio/archive" />
      </section>
      <section aria-label="Archive: artifact and evidence">
        <StudioAssetsPage routeMarker="/studio/archive" />
      </section>
      <section aria-label="Archive: verification and export">
        <StudioJobsPage routeMarker="/studio/archive" />
      </section>
    </div>
    </StudioShell>
  );
}

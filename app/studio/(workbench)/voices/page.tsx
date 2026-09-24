import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { StudioVoicesRouteAdapter } from "@/components/studio/v5/identity/VoicesRouteAdapter";

export const metadata: Metadata = {
  title: "Voices",
  description: "Studio voice identities with explicit rights and model compatibility.",
  alternates: {
    canonical: "/studio/voices",
  },
};

/**
 * STUDIO_10 — Voices route adapter. Identity-owned voice library;
 * navigation registration stays with STUDIO_08 (not modified here).
 */
export default function StudioVoicesRoute() {
  return (
    <StudioShell dataSource="live">
      <StudioVoicesRouteAdapter />
    </StudioShell>
  );
}

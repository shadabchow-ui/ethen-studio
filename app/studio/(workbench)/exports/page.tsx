import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { StudioExportsPanel } from "@/components/studio/StudioExportsPanel";

export const metadata: Metadata = {
  title: "Exports & Review",
  description: "Advertised V1 exports with verified bytes and pinned provenance; review links with expiry and revocation.",
  alternates: {
    canonical: "/studio/exports",
  },
};

export default function StudioExportsRoute() {
  return (
    <StudioShell dataSource="live">
      <StudioExportsPanel />
    </StudioShell>
  );
}

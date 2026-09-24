import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { StudioHome } from "@/components/studio/v5/discovery";

export const metadata: Metadata = {
  title: "Studio",
  description: "Ethen Studio home: create, resume, and recent work.",
  alternates: {
    canonical: "/studio",
  },
};

/**
 * STUDIO_08 — Home route adapter. The V5 home (original Studio composition
 * restored inside the shared console shell) replaces the sparse canonical
 * home at the same URL; project selection and deep links are preserved
 * through session recoverable identity.
 */
export default function StudioHomeRoute() {
  return (
    <StudioShell dataSource="live">
      <StudioHome />
    </StudioShell>
  );
}

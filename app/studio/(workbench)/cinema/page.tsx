import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { StudioCinemaBoard } from "@/components/studio/StudioCinemaBoard";

export const metadata: Metadata = {
  title: "Cinema",
  description: "Sequences, scenes, and shots over canonical takes on the V1 reference layer.",
  alternates: {
    canonical: "/studio/cinema",
  },
};

export default function StudioCinemaRoute() {
  return (
    <StudioShell dataSource="live">
      <StudioCinemaBoard />
    </StudioShell>
  );
}

import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { StudioIdentitiesRouteAdapter } from "@/components/studio/v5/identity/IdentitiesRouteAdapter";

export const metadata: Metadata = {
  title: "Identities",
  description: "Studio character, product, and brand identity libraries.",
};

/**
 * STUDIO_10 — identities route adapter: /studio/identities/{characters,products,brands}.
 */
export default async function StudioIdentitiesRoute({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return (
    <StudioShell dataSource="live">
      <StudioIdentitiesRouteAdapter kind={kind} />
    </StudioShell>
  );
}

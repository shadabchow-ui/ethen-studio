import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { CreationDetail } from "@/components/studio/v5/discovery/explore/CreationDetail";

export const metadata: Metadata = {
  title: "Creation",
  description: "A showcase creation in Ethen Studio, with Remix into the matching tool.",
};

/**
 * Canonical creation detail (hard navigation, refresh, shared links).
 * Soft navigation from Studio renders the intercepted overlay instead.
 */
export default async function StudioCreationRoute({ params }: { params: Promise<{ creationId: string }> }) {
  const { creationId } = await params;
  return (
    <StudioShell dataSource="live">
      <div className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <h1 tabIndex={-1} className="sr-only">
          Creation detail
        </h1>
        <CreationDetail creationId={decodeURIComponent(creationId)} mode="page" />
      </div>
    </StudioShell>
  );
}

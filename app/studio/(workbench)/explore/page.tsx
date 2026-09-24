import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";
import { ExploreRoute } from "@/components/studio/v5/discovery/explore/ExploreRoute";

export const metadata: Metadata = {
  title: "Explore",
  description: "Ethen Studio discovery: creations, apps, templates and models.",
  alternates: {
    canonical: "/studio/explore",
  },
};

/**
 * Discovery — Explore. The view lives in the query string (`?type=`,
 * `&category=`) so every view deep-links; one page, no duplicate routes.
 */
export default async function StudioExploreRoute({ searchParams }: { searchParams: Promise<{ type?: string; category?: string }> }) {
  const query = await searchParams;
  return (
    <StudioShell dataSource="live">
      <div className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <ExploreRoute type={typeof query.type === "string" ? query.type : undefined} category={typeof query.category === "string" ? query.category : undefined} />
      </div>
    </StudioShell>
  );
}

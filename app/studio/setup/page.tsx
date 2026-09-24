import type { Metadata } from "next";
import Link from "next/link";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { StudioPageFrame } from "@/components/studio/StudioPageFrame";

export const metadata: Metadata = {
  title: "Studio setup",
  description: "Local Studio tiers: UI-only, fixture runtime, and full stack. Env var names only.",
  alternates: {
    canonical: "/studio/setup",
  },
};

const TIERS = [
  {
    name: "UI-only",
    select: "Loopback lane (development + local auth bypass)",
    works: "Catalog, projects/assets libraries, identity reads, workflow graphs, every page renders.",
  },
  {
    name: "Fixture runtime",
    select: "UI-only lane plus STUDIO_LOCAL_RUNTIME=fixture (and ETHEN_STUDIO_ALLOW_PARTIAL=1 for PARTIAL models)",
    works: "Create to History, review lifecycle, notifications, exports, fixture cancel. Process-local memory; a restart wipes it.",
  },
  {
    name: "Full stack",
    select: "Local Supabase (35 studio migrations + seed) + Temporal + Studio worker",
    works: "Everything, durably. Needs Docker; otherwise this tier is unavailable.",
  },
] as const;

export default function StudioSetupRoute() {
  return (
    <StudioShell dataSource="live">
      <StudioPageFrame
        title="Studio setup"
        eyebrow="LOCAL RUNBOOK"
        description="Three local tiers. Env var names only — values stay in your shell."
        actions={<Link className="underline" href="/studio">Back to Studio home</Link>}
      >
        <div className="space-y-4">
          {TIERS.map((tier) => (
            <section
              key={tier.name}
              aria-label={`${tier.name} tier`}
              className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
            >
              <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{tier.name}</h2>
              <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">Select: </span>
                {tier.select}
              </p>
              <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">Works: </span>
                {tier.works}
              </p>
            </section>
          ))}
          <p className="text-[12.5px] text-[var(--text-secondary)]">
            Missing-service errors always report <code>SETUP_REQUIRED</code> with the dependency name —
            never retry them. Full runbook: <code>docs/LOCAL_STUDIO_TIERS.md</code>.{" "}
            <Link className="underline" href="/studio/work/assets">Open Assets</Link>
          </p>
        </div>
      </StudioPageFrame>
    </StudioShell>
  );
}

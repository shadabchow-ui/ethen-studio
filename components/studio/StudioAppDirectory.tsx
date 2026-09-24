import Link from "next/link";
import { StudioSectionHeader } from "./StudioSectionHeader";
import { APP_DIRECTORY_GROUPS } from "./studio-home-data";
import { getStudioCapabilityPresentation, studioCapabilityLabel } from "./studio-capability-truth";

export function StudioAppDirectory() {
  return (
    <section className="space-y-8 pb-4">
      <StudioSectionHeader title="Explore More Studio Apps" centered />
      <div className="grid gap-x-10 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
        {APP_DIRECTORY_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2.5">
            <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.items.map((item) => {
                const presentation = getStudioCapabilityPresentation(item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                const label = studioCapabilityLabel(item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-label={`${item.label}: ${label}`}
                    className="rounded-[7px] bg-[var(--bg-elevated)] px-3 py-2 text-[11.5px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-inset)] hover:text-[var(--text-primary)]"
                  >
                    {item.label}{presentation === "catalog_only" ? " · Catalog" : ""}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

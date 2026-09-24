"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStudioIdentity } from "../../studio-project-scope";
import { StudioLibraryFrame } from "../shell/LibraryFrame";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import { APP_STEPS, HomeArt, TEMPLATE_MOTIF } from "./StudioHomeCards";

export interface TemplateEntry {
  id: string;
  title: string;
  description: string;
  href: string;
  versionLabel: string;
  rightsLabel: string;
}

export const CURATED_TEMPLATES: readonly TemplateEntry[] = [
  { id: "product-shot", title: "Product shot", description: "Clean product render with direction controls.", href: "/studio/canvas?template=product-shot", versionLabel: "v1", rightsLabel: "Your generations" },
  { id: "scene-board", title: "Scene board", description: "Shot list with takes and review handoff.", href: "/studio/canvas?template=scene-board", versionLabel: "v1", rightsLabel: "Your generations" },
  { id: "voice-draft", title: "Voice draft", description: "Script to speech starter with voice slots.", href: "/studio/audio?template=voice-draft", versionLabel: "v1", rightsLabel: "Voice consent required" },
  { id: "campaign-starter", title: "Campaign starter", description: "Brief to first variants for review.", href: "/studio/canvas?template=campaign-starter", versionLabel: "v1", rightsLabel: "Review required" },
];

/**
 * STUDIO_08 — Templates library: curated templates vs personal
 * templates, with version and rights clear. Personal templates save
 * from Canvas once template publishing lands; the tab says so.
 */
export function StudioTemplatesLibrary() {
  const { identity } = useStudioIdentity();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [tab, setTab] = useState<"curated" | "personal">("curated");

  const entries = useMemo(() => {
    const all = tab === "curated" ? [...CURATED_TEMPLATES] : [];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((entry) => `${entry.title} ${entry.description}`.toLowerCase().includes(needle));
  }, [query, tab]);

  return (
    <div data-testid="studio-templates-library">
      <StudioLibraryFrame
        title="Templates"
        scopeLabel={identity.projectId ? "Project templates" : "No project selected"}
        searchValue={query}
        searchLabel="Search templates"
        onSearchChange={setQuery}
        view={view}
        onViewChange={setView}
        selectionCount={0}
        state={entries.length === 0 && tab === "personal" ? "empty" : "ready"}
        emptyProps={{
          title: "No personal templates yet",
          description:
            "Templates you save from Canvas will appear here. Saving arrives with Canvas template publishing; curated templates are ready now.",
          actionLabel: "Browse curated templates",
          onAction: () => setTab("curated"),
        }}
        switcher={[
          { id: "curated", label: "Curated", onSelect: () => setTab("curated") },
          { id: "personal", label: "Personal", onSelect: () => setTab("personal") },
        ]}
        activeSwitcherId={tab}
        filters={
          <span role="status" className="inline-flex min-h-[44px] items-center px-2 text-[12px] text-[var(--text-tertiary)]">
            {entries.length} templates · versions and rights shown on each entry
          </span>
        }
      >
        <ul className="grid grid-cols-[repeat(1,minmax(0,1fr))] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={entry.href}
                className={`group block min-h-[44px] overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-colors duration-150 hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] ${STUDIO_FOCUS_RING_CLASS}`}
              >
                <HomeArt motif={TEMPLATE_MOTIF[entry.id] ?? "template"} steps={APP_STEPS[entry.id]} className="aspect-[5/2] transition-[filter] duration-150 group-hover:brightness-125" />
                <span className="block px-4 pb-4 pt-3">
                  <span className="block text-[14px] font-medium text-[var(--text-primary)]">{entry.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-[1.45] text-[var(--text-tertiary)]">{entry.description}</span>
                  <span className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className="rounded-[5px] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]">
                      {entry.versionLabel}
                    </span>
                    <span className="rounded-[5px] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]">
                      {entry.rightsLabel}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </StudioLibraryFrame>
    </div>
  );
}

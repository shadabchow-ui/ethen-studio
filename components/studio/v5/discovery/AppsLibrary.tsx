"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStudioIdentity } from "../../studio-project-scope";
import { getStudioRouteForAppId } from "../../studio-navigation";
import { StudioLibraryFrame } from "../shell/LibraryFrame";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import { APP_MOTIF, APP_STEPS, HomeArt } from "./StudioHomeCards";

export interface AppEntry {
  id: string;
  title: string;
  description: string;
  href: string;
  versionLabel: string;
  rightsLabel: string;
  curated: boolean;
}

/**
 * Curated app entries resolve through the single app-id route map, so
 * destinations stay consistent with the rest of Studio. Personal apps
 * (private Workflow → App) arrive with Canvas; the workspace tab names
 * that honestly instead of faking entries.
 */
const CURATED_APPS: ReadonlyArray<Omit<AppEntry, "href" | "curated" | "id"> & { appId: string }> = [
  { appId: "create-image", title: "Create image", description: "Text to image on verified routes.", versionLabel: "Studio tool", rightsLabel: "Your generations" },
  { appId: "text-to-video", title: "Text to video", description: "Prompt video with duration control.", versionLabel: "Studio tool", rightsLabel: "Your generations" },
  { appId: "image-to-video", title: "Animate image", description: "Bring a still to life.", versionLabel: "Studio tool", rightsLabel: "Your generations" },
  { appId: "marketing-studio", title: "Marketing Studio", description: "Brief to campaign variants with review.", versionLabel: "Composition", rightsLabel: "Review required" },
  { appId: "ai-influencer", title: "AI Influencer", description: "Character-led content variants.", versionLabel: "Composition", rightsLabel: "Identity consent required" },
  { appId: "cinema-studio", title: "Cinema Studio", description: "Scene, shot and take boards.", versionLabel: "Composition", rightsLabel: "Your generations" },
];

export function curatedEntries(): AppEntry[] {
  return CURATED_APPS.map((app) => ({
    id: app.appId,
    title: app.title,
    description: app.description,
    href: getStudioRouteForAppId(app.appId),
    versionLabel: app.versionLabel,
    rightsLabel: app.rightsLabel,
    curated: true,
  }));
}

/**
 * STUDIO_08 — Apps library: curated Studio apps vs workspace apps,
 * with version and rights made clear on every entry.
 */
export function StudioAppsLibrary({ compact = false }: { compact?: boolean }) {
  const { identity } = useStudioIdentity();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [tab, setTab] = useState<"curated" | "workspace">("curated");

  const entries = useMemo(() => {
    const all = tab === "curated" ? curatedEntries() : [];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((entry) => `${entry.title} ${entry.description}`.toLowerCase().includes(needle));
  }, [query, tab]);

  return (
    <div data-testid="studio-apps-library">
      <StudioLibraryFrame
        title={compact ? "Explore apps" : "Apps"}
        scopeLabel={identity.projectId ? "Project apps" : "No project selected"}
        searchValue={query}
        searchLabel="Search apps"
        onSearchChange={setQuery}
        view={view}
        onViewChange={setView}
        selectionCount={0}
        state={entries.length === 0 && tab === "workspace" ? "empty" : "ready"}
        emptyProps={{
          title: "No workspace apps yet",
          description:
            "Private apps you publish from Canvas workflows will appear here. Publishing arrives with Canvas; curated Studio apps are ready now.",
          actionLabel: "Browse curated apps",
          onAction: () => setTab("curated"),
        }}
        switcher={[
          { id: "curated", label: "Curated", onSelect: () => setTab("curated") },
          { id: "workspace", label: "Workspace", onSelect: () => setTab("workspace") },
        ]}
        activeSwitcherId={tab}
        filters={
          <span role="status" className="inline-flex min-h-[44px] items-center px-2 text-[12px] text-[var(--text-tertiary)]">
            {entries.length} apps · versions and rights shown on each entry
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
                <HomeArt motif={APP_MOTIF[entry.id] ?? "canvas"} steps={APP_STEPS[entry.id]} className="aspect-[5/2] transition-[filter] duration-150 group-hover:brightness-125" />
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

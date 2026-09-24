"use client";

/**
 * Studio project tabs + overview.
 *
 * M5: the V3 project-scoped generation workspace retired — creation runs on
 * the canonical `/studio/create/[tool]?projectId=` routes. This module keeps
 * only the project tab bar and the overview cards, with generator links
 * pointed at the canonical runtime (no redirect hop for new clicks).
 */

import Link from "next/link";
import { useEffect } from "react";
import { useStudioIdentity } from "./studio-project-scope";
import { useDestinationFocus } from "./use-studio-workspace-hooks";

const PROJECT_TABS: Array<{ id: string; label: string; href: (projectId: string) => string }> = [
  { id: "overview", label: "Overview", href: (p) => `/studio/projects/${p}` },
  { id: "create-image", label: "Create", href: (p) => `/studio/create/image?projectId=${encodeURIComponent(p)}` },
  { id: "edit-image", label: "Edit", href: (p) => `/studio/create/edit?projectId=${encodeURIComponent(p)}` },
  { id: "create-video", label: "Video", href: (p) => `/studio/create/video?projectId=${encodeURIComponent(p)}` },
  { id: "assets", label: "Assets", href: (p) => `/studio/projects/${p}/assets` },
  { id: "characters", label: "Characters", href: (p) => `/studio/projects/${p}/characters` },
  { id: "products", label: "Products", href: (p) => `/studio/projects/${p}/products` },
  { id: "brands", label: "Brands", href: (p) => `/studio/projects/${p}/brands` },
  { id: "review", label: "Review", href: (p) => `/studio/projects/${p}/review` },
  { id: "export", label: "Export", href: (p) => `/studio/projects/${p}/export` },
];

export function StudioProjectTabs({ projectId, active }: { projectId: string; active: string }) {
  return (
    <nav aria-label="Project sections" className="flex flex-wrap gap-1">
      {PROJECT_TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href(projectId)}
          aria-current={tab.id === active ? "page" : undefined}
          className={`rounded-[8px] px-3 py-1.5 text-[12.5px] ${tab.id === active ? "bg-[var(--bg-elevated)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function StudioProjectOverview({ projectId }: { projectId: string }) {
  const { identity, selectProject } = useStudioIdentity();
  const focusDestination = useDestinationFocus();

  useEffect(() => {
    selectProject(projectId);
    focusDestination("studio-project-main");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const lastJob = identity?.lastJobByProject[projectId] ?? null;
  const lastView = identity?.lastViewByProject[projectId] ?? null;
  const resumeHref =
    lastView === "create-image"
      ? `/studio/create/image?projectId=${encodeURIComponent(projectId)}`
      : lastView === "edit-image"
        ? `/studio/create/edit?projectId=${encodeURIComponent(projectId)}`
        : lastView === "create-video"
          ? `/studio/create/video?projectId=${encodeURIComponent(projectId)}`
          : lastView
            ? `/studio/projects/${projectId}/${lastView}`
            : null;

  return (
    <div className="space-y-4">
      <StudioProjectTabs projectId={projectId} active="overview" />
      <div className="grid gap-4 md:grid-cols-3">
        <Link href={`/studio/create/image?projectId=${encodeURIComponent(projectId)}`} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 hover:border-[var(--accent)]">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Create image</p>
          <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">Text-to-image on verified routes with full inspector controls.</p>
        </Link>
        <Link href={`/studio/create/edit?projectId=${encodeURIComponent(projectId)}`} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 hover:border-[var(--accent)]">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Edit image</p>
          <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">Reference-driven editing with typed character, product and style refs.</p>
        </Link>
        <Link href={`/studio/create/video?projectId=${encodeURIComponent(projectId)}`} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 hover:border-[var(--accent)]">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Create video</p>
          <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">Text-to-video with duration, resolution and aspect controls.</p>
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Link href={`/studio/projects/${projectId}/assets`} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 hover:border-[var(--accent)]">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Assets</p>
          <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">Project library with open, download, provenance and actions.</p>
        </Link>
        <Link href={`/studio/projects/${projectId}/review`} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 hover:border-[var(--accent)]">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Review</p>
          <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">Compare, accept, reject and comment with job evidence.</p>
        </Link>
        <Link href={`/studio/projects/${projectId}/export`} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 hover:border-[var(--accent)]">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Export</p>
          <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">Verified bytes with pinned provenance and review links.</p>
        </Link>
      </div>
      <p className="text-[12px] text-[var(--text-tertiary)]" role="status">
        {lastJob ? <>Last job <span className="font-mono">{lastJob.slice(0, 8)}</span> · </> : "No jobs yet in this project · "}
        {lastView && resumeHref ? <Link className="underline" href={resumeHref}>Resume {lastView}</Link> : "pick a workflow above"}
      </p>
    </div>
  );
}

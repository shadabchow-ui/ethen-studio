/**
 * STUDIO_18 — projects library over the shared StudioLibraryFrame.
 * Authority §§4/17 library density + §41 project table: reusable
 * cards/table toggle, scoped search, keyboard-first rows, real
 * auth/empty/error/setup states. Read-only: projects are Platform
 * owned; Studio never forks them.
 */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StudioLibraryFrame } from "../shell/LibraryFrame";
import { StudioSetupState } from "../shell/StudioSetupState";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { WorkProjectView, WorkUiState } from "./types";

export function ProjectsLibrary({
  uiState,
  projects,
  onRetry,
}: {
  uiState: WorkUiState;
  projects: readonly WorkProjectView[];
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) || project.projectId.toLowerCase().includes(query),
    );
  }, [projects, search]);

  const state = uiState.state === "ready" && filtered.length === 0 ? "empty" : uiState.state;

  if (uiState.state === "setup") {
    return (
      <div data-testid="work-projects">
        <StudioSetupState
          what="Projects"
          dependency={uiState.dependency}
          primaryLabel="Back to Studio home"
          primaryHref="/studio"
          testId="work-projects-setup"
        />
      </div>
    );
  }

  return (
    <div data-testid="work-projects">
      <StudioLibraryFrame
        title="Projects"
        scopeLabel="Studio work · projects"
        searchValue={search}
        searchLabel="Search projects by name or id"
        onSearchChange={setSearch}
        view={view}
        onViewChange={setView}
        selectionCount={0}
        state={state}
        emptyProps={{
          title: "No projects match",
          description:
            projects.length === 0
              ? "You have no Platform projects yet. Create or join a project to start."
              : "No project matches this search. Clear it to see every project.",
          testId: "work-projects-empty",
        }}
        errorProps={
          uiState.state === "permission"
            ? {
                title: "Sign in required",
                description: uiState.message ?? "Project membership is required to list projects.",
                testId: "work-projects-permission",
              }
            : {
                title: "Projects unavailable",
                description: uiState.message ?? "Project listing failed.",
                retryLabel: "Retry",
                onRetry,
                testId: "work-projects-error",
              }
        }
        onRetry={onRetry}
      >
        {view === "cards" ? (
          <ul className="grid grid-cols-[repeat(1,minmax(0,1fr))] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]" aria-label="Projects">
            {filtered.map((project) => (
              <li key={project.projectId}>
                <Link
                  href={`/studio/work/assets?projectId=${encodeURIComponent(project.projectId)}`}
                  aria-label={`Resume work in ${project.name}`}
                  className={`block min-h-[44px] rounded-[16px] bg-[var(--bg-surface)] px-5 py-4 transition hover:bg-[var(--bg-elevated)] ${STUDIO_FOCUS_RING_CLASS}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-[14px] text-[var(--text-primary)]">{project.name}</h3>
                    {typeof project.assetCount === "number" ? (
                      <span className="shrink-0 rounded-full bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                        {project.assetCount} asset{project.assetCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </span>
                  <p className="mt-1 font-mono text-[10.5px] text-[var(--text-tertiary)]">{project.projectId}</p>
                  <p className="mt-1 text-[11.5px] text-[var(--text-secondary)]">
                    rev {project.revision} · Resume in assets →
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto rounded-[16px] bg-[var(--bg-surface)]">
            <table className="w-full min-w-[560px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[11px] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                  <th scope="col" className="px-4 py-3 font-medium">Project</th>
                  <th scope="col" className="px-4 py-3 font-medium">Revision</th>
                  <th scope="col" className="px-4 py-3 font-medium">Open</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((project) => (
                  <tr key={project.projectId} className="border-b border-[var(--border-default)] last:border-0">
                    <td className="px-4 py-3">
                      <span className="block truncate text-[var(--text-primary)]">{project.name}</span>
                      <span className="block truncate font-mono text-[10.5px] text-[var(--text-tertiary)]">
                        {project.projectId}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">rev {project.revision}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/studio/work/assets?projectId=${encodeURIComponent(project.projectId)}`}
                        className={`inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
                      >
                        Assets
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StudioLibraryFrame>
    </div>
  );
}

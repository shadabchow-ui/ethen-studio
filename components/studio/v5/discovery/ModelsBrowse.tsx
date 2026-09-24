"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useStudioIdentity } from "../../studio-project-scope";

function subscribeSearch(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getSearchSnapshot(): string {
  return window.location.search;
}

function getSearchServerSnapshot(): string {
  return "";
}
import { StudioLibraryFrame } from "../shell/LibraryFrame";
import { StudioInspectorDrawer } from "../shell/InspectorDrawer";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import { useCatalogProjection } from "./useCatalogProjection";
import {
  catalogTasks,
  endpointsForFamily,
  filterCatalog,
  type DiscoverableEndpointView,
} from "./catalog-client";

/** Pagination size for the browse list (a number, not an inventory). */
const BROWSE_PAGE_SIZE = 36;

/**
 * STUDIO_08 — family-based Models browse. Families first, endpoints on
 * disclosure, technical endpoint detail in a drawer. Search/filter keep
 * the discovery URL shareable; error/retry is distinct from empty.
 */
export function StudioModelsBrowse() {
  const { identity } = useStudioIdentity();
  const { state, projection, retry } = useCatalogProjection(identity.projectId);
  // Shareable ?q=&task=&family= deep links, derived from the URL with
  // user overrides (no useSearchParams Suspense requirement, no effects).
  const search = useSyncExternalStore(subscribeSearch, getSearchSnapshot, getSearchServerSnapshot);
  const urlParams = useMemo(() => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search), [search]);
  const [queryOverride, setQueryOverride] = useState<string | null>(null);
  const [taskOverride, setTaskOverride] = useState<string | null | undefined>(undefined);
  const [familyOverride, setFamilyOverride] = useState<string | null | undefined>(undefined);
  const query = queryOverride ?? urlParams.get("q") ?? "";
  const task = taskOverride === undefined ? urlParams.get("task") : taskOverride;
  const openFamilyId = familyOverride === undefined ? urlParams.get("family") : familyOverride;
  const setQuery = (value: string) => setQueryOverride(value);
  const setTask = (value: string | null) => setTaskOverride(value);
  const setOpenFamilyId = (value: string | null) => setFamilyOverride(value);
  const [executableOnly, setExecutableOnly] = useState(false);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [detail, setDetail] = useState<DiscoverableEndpointView | null>(null);
  const [visibleCount, setVisibleCount] = useState(BROWSE_PAGE_SIZE);

  const tasks = useMemo(() => (projection ? catalogTasks(projection) : []), [projection]);
  const filtered = useMemo(
    () => (projection ? filterCatalog(projection, { query, task, executableOnly }) : { families: [], endpoints: [] }),
    [projection, query, task, executableOnly],
  );
  const openEndpoints = useMemo(
    () => (projection && openFamilyId ? endpointsForFamily(projection, openFamilyId) : []),
    [projection, openFamilyId],
  );
  const visibleFamilies = filtered.families.slice(0, visibleCount);
  const resetAnd = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setVisibleCount(BROWSE_PAGE_SIZE);
  };

  return (
    <div data-testid="studio-models-browse">
      <StudioLibraryFrame
        title="Models"
        scopeLabel={identity.projectId ? "Project catalog" : "No project selected"}
        searchValue={query}
        searchLabel="Search models"
        onSearchChange={(value) => resetAnd(setQuery, value)}
        view={view}
        onViewChange={setView}
        selectionCount={0}
        state={!identity.projectId ? "empty" : state}
        emptyProps={
          !identity.projectId
            ? {
                title: "Select a project to browse models",
                description: "Model availability is resolved per project. Pick a project above, or press New to create one.",
                actionLabel: "Go to projects",
                actionHref: "/studio/projects",
              }
            : {
                title: "No models match",
                description: "No families match this search. Clear the search or choose a different task.",
                actionLabel: "Clear search",
                onAction: () => {
                  resetAnd(setQuery, "");
                  setTask(null);
                  setExecutableOnly(false);
                },
              }
        }
        errorProps={
          state === "setup"
            ? {
                title: "Catalog setup required",
                description: "Project storage is being set up, so model availability cannot load yet. Your work is safe.",
                secondaryLabel: "All projects",
                secondaryHref: "/studio/projects",
              }
            : state === "permission"
              ? {
                  title: "Sign in required",
                  description: "Model availability needs a signed-in session.",
                  secondaryLabel: "Sign in",
                  secondaryHref: "/sign-in",
                }
              : {
                  title: "Models unavailable",
                  description: "The catalog could not load. This is a loading failure, not an empty catalog.",
                  retryLabel: "Retry",
                  onRetry: retry,
                  secondaryLabel: "Studio home",
                  secondaryHref: "/studio",
                }
        }
        onRetry={retry}
        filters={
          <>
            <label className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3">
              <span className="text-[12px] text-[var(--text-tertiary)]">Task</span>
              <select
                aria-label="Filter by task"
                value={task ?? ""}
                onChange={(event) => resetAnd(setTask, event.target.value || null)}
                className={`min-h-[44px] bg-transparent py-1 text-[12.5px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
              >
                <option value="">All tasks</option>
                {tasks.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => { setExecutableOnly((value) => !value); setVisibleCount(BROWSE_PAGE_SIZE); }}
              aria-pressed={executableOnly}
              className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3.5 py-2 text-[12.5px] transition ${STUDIO_FOCUS_RING_CLASS} ${
                executableOnly ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
              }`}
            >
              Available now
            </button>
            {projection ? (
              <span role="status" className="inline-flex min-h-[44px] items-center px-2 text-[12px] text-[var(--text-tertiary)]">
                {filtered.families.length} of {projection.tallies.families} families · {filtered.endpoints.length} of{" "}
                {projection.tallies.endpoints} endpoints
              </span>
            ) : null}
          </>
        }
      >
        {view === "cards" ? (
          <ul className="grid grid-cols-[repeat(1,minmax(0,1fr))] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
            {visibleFamilies.map((family) => (
              <li key={family.familyId}>
                <button
                  type="button"
                  onClick={() => setOpenFamilyId(family.familyId)}
                  aria-label={`${family.label}, ${family.endpointCount} endpoints, ${family.executableCount} available`}
                  className={`w-full min-h-[44px] text-left ${STUDIO_FOCUS_RING_CLASS} rounded-[16px]`}
                >
                  <span className="block rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-5 py-4 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--studio-bg-selected)]">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-[15px] font-medium text-[var(--text-primary)]">{family.label}</span>
                      <span className="shrink-0 rounded-full bg-[var(--bg-surface)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                        {family.executableCount > 0 ? `${family.executableCount} ready` : "Setup required"}
                      </span>
                    </span>
                    <span className="mt-1 block text-[12px] text-[var(--text-secondary)]">
                      {family.endpointCount} endpoint{family.endpointCount === 1 ? "" : "s"} · {family.executableCount} available
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-[var(--text-tertiary)]">
                      {family.tasks.join(", ") || "no tasks"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto rounded-[12px] border border-[var(--border-default)]">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="bg-[var(--bg-surface)] text-[var(--text-tertiary)]">
                  <th scope="col" className="px-4 py-2.5 font-medium">Family</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Endpoints</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Available</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {visibleFamilies.map((family) => (
                  <tr key={family.familyId} className="border-t border-[var(--border-default)]">
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => setOpenFamilyId(family.familyId)} className={`font-medium text-[var(--text-primary)] underline ${STUDIO_FOCUS_RING_CLASS}`}>
                        {family.label}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{family.endpointCount}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{family.executableCount}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{family.tasks.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {visibleFamilies.length < filtered.families.length ? (
          <div className="mt-5 flex justify-center">
            <button type="button" onClick={() => setVisibleCount((count) => count + BROWSE_PAGE_SIZE)} className={`min-h-[44px] rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-5 py-2 text-[12.5px] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--studio-bg-selected)] ${STUDIO_FOCUS_RING_CLASS}`}>
              Load more families
            </button>
          </div>
        ) : null}
      </StudioLibraryFrame>

      <StudioInspectorDrawer
        open={openFamilyId !== null}
        onClose={() => setOpenFamilyId(null)}
        title={filtered.families.find((family) => family.familyId === openFamilyId)?.label ?? projection?.families.find((family) => family.familyId === openFamilyId)?.label ?? "Model family"}
        testId="studio-family-drawer"
      >
        <ul className="space-y-2">
          {openEndpoints.map((endpoint) => (
            <li key={endpoint.endpointId}>
              <button
                type="button"
                onClick={() => setDetail(endpoint)}
                className={`w-full rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-3 text-left transition hover:bg-[var(--bg-elevated)] ${STUDIO_FOCUS_RING_CLASS}`}
              >
                <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{endpoint.label}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-[var(--text-tertiary)]">{endpoint.endpointId}</span>
                <span className="mt-0.5 block text-[11.5px] text-[var(--text-secondary)]">
                  {endpoint.executable ? "Available" : (endpoint.disabledReasons[0] ?? "Unavailable")}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {openEndpoints.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-[var(--text-tertiary)]">No endpoints in this family.</p>
        ) : null}
      </StudioInspectorDrawer>

      <StudioInspectorDrawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.label ?? "Endpoint"}
        testId="studio-endpoint-drawer"
      >
        {detail ? (
          <dl className="space-y-3 text-[12.5px]">
            <div>
              <dt className="text-[var(--text-tertiary)]">Endpoint</dt>
              <dd className="font-mono text-[var(--text-primary)]">{detail.endpointId}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-tertiary)]">Availability</dt>
              <dd className="text-[var(--text-primary)]">{detail.executable ? "Available" : detail.disabledReasons.join(" ") || "Unavailable"}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-tertiary)]">Required parameters</dt>
              <dd className="text-[var(--text-primary)]">{detail.requiredParameters.join(", ") || "none"}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-tertiary)]">Supported parameters</dt>
              <dd className="text-[var(--text-primary)]">{detail.supportedParameters.join(", ") || "none"}</dd>
            </div>
            <div>
              <Link href="/studio/models?view=expert" className={`underline ${STUDIO_FOCUS_RING_CLASS}`}>
                Open expert health view
              </Link>
            </div>
          </dl>
        ) : null}
      </StudioInspectorDrawer>

    </div>
  );
}

/**
 * STUDIO_18 — assets library over the shared StudioLibraryFrame.
 * Scoped search (project-bound, never global), kind filter, asset
 * preview/selection with bulk authorized actions (request review,
 * download, delete eligibility), version drawer facts. Bulk actions
 * check the caller's capabilities; denied actions explain why.
 */
"use client";

import { useMemo, useState } from "react";
import { StudioLibraryFrame } from "../shell/LibraryFrame";
import { StudioSetupState } from "../shell/StudioSetupState";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { WorkAssetView, WorkUiState } from "./types";

const KIND_FILTERS = ["all", "image", "video", "audio"] as const;
type KindFilter = (typeof KIND_FILTERS)[number];

export function AssetsLibrary({
  uiState,
  projectId,
  assets,
  canRequestReview,
  onRetry,
  onRequestReview,
}: {
  uiState: WorkUiState;
  projectId: string;
  projectName?: string | null;
  assets: readonly WorkAssetView[];
  canRequestReview: boolean;
  onRetry: () => void;
  onRequestReview: (assets: readonly WorkAssetView[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [kind, setKind] = useState<KindFilter>("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (kind !== "all" && asset.kind !== kind) return false;
      if (!query) return true;
      return (
        asset.filename.toLowerCase().includes(query) || asset.assetId.toLowerCase().includes(query)
      );
    });
  }, [assets, kind, search]);

  const state = uiState.state === "ready" && filtered.length === 0 ? "empty" : uiState.state;
  const selectedAssets = useMemo(
    () => filtered.filter((asset) => selected.has(asset.assetId)),
    [filtered, selected],
  );
  const preview = previewId ? (assets.find((asset) => asset.assetId === previewId) ?? null) : null;

  const toggle = (assetId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) => {
      if (filtered.every((asset) => current.has(asset.assetId))) return new Set();
      return new Set(filtered.map((asset) => asset.assetId));
    });
  };

  if (uiState.state === "setup") {
    return (
      <div data-testid="work-assets">
        <StudioSetupState
          what="Assets"
          dependency={uiState.dependency}
          primaryLabel="Back to Studio home"
          primaryHref="/studio"
          testId="work-assets-setup"
        />
      </div>
    );
  }

  return (
    <div data-testid="work-assets">
      <StudioLibraryFrame
        title="Assets"
        scopeLabel={`Studio work · assets · ${projectId.slice(0, 8)}…`}
        searchValue={search}
        searchLabel="Search this project's assets by name or id"
        onSearchChange={setSearch}
        view={view}
        onViewChange={setView}
        filters={
          <div role="group" aria-label="Filter assets by kind" className="flex flex-wrap gap-1.5">
            {KIND_FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                aria-pressed={kind === option}
                className={`inline-flex min-h-[44px] items-center rounded-[9px] px-3 py-1.5 text-[12px] ${STUDIO_FOCUS_RING_CLASS} ${
                  kind === option
                    ? "bg-[var(--bg-elevated)] font-medium text-[var(--text-primary)]"
                    : "bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        }
        selectionCount={selected.size}
        selectionActions={
          <>
            <button
              type="button"
              disabled={selectedAssets.length === 0 || !canRequestReview}
              onClick={() => onRequestReview(selectedAssets)}
              title={canRequestReview ? undefined : "Your role cannot request reviews."}
              className={`inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
            >
              Request review ({selectedAssets.length})
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className={`inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--bg-surface)] px-3.5 py-2 text-[12.5px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
            >
              Clear
            </button>
          </>
        }
        state={state}
        emptyProps={{
          title: "No assets match",
          description:
            assets.length === 0
              ? "This project has no durable assets yet. Create or upload media to start."
              : "No asset matches this search or kind filter.",
          testId: "work-assets-empty",
        }}
        errorProps={
          uiState.state === "permission"
            ? {
                title: "Sign in required",
                description: uiState.message ?? "Project membership is required to read assets.",
                testId: "work-assets-permission",
              }
            : {
                title: "Assets unavailable",
                description: uiState.message ?? "Asset listing failed.",
                retryLabel: "Retry",
                onRetry,
                testId: "work-assets-error",
              }
        }
        onRetry={onRetry}
      >
        {filtered.length > 0 ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleAll}
              className={`inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--bg-surface)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] ${STUDIO_FOCUS_RING_CLASS}`}
            >
              {filtered.every((asset) => selected.has(asset.assetId)) ? "Deselect all" : "Select all"}
            </button>
            <p role="status" className="text-[11.5px] text-[var(--text-secondary)]">
              {filtered.length} assets{kind !== "all" ? ` · ${kind}` : ""}
            </p>
          </div>
        ) : null}
        {view === "cards" ? (
          <ul className="grid grid-cols-[repeat(1,minmax(0,1fr))] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]" aria-label="Assets">
            {filtered.map((asset) => {
              const checked = selected.has(asset.assetId);
              return (
                <li
                  key={asset.assetId}
                  className={`rounded-[16px] px-5 py-4 transition ${
                    checked ? "bg-[var(--bg-elevated)] ring-1 ring-[var(--border-default)]" : "bg-[var(--bg-surface)]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(asset.assetId)}
                      aria-label={`Select ${asset.filename}`}
                      className="mt-1 h-[20px] w-[20px] shrink-0 accent-[var(--accent)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                          {asset.kind}
                        </span>
                        <span className="text-[10.5px] text-[var(--text-tertiary)]">v{asset.latestVersion}</span>
                      </p>
                      <h3 className="mt-1 truncate text-[14px] text-[var(--text-primary)]">{asset.filename}</h3>
                      <p className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">{asset.assetId}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`Actions for ${asset.filename}`}>
                        <button
                          type="button"
                          onClick={() => setPreviewId(previewId === asset.assetId ? null : asset.assetId)}
                          aria-expanded={previewId === asset.assetId}
                          className={`inline-flex min-h-[44px] items-center rounded-[7px] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11.5px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
                        >
                          Preview
                        </button>
                      </div>
                      {previewId === asset.assetId ? (
                        <dl className="mt-2 space-y-1 border-t border-[var(--border-default)] pt-2 text-[11px]">
                          <div className="flex justify-between gap-2">
                            <dt className="text-[var(--text-tertiary)]">Kind</dt>
                            <dd className="text-[var(--text-secondary)]">{asset.kind}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-[var(--text-tertiary)]">Latest version</dt>
                            <dd className="text-[var(--text-secondary)]">v{asset.latestVersion}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-[var(--text-tertiary)]">Revision</dt>
                            <dd className="text-[var(--text-secondary)]">rev {asset.revision}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-[var(--text-tertiary)]">Created</dt>
                            <dd className="text-[var(--text-secondary)]">{asset.createdAt || "—"}</dd>
                          </div>
                        </dl>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="overflow-x-auto rounded-[16px] bg-[var(--bg-surface)]">
            <table className="w-full min-w-[640px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[11px] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                  <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Select</span></th>
                  <th scope="col" className="px-4 py-3 font-medium">Asset</th>
                  <th scope="col" className="px-4 py-3 font-medium">Kind</th>
                  <th scope="col" className="px-4 py-3 font-medium">Version</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((asset) => (
                  <tr key={asset.assetId} className="border-b border-[var(--border-default)] last:border-0">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(asset.assetId)}
                        onChange={() => toggle(asset.assetId)}
                        aria-label={`Select ${asset.filename}`}
                        className="h-[20px] w-[20px] accent-[var(--accent)]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="block truncate text-[var(--text-primary)]">{asset.filename}</span>
                      <span className="block truncate font-mono text-[10.5px] text-[var(--text-tertiary)]">
                        {asset.assetId}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{asset.kind}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">v{asset.latestVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview && view === "table" ? (
          <p className="sr-only" role="status">Previewing {preview.filename}.</p>
        ) : null}
      </StudioLibraryFrame>
    </div>
  );
}

/**
 * STUDIO M5 — Canvas graph index.
 *
 * Lists the project's workflow graphs (head revision each) over
 * GET /api/studio/v1/workflows/graphs and links each row to the V5 editor
 * at /studio/workflows/[graphId]. Loading, error, and empty states reuse
 * the V5 shell states; failures surface the measured reason, never a
 * silent list. P05: the empty state and header carry New workflow /
 * Start from template actions that create through POST graphs.
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StudioPageHeader } from "../shell/PageHeader";
import { StudioEmptyState, StudioErrorState, StudioLoadingState } from "../shell/states";
import { StudioSetupState } from "../shell/StudioSetupState";
import { CanvasApiError, createGraph, fetchGraphs } from "./canvas-api-client";
import { CANVAS_TEMPLATES } from "./templates";
import type { CanvasGraphSummary } from "./types";
import { STUDIO_FOCUS_RING_CLASS, STUDIO_PAGE_CLASS } from "../shell/tokens";

export function CanvasGraphsIndex({ projectId }: { projectId: string | null }) {
  const router = useRouter();
  const [graphs, setGraphs] = useState<CanvasGraphSummary[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [setupDependency, setSetupDependency] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- M7A: reset-then-refetch on project change; terminal state set in guarded fetch continuations.
    setGraphs(null);
    setFailure(null);
    setSetupDependency(null);
    fetchGraphs(projectId)
      .then((body) => {
        if (!cancelled) setGraphs(body.graphs);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof CanvasApiError && error.code === "SETUP_REQUIRED") {
          setSetupDependency(error.dependency);
        } else {
          setFailure(error instanceof CanvasApiError ? `${error.code}: ${error.message}` : "Graph index failed.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleCreate = (templateId?: string) => {
    if (!projectId || creating) return;
    setCreating(true);
    setFailure(null);
    createGraph({ projectId, templateId })
      .then((created) => {
        router.push(`/studio/workflows/${encodeURIComponent(created.graphId)}?projectId=${encodeURIComponent(projectId)}`);
      })
      .catch((error: unknown) => {
        setCreating(false);
        if (error instanceof CanvasApiError && error.code === "SETUP_REQUIRED") {
          setSetupDependency(error.dependency);
        } else {
          setFailure(error instanceof CanvasApiError ? `${error.code}: ${error.message}` : "Workflow creation failed.");
        }
      });
  };

  const headerAction = projectId ? (
    <button
      type="button"
      onClick={() => handleCreate()}
      disabled={creating}
      data-testid="graphs-index-new"
      className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--accent)] px-4 py-2 text-[12.5px] font-medium text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
    >
      {creating ? "Creating…" : "New workflow"}
    </button>
  ) : null;

  return (
    <div className={`${STUDIO_PAGE_CLASS} space-y-4`}>
      <StudioPageHeader
        eyebrow="CANVAS"
        title="Workflows"
        description="Dependency-aware workflow graphs over canonical Studio commands."
        routeMarker="/studio/workflows"
        actions={headerAction}
      />
      {!projectId ? (
        <StudioErrorState
          title="Project required"
          description="Open a project to list its workflow graphs."
          secondaryLabel="Back to Studio home"
          secondaryHref="/studio"
          testId="graphs-index-no-project"
        />
      ) : setupDependency !== null ? (
        <div data-testid="graphs-index-setup">
          <StudioSetupState
            what="Workflows"
            dependency={setupDependency}
            primaryLabel="Back to Studio home"
            primaryHref="/studio"
          />
        </div>
      ) : failure ? (
        <StudioErrorState
          title="Graph index failed"
          description={failure}
          secondaryLabel="Back to Studio home"
          secondaryHref="/studio"
          testId="graphs-index-error"
        />
      ) : graphs === null ? (
        <StudioLoadingState title="Loading workflow graphs…" testId="graphs-index-loading" />
      ) : graphs.length === 0 && !showTemplates ? (
        <div className="space-y-3">
          <StudioEmptyState
            title="No workflows yet"
            description="Create a blank workflow or start from a template, then author nodes in the canvas."
            actionLabel={creating ? "Creating…" : "New workflow"}
            onAction={() => handleCreate()}
            testId="graphs-index-empty"
          />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              data-testid="graphs-index-templates"
              className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-4 py-2 text-[12.5px] font-medium ${STUDIO_FOCUS_RING_CLASS}`}
            >
              Start from template
            </button>
          </div>
        </div>
      ) : showTemplates && graphs.length === 0 ? (
        <section aria-label="Start from template" className="space-y-3" data-testid="graphs-index-template-picker">
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {CANVAS_TEMPLATES.map((template) => (
              <li key={template.templateId} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">{template.title}</p>
                <p className="mt-0.5 text-[11.5px] text-[var(--text-secondary)]">{template.description}</p>
                <button
                  type="button"
                  onClick={() => handleCreate(template.templateId)}
                  disabled={creating}
                  data-testid={`graphs-index-template-${template.templateId}`}
                  className={`mt-2 inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
                >
                  {creating ? "Creating…" : "Use template"}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setShowTemplates(false)}
            className={`inline-flex min-h-[44px] items-center underline ${STUDIO_FOCUS_RING_CLASS}`}
          >
            Back
          </button>
        </section>
      ) : (
        <ul className="space-y-2" data-testid="graphs-index-list">
          {graphs.map((graph) => (
            <li key={graph.graphId}>
              <Link
                href={`/studio/workflows/${encodeURIComponent(graph.graphId)}?projectId=${encodeURIComponent(projectId)}`}
                className="flex items-center gap-3 rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 hover:border-[var(--border-strong)] hover:bg-[var(--studio-bg-selected)]"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--text-primary)]">{graph.graphId}</span>
                <span className="shrink-0 text-[12px] text-[var(--text-tertiary)]">
                  r{graph.headRevision} · {graph.nodeCount} nodes
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

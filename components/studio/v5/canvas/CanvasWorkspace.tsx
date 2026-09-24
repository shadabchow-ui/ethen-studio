/**
 * STUDIO_13 — Canvas workspace: approachable Ethen authoring surface.
 * VISUAL-03 — spatial plane with data-driven edges, compact nodes,
 * toolbar with zoom, list alternative, inspector, version menu + diff,
 * estimate bar, templates and Workflow→App creation. Desktop/tablet
 * authoring; narrow viewports get an inspect-and-handoff layout with
 * the same node test-ids, never a broken canvas or 375px authoring.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { StudioPageHeader } from "../shell/PageHeader";
import { StudioEmptyState, StudioErrorState } from "../shell/states";
import { StudioSetupState } from "../shell/StudioSetupState";
import { StudioInspectorDrawer } from "../shell/InspectorDrawer";
import { STUDIO_FOCUS_RING_CLASS, STUDIO_PAGE_CLASS } from "../shell/tokens";
import {
  CANVAS_NODE_STATUS_LABELS,
  CANVAS_RUN_STATUS_LABELS,
  type CanvasEstimate,
  type CanvasPreview,
  type CanvasRevisionSummary,
  type CanvasRunProjection,
} from "./types";
import { TOOLBOX_KINDS, portTypeLabel } from "./toolbox-model";
import { CANVAS_TEMPLATES } from "./templates";
import { CanvasPlane } from "./CanvasPlane";

export interface CanvasWorkspaceData {
  graphId: string;
  projectId: string | null;
  graph: import("./types").CanvasGraph | null;
  revisions: CanvasRevisionSummary[];
  estimate: CanvasEstimate | null;
  previews: CanvasPreview[];
  run: CanvasRunProjection | null;
  runLoading: boolean;
  runError: string | null;
  actionError: string | null;
  setupDependency?: string | null;
  notice: string | null;
  onSelectRevision: (revision: number) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onEditNodeLabel: (nodeId: string, label: string) => void;
  onRun: (selection: string[] | null) => void;
  onCancelRun: () => void;
  onRetryRun: () => void;
  onRefreshRun: () => void;
  onApplyTemplate: (templateId: string) => void;
  onCreateApp: () => void;
  onClearAction: () => void;
}

/** Desktop/tablet authoring at lg+; SSR defaults to the plane. */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- M7A: media-query subscription sync; external-store subscription pattern, not render-derived state.
    setDesktop(query.matches);
    const onChange = (event: MediaQueryListEvent) => setDesktop(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export function CanvasWorkspace(props: CanvasWorkspaceData) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);
  const [compareRevision, setCompareRevision] = useState<number | null>(null);
  const [appName, setAppName] = useState("");
  const [zoom, setZoom] = useState(1);
  const isDesktop = useIsDesktop();

  const nodes = useMemo(() => props.graph?.nodes ?? [], [props.graph]);
  const inspected = nodes.find((node) => node.id === inspectedNodeId) ?? null;
  const headRevision = props.revisions.length > 0 ? props.revisions[props.revisions.length - 1] : null;
  const compare = props.revisions.find((entry) => entry.revision === compareRevision) ?? null;

  const [activeGraphId, setActiveGraphId] = useState(props.graphId);
  // Render-time selection reset when the graph changes.
  if (activeGraphId !== props.graphId) {
    setActiveGraphId(props.graphId);
    setSelectedNodeId(null);
    setInspectedNodeId(null);
  }

  const nodeStatusOf = (nodeId: string): { statusLabel: string; failed: boolean } => {
    const projection = props.run?.nodes[nodeId];
    if (!projection) return { statusLabel: "Not run yet", failed: false };
    return { statusLabel: CANVAS_NODE_STATUS_LABELS[projection.status], failed: projection.status === "FAILED" };
  };

  const stepZoom = (direction: 1 | -1) => {
    const index = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
    const next = index < 0 ? 1 : ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))] ?? 1;
    setZoom(next);
  };

  const selectAndInspect = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setInspectedNodeId(nodeId);
  };

  if (!props.projectId) {
    return (
      <div className={`${STUDIO_PAGE_CLASS} space-y-4`}>
        <StudioPageHeader
          eyebrow="CANVAS"
          title="Canvas workspace"
          description="Typed graphs, compiled runs, and reusable workflow apps."
          routeMarker="/studio/workflows/[graphId]"
        />
        {/* VISUAL-03 locked product preview: real toolbox/template data, no actions. */}
        <section aria-label="Canvas preview (locked)" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 opacity-80">
          <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Node toolbox preview</h2>
          <ul className="mt-2 grid grid-cols-[repeat(1,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))]" aria-hidden>
            {TOOLBOX_KINDS.slice(0, 4).map((kind) => (
              <li key={kind.kind} className="rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2.5">
                <span className="block text-[12.5px] font-medium text-[var(--text-primary)]">{kind.label}</span>
                <span className="mt-0.5 block text-[11.5px] text-[var(--text-tertiary)]">{kind.description}</span>
              </li>
            ))}
          </ul>
        </section>
        <StudioEmptyState
          title="Select a project to open Canvas"
          description="Canvas graphs live inside a project. Choose a project, then open or start a graph."
          actionLabel="Open projects"
          actionHref="/studio/projects"
          testId="canvas-no-project"
        />
      </div>
    );
  }

  if (!props.graph) {
    return (
      <div className={`${STUDIO_PAGE_CLASS} space-y-4`}>
        <StudioPageHeader
          eyebrow="CANVAS"
          title="Canvas workspace"
          description="Typed graphs, compiled runs, and reusable workflow apps."
          routeMarker="/studio/workflows/[graphId]"
        />
        {props.setupDependency ? (
          <div data-testid="canvas-setup">
            <StudioSetupState
              what="Workflows"
              dependency={props.setupDependency}
              primaryLabel="Back to Studio home"
              primaryHref="/studio"
            />
          </div>
        ) : (
          <StudioErrorState
            title="Graph unavailable"
            description={props.actionError ?? "This graph could not be loaded in this project."}
            secondaryLabel="Back to Studio home"
            secondaryHref="/studio"
            testId="canvas-graph-missing"
          />
        )}
      </div>
    );
  }

  return (
    <div className={`${STUDIO_PAGE_CLASS} space-y-4`} data-testid="canvas-workspace">
      <StudioPageHeader
        eyebrow="CANVAS"
        title="Canvas workspace"
        description="Author typed nodes, compile immutable revisions, and run the DAG."
        routeMarker="/studio/workflows/[graphId]"
      />

      {props.setupDependency ? (
        <div data-testid="canvas-setup">
          <StudioSetupState
            what="Workflows"
            dependency={props.setupDependency}
            primaryLabel="Back to Studio home"
            primaryHref="/studio"
          />
        </div>
      ) : null}
      {props.actionError && (
        <div role="alert" data-testid="canvas-action-error" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">Something needs attention</p>
          <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">{props.actionError}</p>
          <button type="button" onClick={props.onClearAction} className={`mt-2 inline-flex min-h-[44px] items-center underline ${STUDIO_FOCUS_RING_CLASS}`}>Dismiss</button>
        </div>
      )}
      {props.notice && (
        <div role="status" data-testid="canvas-notice" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <p className="text-[12.5px] text-[var(--text-secondary)]">{props.notice}</p>
          <button type="button" onClick={props.onClearAction} className={`mt-2 inline-flex min-h-[44px] items-center underline ${STUDIO_FOCUS_RING_CLASS}`}>Dismiss</button>
        </div>
      )}

      {/* Toolbar: estimate + version + zoom + view + run */}
      <section aria-label="Run estimate and version" className="flex flex-wrap items-end gap-3 rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4" data-testid="canvas-estimate-bar">
        <div>
          <label htmlFor="canvas-revision" className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Compiled revision</label>
          <select
            id="canvas-revision"
            data-testid="canvas-revision-select"
            className={`mt-1 min-h-[44px] rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1.5 text-[13px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
            value={headRevision?.revision ?? ""}
            onChange={(event) => props.onSelectRevision(Number(event.target.value))}
          >
            {props.revisions.map((entry) => (
              <option key={entry.revision} value={entry.revision}>
                r{entry.revision} · {entry.nodeCount} nodes{entry.dagHash ? "" : " · not compiled"}
              </option>
            ))}
          </select>
        </div>
        <div className="min-h-[44px] text-[12.5px] text-[var(--text-secondary)]" data-testid="canvas-estimate">
          {props.estimate ? (
            <p>
              Estimate <strong className="text-[var(--text-primary)]">{props.estimate.totalIcu} ICU</strong> of {props.estimate.budgetIcu} ICU budget ·{" "}
              {props.estimate.withinBudget ? "within budget" : "over budget"}
            </p>
          ) : (
            <p className="text-[var(--text-tertiary)]">Estimate unavailable for this revision.</p>
          )}
        </div>
        {view === "graph" && isDesktop ? (
          <div role="group" aria-label="Canvas zoom" className="flex min-h-[44px] items-center gap-1">
            <button type="button" onClick={() => stepZoom(-1)} disabled={zoom <= ZOOM_STEPS[0]} aria-label="Zoom out" data-testid="canvas-zoom-out" className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] border border-[var(--border-default)] px-2 text-[14px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>
              −
            </button>
            <span role="status" aria-label={`Zoom ${Math.round(zoom * 100)} percent`} className="min-w-[52px] text-center text-[12px] text-[var(--text-secondary)]">
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" onClick={() => stepZoom(1)} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} aria-label="Zoom in" data-testid="canvas-zoom-in" className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] border border-[var(--border-default)] px-2 text-[14px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>
              +
            </button>
            <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Reset zoom" data-testid="canvas-zoom-reset" className={`inline-flex min-h-[44px] items-center rounded-[10px] px-2 text-[12px] text-[var(--text-secondary)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>
              Reset
            </button>
          </div>
        ) : null}
        <div className="flex min-h-[44px] flex-col justify-center text-[12.5px]" data-testid="canvas-revision-status">
          <span className="text-[var(--text-secondary)]">
            Revision <strong className="text-[var(--text-primary)]">r{headRevision?.revision ?? "—"}</strong>
          </span>
          <span role="status" className={props.dirty ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}>
            {props.dirty ? "● Unsaved changes" : "○ Saved"}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onSave}
            disabled={!props.dirty || props.saving}
            title={props.dirty ? "Save an immutable revision" : "No unsaved changes"}
            data-testid="canvas-save"
            className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--accent)] px-4 py-2 text-[12.5px] font-medium text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
          >
            {props.saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setView(view === "graph" ? "list" : "graph")}
            data-testid="canvas-view-toggle"
            className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3.5 py-2 text-[12.5px] font-medium ${STUDIO_FOCUS_RING_CLASS}`}
          >
            {view === "graph" ? "List view" : "Graph view"}
          </button>
          <button
            type="button"
            onClick={() => props.onRun(null)}
            disabled={!headRevision?.dagHash}
            title={!headRevision?.dagHash ? "Compile a revision before running." : "Run the full DAG"}
            data-testid="canvas-run-full"
            className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--accent)] px-4 py-2 text-[12.5px] font-medium text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
          >
            Run
          </button>
          <button
            type="button"
            onClick={() => selectedNodeId && props.onRun([selectedNodeId])}
            disabled={!selectedNodeId || !headRevision?.dagHash}
            title="Run the selected node and its downstream nodes only"
            data-testid="canvas-run-selection"
            className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
          >
            Run selection
          </button>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        {/* Toolbox */}
        <section aria-label="Node toolbox" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4" data-testid="canvas-toolbox">
          <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Toolbox</h2>
          <ul className="mt-2 space-y-2">
            {TOOLBOX_KINDS.map((kind) => (
              <li key={kind.kind} className="rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5">
                <p className="text-[12.5px] font-medium text-[var(--text-primary)]">{kind.label}</p>
                <p className="mt-0.5 text-[11.5px] leading-4 text-[var(--text-secondary)]">{kind.description}</p>
              </li>
            ))}
          </ul>
          <h2 className="mt-4 text-[13px] font-medium text-[var(--text-primary)]">Templates</h2>
          <ul className="mt-2 space-y-2">
            {CANVAS_TEMPLATES.map((template) => (
              <li key={template.templateId} className="rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5">
                <p className="text-[12.5px] font-medium text-[var(--text-primary)]">{template.title}</p>
                <p className="mt-0.5 text-[11.5px] leading-4 text-[var(--text-secondary)]">{template.description}</p>
                <button
                  type="button"
                  onClick={() => props.onApplyTemplate(template.templateId)}
                  data-testid={`canvas-template-${template.templateId}`}
                  className={`mt-1 inline-flex min-h-[44px] items-center text-[12px] text-[var(--text-secondary)] underline ${STUDIO_FOCUS_RING_CLASS}`}
                >
                  Use template
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Node surface */}
        <section aria-label={view === "graph" ? "Graph nodes" : "Node list"} data-testid="canvas-surface">
          {view === "graph" ? (
            isDesktop ? (
              <CanvasPlane
                graph={props.graph}
                nodeStatus={nodeStatusOf}
                selectedNodeId={selectedNodeId}
                zoom={zoom}
                onSelect={selectAndInspect}
              />
            ) : (
              <div className="space-y-2" data-testid="canvas-inspect-mode">
                <p className="rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
                  Canvas authoring needs a larger screen. Inspect nodes, run, and hand off here.
                </p>
                {props.run ? (
                  <p role="status" className="text-[12px] text-[var(--text-secondary)]">
                    {CANVAS_RUN_STATUS_LABELS[props.run.status]} · {props.run.completedNodes}/{props.run.totalNodes} nodes · {props.run.actualIcu} ICU
                  </p>
                ) : null}
                <ul className="space-y-2" data-testid="canvas-node-grid">
                  {nodes.map((node) => {
                    const state = nodeStatusOf(node.id);
                    const portText = [...node.inputs, ...node.outputs]
                      .map((port) => `${port.label} (${portTypeLabel(port.mediaType, port.unit)})`)
                      .join(" · ");
                    return (
                      <li key={node.id}>
                        <button
                          type="button"
                          onClick={() => selectAndInspect(node.id)}
                          aria-pressed={selectedNodeId === node.id}
                          aria-label={`${node.label}, ${node.kind} node, ${state.statusLabel}`}
                          data-testid={`canvas-node-${node.id}`}
                          className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[12px] border px-3.5 py-2.5 text-left ${STUDIO_FOCUS_RING_CLASS} ${
                            selectedNodeId === node.id
                              ? "border-[var(--accent)] bg-[var(--bg-elevated)]"
                              : "border-[var(--border-default)] bg-[var(--bg-elevated)]"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{node.label}</span>
                            <span className="mt-0.5 block truncate text-[11.5px] text-[var(--text-tertiary)]">
                              {node.kind} · {portText || "no ports"}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                            {state.statusLabel}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          ) : (
            <div className="overflow-x-auto rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)]" data-testid="canvas-node-table-wrap">
              <table className="w-full text-left text-[12.5px]" data-testid="canvas-node-table">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-tertiary)]">
                    <th scope="col" className="p-2.5">Node</th>
                    <th scope="col" className="p-2.5">Kind</th>
                    <th scope="col" className="p-2.5">Ports</th>
                    <th scope="col" className="p-2.5">Status</th>
                    <th scope="col" className="p-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node) => (
                    <tr key={node.id} className="border-b border-[var(--border-default)] last:border-0">
                      <td className="p-2.5 font-medium text-[var(--text-primary)]">{node.label}</td>
                      <td className="p-2.5 text-[var(--text-secondary)]">{node.kind}</td>
                      <td className="p-2.5 text-[12px] text-[var(--text-tertiary)]">
                        {node.inputs.length + node.outputs.length} ports
                      </td>
                      <td className="p-2.5 text-[12px] text-[var(--text-secondary)]">
                        {nodeStatusOf(node.id).statusLabel}
                      </td>
                      <td className="p-2.5">
                        <button type="button" onClick={() => selectAndInspect(node.id)} className={`inline-flex min-h-[44px] items-center text-[12px] text-[var(--text-secondary)] underline ${STUDIO_FOCUS_RING_CLASS}`} data-testid={`canvas-inspect-${node.id}`}>
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Previews */}
          <section aria-label="Node previews" className="mt-4" data-testid="canvas-previews">
            <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Previews</h2>
            {props.previews.length === 0 ? (
              <p className="mt-1 text-[12.5px] text-[var(--text-tertiary)]">No previews yet. Run the graph to produce node outputs.</p>
            ) : (
              <ul className="mt-2 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {props.previews.map((preview) => (
                  <li key={preview.nodeId} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4" data-testid={`canvas-preview-${preview.nodeId}`}>
                    <p className="text-[13px] font-medium text-[var(--text-primary)]">{preview.label}</p>
                    <p className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">{preview.mediaType}</p>
                    <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{preview.assetId ? `Asset ${preview.assetId}` : preview.emptyLabel}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>

        {/* Run tray + version diff + app */}
        <div className="space-y-4">
          <section aria-label="Revision history" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4" data-testid="canvas-revision-history">
            <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Revisions</h2>
            {props.revisions.length === 0 ? (
              <p className="mt-1 text-[12.5px] text-[var(--text-tertiary)]">No revisions yet. Save to create revision 1.</p>
            ) : (
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-[12px] text-[var(--text-secondary)]">
                {[...props.revisions].reverse().map((entry) => (
                  <li key={entry.revision} data-testid={`canvas-revision-r${entry.revision}`}>
                    r{entry.revision} · {entry.nodeCount} nodes · {entry.sha256.slice(0, 8)} ·{" "}
                    {entry.dagHash ? "compiled" : "not compiled"}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Run tray" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4" data-testid="canvas-run-tray">
            <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Run tray</h2>
            {!props.run && !props.runLoading && !props.runError && (
              <p className="mt-1 text-[12.5px] text-[var(--text-tertiary)]">No active run. Choose Run to execute the compiled revision.</p>
            )}
            {props.runLoading && <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]" role="status">Loading run…</p>}
            {props.runError && (
              <div className="mt-1 text-[12.5px]" role="alert" data-testid="canvas-run-error">
                <p className="text-[var(--text-secondary)]">{props.runError}</p>
                <button type="button" onClick={props.onRefreshRun} className={`mt-1 inline-flex min-h-[44px] items-center underline ${STUDIO_FOCUS_RING_CLASS}`}>Retry</button>
              </div>
            )}
            {props.run && (
              <div className="mt-1 text-[12.5px]" data-testid="canvas-run-status">
                <p className="text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">{CANVAS_RUN_STATUS_LABELS[props.run.status]}</strong> · {props.run.completedNodes}/{props.run.totalNodes} nodes · {props.run.actualIcu} ICU</p>
                <div
                  role="progressbar"
                  aria-label="Run progress"
                  aria-valuenow={props.run.completedNodes}
                  aria-valuemin={0}
                  aria-valuemax={props.run.totalNodes}
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-inset)]"
                >
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${props.run.totalNodes > 0 ? Math.round((props.run.completedNodes / props.run.totalNodes) * 100) : 0}%` }}
                  />
                </div>
                <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">{props.run.summary}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(props.run.status === "RUNNING" || props.run.status === "QUEUED") && (
                    <button type="button" onClick={props.onCancelRun} data-testid="canvas-cancel-run" className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3 py-1.5 text-[12px] ${STUDIO_FOCUS_RING_CLASS}`}>
                      Cancel run
                    </button>
                  )}
                  {props.run.status === "FAILED" && (
                    <button type="button" onClick={props.onRetryRun} data-testid="canvas-retry-run" className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3 py-1.5 text-[12px] ${STUDIO_FOCUS_RING_CLASS}`}>
                      Retry failed nodes
                    </button>
                  )}
                  <button type="button" onClick={props.onRefreshRun} data-testid="canvas-refresh-run" className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3 py-1.5 text-[12px] ${STUDIO_FOCUS_RING_CLASS}`}>
                    Refresh
                  </button>
                </div>
              </div>
            )}
          </section>

          <section aria-label="Version compare" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4" data-testid="canvas-version-diff">
            <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Version diff</h2>
            <label htmlFor="canvas-compare" className="mt-1 block text-[11.5px] text-[var(--text-tertiary)]">Compare head against</label>
            <select
              id="canvas-compare"
              data-testid="canvas-compare-select"
              className={`mt-1 min-h-[44px] w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1.5 text-[13px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
              value={compareRevision ?? ""}
              onChange={(event) => setCompareRevision(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">Select a revision…</option>
              {props.revisions.map((entry) => (
                <option key={entry.revision} value={entry.revision}>r{entry.revision}</option>
              ))}
            </select>
            {compare && headRevision && (
              <p className="mt-2 text-[12px] text-[var(--text-secondary)]" data-testid="canvas-diff-result">
                r{compare.revision} → r{headRevision.revision}: {compare.nodeCount} → {headRevision.nodeCount} nodes ·{" "}
                {compare.sha256 === headRevision.sha256 ? "identical content" : "content changed"}
              </p>
            )}
          </section>

          <section aria-label="Workflow app" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4" data-testid="canvas-app-section">
            <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Workflow → App</h2>
            <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">Freeze this revision as a private workspace app with declared inputs and outputs.</p>
            <label htmlFor="canvas-app-name" className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">App name</label>
            <input
              id="canvas-app-name"
              data-testid="canvas-app-name"
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              placeholder="e.g. promo-variant-maker"
              className="mt-1 min-h-[44px] w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1.5 text-[13px] text-[var(--text-primary)]"
            />
            <button
              type="button"
              onClick={props.onCreateApp}
              disabled={!headRevision?.dagHash}
              title={!headRevision?.dagHash ? "Compile a revision before freezing an app." : "Freeze a private app from this revision"}
              data-testid="canvas-create-app"
              className={`mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-[10px] border border-[var(--border-default)] px-3 py-2 text-[12.5px] font-medium disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
            >
              Create private app
            </button>
          </section>
        </div>
      </div>

      <StudioInspectorDrawer
        open={inspected !== null}
        onClose={() => setInspectedNodeId(null)}
        title={inspected ? `Inspect ${inspected.label}` : "Inspect node"}
        testId="canvas-inspector"
      >
        {inspected && (
          <div className="space-y-3 text-[12.5px]" data-testid="canvas-inspector-body">
            <p className="text-[11.5px] text-[var(--text-tertiary)]">Kind: {inspected.kind}{inspected.task ? ` · Task ${inspected.task}` : ""}</p>
            <label className="block">
              <span className="text-[13px] font-medium text-[var(--text-primary)]">Label</span>
              <input
                aria-label="Node label"
                data-testid={`canvas-node-label-${inspected.id}`}
                value={inspected.label}
                onChange={(event) => props.onEditNodeLabel(inspected.id, event.target.value)}
                className={`mt-1 min-h-[44px] w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1.5 text-[13px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
              />
            </label>
            <div>
              <h3 className="text-[13px] font-medium text-[var(--text-primary)]">Parameters</h3>
              {Object.keys(inspected.params).length === 0 ? (
                <p className="text-[12px] text-[var(--text-tertiary)]">No parameters.</p>
              ) : (
                <dl className="mt-1 space-y-1 text-[12px]">
                  {Object.entries(inspected.params).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-2">
                      <dt className="text-[var(--text-tertiary)]">{key}</dt>
                      <dd className="font-mono text-[var(--text-primary)]">{JSON.stringify(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <div>
              <h3 className="text-[13px] font-medium text-[var(--text-primary)]">Ports</h3>
              <ul className="mt-1 space-y-1 text-[12px] text-[var(--text-secondary)]">
                {[...inspected.inputs.map((p) => ({ ...p, dir: "in" })), ...inspected.outputs.map((p) => ({ ...p, dir: "out" }))].map((port) => (
                  <li key={`${port.dir}-${port.name}`}>
                    {port.dir === "in" ? "←" : "→"} {port.label} ({portTypeLabel(port.mediaType, port.unit)})
                  </li>
                ))}
              </ul>
            </div>
            {props.run?.nodes[inspected.id] && (
              <div>
                <h3 className="text-[13px] font-medium text-[var(--text-primary)]">Latest run</h3>
                <p className="text-[12px] text-[var(--text-secondary)]">{CANVAS_NODE_STATUS_LABELS[props.run.nodes[inspected.id].status]}</p>
                {props.run.nodes[inspected.id].error && (
                  <p className="mt-1 text-[12px] text-[var(--text-primary)]" role="alert">{props.run.nodes[inspected.id].error}</p>
                )}
              </div>
            )}
          </div>
        )}
      </StudioInspectorDrawer>
    </div>
  );
}

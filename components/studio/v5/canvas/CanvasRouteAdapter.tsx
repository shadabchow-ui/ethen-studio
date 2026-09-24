/**
 * STUDIO_13 — Canvas route adapter.
 * Binds /studio/workflows/[graphId] to the V5 Canvas workspace: loads the
 * head graph + revisions + estimate, drives run/cancel/retry through the
 * V1 workflow routes, and freezes private Workflow→App definitions.
 * The certified /studio/canvas index redirect is untouched (j20 retires).
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CanvasApiError,
  cancelCanvasRun,
  createCanvasRun,
  fetchEstimate,
  fetchGraphWorkspace,
  fetchRevisions,
  freezeCanvasApp,
  retryCanvasRun,
  saveRevision,
} from "./canvas-api-client";
import { canvasTemplate } from "./templates";
import type { CanvasEstimate, CanvasGraph, CanvasPreview, CanvasRevisionSummary } from "./types";
import { CanvasWorkspace } from "./CanvasWorkspace";
import { useCanvasRun } from "./useCanvasRun";
import { STUDIO_PAGE_CLASS } from "../shell/tokens";

function messageOf(failure: unknown): string {
  return failure instanceof CanvasApiError ? failure.message : "Request failed.";
}

/** Raw `details.dependency` when the failure is a setup condition, else null. */
function setupOf(failure: unknown): string | null {
  if (failure instanceof CanvasApiError && failure.code === "SETUP_REQUIRED") return failure.dependency;
  return null;
}

export function CanvasRouteAdapter({ graphId, projectId }: { graphId: string; projectId: string | null }) {
  const [graph, setGraph] = useState<CanvasGraph | null>(null);
  const [revisions, setRevisions] = useState<CanvasRevisionSummary[]>([]);
  const [estimate, setEstimate] = useState<CanvasEstimate | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [setupDependency, setSetupDependency] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [savedJson, setSavedJson] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const run = useCanvasRun(runId, projectId);

  // Render-time readiness when no project scopes the workspace.
  if (!projectId && !loaded) setLoaded(true);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetchGraphWorkspace(graphId, projectId)
      .then((payload) => {
        if (cancelled) return;
        setGraph(payload.graph);
        setSavedJson(JSON.stringify(payload.graph));
        setRevisions(payload.revisions);
        const head = payload.revisions[payload.revisions.length - 1];
        setRevision(head ? head.revision : null);
        setLoaded(true);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const dependency = setupOf(failure);
        if (dependency !== null) {
          setSetupDependency(dependency);
          setActionError(null);
        } else {
          setActionError(messageOf(failure));
        }
        setGraph(null);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [graphId, projectId]);

  // Render-time estimate reset when revision scope clears.
  if ((!projectId || revision === null) && estimate !== null) setEstimate(null);

  useEffect(() => {
    if (!projectId || revision === null) return;
    let cancelled = false;
    fetchEstimate({ projectId, graphId, revision })
      .then((next) => {
        if (!cancelled) setEstimate(next);
      })
      .catch(() => {
        if (!cancelled) setEstimate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [graphId, projectId, revision]);

  const previews: CanvasPreview[] = (run.projection ? Object.values(run.projection.nodes) : [])
    .filter((node) => node.status === "SUCCEEDED" || node.status === "REUSED")
    .map((node) => ({
      nodeId: node.nodeId,
      mediaType: "output",
      label: node.nodeId,
      assetId: null,
      emptyLabel: node.cacheHit ? "Reused from cache." : "Output ready; preview pending ingest.",
    }));

  const noteActionFailure = useCallback((failure: unknown) => {
    const dependency = setupOf(failure);
    if (dependency !== null) {
      setSetupDependency(dependency);
      setActionError(null);
    } else {
      setActionError(messageOf(failure));
    }
  }, []);

  const handleRun = useCallback(
    (selection: string[] | null) => {
      if (!projectId || revision === null) return;
      setActionError(null);
      setSetupDependency(null);
      setNotice(null);
      createCanvasRun({ projectId, graphId, revision, budgetIcu: estimate?.budgetIcu ?? 1000, selection: selection ?? undefined })
        .then((created) => {
          setRunId(created.runId);
          setNotice(
            selection
              ? `Partial run started: ${created.recompute.length} nodes recompute, ${created.reuse.length} reused.`
              : `Run started: ${created.recompute.length} nodes recompute, ${created.reuse.length} reused.`,
          );
        })
        .catch((failure: unknown) => noteActionFailure(failure));
    },
    [projectId, graphId, revision, estimate, noteActionFailure],
  );

  const handleCancel = useCallback(() => {
    if (!runId || !projectId) return;
    cancelCanvasRun(runId, projectId, "cancelled from Canvas")
      .then(() => {
        run.refresh();
        setNotice("Cancel requested. Settled nodes keep their outputs.");
      })
      .catch((failure: unknown) => noteActionFailure(failure));
  }, [runId, projectId, run, noteActionFailure]);

  const handleRetry = useCallback(() => {
    if (!runId || !projectId) return;
    retryCanvasRun(runId, projectId)
      .then(() => {
        run.refresh();
        setNotice("Retry started for failed nodes; retained outputs untouched.");
      })
      .catch((failure: unknown) => noteActionFailure(failure));
  }, [runId, projectId, run, noteActionFailure]);

  const handleTemplate = useCallback(
    (templateId: string) => {
      const template = canvasTemplate(templateId);
      if (!template) return;
      setGraph(structuredClone(template.graph));
      setNotice(`Template “${template.title}” loaded locally. Save a revision to compile and run it.`);
    },
    [],
  );

  const handleEditNodeLabel = useCallback((nodeId: string, label: string) => {
    setGraph((prev) =>
      prev ? { ...prev, nodes: prev.nodes.map((node) => (node.id === nodeId ? { ...node, label } : node)) } : prev,
    );
  }, []);

  const handleSave = useCallback(() => {
    if (!projectId || !graph) return;
    const head = revisions[revisions.length - 1];
    if (!head) return;
    setSaving(true);
    setActionError(null);
    setSetupDependency(null);
    setNotice(null);
    saveRevision({ projectId, graphId, baseRevision: head.revision, graph })
      .then((saved) => {
        setSavedJson(JSON.stringify(graph));
        setRevision(saved.revision);
        return fetchRevisions(graphId, projectId).then(
          (payload) => {
            setRevisions(payload.revisions);
            setNotice(`Revision ${saved.revision} saved and compiled.`);
          },
          () => {
            setNotice(`Revision ${saved.revision} saved and compiled.`);
          },
        );
      })
      .catch((failure: unknown) => {
        if (failure instanceof CanvasApiError && failure.code === "CONFLICT") {
          setActionError("Someone saved a newer revision while you were editing. Reload to see it, then re-apply your edits.");
        } else {
          noteActionFailure(failure);
        }
      })
      .finally(() => setSaving(false));
  }, [projectId, graphId, graph, revisions, noteActionFailure]);

  const handleCreateApp = useCallback(() => {
    if (!projectId || revision === null) return;
    setActionError(null);
    freezeCanvasApp({ projectId, graphId, revision, appId: `app-${graphId.slice(0, 8)}-r${revision}`, invoke: [], manage: [] })
      .then((created) => setNotice(`Private app ${created.app.appId} frozen at revision ${revision}.`))
      .catch((failure: unknown) => noteActionFailure(failure));
  }, [projectId, graphId, revision, noteActionFailure]);

  if (!loaded) {
    return (
      <div className={STUDIO_PAGE_CLASS} role="status" data-testid="canvas-loading">
        <p className="text-sm">Loading Canvas workspace…</p>
      </div>
    );
  }

  const dirty = graph !== null && savedJson !== null && JSON.stringify(graph) !== savedJson;

  return (
    <CanvasWorkspace
      graphId={graphId}
      projectId={projectId}
      graph={graph}
      revisions={revisions}
      estimate={estimate}
      previews={previews}
      run={run.projection}
      runLoading={run.loading}
      runError={run.error ? run.error.message : null}
      actionError={actionError}
      setupDependency={setupDependency}
      notice={notice}
      onSelectRevision={setRevision}
      dirty={dirty}
      saving={saving}
      onSave={handleSave}
      onEditNodeLabel={handleEditNodeLabel}
      onRun={handleRun}
      onCancelRun={handleCancel}
      onRetryRun={handleRetry}
      onRefreshRun={run.refresh}
      onApplyTemplate={handleTemplate}
      onCreateApp={handleCreateApp}
      onClearAction={() => {
        setActionError(null);
        setSetupDependency(null);
        setNotice(null);
      }}
    />
  );
}

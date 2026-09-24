/**
 * STUDIO_14 — pro workbench route adapter.
 * Binds /studio/pro/[tool] to the V1 workbench routes: timeline heads,
 * head revision, single-op revision appends (trim/split/gain with frame
 * deltas converted to integer ticks) and deterministic render submits.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { framesToTicks } from "./timecode";
import type {
  BinItemView,
  ProTool,
  WorkbenchClipView,
  WorkbenchHeadView,
  WorkbenchRevisionView,
  WorkbenchUiState,
} from "./types";
import { WorkbenchWorkspace } from "./WorkbenchWorkspace";
import type { StageWarning } from "./Stage";
import {
  WorkbenchApiError,
  appendTimelineRevision,
  createTimeline,
  fetchTimelineDetail,
  fetchTimelines,
  submitTimelineRender,
} from "./workbench-api-client";

function messageOf(failure: unknown): string {
  return failure instanceof WorkbenchApiError ? failure.message : "Request failed.";
}

function findClip(revision: WorkbenchRevisionView | null, clipId: string | null): { clip: WorkbenchClipView; kind: string } | null {
  if (!revision || !clipId) return null;
  for (const track of revision.tracks) {
    const clip = track.clips.find((c) => c.clipId === clipId);
    if (clip) return { clip, kind: track.kind };
  }
  return null;
}

export function WorkbenchRouteAdapter({ tool, projectId }: { tool: Exclude<ProTool, "cinema">; projectId: string | null }) {
  const [uiState, setUiState] = useState<WorkbenchUiState>({ state: "loading" });
  const [heads, setHeads] = useState<WorkbenchHeadView[]>([]);
  const [head, setHead] = useState<WorkbenchHeadView | null>(null);
  const [revision, setRevision] = useState<WorkbenchRevisionView | null>(null);
  const [bin, setBin] = useState<BinItemView[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playheadTicks, setPlayheadTicks] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [renderNotice, setRenderNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Render-time readiness when no project scopes the workspace.
  if (!projectId && uiState.state !== "setup") {
    setUiState({ state: "setup", message: "Select a project to open the pro workbench. Timelines are project-scoped." });
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetchTimelines(projectId)
      .then((timelines) => {
        if (cancelled) return;
        setHeads(timelines);
        if (timelines.length === 0) {
          setUiState({ state: "empty", action: "Create your first timeline to start editing." });
          return;
        }
        const first = timelines[0];
        fetchTimelineDetail(projectId, first.timelineId)
          .then((detail) => {
            if (cancelled) return;
            setHead(detail.head);
            setRevision(
              detail.revision
                ? { revision: detail.revision.revision, recipeHash: detail.revision.recipeHash, tracks: detail.revision.recipe.tracks, captionTracks: detail.revision.recipe.captionTracks }
                : null,
            );
            setUiState(detail.revision ? { state: "ready" } : { state: "empty", action: "This timeline has no revisions yet." });
          })
          .catch((failure: unknown) => {
            if (cancelled) return;
            if (failure instanceof WorkbenchApiError && failure.code === "SETUP_REQUIRED") {
              setUiState({ state: "setup", message: messageOf(failure), dependency: failure.dependency });
            } else {
              setUiState({ state: "error", message: messageOf(failure) });
            }
          });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        if (failure instanceof WorkbenchApiError && failure.code === "SETUP_REQUIRED") {
          setUiState({ state: "setup", message: messageOf(failure), dependency: failure.dependency });
        } else {
          setUiState({ state: "error", message: messageOf(failure) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken]);

  const refreshDetail = useCallback(
    async (timelineId: string) => {
      if (!projectId) return;
      const detail = await fetchTimelineDetail(projectId, timelineId);
      setHead(detail.head);
      setRevision(
        detail.revision
          ? { revision: detail.revision.revision, recipeHash: detail.revision.recipeHash, tracks: detail.revision.recipe.tracks, captionTracks: detail.revision.recipe.captionTracks }
          : null,
      );
      setUiState(detail.revision ? { state: "ready" } : { state: "empty", action: "This timeline has no revisions yet." });
    },
    [projectId],
  );

  const handleCreateTimeline = useCallback(() => {
    if (!projectId) return;
    setBusy(true);
    createTimeline({ projectId, title: "Untitled timeline" })
      .then((created) =>
        fetchTimelines(projectId).then((timelines) => {
          setHeads(timelines);
          return refreshDetail(created.timelineId);
        }),
      )
      .catch((failure: unknown) => {
        if (failure instanceof WorkbenchApiError && failure.code === "SETUP_REQUIRED") {
          setUiState({ state: "setup", message: messageOf(failure), dependency: failure.dependency });
        } else {
          setUiState({ state: "error", message: messageOf(failure) });
        }
      })
      .finally(() => setBusy(false));
  }, [projectId, refreshDetail]);

  const appendOp = useCallback(
    async (op: Record<string, unknown>) => {
      if (!projectId || !head) return;
      setBusy(true);
      setRenderNotice(null);
      try {
        // Probes are caller-measured: the adapter ships measured source
        // facts from the bin; the kernel refuses unmeasured trims.
        const probes = bin
          .filter((item) => item.durationMs !== null)
          .map((item) => ({
            assetId: item.assetId,
            version: item.version,
            durationTicks: Math.round(((item.durationMs as number) / 1000) * head.timescale),
            width: null,
            height: null,
            hasAudio: item.kind === "audio",
          }));
        const appended = await appendTimelineRevision({
          projectId,
          timelineId: head.timelineId,
          expectedParent: head.headRevision,
          op,
          probes,
        });
        await refreshDetail(head.timelineId);
        setRenderNotice(`Revision ${appended.revision} saved.`);
      } catch (failure) {
        setRenderNotice(messageOf(failure));
      } finally {
        setBusy(false);
      }
    },
    [projectId, head, bin, refreshDetail],
  );

  const onTrim = useCallback(
    (clipId: string, inDeltaFrames: number, outDeltaFrames: number) => {
      if (!head) return;
      void appendOp({
        kind: "trim",
        clipId,
        inDeltaTicks: framesToTicks(inDeltaFrames, head.timescale, head.fpsNum, head.fpsDen),
        outDeltaTicks: framesToTicks(outDeltaFrames, head.timescale, head.fpsNum, head.fpsDen),
      });
    },
    [appendOp, head],
  );

  const onSplit = useCallback(
    (clipId: string, atTicks: number) => {
      void appendOp({
        kind: "split",
        clipId,
        atTimelineTicks: atTicks,
        newClipId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `clip-${Date.now()}`,
      });
    },
    [appendOp],
  );

  const onGain = useCallback(
    (clipId: string, gainDb: number | null) => {
      void appendOp({ kind: "gain", clipId, gainDb });
    },
    [appendOp],
  );

  const onRender = useCallback(() => {
    if (!projectId || !head || !revision) return;
    setBusy(true);
    setRenderNotice(null);
    submitTimelineRender({
      projectId,
      timelineId: head.timelineId,
      revision: revision.revision,
      output: { container: "mp4", videoCodec: "h264", width: 1920, height: 1080, audioCodec: "aac", captionBurnIn: false },
      interchange: "none",
    })
      .then((result) => {
        setRenderNotice(
          result.replayed
            ? `Render ${result.render.renderId.slice(0, 8)} replayed (same revision resubmitted).`
            : `Render ${result.render.renderId.slice(0, 8)} queued for revision ${result.render.revision}. Review unlocks when it completes.`,
        );
      })
      .catch((failure: unknown) => setRenderNotice(messageOf(failure)))
      .finally(() => setBusy(false));
  }, [projectId, head, revision]);

  const found = findClip(revision, selectedClipId);
  const warnings: StageWarning[] = [];
  if (revision && revision.tracks.filter((t) => t.kind === "video").length > 1) {
    warnings.push({ code: "INTERCHANGE_SUBSET", message: "Interchange export covers the V1 subset only: single video track, straight cuts, file clips." });
  }
  void setBin;
  void setSelectedAssetId;

  return (
    <WorkbenchWorkspace
      tool={tool}
      uiState={uiState}
      heads={heads}
      head={head}
      revision={revision}
      bin={bin}
      selectedAssetId={selectedAssetId}
      selectedClip={found?.clip ?? null}
      selectedTrackKind={found?.kind ?? null}
      playheadTicks={playheadTicks}
      zoom={zoom}
      warnings={warnings}
      renderLabel={busy ? "Working…" : "Submit render"}
      renderNotice={renderNotice}
      busy={busy}
      onSelectTimeline={(timelineId) => {
        setSelectedClipId(null);
        setPlayheadTicks(0);
        refreshDetail(timelineId).catch((failure: unknown) => setRenderNotice(messageOf(failure)));
      }}
      onSelectAsset={setSelectedAssetId}
      onSelectClip={setSelectedClipId}
      onScrub={setPlayheadTicks}
      onZoom={setZoom}
      onSplit={onSplit}
      onTrim={onTrim}
      onGain={onGain}
      onRender={onRender}
      onCreateTimeline={uiState.state === "empty" && heads.length === 0 ? handleCreateTimeline : undefined}
      onRetry={() => {
        setUiState({ state: "loading" });
        setReloadToken((t) => t + 1);
      }}
    />
  );
}

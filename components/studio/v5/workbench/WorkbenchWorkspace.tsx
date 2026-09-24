/**
 * STUDIO_14 — workspace composition: bin rail + stage + inspector over a
 * lower timeline. Mobile viewports render preview-only (stage + notice);
 * authoring rails require tablet/desktop widths.
 */
"use client";

import { StudioEmptyState, StudioErrorState, StudioPageHeader, StudioSetupState } from "../shell";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import { BinRail } from "./BinRail";
import { Inspector } from "./Inspector";
import { Stage, type StageWarning } from "./Stage";
import { Timeline } from "./Timeline";
import type {
  BinItemView,
  ProTool,
  WorkbenchClipView,
  WorkbenchHeadView,
  WorkbenchRevisionView,
  WorkbenchUiState,
} from "./types";

const TOOL_LABEL: Record<Exclude<ProTool, "cinema">, string> = {
  image: "Image pro workbench",
  video: "Video pro workbench",
  audio: "Audio pro workbench",
  dubbing: "Dubbing pro workbench",
};

export function WorkbenchWorkspace({
  tool,
  uiState,
  heads,
  head,
  revision,
  bin,
  selectedAssetId,
  selectedClip,
  selectedTrackKind,
  playheadTicks,
  zoom,
  warnings,
  renderLabel,
  renderNotice,
  busy,
  onSelectTimeline,
  onSelectAsset,
  onSelectClip,
  onScrub,
  onZoom,
  onSplit,
  onTrim,
  onGain,
  onRender,
  onCreateTimeline,
  onRetry,
}: {
  tool: Exclude<ProTool, "cinema">;
  uiState: WorkbenchUiState;
  heads: WorkbenchHeadView[];
  head: WorkbenchHeadView | null;
  revision: WorkbenchRevisionView | null;
  bin: BinItemView[];
  selectedAssetId: string | null;
  selectedClip: WorkbenchClipView | null;
  selectedTrackKind: string | null;
  playheadTicks: number;
  zoom: number;
  warnings: StageWarning[];
  renderLabel: string;
  renderNotice: string | null;
  busy: boolean;
  onSelectTimeline: (timelineId: string) => void;
  onSelectAsset: (assetId: string) => void;
  onSelectClip: (clipId: string | null) => void;
  onScrub: (ticks: number) => void;
  onZoom: (zoom: number) => void;
  onSplit: (clipId: string, atTicks: number) => void;
  onTrim: (clipId: string, inDeltaFrames: number, outDeltaFrames: number) => void;
  onGain: (clipId: string, gainDb: number | null) => void;
  onRender: () => void;
  onCreateTimeline?: () => void;
  onRetry: () => void;
}) {
  const durationTicks = (revision?.tracks ?? []).reduce(
    (end, track) => track.clips.reduce((m, c) => Math.max(m, c.timelineStartTicks + c.durationTicks), end),
    0,
  );
  return (
    <div data-testid="workbench-workspace" data-tool={tool} className="flex flex-col gap-4">
      <StudioPageHeader
        eyebrow="PRO WORKBENCH"
        title={TOOL_LABEL[tool]}
        description="Nondestructive timeline edits over pinned sources. Nothing here modifies original media."
      />
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Timelines">
        <label htmlFor="workbench-timeline-select" className="text-[11.5px] text-[var(--text-secondary)]">Timeline</label>
        <select
          id="workbench-timeline-select"
          data-testid="workbench-timeline-select"
          value={head?.timelineId ?? ""}
          onChange={(event) => onSelectTimeline(event.target.value)}
          className={`min-h-[44px] rounded-[8px] bg-[var(--bg-surface)] px-3 py-1.5 text-[12px] ${STUDIO_FOCUS_RING_CLASS}`}
        >
          <option value="">Select a timeline…</option>
          {heads.map((h) => (
            <option key={h.timelineId} value={h.timelineId}>
              {h.title} · rev {h.headRevision}
            </option>
          ))}
        </select>
        {head?.lockedBy ? (
          <span data-testid="workbench-lock" className="rounded-full bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
            Locked by {head.lockedBy}
          </span>
        ) : null}
      </div>
      {uiState.state === "loading" ? (
        <p data-testid="workbench-loading" className="py-10 text-center text-[13px] text-[var(--text-secondary)]">Loading workbench…</p>
      ) : null}
      {uiState.state === "setup" ? (
        uiState.dependency !== null && uiState.dependency !== undefined ? (
          <div data-testid="workbench-setup">
            <StudioSetupState
              what="Timelines"
              dependency={uiState.dependency}
              primaryLabel="Go to Assets"
              primaryHref={typeof window !== "undefined" ? `/studio/work/assets?projectId=${encodeURIComponent(new URLSearchParams(window.location.search).get("projectId") ?? "")}` : "/studio/work/assets"}
            />
          </div>
        ) : (
          <>
            <section aria-label="Workbench preview (locked)" className="rounded-[16px] bg-[var(--bg-surface)] p-4 opacity-80">
              <div className="flex aspect-video w-full items-center justify-center rounded-[12px] bg-[var(--bg-inset)]">
                <p className="px-6 text-center text-[12.5px] text-[var(--text-tertiary)]">Stage preview appears once a project is selected.</p>
              </div>
            </section>
            <StudioEmptyState title="Project setup needed" description={uiState.message} actionLabel="Retry" onAction={onRetry} />
          </>
        )
      ) : null}
      {uiState.state === "empty" ? (
        onCreateTimeline ? (
          <StudioEmptyState title="No timelines yet" description={uiState.action} actionLabel={busy ? "Creating…" : "New timeline"} onAction={onCreateTimeline} />
        ) : (
          <StudioEmptyState title="No timeline selected" description={uiState.action} actionLabel="Retry" onAction={onRetry} />
        )
      ) : null}
      {uiState.state === "error" ? (
        <div data-testid="workbench-error">
          <StudioErrorState title="Workbench unavailable" description={uiState.message} retryLabel="Retry" onRetry={onRetry} />
        </div>
      ) : null}
      {uiState.state === "ready" && head && revision ? (
        <>
          {/* Mobile: preview-only stage. Authoring rails appear at md+. */}
          <div className="flex flex-col gap-4 min-[768px]:hidden">
            <Stage
              title={head.title}
              playheadTicks={playheadTicks}
              durationTicks={durationTicks}
              timescale={head.timescale}
              fpsNum={head.fpsNum}
              fpsDen={head.fpsDen}
              proxyUrl={null}
              warnings={warnings}
              previewOnly
              onRender={onRender}
              renderLabel={renderLabel}
            />
          </div>
          <div className="hidden flex-col gap-4 min-[768px]:flex">
            <div className="flex items-stretch gap-4">
              <div className="hidden min-[1200px]:block">
                <BinRail
                  items={bin}
                  selectedAssetId={selectedAssetId}
                  onSelect={onSelectAsset}
                  timescale={head.timescale}
                  fpsNum={head.fpsNum}
                  fpsDen={head.fpsDen}
                />
              </div>
              <Stage
                title={head.title}
                playheadTicks={playheadTicks}
                durationTicks={durationTicks}
                timescale={head.timescale}
                fpsNum={head.fpsNum}
                fpsDen={head.fpsDen}
                proxyUrl={null}
                warnings={warnings}
                previewOnly={false}
                onRender={onRender}
                renderLabel={renderLabel}
              />
              <Inspector
                clip={selectedClip}
                trackKind={selectedTrackKind}
                timescale={head.timescale}
                fpsNum={head.fpsNum}
                fpsDen={head.fpsDen}
                onTrim={onTrim}
                onGain={onGain}
                busy={busy}
              />
            </div>
            <Timeline
              tracks={revision.tracks}
              timescale={head.timescale}
              fpsNum={head.fpsNum}
              fpsDen={head.fpsDen}
              selectedClipId={selectedClip?.clipId ?? null}
              playheadTicks={playheadTicks}
              zoom={zoom}
              onSelectClip={onSelectClip}
              onScrub={onScrub}
              onZoom={onZoom}
              onSplit={onSplit}
            />
          </div>
          {renderNotice ? <p data-testid="workbench-render-notice" className="text-[12px] text-[var(--text-secondary)]">{renderNotice}</p> : null}
        </>
      ) : null}
    </div>
  );
}

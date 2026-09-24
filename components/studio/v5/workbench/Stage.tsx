/**
 * STUDIO_14 — stage: large preview player with proxy playback, readable
 * timecode and honest unsupported-feature warnings.
 */
"use client";

import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import { ticksToTimecode } from "./timecode";

export interface StageWarning {
  code: string;
  message: string;
}

export function Stage({
  title,
  playheadTicks,
  durationTicks,
  timescale,
  fpsNum,
  fpsDen,
  proxyUrl,
  warnings,
  previewOnly,
  onRender,
  renderLabel,
}: {
  title: string;
  playheadTicks: number;
  durationTicks: number;
  timescale: number;
  fpsNum: number;
  fpsDen: number;
  proxyUrl: string | null;
  warnings: StageWarning[];
  previewOnly: boolean;
  onRender: () => void;
  renderLabel: string;
}) {
  return (
    <section aria-label="Stage" data-testid="workbench-stage" className="flex min-w-0 flex-1 flex-col gap-3 rounded-[16px] bg-[var(--bg-surface)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto truncate text-[14px] font-semibold text-[var(--text-primary)]">{title}</h2>
        <span data-testid="stage-timecode" className="rounded-[8px] bg-[var(--bg-inset)] px-3 py-1 font-mono text-[13px] text-[var(--text-primary)]" aria-label="Playhead timecode">
          {ticksToTimecode(playheadTicks, timescale, fpsNum, fpsDen)}
        </span>
        <span className="font-mono text-[11.5px] text-[var(--text-tertiary)]" aria-label="Timeline duration">
          / {ticksToTimecode(durationTicks, timescale, fpsNum, fpsDen)}
        </span>
      </div>
      <div data-testid="stage-player" className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-[12px] bg-[var(--bg-inset)]">
        {proxyUrl ? (
          <video data-testid="stage-video" src={proxyUrl} controls preload="metadata" className="max-h-full max-w-full" aria-label={`${title} proxy preview`} />
        ) : (
          <p className="px-6 text-center text-[12.5px] text-[var(--text-tertiary)]">
            Proxy preview appears here once clips with measured media are on the timeline.
          </p>
        )}
      </div>
      {warnings.length > 0 ? (
        <ul data-testid="stage-warnings" className="flex flex-col gap-1.5" aria-label="Export warnings">
          {warnings.map((warning) => (
            <li key={warning.message} className="rounded-[10px] bg-[var(--bg-inset)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {previewOnly ? (
          <p data-testid="stage-preview-only" className="text-[12px] text-[var(--text-secondary)]">
            Preview-only on this screen size. Timeline authoring needs a tablet or desktop.
          </p>
        ) : null}
        <button
          type="button"
          data-testid="stage-render"
          onClick={onRender}
          className={`ml-auto inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--accent)] px-4 py-2 text-[12.5px] font-semibold text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
        >
          {renderLabel}
        </button>
      </div>
    </section>
  );
}

/**
 * STUDIO_14 — inspector: selected-clip trim/gain/caption details.
 * Every control maps to one nondestructive edit op; sources stay intact.
 */
"use client";

import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { WorkbenchClipView } from "./types";
import { ticksToTimecode } from "./timecode";

export function Inspector({
  clip,
  trackKind,
  timescale,
  fpsNum,
  fpsDen,
  onTrim,
  onGain,
  busy,
}: {
  clip: WorkbenchClipView | null;
  trackKind: string | null;
  timescale: number;
  fpsNum: number;
  fpsDen: number;
  onTrim: (clipId: string, inDeltaTicks: number, outDeltaTicks: number) => void;
  onGain: (clipId: string, gainDb: number | null) => void;
  busy: boolean;
}) {
  return (
    <aside aria-label="Inspector" data-testid="workbench-inspector" className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto rounded-[16px] bg-[var(--bg-surface)] p-4">
      <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">Inspector</h2>
      {!clip ? (
        <p className="text-[12px] text-[var(--text-tertiary)]">Select a clip on the timeline to inspect it.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col gap-1.5 text-[12px]">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-tertiary)]">Clip</dt>
              <dd className="truncate font-mono text-[var(--text-primary)]" data-testid="inspector-clip-id">{clip.clipId.slice(0, 8)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-tertiary)]">Source</dt>
              <dd className="truncate font-mono text-[var(--text-primary)]">{clip.assetId.slice(0, 8)} v{clip.version}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-tertiary)]">In</dt>
              <dd className="font-mono text-[var(--text-primary)]">{ticksToTimecode(clip.sourceInTicks, timescale, fpsNum, fpsDen)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-tertiary)]">Duration</dt>
              <dd className="font-mono text-[var(--text-primary)]">{ticksToTimecode(clip.durationTicks, timescale, fpsNum, fpsDen)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-tertiary)]">Captions</dt>
              <dd className="text-[var(--text-primary)]">{clip.captionTrackId ? "attached" : "none"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-tertiary)]">Transform</dt>
              <dd className="text-[var(--text-primary)]">{clip.hasImageTransform ? "crop/mask ref" : "full frame"}</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">Trim (1 frame steps)</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" data-testid="inspector-trim-in-minus" disabled={busy} onClick={() => onTrim(clip.clipId, -1, 0)} className={`inline-flex min-h-[44px] items-center justify-center rounded-[8px] bg-[var(--bg-inset)] px-2 py-1.5 text-[11.5px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>In −1f</button>
              <button type="button" data-testid="inspector-trim-in-plus" disabled={busy} onClick={() => onTrim(clip.clipId, 1, 0)} className={`inline-flex min-h-[44px] items-center justify-center rounded-[8px] bg-[var(--bg-inset)] px-2 py-1.5 text-[11.5px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>In +1f</button>
              <button type="button" data-testid="inspector-trim-out-minus" disabled={busy} onClick={() => onTrim(clip.clipId, 0, -1)} className={`inline-flex min-h-[44px] items-center justify-center rounded-[8px] bg-[var(--bg-inset)] px-2 py-1.5 text-[11.5px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>Out −1f</button>
              <button type="button" data-testid="inspector-trim-out-plus" disabled={busy} onClick={() => onTrim(clip.clipId, 0, 1)} className={`inline-flex min-h-[44px] items-center justify-center rounded-[8px] bg-[var(--bg-inset)] px-2 py-1.5 text-[11.5px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>Out +1f</button>
            </div>
          </div>
          {trackKind === "audio" ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">Gain ({clip.gainDb ?? 0} dB)</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" data-testid="inspector-gain-down" disabled={busy} onClick={() => onGain(clip.clipId, (clip.gainDb ?? 0) - 1)} className={`inline-flex min-h-[44px] items-center justify-center rounded-[8px] bg-[var(--bg-inset)] px-2 py-1.5 text-[11.5px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>−1 dB</button>
                <button type="button" data-testid="inspector-gain-reset" disabled={busy} onClick={() => onGain(clip.clipId, null)} className={`inline-flex min-h-[44px] items-center justify-center rounded-[8px] bg-[var(--bg-inset)] px-2 py-1.5 text-[11.5px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>Unity</button>
                <button type="button" data-testid="inspector-gain-up" disabled={busy} onClick={() => onGain(clip.clipId, (clip.gainDb ?? 0) + 1)} className={`inline-flex min-h-[44px] items-center justify-center rounded-[8px] bg-[var(--bg-inset)] px-2 py-1.5 text-[11.5px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>+1 dB</button>
              </div>
            </div>
          ) : null}
          <p className="text-[11px] text-[var(--text-tertiary)]">Edits append a new revision. Source media is never modified.</p>
        </div>
      )}
    </aside>
  );
}

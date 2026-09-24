/**
 * STUDIO_14 — timeline: lower track/clip editor with keyboard selection,
 * scrub and zoom. Clip geometry derives from integer tick positions.
 */
"use client";

import { useCallback, useMemo, useRef } from "react";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { WorkbenchTrackView } from "./types";
import { ticksToTimecode } from "./timecode";

export function Timeline({
  tracks,
  timescale,
  fpsNum,
  fpsDen,
  selectedClipId,
  playheadTicks,
  zoom,
  onSelectClip,
  onScrub,
  onZoom,
  onSplit,
}: {
  tracks: WorkbenchTrackView[];
  timescale: number;
  fpsNum: number;
  fpsDen: number;
  selectedClipId: string | null;
  playheadTicks: number;
  zoom: number;
  onSelectClip: (clipId: string | null) => void;
  onScrub: (ticks: number) => void;
  onZoom: (zoom: number) => void;
  onSplit: (clipId: string, atTicks: number) => void;
}) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const durationTicks = useMemo(() => {
    let end = 0;
    for (const track of tracks) {
      for (const clip of track.clips) end = Math.max(end, clip.timelineStartTicks + clip.durationTicks);
    }
    return Math.max(end, 1);
  }, [tracks]);
  const pxPerTick = (zoom * 720) / Math.max(durationTicks, 1);

  const flatClips = useMemo(() => tracks.flatMap((t) => t.clips.map((c) => c.clipId)), [tracks]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (flatClips.length === 0) return;
      const index = selectedClipId ? flatClips.indexOf(selectedClipId) : -1;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onSelectClip(flatClips[Math.min(flatClips.length - 1, index + 1)]);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onSelectClip(flatClips[Math.max(0, index <= 0 ? 0 : index - 1)]);
      } else if (event.key === "Escape") {
        onSelectClip(null);
      } else if ((event.key === "s" || event.key === "S") && selectedClipId) {
        event.preventDefault();
        onSplit(selectedClipId, playheadTicks);
      }
    },
    [flatClips, selectedClipId, onSelectClip, onSplit, playheadTicks],
  );

  const scrubFromPointer = useCallback(
    (clientX: number) => {
      const el = rulerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)));
      onScrub(Math.round(ratio * durationTicks));
    },
    [durationTicks, onScrub],
  );

  return (
    <section aria-label="Timeline" data-testid="workbench-timeline" className="flex flex-col gap-2 rounded-[16px] bg-[var(--bg-surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[12px] font-semibold text-[var(--text-primary)]">Timeline</h2>
        <span data-testid="timeline-duration" className="font-mono text-[11.5px] text-[var(--text-tertiary)]">
          {ticksToTimecode(durationTicks, timescale, fpsNum, fpsDen)}
        </span>
        <button type="button" data-testid="timeline-zoom-out" aria-label="Zoom out" onClick={() => onZoom(Math.max(0.5, zoom / 1.5))} className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[8px] bg-[var(--bg-inset)] px-2.5 py-1 text-[12px] ${STUDIO_FOCUS_RING_CLASS}`}>−</button>
        <button type="button" data-testid="timeline-zoom-in" aria-label="Zoom in" onClick={() => onZoom(Math.min(8, zoom * 1.5))} className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[8px] bg-[var(--bg-inset)] px-2.5 py-1 text-[12px] ${STUDIO_FOCUS_RING_CLASS}`}>+</button>
      </div>
      <div
        ref={rulerRef}
        role="slider"
        tabIndex={0}
        aria-label="Playhead scrubber"
        aria-valuemin={0}
        aria-valuemax={durationTicks}
        aria-valuenow={playheadTicks}
        aria-valuetext={ticksToTimecode(playheadTicks, timescale, fpsNum, fpsDen)}
        data-testid="timeline-scrubber"
        onKeyDown={(event) => {
          const step = Math.max(1, Math.round(durationTicks / 100));
          if (event.key === "ArrowRight") { event.preventDefault(); onScrub(Math.min(durationTicks, playheadTicks + step)); }
          if (event.key === "ArrowLeft") { event.preventDefault(); onScrub(Math.max(0, playheadTicks - step)); }
          if (event.key === "Home") { event.preventDefault(); onScrub(0); }
          if (event.key === "End") { event.preventDefault(); onScrub(durationTicks); }
        }}
        onPointerDown={(event) => {
          (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
          scrubFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.buttons > 0) scrubFromPointer(event.clientX);
        }}
        className={`relative h-11 cursor-ew-resize overflow-hidden rounded-[10px] bg-[var(--bg-inset)] ${STUDIO_FOCUS_RING_CLASS}`}
      >
        <div
          data-testid="timeline-playhead"
          className="absolute inset-y-0 w-[2px] bg-[var(--accent)]"
          style={{ left: `${(playheadTicks / durationTicks) * 100}%` }}
        />
        <span className="pointer-events-none absolute left-2 top-1 font-mono text-[10.5px] text-[var(--text-tertiary)]">
          {ticksToTimecode(playheadTicks, timescale, fpsNum, fpsDen)}
        </span>
      </div>
      <div data-testid="timeline-tracks" onKeyDown={onKeyDown} className="flex flex-col gap-1.5 overflow-x-auto pb-1">
        {tracks.length === 0 ? (
          <p className="px-1 py-3 text-[12px] text-[var(--text-tertiary)]">No tracks yet. Add media from the bin to start cutting.</p>
        ) : null}
        {tracks.map((track) => (
          <div key={track.trackId} className="flex min-w-max items-stretch gap-2" role="group" aria-label={`${track.kind} track`}>
            <span className="w-14 shrink-0 self-center text-[10.5px] uppercase tracking-wide text-[var(--text-tertiary)]">{track.kind}</span>
            <div className="relative h-12 flex-1" style={{ minWidth: 320 }}>
              {track.clips.map((clip) => {
                const selected = clip.clipId === selectedClipId;
                return (
                  <button
                    key={clip.clipId}
                    type="button"
                    data-testid={`timeline-clip-${clip.clipId}`}
                    aria-pressed={selected}
                    aria-label={`Clip ${clip.clipId.slice(0, 8)} starting ${ticksToTimecode(clip.timelineStartTicks, timescale, fpsNum, fpsDen)}`}
                    onClick={() => onSelectClip(clip.clipId)}
                    onFocus={() => onSelectClip(clip.clipId)}
                    className={`absolute inset-y-0 overflow-hidden rounded-[8px] border px-2 py-1 text-left ${STUDIO_FOCUS_RING_CLASS} ${
                      selected ? "border-[var(--accent)] bg-[var(--bg-elevated)]" : "border-[var(--border-subtle)] bg-[var(--bg-inset)]"
                    }`}
                    style={{
                      left: clip.timelineStartTicks * pxPerTick,
                      width: Math.max(24, clip.durationTicks * pxPerTick),
                    }}
                  >
                    <span className="block truncate text-[11px] text-[var(--text-primary)]">
                      {clip.assetId.slice(0, 6)}·v{clip.version}
                    </span>
                    <span className="block font-mono text-[10px] text-[var(--text-tertiary)]">
                      {ticksToTimecode(clip.durationTicks, timescale, fpsNum, fpsDen)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--text-tertiary)]">← → select clip · S splits at playhead · Esc clears selection.</p>
    </section>
  );
}

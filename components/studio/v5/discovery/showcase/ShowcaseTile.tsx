"use client";

/**
 * Discovery media tile — the one card for showcase video and images.
 *
 * Poster first, always. A video attaches its source only on intent: 250ms
 * of mouse hover, or the touch play button. One preview plays page-wide
 * (preview-manager), muted and looped; it stops on leave, when the tile
 * falls under 25% visible, and never starts under reduced motion or data
 * saver. The whole tile is a link to creation detail; Remix / Open are
 * separate controls revealed on hover AND keyboard focus (never hover-only).
 */

import * as React from "react";
import Link from "next/link";
import { StudioNavIcon } from "../../shell/studio-nav-icons";
import {
  aspectLabel,
  creationHref,
  formatDuration,
  itemTitle,
  remixHref,
  type StudioShowcaseItem,
} from "../../../../../lib/studio-v5/showcase-feed";
import { claimPreview, previewAllowed, releasePreview } from "./preview-manager";
import { rememberInvoker } from "./return-focus";

const INTENT_DELAY_MS = 250;

export interface ShowcaseTileProps {
  item: StudioShowcaseItem;
  projectId: string | null;
  /** Grid/cell classes (span, aspect) from the parent layout. */
  className?: string;
  /** Attribution line 1 (app title or model label); omitted when null. */
  attribution?: string | null;
  eager?: boolean;
  /** Hide the Remix/Open cluster (e.g. tiles inside a single-link card). */
  actions?: boolean;
  /** Tile is a decorative preview inside another link: no own link. */
  decorative?: boolean;
  onHidden?: (id: string) => void;
}

export function ShowcaseTile({
  item,
  projectId,
  className = "",
  attribution = null,
  eager = false,
  actions = true,
  decorative = false,
  onHidden,
}: ShowcaseTileProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [videoFailed, setVideoFailed] = React.useState(false);
  const [posterFailed, setPosterFailed] = React.useState(false);

  const canPreview = item.mediaType === "video" && item.videoUrl !== null && !videoFailed;

  const stop = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPlaying(false);
    setReady(false);
    setProgress(0);
    releasePreview(item.id);
  }, [item.id]);

  const start = React.useCallback(() => {
    if (!canPreview || !previewAllowed()) return;
    claimPreview(item.id, stop);
    setPlaying(true);
  }, [canPreview, item.id, stop]);

  const startWithIntent = React.useCallback(() => {
    if (!canPreview) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      start();
    }, INTENT_DELAY_MS);
  }, [canPreview, start]);

  // Pause when mostly offscreen; clean up on unmount.
  React.useEffect(() => {
    if (!playing) return;
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.intersectionRatio < 0.25) stop();
      },
      { threshold: [0, 0.25] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [playing, stop]);

  React.useEffect(() => () => stop(), [stop]);

  if (posterFailed) return null;

  const duration = formatDuration(item.durationSeconds);
  const remix = remixHref(item, projectId);
  const label = `${itemTitle(item)} — ${item.mediaType === "video" ? "video" : "image"}, ${aspectLabel(item.aspectRatio)}${duration ? `, ${duration}` : ""}`;
  const lineOne = attribution;
  const lineTwo = `${aspectLabel(item.aspectRatio)}${item.mediaType === "video" ? (duration ? ` · ${duration}` : " · Video") : " · Image"}`;
  const objectPosition = "50% 40%";

  return (
    <div
      ref={hostRef}
      data-showcase-tile={item.id}
      data-media={item.mediaType}
      data-placeholder={item.placeholder ? "true" : undefined}
      className={`group/tile relative isolate overflow-hidden rounded-[10px] bg-[var(--bg-inset)] ${className}`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") startWithIntent();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") stop();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- showcase posters are static manifest media */}
      <img
        src={item.posterUrl}
        alt=""
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        onError={() => {
          setPosterFailed(true);
          onHidden?.(item.id);
        }}
        style={{ objectPosition }}
        className="absolute inset-0 h-full w-full object-cover transition-[filter,transform] duration-300 ease-out group-hover/tile:brightness-[1.04] motion-reduce:transition-none"
      />
      {playing && item.videoUrl ? (
        <video
          ref={videoRef}
          src={item.videoUrl}
          poster={item.posterUrl}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onCanPlay={(event) => {
            setReady(true);
            // autoPlay alone is not honoured everywhere (background panes,
            // some policies); an explicit muted play() is.
            const video = event.currentTarget;
            if (video.paused) void video.play().catch(() => undefined);
          }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            if (video.duration > 0) setProgress(video.currentTime / video.duration);
          }}
          onError={() => {
            setVideoFailed(true);
            stop();
          }}
          style={{ objectPosition }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${ready ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}

      {/* Bottom scrim + attribution: hover or keyboard focus. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex h-[55%] items-end bg-gradient-to-t from-black/70 via-black/25 to-transparent px-3 pb-3 opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100"
      >
        <div className="min-w-0 pr-24 text-white">
          {lineOne ? <p className="truncate text-[12.5px] font-medium leading-tight">{lineOne}</p> : null}
          <p className="mt-0.5 truncate text-[11.5px] text-white/70">{lineTwo}</p>
        </div>
      </div>

      {decorative ? null : (
        <Link
          href={creationHref(item)}
          scroll={false}
          onClick={(event) => rememberInvoker(event.currentTarget)}
          aria-label={`Open ${label}`}
          className="absolute inset-0 z-[3] rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
        />
      )}

      {/* Persistent chrome: duration (video) and provenance chips. */}
      {duration && !playing ? (
        <span className="pointer-events-none absolute bottom-2 right-2 z-[4] rounded-[6px] bg-black/55 px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-white backdrop-blur-sm transition-opacity duration-150 group-hover/tile:opacity-0 group-focus-within/tile:opacity-0">
          {videoFailed ? "Still preview" : duration}
        </span>
      ) : null}
      {/* Touch: explicit play/pause (no hover on coarse pointers). */}
      {canPreview && !decorative ? (
        <button
          type="button"
          onClick={() => (playing ? stop() : start())}
          aria-label={playing ? `Pause preview of ${label}` : `Preview ${label}`}
          aria-pressed={playing}
          className="absolute bottom-2 left-2 z-[5] hidden h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm pointer-coarse:flex focus-visible:ring-2 focus-visible:ring-[var(--accent)] outline-none"
        >
          {playing ? (
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
          ) : (
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
      ) : null}

      {actions && !decorative ? (
        <div className="absolute bottom-2.5 right-2.5 z-[5] flex items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 pointer-coarse:hidden">
          {remix ? (
            <Link
              href={remix}
              aria-label={`Remix ${itemTitle(item)}`}
              className="inline-flex h-[30px] items-center gap-1 rounded-[8px] bg-[var(--accent)] px-2.5 text-[12px] font-semibold text-[var(--accent-fg)] outline-none transition-opacity hover:opacity-90 active:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <StudioNavIcon name="remix" size={13} />
              Remix
            </Link>
          ) : null}
          <Link
            href={creationHref(item)}
            scroll={false}
            onClick={(event) => rememberInvoker(event.currentTarget)}
            aria-label={`Open details for ${label}`}
            className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-black/45 text-white outline-none backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <StudioNavIcon name="open" size={13} />
          </Link>
        </div>
      ) : null}

      {playing ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-[2px] origin-left bg-white/80" style={{ transform: `scaleX(${progress})` }} />
      ) : null}
    </div>
  );
}

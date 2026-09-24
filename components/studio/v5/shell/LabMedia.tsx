"use client";

/**
 * Studio V4 lab — media primitives (§24/§59–§61).
 *
 * One card type backs every mosaic, rail and showcase on the homepage, so the
 * whole page obeys the same playback contract:
 *
 * - poster paints first, always, at a fixed aspect box (no layout shift, no
 *   black holes while a clip loads);
 * - a clip only attaches its source when the card is near the viewport;
 * - a shared budget caps how many clips play at once, so a page with fourteen
 *   videos never opens fourteen streams;
 * - leaving the viewport pauses and yields the slot back;
 * - `prefers-reduced-motion` keeps every card on its poster.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ResolvedLabMedia } from "@/lib/studio-v5/media-manifest";

/** Simultaneous playing clips. Four keeps a dense page cheap and alive. */
const PLAYBACK_BUDGET = 4;

const playing = new Set<string>();
const waiting = new Map<string, () => void>();

function requestSlot(id: string, onGranted: () => void): boolean {
  if (playing.has(id)) return true;
  if (playing.size < PLAYBACK_BUDGET) {
    playing.add(id);
    return true;
  }
  waiting.set(id, onGranted);
  return false;
}

function releaseSlot(id: string): void {
  playing.delete(id);
  waiting.delete(id);
  const next = waiting.entries().next();
  if (!next.done) {
    const [nextId, grant] = next.value;
    waiting.delete(nextId);
    playing.add(nextId);
    grant();
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export const ASPECT_CLASS: Record<string, string> = {
  "21/9": "aspect-[21/9]",
  "16/9": "aspect-[16/9]",
  "3/2": "aspect-[3/2]",
  "4/5": "aspect-[4/5]",
  "1/1": "aspect-square",
  "9/16": "aspect-[9/16]",
};

export interface LabMediaFrameProps {
  media: ResolvedLabMedia;
  className?: string;
  /** Override the manifest aspect (mosaic cells sometimes need a taller box). */
  aspect?: keyof typeof ASPECT_CLASS;
  /** Fill the parent instead of using an aspect box. */
  fill?: boolean;
  /** Stop playback entirely (used by mosaics that already have a hero clip). */
  still?: boolean;
  priority?: boolean;
  children?: React.ReactNode;
}

/**
 * The media surface itself: poster image, optional clip, and whatever overlay
 * the caller composes on top.
 */
export function LabMediaFrame({
  media,
  className,
  aspect,
  fill = false,
  still = false,
  priority = false,
  children,
}: LabMediaFrameProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const reducedMotion = useReducedMotion();
  const [near, setNear] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  const isVideo = media.kind === "video" && media.src !== null && !still && !reducedMotion;

  React.useEffect(() => {
    if (!isVideo) return;
    const node = hostRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setNear(entry.isIntersecting);
      },
      // A generous margin preloads the next row without playing it.
      { rootMargin: "240px 0px", threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isVideo]);

  React.useEffect(() => {
    if (!isVideo) return;
    const id = media.id;
    if (!near) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- M7A: observer/slot-arbiter effect; activation is externally driven, not render-derived.
      setActive(false);
      releaseSlot(id);
      return;
    }
    const granted = requestSlot(id, () => setActive(true));
    if (granted) setActive(true);
    return () => releaseSlot(id);
  }, [isVideo, near, media.id]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      const play = video.play();
      if (play && typeof play.catch === "function") play.catch(() => setActive(false));
    } else {
      video.pause();
    }
  }, [active]);

  return (
    <div
      ref={hostRef}
      className={cn(
        "relative overflow-hidden bg-[var(--chat-surface-sunken)]",
        fill ? "h-full w-full" : ASPECT_CLASS[aspect ?? media.aspectRatio],
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.poster}
        alt=""
        aria-hidden="true"
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {isVideo && near ? (
        <video
          ref={videoRef}
          // The source is attached only once the card is near the viewport,
          // so an unseen row costs nothing.
          src={media.src ?? undefined}
          poster={media.poster}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onCanPlay={() => setReady(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            ready && active ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
      {children}
    </div>
  );
}

/** The gradient scrim overlays share, so overlay text is always legible. */
export function LabMediaScrim({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/78 via-black/12 to-transparent",
        className,
      )}
    />
  );
}

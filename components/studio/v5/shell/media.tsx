"use client";

import { useState } from "react";
import Link from "next/link";
import type { StudioAudioRowProps, StudioMediaCardProps } from "./types";
import { STUDIO_FOCUS_RING_CLASS } from "./tokens";

/**
 * STUDIO_08 — media-first generation card (recovered from V4 LabMedia
 * composition with fixture actions removed). Status, cost and lineage
 * are visible without hover. Image failure renders an intentional
 * neutral fallback — never a broken image icon.
 */
export function StudioMediaCard({
  id,
  title,
  kind,
  href,
  imageUrl,
  imageAlt,
  statusLabel,
  costLabel,
  lineageLabel,
  badge,
}: StudioMediaCardProps) {
  const [failed, setFailed] = useState(false);
  const showFallback = failed || !imageUrl;
  return (
    <article
      data-testid={`studio-media-card-${id}`}
      className="overflow-hidden rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-elevated)]"
    >
      <Link href={href} aria-label={`${title} (${kind})`} className={`block ${STUDIO_FOCUS_RING_CLASS}`}>
        {showFallback ? (
          <div
            data-testid={`studio-media-fallback-${id}`}
            aria-hidden
            className="flex aspect-[4/3] w-full items-center justify-center bg-[var(--bg-inset)]"
          >
            <span className="text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{kind}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={imageAlt ?? ""}
            loading="lazy"
            onError={() => setFailed(true)}
            className="aspect-[4/3] w-full object-cover"
          />
        )}
        <span className="block px-3 py-2.5">
          <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{title}</span>
          <span className="mt-0.5 block text-[11.5px] text-[var(--text-tertiary)]">
            {[kind, statusLabel, costLabel, lineageLabel].filter(Boolean).join(" · ")}
          </span>
        </span>
      </Link>
      {badge ? (
        <span className="mx-3 mb-3 inline-block rounded-full bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
          {badge}
        </span>
      ) : null}
    </article>
  );
}

/**
 * STUDIO_08 — audio result row with waveform bars, status and cost.
 * No autoplay; playback controls belong to the detail surface.
 */
export function StudioAudioRow({ id, title, durationLabel, statusLabel, costLabel, waveformBars, href }: StudioAudioRowProps) {
  const bars = waveformBars ?? [8, 14, 11, 18, 22, 15, 19, 12, 16, 9, 13, 17, 10, 15, 8, 12];
  return (
    <article
      data-testid={`studio-audio-row-${id}`}
      className="rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 py-3"
    >
      <Link href={href} aria-label={`${title} (audio)`} className={`flex min-h-[44px] items-center gap-4 ${STUDIO_FOCUS_RING_CLASS}`}>
        <span aria-hidden className="flex h-8 shrink-0 items-end gap-[3px]">
          {bars.slice(0, 24).map((height, index) => (
            <span
              key={index}
              style={{ height: `${Math.min(Math.max(height, 4), 32)}px` }}
              className="w-[3px] rounded-full bg-[var(--text-tertiary)]"
            />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{title}</span>
          <span className="mt-0.5 block text-[11.5px] text-[var(--text-tertiary)]">
            {[durationLabel, statusLabel, costLabel].filter(Boolean).join(" · ")}
          </span>
        </span>
      </Link>
    </article>
  );
}

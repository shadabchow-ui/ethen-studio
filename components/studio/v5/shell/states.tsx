"use client";

import Link from "next/link";
import type { StudioEmptyStateProps, StudioErrorStateProps } from "./types";
import { STUDIO_FOCUS_RING_CLASS } from "./tokens";

/** Final polish — a quiet glyph that tells empty and error apart at a glance. */
function StateGlyph({ kind }: { kind: "empty" | "error" }) {
  return (
    <span aria-hidden="true" className="mx-auto mb-3.5 flex h-10 w-10 items-center justify-center rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {kind === "empty" ? <path d="M4 13h4l1.5 2.5h5L16 13h4M5.5 6h13L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" /> : <path d="M12 8v5M12 16.5h.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />}
      </svg>
    </span>
  );
}

/**
 * STUDIO_08 — distinct empty state. Absence of content is never rendered
 * as a fetch failure, and actions always name a real destination.
 * VISUAL-01 compact mode bounds the state to one region instead of
 * dominating the page.
 */
export function StudioEmptyState({ title, description, actionLabel, actionHref, onAction, testId, compact }: StudioEmptyStateProps & { compact?: boolean }) {
  return (
    <div
      data-testid={testId ?? "studio-empty-state"}
      role="status"
      className={`rounded-[16px] border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] text-center ${compact ? "px-4 py-5" : "px-6 py-12"}`}
    >
      {compact ? null : <StateGlyph kind="empty" />}
      <p className="text-[14px] font-medium text-[var(--text-primary)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-5 text-[var(--text-secondary)]">{description}</p>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className={`mt-4 inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--studio-bg-selected)] ${STUDIO_FOCUS_RING_CLASS}`}
        >
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && !actionHref && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={`mt-4 inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--studio-bg-selected)] ${STUDIO_FOCUS_RING_CLASS}`}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * STUDIO_08 — distinct error state. Copy explains the user action, never
 * internal class names or storage implementation. Retry is explicit.
 */
export function StudioErrorState({
  title,
  description,
  retryLabel,
  onRetry,
  secondaryLabel,
  secondaryHref,
  testId,
  compact,
}: StudioErrorStateProps & { compact?: boolean }) {
  return (
    <div
      data-testid={testId ?? "studio-error-state"}
      role="alert"
      className={`rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] text-center ${compact ? "px-4 py-5" : "px-6 py-12"}`}
    >
      {compact ? null : <StateGlyph kind="error" />}
      <p className="text-[14px] font-medium text-[var(--text-primary)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-5 text-[var(--text-secondary)]">{description}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {retryLabel && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--studio-bg-selected)] ${STUDIO_FOCUS_RING_CLASS}`}
          >
            {retryLabel}
          </button>
        ) : null}
        {secondaryLabel && secondaryHref ? (
          <Link
            href={secondaryHref}
            className={`inline-flex min-h-[44px] items-center rounded-[10px] px-4 py-2.5 text-[12.5px] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * VISUAL-05 — shared loading vocabulary. One honest pending surface
 * (role=status, calm copy, no fake progress) used by libraries,
 * settings, and trays instead of bespoke loaders.
 */
export function StudioLoadingState({ title, testId }: { title: string; testId?: string }) {
  return (
    <p
      role="status"
      data-testid={testId}
      className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-12 text-center text-[13px] text-[var(--text-tertiary)] motion-safe:animate-pulse"
    >
      {title}
    </p>
  );
}

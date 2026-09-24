/**
 * STUDIO_09 — create result card and history list.
 *
 * In-flow result below the composer (never hidden under sticky controls)
 * with real stage labels, cost, retry, use-as-reference, and
 * open-in-workbench / open-in-Canvas handoffs. Failed runs never claim
 * “no charge” — the receipt is the source of charge truth.
 */

"use client";

import Link from "next/link";
import type { CreateJobResultView } from "./types";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import { isTerminalJobStatus } from "./create-api-client";

const ACTION_CLASS = `inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--bg-elevated)] px-3 py-2 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--studio-bg-selected)] ${STUDIO_FOCUS_RING_CLASS}`;

export function workbenchHrefFor(toolId: string, jobId: string): string {
  // VISUAL-06 — handoffs must resolve: /studio/workbench/* never existed;
  // /studio/pro/* is the implemented Pro workbench for the same tools.
  const workbench = toolId === "video" ? "video" : toolId === "music" || toolId === "sfx" ? "audio" : "image";
  return `/studio/pro/${workbench}?jobId=${encodeURIComponent(jobId)}`;
}

export function canvasHrefFor(jobId: string): string {
  // VISUAL-06 — /studio/canvas is a certified redirect to Home; the
  // implemented Canvas surface is the workflows graph list/workspace.
  return `/studio/workflows?jobId=${encodeURIComponent(jobId)}`;
}

export function CreateResultCard({
  result,
  onRetry,
  onUseAsReference,
  retryBusy,
}: {
  result: CreateJobResultView;
  onRetry?: () => void;
  onUseAsReference?: () => void;
  retryBusy?: boolean;
}) {
  const terminal = isTerminalJobStatus(result.status);
  const failed = result.status === "FAILED";
  return (
    <article
      data-testid="create-result"
      aria-label={`Result for job ${result.jobId}`}
      className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-medium text-[var(--text-primary)]">
          {terminal ? result.statusLabel : `${result.statusLabel}…`}
        </h3>
        {result.costLabel ? (
          <span className="text-[12px] text-[var(--text-secondary)]">{result.costLabel}</span>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-[12.5px] text-[var(--text-secondary)]">{result.promptText}</p>
      {result.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.previewUrl}
          alt={`Generated output for job ${result.jobId}`}
          className="mt-3 max-h-[320px] w-full rounded-[12px] object-contain"
          loading="lazy"
        />
      ) : null}
      {failed ? (
        <p role="alert" className="mt-2 text-[12.5px] text-[var(--text-primary)]">
          This run failed. Successful charged outputs, if any, are listed on the receipt.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {result.retryable && onRetry ? (
          <button type="button" onClick={onRetry} disabled={retryBusy} className={ACTION_CLASS}>
            {retryBusy ? "Retrying…" : "Retry"}
          </button>
        ) : null}
        {onUseAsReference ? (
          <button type="button" onClick={onUseAsReference} className={ACTION_CLASS}>
            Use as reference
          </button>
        ) : null}
        <Link href={workbenchHrefFor(result.toolId, result.jobId)} className={ACTION_CLASS}>
          Open in workbench
        </Link>
        <Link href={canvasHrefFor(result.jobId)} className={ACTION_CLASS}>
          Open in Canvas
        </Link>
      </div>
    </article>
  );
}

export function CreateHistoryList({
  entries,
  onRetry,
  onSelect,
}: {
  entries: readonly CreateJobResultView[];
  onRetry?: (jobId: string) => void;
  onSelect?: (jobId: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <p role="status" data-testid="create-history-empty" className="text-[12.5px] text-[var(--text-tertiary)]">
        No generations yet — completed runs appear here with their cost and status.
      </p>
    );
  }
  return (
    <ol data-testid="create-history" className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.jobId}>
          <CreateResultCard
            result={entry}
            onRetry={entry.retryable && onRetry ? () => onRetry(entry.jobId) : undefined}
            onUseAsReference={undefined}
          />
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(entry.jobId)}
              className="mt-1 text-[12px] text-[var(--text-secondary)] underline"
            >
              Reload these settings
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

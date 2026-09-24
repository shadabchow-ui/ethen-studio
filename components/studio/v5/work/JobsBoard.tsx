/**
 * STUDIO_18 — jobs truth board.
 * Replaces misleading local/in-memory prose with the canonical read
 * model: stage, attempts with ambiguity, reconciliation, charges
 * (including failed children), and safe retry/cancel from the kernel
 * policy. Retry/cancel act through the canonical j05 routes; the board
 * only shows eligibility, never invents transitions.
 */
"use client";

import { useState } from "react";
import { StudioEmptyState, StudioErrorState } from "../shell/states";
import { StudioSetupState } from "../shell/StudioSetupState";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { WorkJobView, WorkUiState } from "./types";

export function JobsBoard({
  uiState,
  jobs,
  busy,
  notice,
  onRetry,
  onCancel,
}: {
  uiState: WorkUiState;
  jobs: readonly WorkJobView[];
  busy: string | null;
  notice: string | null;
  onRetry: () => void;
  onCancel: (job: WorkJobView) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section aria-label="Jobs" data-testid="work-jobs" className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        Studio work · jobs · canonical truth
      </p>
      {notice ? (
        <p role="status" className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-[12.5px] text-[var(--text-secondary)]">
          {notice}
        </p>
      ) : null}
      {uiState.state === "loading" ? (
        <p role="status" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-12 text-center text-[13px] text-[var(--text-tertiary)]">
          Loading jobs…
        </p>
      ) : null}
      {uiState.state === "empty" ? (
        <StudioEmptyState
          title="No jobs yet"
          description="Admitted jobs appear here with their canonical stage, attempts, and charges."
          actionLabel="Create something"
          actionHref={typeof window !== "undefined" ? `/studio/create/image?projectId=${encodeURIComponent(new URLSearchParams(window.location.search).get("projectId") ?? "")}` : "/studio/create/image"}
          testId="work-jobs-empty"
        />
      ) : null}
      {uiState.state === "setup" ? (
        <StudioSetupState
          what="Jobs"
          dependency={uiState.dependency}
          primaryLabel="Go to Assets"
          primaryHref={typeof window !== "undefined" ? `/studio/work/assets?projectId=${encodeURIComponent(new URLSearchParams(window.location.search).get("projectId") ?? "")}` : "/studio/work/assets"}
          testId="work-jobs-setup"
        />
      ) : null}
      {(uiState.state === "error" || uiState.state === "permission") && (
        <StudioErrorState
          title={uiState.state === "permission" ? "Sign in required" : "Jobs unavailable"}
          description={uiState.message ?? "Jobs listing failed."}
          retryLabel={uiState.state === "error" ? "Retry" : undefined}
          onRetry={uiState.state === "error" ? onRetry : undefined}
          testId="work-jobs-error"
        />
      )}
      {uiState.state === "ready" ? (
        <ul className="space-y-3" aria-label="Jobs">
          {jobs.map((job) => {
            const open = expanded === job.jobId;
            return (
              <li key={job.jobId} className="rounded-[16px] bg-[var(--bg-surface)] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-[14px] text-[var(--text-primary)]">{job.taskName}</h3>
                      <span className="shrink-0 rounded-full bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                        {job.stageLabel}
                      </span>
                    </span>
                    <p className="mt-1 font-mono text-[10.5px] text-[var(--text-tertiary)]">{job.jobId}</p>
                    <p className="mt-1 text-[12px] text-[var(--text-secondary)]" data-testid={`job-summary-${job.jobId}`}>
                      {job.summary}
                    </p>
                    {job.ambiguousAttempt ? (
                      <p className="mt-1 text-[12px] font-medium text-[var(--text-primary)]">
                        Ambiguous provider submit — reconciliation must resolve before retry.
                      </p>
                    ) : null}
                    {job.failedChildrenWithCharges.length > 0 ? (
                      <p className="mt-1 text-[12px] font-medium text-[var(--text-primary)]">
                        {job.failedChildrenWithCharges.length} failed child job
                        {job.failedChildrenWithCharges.length === 1 ? "" : "s"} still charged:{" "}
                        {job.failedChildrenWithCharges.map((child) => `${child.jobId} (${child.chargedIcu} ICU)`).join(", ")}.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Actions for ${job.jobId}`}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : job.jobId)}
                      aria-expanded={open}
                      className={`inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
                    >
                      {open ? "Collapse" : "Detail"}
                    </button>
                    <button
                      type="button"
                      disabled={!job.cancellable || busy === job.jobId}
                      onClick={() => onCancel(job)}
                      title={job.cancellable ? undefined : `Terminal ${job.status} cannot cancel.`}
                      className={`inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] text-[var(--text-primary)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
                    >
                      {busy === job.jobId ? "Cancelling…" : "Cancel"}
                    </button>
                  </div>
                </div>
                {open ? (
                  <dl className="mt-3 grid gap-x-8 gap-y-1.5 border-t border-[var(--border-default)] pt-3 text-[12px] sm:grid-cols-2">
                    <div className="flex justify-between gap-2"><dt className="text-[var(--text-tertiary)]">Stage</dt><dd className="text-[var(--text-secondary)]">{job.stageLabel}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-[var(--text-tertiary)]">Attempts</dt><dd className="text-[var(--text-secondary)]">{job.attemptCount}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-[var(--text-tertiary)]">Estimated</dt><dd className="text-[var(--text-secondary)]">{job.estimatedIcu === null ? "—" : `${job.estimatedIcu} ICU`}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-[var(--text-tertiary)]">Charged</dt><dd className="text-[var(--text-secondary)]">{job.chargedIcu === null ? "not yet settled" : `${job.chargedIcu} ICU`}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-[var(--text-tertiary)]">Released</dt><dd className="text-[var(--text-secondary)]">{job.releasedIcu === null ? "—" : `${job.releasedIcu} ICU`}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-[var(--text-tertiary)]">Retry</dt><dd className="text-[var(--text-secondary)]">{job.retryKind === "forbidden" ? `forbidden — ${job.retryReason}` : `${job.retryKind.replace("_", " ")} — ${job.retryReason}`}</dd></div>
                    {job.reconcilingChildren.length > 0 ? (
                      <div className="flex justify-between gap-2"><dt className="text-[var(--text-tertiary)]">Reconciling children</dt><dd className="truncate font-mono text-[11px] text-[var(--text-secondary)]">{job.reconcilingChildren.join(", ")}</dd></div>
                    ) : null}
                    {job.lastError ? (
                      <div className="flex justify-between gap-2"><dt className="text-[var(--text-tertiary)]">Last error</dt><dd className="max-w-[60%] truncate text-[var(--text-secondary)]" title={job.lastError}>{job.lastError}</dd></div>
                    ) : null}
                    {job.cancelReason ? (
                      <div className="flex justify-between gap-2"><dt className="text-[var(--text-tertiary)]">Cancel reason</dt><dd className="text-[var(--text-secondary)]">{job.cancelReason}</dd></div>
                    ) : null}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

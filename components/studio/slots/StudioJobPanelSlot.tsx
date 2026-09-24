"use client";

import { useCallback, useEffect, useState } from "react";
import type { StudioJobPanelSlotProps } from "@ethen/app-shell";
import { presentStudioJob } from "@ethen/ui/jobs/studio-job-ux";
import { useStudioWorkbenchSelectionOptional } from "./selection-context";
import {
  SlotEmpty,
  SlotError,
  SlotLoading,
  SlotPanel,
  SlotUnauthorized,
  fetchSlotJson,
  isUnauthorizedStatus,
  type SlotFetchState,
} from "./slot-primitives";

/**
 * Studio V2 Job 13 — JobPanel slot implementation.
 *
 * Mounts the Job 12B canonical live binding (`readStudioJobPresentation`)
 * through the thin `/api/media/shell/job-presentation` projection and the
 * shared `presentStudioJob` contract. Unknown states render `unknown`;
 * progress renders only when measured (the durable job carries none, so no
 * bar). Studio V3 Job 4 adds Retry/Cancel through the canonical durable
 * action surface (POST image|video jobs/[id]); only states the service
 * can transition offer the action, and denials surface honestly.
 */

interface JobBindingPayload {
  jobId: string;
  projectId: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  terminalReason: string | null;
  hasReceipt: boolean;
  hasEvidence: boolean;
}

const JOB_TERMINAL: ReadonlySet<string> = new Set([
  "completed", "failed", "cancelled", "dead_letter", "timed_out", "indeterminate", "escalated", "halt_unsafe",
]);

const TONE_STYLES: Record<string, string> = {
  neutral: "bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
  info: "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
  warning: "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
  success: "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
  danger: "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
};

export function StudioJobPanelSlot({ projectId, jobId, onOpenJob }: StudioJobPanelSlotProps) {
  const selection = useStudioWorkbenchSelectionOptional();
  const [fetchState, setFetchState] = useState<SlotFetchState<JobBindingPayload>>({ state: "loading" });

  const load = useCallback(() => {
    if (!jobId) {
      setFetchState({ state: "empty" });
      return;
    }
    setFetchState({ state: "loading" });
    void fetchSlotJson(
      `/api/media/shell/job-presentation?projectId=${encodeURIComponent(projectId)}&jobId=${encodeURIComponent(jobId)}`,
    )
      .then(({ status, body }) => {
        if (isUnauthorizedStatus(status)) {
          setFetchState({ state: "unauthorized", message: "Job reads for this project require project membership." });
          return;
        }
        const record = body as { ok?: boolean; data?: JobBindingPayload; error?: unknown } | null;
        if (record?.ok && record.data) {
          setFetchState({ state: "ready", data: record.data });
          return;
        }
        if (status === 404) {
          setFetchState({ state: "empty" });
          return;
        }
        const message =
          typeof record?.error === "string"
            ? record.error
            : (record?.error as { message?: string } | undefined)?.message ?? "Job presentation failed.";
        setFetchState({ state: "error", message });
      })
      .catch(() => setFetchState({ state: "error", message: "Network error reading job state." }));
  }, [projectId, jobId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- M7A: async loader on scope change; all setState calls settle in fetch continuations.
    load();
  }, [load]);

  useEffect(() => {
    if (fetchState.state === "ready") {
      selection?.setSubject({
        kind: "job",
        id: fetchState.data.jobId,
        title: `Job ${fetchState.data.jobId.slice(0, 8)}…`,
        detail: {
          Status: fetchState.data.status,
          Attempt: `${fetchState.data.attempt} of ${fetchState.data.maxAttempts}`,
          ...(fetchState.data.terminalReason ? { Reason: fetchState.data.terminalReason } : {}),
        },
      });
    }
    // Selection follows the bound job only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchState.state === "ready" ? (fetchState as { data: JobBindingPayload }).data.jobId : null]);

  const openJob = useCallback(() => {
    if (jobId) onOpenJob?.(jobId);
  }, [jobId, onOpenJob]);

  const [acting, setActing] = useState<"retry" | "cancel" | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const act = useCallback((action: "retry" | "cancel") => {
    if (!jobId || acting) return;
    setActing(action);
    setActionNote(null);
    // Kind-agnostic: both jobs routes share actOnMediaJob; the image route
    // resolves any durable media job by id within the project.
    void fetchSlotJson(`/api/media/image/jobs/${encodeURIComponent(jobId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, action }),
    })
      .then(({ status, body }) => {
        setActing(null);
        const record = body as { ok?: boolean; error?: unknown; status?: string } | null;
        if (record?.ok) {
          setActionNote(`${action === "retry" ? "Retried" : "Cancelled"} · ${typeof record.status === "string" ? record.status : "updated"}`);
          load();
          return;
        }
        const message = typeof record?.error === "string" ? record.error : `Job ${action} was refused (HTTP ${status}).`;
        setActionNote(message);
        load();
      })
      .catch(() => {
        setActing(null);
        setActionNote("Network error sending the job action.");
      });
  }, [jobId, acting, projectId, load]);

  const binding = fetchState.state === "ready" ? fetchState.data : null;
  const presentation = binding
    ? presentStudioJob({
        status: binding.status,
        progress: null,
        attempt: binding.attempt,
        maxAttempts: binding.maxAttempts,
        terminalReason: binding.terminalReason,
        hasReceipt: binding.hasReceipt,
        hasEvidence: binding.hasEvidence,
      })
    : null;

  return (
    <SlotPanel label="Studio job">
      {fetchState.state === "loading" ? <SlotLoading label="Reading job state…" /> : null}
      {fetchState.state === "unauthorized" ? <SlotUnauthorized message={fetchState.message} /> : null}
      {fetchState.state === "error" ? <SlotError message={fetchState.message} onRetry={load} /> : null}
      {fetchState.state === "empty" ? (
        <SlotEmpty title={jobId ? "No job in this project" : "No active jobs"} hint="Cross-project reads resolve to nothing." />
      ) : null}
      {binding && presentation ? (
        <div className="rounded-[12px] bg-[var(--bg-surface)] px-4 py-3.5" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`rounded-[7px] px-2.5 py-1 text-[11.5px] font-medium ${TONE_STYLES[presentation.tone] ?? TONE_STYLES.neutral}`}
            >
              {presentation.state}
            </span>
            <span className="font-mono text-[10.5px] text-[var(--text-tertiary)]">{binding.jobId.slice(0, 12)}…</span>
          </div>
          <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
            Attempt {binding.attempt} of {binding.maxAttempts}
            {binding.terminalReason ? ` · ${binding.terminalReason}` : ""}
          </p>
          {presentation.reconcilable ? (
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Reconciliation required — inspect evidence before retrying.</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {presentation.actions.includes("view-evidence") ? (
              <button
                type="button"
                onClick={openJob}
                disabled={!binding.hasEvidence}
                title={binding.hasEvidence ? undefined : "No evidence trail recorded for this job."}
                className="rounded-[9px] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] disabled:opacity-50"
              >
                Inspect evidence
              </button>
            ) : null}
            {presentation.actions.includes("view-receipt") ? (
              <button
                type="button"
                onClick={openJob}
                disabled={!binding.hasReceipt}
                title={binding.hasReceipt ? undefined : "No settled receipt for this job."}
                className="rounded-[9px] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] disabled:opacity-50"
              >
                View receipt
              </button>
            ) : null}
            {binding.status === "failed" ? (
              <button
                type="button"
                onClick={() => act("retry")}
                disabled={acting !== null}
                className="rounded-[9px] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] disabled:opacity-50"
              >
                {acting === "retry" ? "Retrying…" : "Retry"}
              </button>
            ) : null}
            {!JOB_TERMINAL.has(binding.status) ? (
              <button
                type="button"
                onClick={() => act("cancel")}
                disabled={acting !== null}
                className="rounded-[9px] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] disabled:opacity-50"
              >
                {acting === "cancel" ? "Cancelling…" : "Cancel"}
              </button>
            ) : null}
          </div>
          {actionNote ? (
            <p className="mt-2 text-[12px] text-[var(--text-secondary)]" role="status">{actionNote}</p>
          ) : null}
        </div>
      ) : null}
    </SlotPanel>
  );
}

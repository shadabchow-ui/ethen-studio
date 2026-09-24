"use client";

import { useCallback, useEffect, useState } from "react";
import type { StudioHistoryPanelSlotProps } from "@ethen/app-shell";
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
 * Studio V2 Job 13 — HistoryPanel slot implementation.
 *
 * Generation history only: the session's media jobs (`/api/media/jobs`),
 * strictly filtered to the slot's project scope. Workflow history, asset
 * versions, and review/export history keep their own surfaces and are not
 * flattened into this chronology. Legacy jobs without a project scope do
 * not appear here; the full jobs route list is unchanged.
 */

interface HistoryJob {
  id: string;
  status: string;
  prompt: string | null;
  modelName: string;
  modality: string;
  projectId: string | null;
  createdAt: string;
}

export function StudioHistoryPanelSlot({ projectId, onOpenRun }: StudioHistoryPanelSlotProps) {
  const selection = useStudioWorkbenchSelectionOptional();
  const [fetchState, setFetchState] = useState<SlotFetchState<HistoryJob[]>>({ state: "loading" });

  const load = useCallback(() => {
    setFetchState({ state: "loading" });
    void fetchSlotJson("/api/media/jobs")
      .then(({ status, body }) => {
        if (isUnauthorizedStatus(status)) {
          setFetchState({ state: "unauthorized", message: "Generation history requires a signed-in session." });
          return;
        }
        const record = body as { ok?: boolean; jobs?: HistoryJob[]; error?: unknown } | null;
        if (record?.ok && Array.isArray(record.jobs)) {
          const scoped = (record.jobs as HistoryJob[]).filter((job) => job.projectId === projectId);
          setFetchState(scoped.length === 0 ? { state: "empty" } : { state: "ready", data: scoped });
          return;
        }
        const message = typeof record?.error === "string" ? record.error : "Generation history is unavailable.";
        setFetchState({ state: "error", message });
      })
      .catch(() => setFetchState({ state: "error", message: "Network error reading generation history." }));
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- M7A: async loader on scope change; all setState calls settle in fetch continuations.
    load();
  }, [load]);

  const openRun = useCallback(
    (job: HistoryJob) => {
      selection?.setSubject({
        kind: "job",
        id: job.id,
        title: job.prompt?.slice(0, 80) || `${job.modality} generation`,
        detail: { Status: job.status, Model: job.modelName, Started: job.createdAt },
      });
      onOpenRun?.(job.id);
    },
    [selection, onOpenRun],
  );

  return (
    <SlotPanel label="Generation history">
      {fetchState.state === "loading" ? <SlotLoading label="Reading generation history…" /> : null}
      {fetchState.state === "unauthorized" ? <SlotUnauthorized message={fetchState.message} /> : null}
      {fetchState.state === "error" ? <SlotError message={fetchState.message} onRetry={load} /> : null}
      {fetchState.state === "empty" ? <SlotEmpty title="No history yet" hint="Generations in this project appear here." /> : null}
      {fetchState.state === "ready" ? (
        <ol className="space-y-1.5" aria-label={`${fetchState.data.length} generations`}>
          {fetchState.data.map((job) => (
            <li key={job.id}>
              <button
                type="button"
                onClick={() => openRun(job)}
                className="flex w-full items-baseline justify-between gap-3 rounded-[9px] bg-[var(--bg-surface)] px-3 py-2 text-left hover:bg-[var(--bg-elevated)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] text-[var(--text-primary)]">
                    {job.prompt?.trim() ? job.prompt : `${job.modality} generation`}
                  </span>
                  <span className="block text-[11px] text-[var(--text-tertiary)]">
                    {job.modelName} · {new Date(job.createdAt).toLocaleString()}
                  </span>
                </span>
                <span className="shrink-0 rounded-[7px] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                  {job.status}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </SlotPanel>
  );
}

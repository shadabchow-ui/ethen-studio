/**
 * STUDIO_11 — stage list with per-stage status, cost, and retry.
 * Plan order is fixed; failed/invalidated stages offer retry while
 * earlier successes are kept. Settled cost per stage stays visible.
 */

"use client";

import * as React from "react";
import { STUDIO_FOCUS_RING_CLASS } from "../../shell/tokens";
import { formatIcuDollars } from "../create-api-client";
import type { AudioStageId, AudioStageView } from "./types";

export function StageList({
  stages,
  busy,
  onRetry,
}: {
  stages: readonly AudioStageView[];
  busy: boolean;
  onRetry: (stage: AudioStageId) => void;
}) {
  const totalEstimated = stages.reduce((sum, stage) => sum + (stage.estimatedIcu ?? 0), 0);
  const totalSettled = stages.reduce((sum, stage) => sum + (stage.settledIcu ?? 0), 0);
  return (
    <section aria-label="Stages" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Stages</h2>
        <p className="text-[12px] text-[var(--text-tertiary)]" data-testid="stage-cost-total">
          {totalSettled > 0 ? `Settled ${formatIcuDollars(totalSettled)}` : `Estimated ${formatIcuDollars(totalEstimated)}`}
        </p>
      </div>
      <ol className="mt-3 space-y-2">
        {stages.map((stage) => (
          <li
            key={stage.stage}
            data-testid={`audio-stage-${stage.stage}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">
                {stage.label} <span className="font-normal text-[var(--text-tertiary)]">· {stage.task}</span>
              </p>
              <p className="text-[12px] text-[var(--text-secondary)]" data-testid={`audio-stage-${stage.stage}-status`}>
                {stage.statusLabel}
                {stage.jobId ? ` · job ${stage.jobId.slice(0, 8)}…` : ""}
                {stage.settledIcu !== null
                  ? ` · settled ${formatIcuDollars(stage.settledIcu)}`
                  : stage.estimatedIcu !== null
                    ? ` · est. ${formatIcuDollars(stage.estimatedIcu)}`
                    : ""}
              </p>
              {stage.errorMessage ? (
                <p role="alert" className="mt-0.5 text-[12px] text-[var(--danger, #c03535)]">
                  {stage.errorMessage}
                </p>
              ) : null}
            </div>
            {stage.retryable ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onRetry(stage.stage)}
                className={`rounded-[8px] border border-[var(--border-default)] px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
              >
                Retry from here
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

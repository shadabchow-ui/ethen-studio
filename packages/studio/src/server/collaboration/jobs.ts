/**
 * Studio V5 collaboration — canonical jobs-truth projection (STUDIO_18).
 *
 * Read-only projection over the j05 job/attempt and j04 receipt read
 * models: canonical stage, attempts with ambiguity, reconciliation
 * state, charges, and safe retry/cancel derived from the kernel
 * transition policy (never a local fork). Failed children that still
 * incurred charges are surfaced explicitly, never $0-silenced.
 */
import "server-only";
import { isTerminalStatus, planRetry, stageFor } from "../runtime/transitions";
import { jobStatusLabel } from "../runtime/states";
import type { JobStatus } from "../../contracts/execution";
import type {
  JobTruthView,
  TruthAttemptRow,
  TruthJobRow,
  TruthReceiptRow,
} from "./types";

const CANCELLABLE: readonly JobStatus[] = [
  "QUEUED",
  "RUNNING",
  "OUTPUT_READY",
  "INGESTING",
  "RECONCILING",
];

function asStatus(status: string): JobStatus {
  return status as JobStatus;
}

export function projectJobTruth(input: {
  job: TruthJobRow;
  attempts: readonly TruthAttemptRow[];
  receipt: TruthReceiptRow | null;
  /** Receipts of reconciling/failed children keyed by job id. */
  childReceipts?: ReadonlyMap<string, TruthReceiptRow>;
  /** Statuses of child jobs keyed by job id. */
  childStatuses?: ReadonlyMap<string, string>;
}): JobTruthView {
  const status = asStatus(input.job.status);
  const ambiguousAttempt = input.attempts.some((attempt) => attempt.submitAmbiguous);
  const retry = planRetry(status, ambiguousAttempt);
  const receipt = input.receipt;
  const reconcilingChildren = receipt ? [...receipt.reconcilingChildren] : [];
  const failedChildrenWithCharges: { jobId: string; chargedIcu: number }[] = [];
  let childrenChargedIcu = 0;
  if (receipt && input.childReceipts && input.childStatuses) {
    for (const childId of receipt.reconcilingChildren) {
      const childStatus = input.childStatuses.get(childId);
      const childReceipt = input.childReceipts.get(childId);
      if (childStatus === "FAILED" && childReceipt && childReceipt.chargedIcu > 0) {
        failedChildrenWithCharges.push({ jobId: childId, chargedIcu: childReceipt.chargedIcu });
      }
      if (childReceipt) childrenChargedIcu += childReceipt.chargedIcu;
    }
  }
  return {
    job: input.job,
    stageLabel: stageFor(status),
    terminal: isTerminalStatus(status),
    attempts: input.attempts,
    attemptCount: input.attempts.length,
    ambiguousAttempt,
    receipt,
    reconcilingChildren,
    failedChildrenWithCharges,
    totalChargedIcu: (receipt?.chargedIcu ?? 0) + childrenChargedIcu,
    retry:
      retry.kind === "linked_attempt"
        ? { kind: retry.kind, reason: "failed job retries as a linked attempt." }
        : { kind: retry.kind, reason: retry.reason },
    cancellable: CANCELLABLE.includes(status),
  };
}

/** Short human status line for list rows (canonical label + attempts). */
export function jobTruthSummary(view: JobTruthView): string {
  const base = jobStatusLabel(asStatus(view.job.status));
  const attempts = view.attemptCount === 1 ? "1 attempt" : `${view.attemptCount} attempts`;
  const charges =
    view.receipt != null
      ? ` · charged ${view.totalChargedIcu} ICU`
      : view.terminal
        ? ""
        : " · not yet settled";
  const children =
    view.failedChildrenWithCharges.length > 0
      ? ` · ${view.failedChildrenWithCharges.length} failed child${view.failedChildrenWithCharges.length === 1 ? "" : "ren"} charged`
      : "";
  return `${base} · ${attempts}${charges}${children}`;
}

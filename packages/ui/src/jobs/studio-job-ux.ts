/**
 * Studio V2 Job 12 (P0-5) — real job UX contract.
 *
 * Maps canonical runtime job states (durable queue + Studio lifecycles) to
 * shell presentation. Only states that exist in the runtime are mapped;
 * unknown states render as explicitly unknown — never invented progress,
 * never fake completion.
 */

export type CanonicalJobStatus =
  | "queued"
  | "claimed"
  | "planning"
  | "running"
  | "processing"
  | "waiting"
  | "admitted"
  | "reconciling"
  | "indeterminate"
  | "halt_unsafe"
  | "completed"
  | "failed"
  | "retryable"
  | "retrying"
  | "canceling"
  | "canceled"
  | "cancelled"
  | "timed_out"
  | "expired"
  | "dead_letter"
  | "dead_lettered";

export type JobPresentationTone = "neutral" | "info" | "warning" | "success" | "danger";

export type JobPresentationAction =
  | "cancel"
  | "retry"
  | "view-receipt"
  | "view-evidence"
  | "acknowledge";

export interface JobPresentationInput {
  status: CanonicalJobStatus | string;
  /** 0..1 when the runtime reports measured progress; null when unknown. */
  progress: number | null;
  attempt?: number;
  maxAttempts?: number;
  terminalReason?: string | null;
  hasReceipt?: boolean;
  hasEvidence?: boolean;
}

export interface JobPresentation {
  /** Display state; "unknown" when the runtime state is not recognized. */
  state: string;
  tone: JobPresentationTone;
  /** True for completed/failed/canceled/dead-letter/expired outcomes. */
  terminal: boolean;
  /** True when reconciliation (not blind retry) is the correct action. */
  reconcilable: boolean;
  actions: JobPresentationAction[];
  /** Measured progress only; null means the shell must not render a bar. */
  progress: number | null;
}

const PRESENTATION: Record<CanonicalJobStatus, Omit<JobPresentation, "progress">> = {
  queued: { state: "queued", tone: "neutral", terminal: false, reconcilable: false, actions: ["cancel", "view-evidence"] },
  claimed: { state: "running", tone: "info", terminal: false, reconcilable: false, actions: ["cancel", "view-evidence"] },
  planning: { state: "running", tone: "info", terminal: false, reconcilable: false, actions: ["cancel", "view-evidence"] },
  running: { state: "running", tone: "info", terminal: false, reconcilable: false, actions: ["cancel", "view-evidence"] },
  processing: { state: "running", tone: "info", terminal: false, reconcilable: false, actions: ["cancel", "view-evidence"] },
  waiting: { state: "waiting", tone: "warning", terminal: false, reconcilable: false, actions: ["cancel", "view-evidence"] },
  admitted: { state: "queued", tone: "neutral", terminal: false, reconcilable: false, actions: ["cancel", "view-evidence"] },
  reconciling: { state: "reconciling", tone: "warning", terminal: false, reconcilable: true, actions: ["view-evidence"] },
  indeterminate: { state: "reconciling", tone: "warning", terminal: false, reconcilable: true, actions: ["view-evidence"] },
  halt_unsafe: { state: "failed", tone: "danger", terminal: true, reconcilable: false, actions: ["view-evidence", "acknowledge"] },
  completed: { state: "completed", tone: "success", terminal: true, reconcilable: false, actions: ["view-receipt", "view-evidence"] },
  failed: { state: "failed", tone: "danger", terminal: true, reconcilable: false, actions: ["retry", "view-evidence"] },
  retryable: { state: "failed", tone: "danger", terminal: false, reconcilable: false, actions: ["retry", "view-evidence"] },
  retrying: { state: "running", tone: "info", terminal: false, reconcilable: false, actions: ["cancel", "view-evidence"] },
  canceling: { state: "canceling", tone: "warning", terminal: false, reconcilable: false, actions: ["view-evidence"] },
  canceled: { state: "canceled", tone: "neutral", terminal: true, reconcilable: false, actions: ["view-evidence"] },
  cancelled: { state: "canceled", tone: "neutral", terminal: true, reconcilable: false, actions: ["view-evidence"] },
  timed_out: { state: "failed", tone: "danger", terminal: true, reconcilable: true, actions: ["retry", "view-evidence"] },
  expired: { state: "failed", tone: "danger", terminal: true, reconcilable: false, actions: ["view-evidence"] },
  dead_letter: { state: "dead-letter", tone: "danger", terminal: true, reconcilable: true, actions: ["view-receipt", "view-evidence", "acknowledge"] },
  dead_lettered: { state: "dead-letter", tone: "danger", terminal: true, reconcilable: true, actions: ["view-receipt", "view-evidence", "acknowledge"] },
};

export function presentStudioJob(input: JobPresentationInput): JobPresentation {
  const known = (PRESENTATION as Record<string, Omit<JobPresentation, "progress"> | undefined>)[input.status];
  const progress =
    typeof input.progress === "number" && Number.isFinite(input.progress)
      ? Math.min(1, Math.max(0, input.progress))
      : null;
  if (!known) {
    return { state: "unknown", tone: "neutral", terminal: false, reconcilable: false, actions: ["view-evidence"], progress: null };
  }
  const actions = [...known.actions];
  if (input.hasReceipt && !actions.includes("view-receipt")) actions.push("view-receipt");
  return { ...known, actions, progress };
}

/** Terminal states the shell may render as final (never auto-retry). */
export const TERMINAL_JOB_PRESENTATION_STATES = ["completed", "failed", "canceled", "dead-letter"] as const;

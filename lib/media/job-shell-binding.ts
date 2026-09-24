/**
 * Studio V2 Job 12B (Gate E) — canonical job live binding.
 *
 * Minimal production-safe data path from the canonical durable job to the
 * shared job presentation contract:
 *
 *   canonical durable job (DurableJobService.getJob)
 *     + spend receipt (credit ledger on the job's reservation key)
 *     + evidence trail (durable job events)
 *   -> Studio job mapper (this module)
 *   -> shared job presentation contract (presentStudioJob)
 *
 * No state is invented: unknown runtime states render `unknown`, progress
 * is always null (the durable job carries no measured progress signal, so
 * the shell must not render a bar), and receipts attach only when the
 * canonical ledger holds provider evidence. Job 13 owns placement/design.
 */

import "server-only";

import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { createPlatformJobRepository } from "@ethen/ai/platform/jobs/factory";
import { presentStudioJob, type JobPresentation } from "@ethen/ui/jobs/studio-job-ux";
import { SupabaseImageCreditLedger, type ImageCreditLedger } from "./image-settlement";

export interface StudioJobBindingDeps {
  service?: DurableJobService;
  ledger?: ImageCreditLedger;
}

export interface StudioJobBinding {
  jobId: string;
  projectId: string;
  /** Canonical runtime status, verbatim (never remapped here). */
  status: string;
  attempt: number;
  maxAttempts: number;
  terminalReason: string | null;
  hasReceipt: boolean;
  hasEvidence: boolean;
  presentation: JobPresentation;
}

/**
 * Read one canonical Studio job and present it through the shared
 * contract. Returns null when the job does not exist in the project —
 * cross-project reads resolve to nothing, never to another tenant's job.
 */
export async function readStudioJobPresentation(
  projectId: string,
  jobId: string,
  deps: StudioJobBindingDeps = {},
): Promise<StudioJobBinding | null> {
  const service = deps.service ?? new DurableJobService({ repository: createPlatformJobRepository() });
  const job = await service.getJob({ projectId }, jobId).catch(() => null);
  if (!job || job.projectId !== projectId) return null;

  const payload = job.payload as Record<string, unknown>;
  const reservationKey = typeof payload.reservationKey === "string" ? payload.reservationKey : null;
  const ledger = deps.ledger ?? new SupabaseImageCreditLedger();
  const reservation = reservationKey ? await ledger.get(projectId, reservationKey).catch(() => null) : null;
  const events = await service.listJobEvents(job.id).catch(() => []);

  const terminalReason = job.lastError
    ? `${job.lastError.code}: ${job.lastError.message}`
    : (job.deadLetterReason ?? job.cancellationReason ?? job.escalationReason ?? null);
  const hasReceipt = (reservation?.providerEvidenceHash ?? null) !== null;
  const hasEvidence = events.length > 0;

  const presentation = presentStudioJob({
    status: job.status,
    // The durable job carries no measured progress signal: always null so
    // the shell renders no bar (never fake completion).
    progress: null,
    attempt: job.attemptCount,
    maxAttempts: job.maxAttempts,
    terminalReason,
    hasReceipt,
    hasEvidence,
  });

  return {
    jobId: job.id,
    projectId: job.projectId,
    status: job.status,
    attempt: job.attemptCount,
    maxAttempts: job.maxAttempts,
    terminalReason,
    hasReceipt,
    hasEvidence,
    presentation,
  };
}

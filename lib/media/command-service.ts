/**
 * Studio V2 Job 05 — canonical command issuance core.
 * Shared by repair execution (and future command surfaces): idempotent
 * durable enqueue followed by atomic reservation, with compensating cancel
 * when the reservation fails. Validation, quoting, and admission stay in
 * the capability modules and routes — this core never invents terms.
 *
 * Studio V2 Job 12B (Gate C) — durable quota/concurrency admission is part
 * of this core: create (idempotent anchor) -> quota claim -> atomic
 * reserve -> duplicate-claim rollback on reservation replay. The claim
 * sits after the idempotency anchor on purpose: same-key retries and
 * races replay the reservation, and the replay signal is what makes the
 * claim exactly-once (a claim placed before any anchor would double-count
 * on every retry). A denied claim leaves no surviving enqueue — the
 * still-queued job is cancelled best-effort — and handler-side admission
 * still blocks unreserved sends regardless.
 */

import "server-only";

import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { createPlatformJobRepository } from "@ethen/ai/platform/jobs/factory";
import type { JobRecord } from "@ethen/ai/platform/jobs/index";
import { SupabaseImageCreditLedger, type CreditReservation, type ImageCreditLedger } from "./image-settlement";
import { SupabaseStudioQuotaService, tryReleaseDuplicateQuota, type StudioQuotaPort } from "./durable-quota";
import type { StudioPersistenceScope } from "./persistence/studio-repository";

export interface CanonicalQuote {
  credits: number;
  pricingVersionId: string;
}

export interface IssuedCommand {
  job: JobRecord;
  reservation: CreditReservation;
  replayed: boolean;
}

/**
 * Enqueue a validated, quoted, admitted command: durable job first
 * (idempotent, duplicate-suppressed), then the durable quota/concurrency
 * claim, then the atomic reservation bound to the job id.
 *
 * Compensation (all best-effort; the original error always propagates):
 * - claim denied/failed -> cancel the still-queued job, but only when no
 *   reservation exists for the key (a racing same-key attempt may have
 *   admitted the shared job — never cancel another attempt's admission);
 * - reserve failed -> re-read the reservation: if it committed with our
 *   terms (unknown-effect reserve), the admission stands and the claim is
 *   correctly held; otherwise roll the claim back as a duplicate (slot +
 *   advisory counter — no spend happened) and run the historical
 *   still-queued cancel;
 * - reserve replayed -> roll the duplicate claim back (the original
 *   admission already holds its slot and counter), so retries never
 *   double-claim.
 */
export async function enqueueWithReservation(input: {
  scope: StudioPersistenceScope;
  actorId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  quote: CanonicalQuote;
  approvedCeiling: number;
  ledger?: ImageCreditLedger;
  service?: DurableJobService;
  quota?: StudioQuotaPort;
}): Promise<IssuedCommand> {
  const ledger = input.ledger ?? new SupabaseImageCreditLedger();
  const service = input.service ?? new DurableJobService({ repository: createPlatformJobRepository() });
  const quota = input.quota ?? new SupabaseStudioQuotaService();
  const job = await service.createJob({
    organizationId: input.scope.organizationId,
    projectId: input.scope.projectId,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
  });
  try {
    await quota.claim(input.scope.projectId, input.quote.credits);
  } catch (error) {
    if (job.status === "queued") {
      const admitted = await ledger.get(input.scope.projectId, input.idempotencyKey).catch(() => null);
      if (!admitted) {
        await service.cancelJob({ projectId: input.scope.projectId }, job.id, "quota-denied").catch(() => null);
      }
    }
    throw error;
  }
  try {
    const reservation = await ledger.reserve({
      organizationId: input.scope.organizationId,
      projectId: input.scope.projectId,
      jobId: job.id,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      pricingVersionId: input.quote.pricingVersionId,
      approvedCeiling: input.approvedCeiling,
      reservedCredits: input.quote.credits,
    });
    if (reservation.replayed) {
      await tryReleaseDuplicateQuota(quota, input.scope.projectId, input.quote.credits);
    }
    return { job, reservation, replayed: reservation.replayed };
  } catch (error) {
    // Unknown-effect reserve: the commit may have landed despite the
    // error. If our reservation exists with our terms, the admission
    // stands (the claim is correctly held) — never cancel or roll back.
    // A mismatched or missing reservation is a genuine failure.
    const committed = await ledger.get(input.scope.projectId, input.idempotencyKey).catch(() => null);
    if (
      committed &&
      (committed.state === "reserved" || committed.state === "settled") &&
      committed.reservedCredits === input.quote.credits &&
      committed.approvedCeiling === input.approvedCeiling &&
      committed.pricingVersionId === input.quote.pricingVersionId
    ) {
      return { job, reservation: { ...committed, replayed: true }, replayed: true };
    }
    await tryReleaseDuplicateQuota(quota, input.scope.projectId, input.quote.credits);
    if (job.status === "queued") {
      await service.cancelJob({ projectId: input.scope.projectId }, job.id, "reservation-failed").catch(() => null);
    }
    throw error;
  }
}

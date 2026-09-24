/** Studio V5 runtime — atomic admission (STUDIO_05). Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import type { VersionPins } from "../../contracts/versions";
import type { ProjectScope } from "../../contracts/scope";
import { MemoryEconomicsStore, type HoldInput } from "../economics/memory";
import { EconomicsError } from "../economics/types";
import {
  RuntimeError,
  type DispatchOutboxEvent,
  type RuntimeJob,
} from "./types";
import type { RuntimeRepository } from "./memory";

export interface AdmissionRequest {
  scope: ProjectScope;
  task: TaskName;
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
  quoteId: string;
  pins: VersionPins;
  endpointId: string;
  parameters: Readonly<Record<string, unknown>>;
  /** ICU to claim against quota; defaults to the quote's estimate. */
  quotaIcu?: number;
}

export interface AdmissionResult {
  job: RuntimeJob;
  reservationId: string;
  dispatchEvent: DispatchOutboxEvent;
  replayed: boolean;
}

export interface AdmissionDeps {
  runtime: RuntimeRepository;
  economics: MemoryEconomicsStore;
}

/**
 * Atomic Studio admission. Phase order is load-bearing and mirrors the j05
 * SQL wrapper `studio_v5_admit_job`:
 *
 * 1. idempotency anchor (same key + same hash → replay; changed hash → 409),
 * 2. quota claim,
 * 3. reservation hold through the j04 economics path,
 * 4. reservation bind + dispatch-outbox publish.
 *
 * Crash safety: every phase is idempotent and re-runnable. A crash before
 * the hold leaves a QUEUED job with no reservation — resubmission replays
 * the anchor and completes admission. A crash after the hold replays the
 * hold (same terms → replayed, no double charge and no double quota claim)
 * and publishes the outbox exactly once via its dedupe key. The hold owns
 * the quota claim (replay-first inside the economics path, mirroring the
 * j04 SQL), so admission never claims quota separately.
 */
export async function admitJob(request: AdmissionRequest, deps: AdmissionDeps): Promise<AdmissionResult> {
  const { runtime, economics } = deps;
  if (!request.actorId || request.actorId.trim().length === 0) {
    throw new RuntimeError("INVALID_INPUT", "actorId is required.");
  }

  const { job: anchored, replayed } = await runtime.anchor({
    scope: request.scope,
    task: request.task,
    idempotencyKey: request.idempotencyKey,
    requestHash: request.requestHash,
    quoteId: request.quoteId,
    pins: request.pins,
    endpointId: request.endpointId,
    parameters: request.parameters,
  });

  // Fast replay: a fully admitted job returns its prior result shape without
  // touching quota or ledger again.
  if (replayed && anchored.reservationId) {
    const dispatchEvent = await runtime.publishOutbox({
      jobId: anchored.jobId,
      scope: request.scope,
      target: "temporal_dispatch",
      dedupeKey: `dispatch:${anchored.jobId}`,
      payload: { jobId: anchored.jobId },
    });
    return { job: anchored, reservationId: anchored.reservationId, dispatchEvent, replayed: true };
  }

  const holdInput: HoldInput = {
    scope: request.scope,
    quoteId: request.quoteId,
    jobId: anchored.jobId,
    parentReservationId: null,
    idempotencyKey: request.idempotencyKey,
    actorId: request.actorId,
  };

  let reservationId: string;
  try {
    const reservation = await economics.hold(holdInput);
    reservationId = reservation.reservationId;
  } catch (error) {
    // Unknown-effect hold: the commit may have landed despite the error.
    // If our reservation exists with our terms, the admission stands and the
    // claim is correctly held — never cancel or roll back. Otherwise cancel
    // the still-queued job (a racing same-key attempt may have admitted the
    // shared job — never cancel another attempt's admission).
    const committed = economics.getReservation(request.scope, request.idempotencyKey);
    if (committed && (committed.state === "held" || committed.state === "settled")) {
      reservationId = committed.reservationId;
    } else {
      const current = await runtime.get(anchored.jobId, request.scope);
      if (current && current.status === "QUEUED" && !current.reservationId) {
        const reason = error instanceof EconomicsError && error.code.startsWith("QUOTA")
          ? "quota-denied"
          : "reservation-failed";
        await runtime.requestCancel(anchored.jobId, request.scope, reason).catch(() => null);
      }
      throw error;
    }
  }

  const job = await runtime.bindReservation(anchored.jobId, request.scope, reservationId);
  const dispatchEvent = await runtime.publishOutbox({
    jobId: job.jobId,
    scope: request.scope,
    target: "temporal_dispatch",
    dedupeKey: `dispatch:${job.jobId}`,
    payload: {
      jobId: job.jobId,
      quoteId: job.quoteId,
      reservationId,
      endpointId: job.endpointId,
    },
  });
  return { job, reservationId, dispatchEvent, replayed };
}

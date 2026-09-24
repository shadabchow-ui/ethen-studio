/** Studio V5 runtime — recoverable settlement (STUDIO_05). Server-only. */
import "server-only";
import type { ProjectScope } from "../../contracts/scope";
import { ZERO_ICU, type IcuAmount } from "../../contracts/money";
import { MemoryEconomicsStore } from "../economics/memory";
import type { RuntimeRepository } from "./memory";
import { RuntimeError } from "./types";

export interface SettlementInput {
  scope: ProjectScope;
  jobId: string;
  idempotencyKey: string;
  /** Integer actual customer charge, or null when still unknown. */
  actualIcu: IcuAmount | null;
  providerId: string;
  providerMinor: number | null;
  minorPerIcu: number;
  providerEvidenceHash: string | null;
}

export interface SettlementOutcome {
  jobId: string;
  reservationState: string;
  replayed: boolean;
}

/**
 * Idempotent settlement bound to the job lifecycle. Unknown usage stays
 * reconciling — never guessed. Crashes between provider confirmation and
 * settlement replay safely: same terms settle once, mismatched terms
 * conflict loudly.
 */
export async function settleJob(
  store: RuntimeRepository,
  economics: MemoryEconomicsStore,
  input: SettlementInput,
): Promise<SettlementOutcome> {
  const job = await store.get(input.jobId, input.scope);
  if (!job) throw new RuntimeError("NOT_FOUND", "job not found in this scope.");
  if (input.actualIcu === null || input.providerMinor === null) {
    const row = economics.getReservation(input.scope, input.idempotencyKey);
    if (!row) throw new RuntimeError("NOT_FOUND", "reservation not found in this scope.");
    const pending = await economics.settle({
      scope: input.scope,
      idempotencyKey: input.idempotencyKey,
      actualIcu: ZERO_ICU,
      usage: {
        meterUnit: "task_unit",
        quantity: null,
        providerMinor: null,
        providerEvidenceHash: null,
      },
      providerId: input.providerId,
      minorPerIcu: input.minorPerIcu,
    });
    if (job.status !== "RECONCILING") {
      await store.forceTransition(input.jobId, input.scope, "RECONCILING").catch(() => null);
    }
    return { jobId: input.jobId, reservationState: pending.state, replayed: pending.replayed };
  }
  const reservation = await economics.settle({
    scope: input.scope,
    idempotencyKey: input.idempotencyKey,
    actualIcu: input.actualIcu,
    usage: {
      meterUnit: "task_unit",
      quantity: 1,
      providerMinor: input.providerMinor,
      providerEvidenceHash: input.providerEvidenceHash,
    },
    providerId: input.providerId,
    minorPerIcu: input.minorPerIcu,
  });
  return { jobId: input.jobId, reservationState: reservation.state, replayed: reservation.replayed };
}

/** Release the unused hold exactly once on cancel/failure paths. */
export async function releaseJobHold(
  economics: MemoryEconomicsStore,
  scope: ProjectScope,
  idempotencyKey: string,
  reason: string,
): Promise<{ state: string; replayed: boolean }> {
  const reservation = await economics.release({ scope, idempotencyKey, reason });
  return { state: reservation.state, replayed: reservation.replayed };
}

export function zeroCharge(): IcuAmount {
  return ZERO_ICU;
}

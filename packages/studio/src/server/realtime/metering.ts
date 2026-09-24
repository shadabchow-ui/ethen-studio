/** Studio V5 realtime — connected-second metering (STUDIO_16, server-only). */
import "server-only";
import { asIcu, type IcuAmount } from "../../contracts/money";
import { realtimeError, type RealtimeIntervalRecord } from "./types";

/**
 * Meter active connected seconds. Closed intervals contribute their exact
 * whole seconds (floor); open intervals contribute up to `now` (clamped, never
 * negative); reconnect gaps between intervals are never billed. Integer math
 * only.
 */
export function connectedSeconds(
  intervals: readonly RealtimeIntervalRecord[],
  now: string,
): number {
  const nowMs = Date.parse(now);
  let total = 0;
  for (const interval of intervals) {
    const startMs = Date.parse(interval.startedAt);
    if (Number.isNaN(startMs)) {
      throw realtimeError("INTERNAL", `Interval ${interval.intervalId} has an invalid start timestamp.`);
    }
    const endMs = interval.endedAt ? Date.parse(interval.endedAt) : nowMs;
    if (Number.isNaN(endMs)) {
      throw realtimeError("INTERNAL", `Interval ${interval.intervalId} has an invalid end timestamp.`);
    }
    const clampedEnd = Math.min(endMs, nowMs);
    if (clampedEnd > startMs) total += Math.floor((clampedEnd - startMs) / 1000);
  }
  return total;
}

/** Settle math: used ICU = seconds × rate, clamped to the hard cap. */
export function settleForSeconds(
  seconds: number,
  rateIcuPerSecond: IcuAmount,
  capIcu: IcuAmount,
): { usedIcu: IcuAmount; capped: boolean } {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw realtimeError("BAD_REQUEST", "Connected seconds must be a non-negative integer.");
  }
  const raw = seconds * (rateIcuPerSecond as number);
  if (raw > (capIcu as number)) return { usedIcu: capIcu, capped: true };
  return { usedIcu: asIcu(raw), capped: false };
}

/**
 * Topup math: raise the reservation toward the authorized ceiling. The new
 * reservation never exceeds the ceiling and never moves backwards; reaching
 * the ceiling is explicit, not an error.
 */
export function topupReservation(
  currentReservedIcu: IcuAmount,
  ceilingIcu: IcuAmount,
  requestedIcu: IcuAmount,
): { newReservedIcu: IcuAmount; atCeiling: boolean } {
  if ((requestedIcu as number) <= 0) {
    throw realtimeError("BAD_REQUEST", "Topup amount must be a positive integer ICU value.");
  }
  const target = (currentReservedIcu as number) + (requestedIcu as number);
  if (target >= (ceilingIcu as number)) return { newReservedIcu: ceilingIcu, atCeiling: true };
  return { newReservedIcu: asIcu(target), atCeiling: false };
}

/**
 * Stop-before-exhaustion: a stop always settles metered use and releases the
 * unused remainder exactly once. Returns the split for the economics settle +
 * release pair.
 */
export function stopSplit(
  reservedIcu: IcuAmount,
  usedIcu: IcuAmount,
): { settleIcu: IcuAmount; releaseIcu: IcuAmount } {
  const used = Math.min(usedIcu as number, reservedIcu as number);
  return { settleIcu: asIcu(used), releaseIcu: asIcu((reservedIcu as number) - used) };
}

/** Studio V5 gateway — mutation idempotency records (STUDIO_19). Server-only. */
import "server-only";
import { gatewayError, type IdempotencyRecord } from "./types";

export const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;

export type IdempotencyOutcome =
  | { kind: "fresh" }
  | { kind: "replay"; record: IdempotencyRecord }
  | { kind: "conflict"; record: IdempotencyRecord };

/**
 * Compare an incoming mutation fingerprint against the stored record.
 * Same key + same hash replays the stored response; a changed payload
 * conflicts (409) instead of executing twice.
 */
export function compareIdempotency(
  stored: IdempotencyRecord | null,
  requestHash: string,
): IdempotencyOutcome {
  if (!stored) return { kind: "fresh" };
  if (stored.requestHash === requestHash) return { kind: "replay", record: stored };
  return { kind: "conflict", record: stored };
}

export function assertNoIdempotencyConflict(outcome: IdempotencyOutcome, key: string): void {
  if (outcome.kind === "conflict") {
    throw gatewayError("CONFLICT", `Idempotency key was already used with a different payload: ${key}.`, {
      key,
    });
  }
}

export function buildIdempotencyRecord(input: {
  key: string;
  requestHash: string;
  statusCode: number;
  response: Readonly<Record<string, unknown>>;
  nowIso?: string;
}): IdempotencyRecord {
  const nowMs = Date.parse(input.nowIso ?? new Date().toISOString());
  return {
    key: input.key,
    requestHash: input.requestHash,
    statusCode: input.statusCode,
    response: input.response,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + IDEMPOTENCY_TTL_MS).toISOString(),
  };
}

export function isIdempotencyKeyShape(key: string): boolean {
  return /^[A-Za-z0-9._:-]{8,128}$/.test(key);
}

export function assertIdempotencyKeyShape(key: string): void {
  if (!isIdempotencyKeyShape(key)) {
    throw gatewayError("BAD_REQUEST", "Idempotency-Key must be 8-128 URL-safe characters.");
  }
}

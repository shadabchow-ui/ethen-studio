/** Studio V5 providers — health breaker (STUDIO_06). Server-only. */
import "server-only";

/** Default: three consecutive transport/auth failures pause admission. */
export const BREAKER_FAILURE_THRESHOLD = 3;

export interface BreakerState {
  endpointId: string;
  consecutiveFailures: number;
  paused: boolean;
  lastFailureKind: string | null;
  lastFailureAt: string | null;
  clearedBy: string | null;
  clearedAt: string | null;
}

export interface BreakerStore {
  get(endpointId: string): Promise<BreakerState | null>;
  recordFailure(endpointId: string, kind: string, atIso?: string): Promise<BreakerState>;
  recordSuccess(endpointId: string): Promise<BreakerState>;
  clear(endpointId: string, clearedBy: string, atIso?: string): Promise<BreakerState>;
}

function fresh(endpointId: string): BreakerState {
  return {
    endpointId,
    consecutiveFailures: 0,
    paused: false,
    lastFailureKind: null,
    lastFailureAt: null,
    clearedBy: null,
    clearedAt: null,
  };
}

/**
 * Record a transport/auth failure. Only consecutive failures count — any
 * success resets the streak. No paid automatic probe is ever issued; the
 * owner clears the pause after verified recovery.
 */
export function applyBreakerFailure(
  current: BreakerState | null,
  endpointId: string,
  kind: string,
  atIso: string,
  threshold: number = BREAKER_FAILURE_THRESHOLD,
): BreakerState {
  const base = current ?? fresh(endpointId);
  const consecutiveFailures = base.consecutiveFailures + 1;
  return {
    ...base,
    consecutiveFailures,
    paused: base.paused || consecutiveFailures >= threshold,
    lastFailureKind: kind,
    lastFailureAt: atIso,
  };
}

export function applyBreakerSuccess(current: BreakerState | null, endpointId: string): BreakerState {
  const base = current ?? fresh(endpointId);
  // Success resets the streak but never auto-clears an owner-held pause.
  return { ...base, consecutiveFailures: 0 };
}

export function applyBreakerClear(
  current: BreakerState | null,
  endpointId: string,
  clearedBy: string,
  atIso: string,
): BreakerState {
  const base = current ?? fresh(endpointId);
  return {
    ...base,
    consecutiveFailures: 0,
    paused: false,
    clearedBy,
    clearedAt: atIso,
  };
}

/** Admission gate: a paused endpoint admits nothing until the owner clears it. */
export function isBreakerPaused(state: BreakerState | null): boolean {
  return state?.paused === true;
}

export function createMemoryBreakerStore(): BreakerStore {
  const states = new Map<string, BreakerState>();
  return {
    async get(endpointId: string): Promise<BreakerState | null> {
      return states.get(endpointId) ?? null;
    },
    async recordFailure(endpointId: string, kind: string, atIso?: string): Promise<BreakerState> {
      const next = applyBreakerFailure(
        states.get(endpointId) ?? null,
        endpointId,
        kind,
        atIso ?? new Date().toISOString(),
      );
      states.set(endpointId, next);
      return next;
    },
    async recordSuccess(endpointId: string): Promise<BreakerState> {
      const next = applyBreakerSuccess(states.get(endpointId) ?? null, endpointId);
      states.set(endpointId, next);
      return next;
    },
    async clear(endpointId: string, clearedBy: string, atIso?: string): Promise<BreakerState> {
      const next = applyBreakerClear(
        states.get(endpointId) ?? null,
        endpointId,
        clearedBy,
        atIso ?? new Date().toISOString(),
      );
      states.set(endpointId, next);
      return next;
    },
  };
}

// In-memory per-process provider cooldown. V1 scope: single-instance only,
// reset on process restart. No persistence, no cross-instance coordination.

interface ProviderCircuitState {
  consecutiveFailures: number;
  cooldownUntil: number | null;
}

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30_000;

const state = new Map<string, ProviderCircuitState>();

function getState(providerId: string): ProviderCircuitState {
  let s = state.get(providerId);
  if (!s) {
    s = { consecutiveFailures: 0, cooldownUntil: null };
    state.set(providerId, s);
  }
  return s;
}

export function isProviderCircuitOpen(providerId: string, now: number = Date.now()): boolean {
  const s = state.get(providerId);
  if (!s || s.cooldownUntil === null) return false;
  if (now >= s.cooldownUntil) {
    s.cooldownUntil = null;
    s.consecutiveFailures = 0;
    return false;
  }
  return true;
}

export function recordProviderFailure(providerId: string, now: number = Date.now()): void {
  const s = getState(providerId);
  s.consecutiveFailures += 1;
  if (s.consecutiveFailures >= FAILURE_THRESHOLD) {
    s.cooldownUntil = now + COOLDOWN_MS;
  }
}

export function recordProviderSuccess(providerId: string): void {
  const s = getState(providerId);
  s.consecutiveFailures = 0;
  s.cooldownUntil = null;
}

/** Test/dev utility — clears all breaker state. */
export function resetCircuitBreaker(providerId?: string): void {
  if (providerId) {
    state.delete(providerId);
    return;
  }
  state.clear();
}

export function getCircuitBreakerSnapshot(): Record<string, ProviderCircuitState> {
  return Object.fromEntries(state.entries());
}

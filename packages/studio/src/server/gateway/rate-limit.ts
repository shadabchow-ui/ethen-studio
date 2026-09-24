/** Studio V5 gateway — fixed-window rate limits (STUDIO_19). Server-only. */
import "server-only";
import { gatewayError, type RateLimitDecision } from "./types";

/**
 * Per-key route budgets. Rate limits precede expensive work (policy,
 * quota, admission) but never replace the quota transactions behind them.
 */
export const GATEWAY_RATE_BUDGETS: Readonly<Record<string, { limit: number; windowMs: number }>> = {
  default: { limit: 600, windowMs: 60_000 },
  admit: { limit: 60, windowMs: 60_000 },
  keys: { limit: 30, windowMs: 60_000 },
  webhooks: { limit: 60, windowMs: 60_000 },
};

export function budgetFor(route: string): { limit: number; windowMs: number } {
  return GATEWAY_RATE_BUDGETS[route] ?? GATEWAY_RATE_BUDGETS["default"];
}

interface WindowCounter {
  windowStartMs: number;
  count: number;
}

/**
 * In-process fixed-window limiter. The persistent store (SQL) is the
 * production binding; this class holds the shared window math plus a
 * bounded memory fallback for tests and single-instance dev.
 */
export class MemoryRateLimiter {
  private readonly windows = new Map<string, WindowCounter>();

  check(input: {
    subject: string;
    route: string;
    limit?: number;
    windowMs?: number;
    nowMs?: number;
  }): RateLimitDecision {
    const budget = { limit: input.limit ?? 0, windowMs: input.windowMs ?? 0 };
    const resolved = input.limit === undefined && input.windowMs === undefined
      ? budgetFor(input.route)
      : { limit: budget.limit || budgetFor(input.route).limit, windowMs: budget.windowMs || budgetFor(input.route).windowMs };
    const nowMs = input.nowMs ?? Date.now();
    const slot = `${input.subject}:${input.route}`;
    let counter = this.windows.get(slot);
    if (!counter || nowMs - counter.windowStartMs >= resolved.windowMs) {
      counter = { windowStartMs: nowMs, count: 0 };
      this.windows.set(slot, counter);
    }
    counter.count += 1;
    const allowed = counter.count <= resolved.limit;
    const resetAtMs = counter.windowStartMs + resolved.windowMs;
    return {
      allowed,
      limit: resolved.limit,
      remaining: Math.max(0, resolved.limit - counter.count),
      resetAtMs,
      retryAfterMs: allowed ? 0 : Math.max(0, resetAtMs - nowMs),
    };
  }

  assertAllowed(input: {
    subject: string;
    route: string;
    limit?: number;
    windowMs?: number;
    nowMs?: number;
  }): RateLimitDecision {
    const decision = this.check(input);
    if (!decision.allowed) {
      throw gatewayError(
        "RATE_LIMITED",
        "Gateway rate limit exceeded; retry after the window resets.",
        { limit: decision.limit, resetAtMs: decision.resetAtMs, retryAfterMs: decision.retryAfterMs },
        true,
      );
    }
    return decision;
  }
}

export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(Math.ceil(decision.resetAtMs / 1000)),
    ...(decision.allowed ? {} : { "Retry-After": String(Math.ceil(decision.retryAfterMs / 1000)) }),
  };
}

import "server-only";

import { NextRequest } from "next/server";
import { jsonError } from "@ethen/security/errors";
import { getUsageLimit, type UsageLimit } from "./limits";

interface UsageCountEntry {
  count: number;
  resetAt: number;
}

const USAGE_LIMIT_STORE_KEY = "__ethenUsageLimitStore";

function getUsageStore(): Map<string, UsageCountEntry> {
  const globalScope = globalThis as typeof globalThis & {
    [USAGE_LIMIT_STORE_KEY]?: Map<string, UsageCountEntry>;
  };
  if (!globalScope[USAGE_LIMIT_STORE_KEY]) {
    globalScope[USAGE_LIMIT_STORE_KEY] = new Map<string, UsageCountEntry>();
  }
  return globalScope[USAGE_LIMIT_STORE_KEY]!;
}

function getClientIdentifier(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const candidate = forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "unknown";
  return candidate.slice(0, 128);
}

/**
 * Enforce a beta usage limit on a route request.
 *
 * Follows the same in-memory pattern as lib/rate-limit/server.ts.
 * Returns null if the request is allowed, or a 429 Response if the limit
 * has been exceeded.
 *
 * Usage:
 *   const limited = enforceUsageLimit(request, "beta-daily-messages", userId);
 *   if (limited) return limited;
 */
export function enforceUsageLimit(
  request: NextRequest,
  limitId: string,
  userId?: string | null,
  options?: { maxOverride?: number },
): Response | null {
  const limit = getUsageLimit(limitId);
  if (!limit) return null; // unknown limit — allow through
  if (!limit.enforced) return null; // not enforced — allow through

  const max = typeof options?.maxOverride === "number" && Number.isFinite(options.maxOverride) && options.maxOverride >= 0
    ? Math.floor(options.maxOverride)
    : limit.max;

  const now = Date.now();
  const store = getUsageStore();
  const baseKey = `${limit.id}:${getClientIdentifier(request)}`;
  const key = userId ? `${baseKey}:${userId}` : baseKey;

  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + limit.windowMs });
    return null;
  }

  if (current.count >= max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return jsonError({
      status: 429,
      code: "USAGE_LIMIT_REACHED",
      error: `${limit.label} limit reached (${max} max). Public beta caps apply.`,
      details: {
        limitId: limit.id,
        limit: max,
        current: current.count,
        retryAfterSeconds,
      },
    });
  }

  current.count += 1;
  store.set(key, current);
  return null;
}

/**
 * Usage-aware variant: overlays Stripe entitlement limits when billing is
 * configured and the user's paid projection defines a matching cap.
 */
export async function enforceEntitledUsageLimit(
  request: NextRequest,
  limitId: string,
  userId?: string | null,
): Promise<Response | null> {
  const { resolveEntitledLimitMax } = await import("../../../billing/src/server");
  const entitledMax = await resolveEntitledLimitMax(limitId, userId);
  return enforceUsageLimit(
    request,
    limitId,
    userId,
    entitledMax != null ? { maxOverride: entitledMax } : undefined,
  );
}

export async function enforceEntitledUsageLimits(
  request: NextRequest,
  limitIds: string[],
  userId?: string | null,
): Promise<Response | null> {
  for (const id of limitIds) {
    const limited = await enforceEntitledUsageLimit(request, id, userId);
    if (limited) return limited;
  }
  return null;
}

/**
 * Check multiple usage limits at once, returning the first exceeded limit.
 */
export function enforceUsageLimits(
  request: NextRequest,
  limitIds: string[],
  userId?: string | null,
): Response | null {
  for (const id of limitIds) {
    const limited = enforceUsageLimit(request, id, userId);
    if (limited) return limited;
  }
  return null;
}

/**
 * Get current usage count for a limit (for dashboard/readback, not enforcement).
 */
export function getUsageCount(limitId: string, request: NextRequest, userId?: string | null): number {
  const limit = getUsageLimit(limitId);
  if (!limit) return 0;

  const store = getUsageStore();
  const baseKey = `${limit.id}:${getClientIdentifier(request)}`;
  const key = userId ? `${baseKey}:${userId}` : baseKey;

  const current = store.get(key);
  if (!current || current.resetAt <= Date.now()) return 0;
  return current.count;
}

/**
 * Reset all usage counters for a specific limit (admin/debug helper).
 * Returns the number of counters reset.
 */
export function resetUsageCounters(limitId?: string): number {
  const store = getUsageStore();
  let reset = 0;

  if (limitId) {
    for (const key of store.keys()) {
      if (key.startsWith(limitId)) {
        store.delete(key);
        reset++;
      }
    }
  } else {
    reset = store.size;
    store.clear();
  }

  return reset;
}

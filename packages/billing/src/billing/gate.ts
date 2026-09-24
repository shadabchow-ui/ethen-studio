import "server-only";

import { getBillingEntitlements } from "./entitlements";
import { isBillingConfigured } from "./config";
import {
  hasPaidCapability,
  overlayUsageLimitMax,
  type BillingEntitlements,
} from "./domain";
import { getUsageLimit } from "../../../usage/src/index";

export { hasPaidCapability, overlayUsageLimitMax, ENTITLEMENT_LIMIT_ALIASES } from "./domain";

export async function resolveEntitledLimitMax(
  limitId: string,
  userId: string | null | undefined,
): Promise<number | null> {
  const baseline = getUsageLimit(limitId);
  if (!baseline) return null;
  if (!userId || !isBillingConfigured()) return baseline.max;
  const entitlements = await getBillingEntitlements(userId);
  return overlayUsageLimitMax(limitId, baseline.max, entitlements);
}

export interface PaidCapabilityDecision {
  allowed: boolean;
  code: "ok" | "billing_not_configured" | "entitlement_unavailable" | "capability_denied";
  entitlements: BillingEntitlements | null;
}

/**
 * Fail-closed paid-capability check. Preview/beta surfaces must not call this
 * unless the price catalog actually defines the capability. When billing is
 * not configured the deployment cannot sell the capability, so the check
 * reports billing_not_configured instead of inventing a grant.
 */
export async function requirePaidCapability(
  userId: string,
  capability: string,
): Promise<PaidCapabilityDecision> {
  if (!isBillingConfigured()) {
    return { allowed: false, code: "billing_not_configured", entitlements: null };
  }
  const entitlements = await getBillingEntitlements(userId);
  if (entitlements.readiness !== "available") {
    return { allowed: false, code: "entitlement_unavailable", entitlements };
  }
  if (!hasPaidCapability(entitlements, capability)) {
    return { allowed: false, code: "capability_denied", entitlements };
  }
  return { allowed: true, code: "ok", entitlements };
}

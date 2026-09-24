import "server-only";

import { createServiceClient } from "@ethen/database/service";
import { isBillingConfigured } from "./config";
import { capabilitiesForSubscriptionState, isPaidProjectionFresh, type BillingEntitlements, type SubscriptionState } from "./domain";

const baseline = (readiness: BillingEntitlements["readiness"]): BillingEntitlements => ({
  readiness,
  state: "inactive",
  planKey: null,
  capabilities: [],
  limits: {},
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
});

/** The only paid-capability authority. Missing/stale projections fail closed. */
export async function getBillingEntitlements(userId: string): Promise<BillingEntitlements> {
  if (!isBillingConfigured()) return baseline("not_configured");
  const supabase = createServiceClient();
  if (!supabase) return baseline("unavailable");

  const { data, error } = await supabase
    .from("billing_entitlement_snapshots")
    .select("subscription_state, plan_key, capabilities, limits, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return baseline(error ? "unavailable" : "available");

  const state = data.subscription_state as SubscriptionState;
  if (!isPaidProjectionFresh(state, data.current_period_end)) return baseline("available");
  const paid = capabilitiesForSubscriptionState(state, {
    capabilities: Array.isArray(data.capabilities) ? data.capabilities.filter((value: unknown): value is string => typeof value === "string") : [],
    limits: data.limits && typeof data.limits === "object" ? data.limits as Record<string, number> : {},
  });
  return {
    readiness: "available",
    state,
    planKey: paid.capabilities.length ? (typeof data.plan_key === "string" ? data.plan_key : null) : null,
    capabilities: paid.capabilities,
    limits: paid.limits,
    currentPeriodEnd: data.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
  };
}

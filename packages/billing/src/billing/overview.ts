import "server-only";
import { isBillingEnabled } from "./mode";

import { getCreditBalance, getCreditLedger } from "../../../usage/src/server";
import { getUsageEvents } from "../../../usage/src/server";
import { createServiceClient } from "@ethen/database/service";
import { getPriceCatalog, isBillingConfigured } from "./config";
import { getBillingEntitlements } from "./entitlements";
import type { BillingOverview } from "./domain";

export async function getBillingOverview(userId: string): Promise<BillingOverview> {
  const [balance, ledger, usage, entitlements] = await Promise.all([
    getCreditBalance(userId), getCreditLedger(userId, 25), getUsageEvents(userId, 25), getBillingEntitlements(userId),
  ]);
  const supabase = createServiceClient();
  const billingConfigured = isBillingEnabled() && isBillingConfigured();
  const catalog = billingConfigured ? getPriceCatalog() : [];
  let hasCustomer = false;
  if (supabase && billingConfigured) {
    const { data } = await supabase.from("billing_customers").select("user_id").eq("user_id", userId).maybeSingle();
    hasCustomer = Boolean(data);
  }
  return {
    readiness: entitlements.readiness,
    subscription: entitlements.planKey || entitlements.state !== "inactive" ? {
      state: entitlements.state, planKey: entitlements.planKey, renewsAt: entitlements.currentPeriodEnd,
      cancelAtPeriodEnd: entitlements.cancelAtPeriodEnd,
    } : null,
    credits: { balance, ledger },
    usage: { recentEvents: usage.map((event) => ({ id: event.id, created_at: event.created_at, summary: event.event_type })) },
    actions: {
      checkoutAvailable: catalog.length > 0 && entitlements.readiness === "available",
      portalAvailable: hasCustomer,
      checkoutOffers: catalog.map(({ offerKey, planKey, mode }) => ({ offerKey, planKey, mode })),
    },
    notice: entitlements.readiness === "not_configured" ? "Billing is not configured for this deployment." : null,
  };
}

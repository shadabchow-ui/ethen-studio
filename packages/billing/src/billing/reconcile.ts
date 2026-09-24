import "server-only";

import { getStripeClient } from "./stripe-client";
import { getStripeCustomer } from "./customer";
import { createServiceClient } from "@ethen/database/service";
import { projectStripeSubscription } from "./projection";

/**
 * Trusted job/command entry point for repairing a single user's subscription
 * projection from Stripe. It never creates a Stripe object or grants credit.
 */
export async function reconcileBillingUser(userId: string): Promise<{ reconciled: number; unavailable: boolean }> {
  const stripe = getStripeClient();
  const customer = await getStripeCustomer(userId);
  const db = createServiceClient();
  if (!stripe || !customer || !db) return { reconciled: 0, unavailable: true };

  const subscriptions = await stripe.subscriptions.list({ customer: customer.stripeCustomerId, status: "all", limit: 100 });
  const correlationId = `reconcile:${customer.stripeCustomerId}:${Date.now()}`;
  const reconciledAt = new Date().toISOString();
  if (subscriptions.data.length === 0) {
    const { data: localCustomer, error: customerError } = await db
      .from("billing_customers")
      .select("id")
      .eq("user_id", userId)
      .single();
    if (customerError || !localCustomer) throw new Error("PERSISTENCE_FAILED");
    const { error } = await db.rpc("clear_billing_subscription_projection", {
      p_user_id: userId,
      p_billing_customer_id: localCustomer.id,
      p_correlation_id: correlationId,
    });
    if (error) throw new Error("PERSISTENCE_FAILED");
  }
  for (const subscription of subscriptions.data) {
    await projectStripeSubscription(subscription, {
      id: correlationId,
      type: "reconciliation.subscription.read",
      createdAt: reconciledAt,
      authoritative: true,
    });
  }
  return { reconciled: subscriptions.data.length, unavailable: false };
}

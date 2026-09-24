import "server-only";

import { createServiceClient } from "@ethen/database/service";
import { getStripeClient } from "./stripe-client";
import { isBillingConfigured } from "./config";

export interface BillingCustomerLink {
  userId: string;
  stripeCustomerId: string;
}

/**
 * Finds the user's billing_customers row, creating a Stripe customer and the
 * linking row if neither exists yet. Never uses email or a Clerk ID as the
 * ownership key — the Supabase user UUID is the only identity carried into
 * Stripe (as metadata), matching the individual billing principal from
 * BILL-ARCH-01.
 *
 * Returns null when billing is not configured or the Supabase service client
 * is unavailable — callers must fail closed on null, never fabricate a link.
 */
export async function findOrCreateStripeCustomer(
  userId: string,
): Promise<BillingCustomerLink | null> {
  if (!isBillingConfigured()) return null;

  const stripe = getStripeClient();
  const supabase = createServiceClient();
  if (!stripe || !supabase) return null;

  const { data: existing } = await supabase
    .from("billing_customers")
    .select("user_id, stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return { userId: existing.user_id, stripeCustomerId: existing.stripe_customer_id };
  }

  const customer = await stripe.customers.create(
    { metadata: { ethen_user_id: userId } },
    { idempotencyKey: `ethen-billing-customer:${userId}` },
  );

  const { data: inserted, error } = await supabase
    .from("billing_customers")
    .insert({ user_id: userId, stripe_customer_id: customer.id })
    .select("user_id, stripe_customer_id")
    .single();

  if (error || !inserted) {
    // Lost the insert race or a write failure — re-read rather than trust a
    // second Stripe customer into existence.
    const { data: retry } = await supabase
      .from("billing_customers")
      .select("user_id, stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    return retry ? { userId: retry.user_id, stripeCustomerId: retry.stripe_customer_id } : null;
  }

  return { userId: inserted.user_id, stripeCustomerId: inserted.stripe_customer_id };
}

/** Reads the existing link without creating one. */
export async function getStripeCustomer(userId: string): Promise<BillingCustomerLink | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("billing_customers")
    .select("user_id, stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  return data ? { userId: data.user_id, stripeCustomerId: data.stripe_customer_id } : null;
}

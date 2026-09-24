import "server-only";

import { createHash } from "node:crypto";
import { getStripeClient } from "./stripe-client";
import { getBillingAppOrigin, isBillingConfigured, resolveOffer } from "./config";
import { findOrCreateStripeCustomer } from "./customer";
import type { BillingErrorCode } from "./domain";

export type CheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; code: BillingErrorCode };

/**
 * Creates a Stripe Checkout Session for an allowlisted offer key only.
 * Arbitrary prices, Stripe price IDs, customer IDs, or entitlement claims
 * from the client are never accepted — offerKey is the sole input, resolved
 * server-side against STRIPE_PRICE_CATALOG_JSON.
 */
export async function createCheckoutSessionForUser(
  userId: string,
  offerKey: string,
  requestIdempotencyKey: string,
): Promise<CheckoutResult> {
  if (!isBillingConfigured()) return { ok: false, code: "BILLING_NOT_CONFIGURED" };

  const offer = resolveOffer(offerKey);
  if (!offer) return { ok: false, code: "PLAN_NOT_AVAILABLE" };

  const stripe = getStripeClient();
  if (!stripe) return { ok: false, code: "BILLING_NOT_CONFIGURED" };

  const customer = await findOrCreateStripeCustomer(userId);
  if (!customer) return { ok: false, code: "CHECKOUT_UNAVAILABLE" };

  const appUrl = getBillingAppOrigin();
  if (!appUrl) return { ok: false, code: "BILLING_NOT_CONFIGURED" };

  try {
    const idempotencyKey = `ethen-checkout:${createHash("sha256")
      .update(`${userId}\0${offerKey}\0${requestIdempotencyKey}`)
      .digest("hex")}`;
    const session = await stripe.checkout.sessions.create({
      customer: customer.stripeCustomerId,
      mode: offer.mode,
      line_items: [{ price: offer.stripePriceId, quantity: 1 }],
      success_url: `${appUrl}/billing?checkout=success`,
      cancel_url: `${appUrl}/billing?checkout=cancelled`,
      client_reference_id: userId,
      metadata: { ethen_user_id: userId, ethen_offer_key: offer.offerKey },
      payment_intent_data:
        offer.mode === "payment"
          ? { metadata: { ethen_user_id: userId, ethen_offer_key: offer.offerKey } }
          : undefined,
    }, { idempotencyKey });

    if (!session.url) return { ok: false, code: "CHECKOUT_UNAVAILABLE" };
    return { ok: true, checkoutUrl: session.url };
  } catch {
    return { ok: false, code: "CHECKOUT_UNAVAILABLE" };
  }
}

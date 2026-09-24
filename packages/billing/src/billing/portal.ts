import "server-only";

import { getStripeClient } from "./stripe-client";
import { getBillingAppOrigin, isBillingConfigured } from "./config";
import { getStripeCustomer } from "./customer";
import type { BillingErrorCode } from "./domain";

export type PortalResult =
  | { ok: true; portalUrl: string }
  | { ok: false; code: BillingErrorCode };

/**
 * Creates a Stripe billing portal session scoped to the authenticated
 * user's own customer link only. Never creates a customer implicitly — a
 * user with no billing history has nothing to manage.
 */
export async function createPortalSessionForUser(userId: string): Promise<PortalResult> {
  if (!isBillingConfigured()) return { ok: false, code: "BILLING_NOT_CONFIGURED" };

  const stripe = getStripeClient();
  if (!stripe) return { ok: false, code: "BILLING_NOT_CONFIGURED" };

  const customer = await getStripeCustomer(userId);
  if (!customer) return { ok: false, code: "CUSTOMER_NOT_PROVISIONED" };

  const appUrl = getBillingAppOrigin();
  if (!appUrl) return { ok: false, code: "BILLING_NOT_CONFIGURED" };

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${appUrl}/billing`,
    });
    return { ok: true, portalUrl: session.url };
  } catch {
    return { ok: false, code: "PORTAL_UNAVAILABLE" };
  }
}

import "server-only";

import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { createServiceClient } from "@ethen/database/service";
import { getPriceCatalog } from "./config";
import { capabilitiesForSubscriptionState, mapStripeSubscriptionStatus } from "./domain";

const supportedEvents = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded", "payment_intent.succeeded",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "invoice.paid", "invoice.payment_failed",
]);

function asIso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

export interface ProviderEventProvenance {
  id: string;
  type: string;
  createdAt: string;
  /** A Stripe reconciliation read is authoritative at the read timestamp. */
  authoritative?: boolean;
}

/**
 * Stripe subscriptions do not expose a monotonic update revision. Use the
 * signed event's creation time plus its immutable event ID as the durable,
 * deterministic ordering key. A reconciliation read deliberately supersedes
 * any earlier event because it reads provider authority at a later time.
 */

export async function projectStripeSubscription(
  subscription: Stripe.Subscription,
  provenance: ProviderEventProvenance,
  stateOverride?: "past_due",
): Promise<boolean> {
  const db = createServiceClient();
  if (!db) throw new Error("PERSISTENCE_FAILED");
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const { data: customer } = await db.from("billing_customers").select("id, user_id").eq("stripe_customer_id", customerId).maybeSingle();
  if (!customer) return false;
  const subscriptionItem = subscription.items.data[0];
  const priceId = subscriptionItem?.price.id ?? null;
  const offer = getPriceCatalog().find((entry) => entry.stripePriceId === priceId && entry.mode === "subscription");
  const state = stateOverride ?? mapStripeSubscriptionStatus(subscription.status);
  const paid = capabilitiesForSubscriptionState(state, offer);
  const { error } = await db.rpc("project_billing_subscription", {
    p_user_id: customer.user_id,
    p_billing_customer_id: customer.id,
    p_stripe_subscription_id: subscription.id,
    p_stripe_price_id: priceId,
    p_plan_key: offer?.planKey ?? null,
    p_state: state,
    p_current_period_start: asIso(subscriptionItem?.current_period_start),
    p_current_period_end: asIso(subscriptionItem?.current_period_end),
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_provider_event_created_at: provenance.createdAt,
    p_provider_event_id: provenance.id,
    p_provider_event_type: provenance.type,
    p_capabilities: paid.capabilities,
    p_limits: paid.limits,
    p_authoritative: Boolean(provenance.authoritative),
    p_mark_webhook: !provenance.authoritative,
  });
  if (error) throw new Error("PERSISTENCE_FAILED");
  return true;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent;
  const value = parent?.subscription_details?.subscription;
  return typeof value === "string" ? value : value?.id ?? null;
}

async function projectInvoiceLifecycle(event: Stripe.Event): Promise<boolean> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return false; // one-time invoices have no subscription entitlement to mutate.
  const stripe = (await import("./stripe-client")).getStripeClient();
  if (!stripe) throw new Error("PROVIDER_UNAVAILABLE");
  // Invoice state is only a lifecycle signal. Retrieve the current provider
  // subscription before projecting so recovery and failure use authoritative state.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return projectStripeSubscription(subscription, {
    id: event.id,
    type: event.type,
    createdAt: asIso(event.created) ?? new Date().toISOString(),
  }, event.type === "invoice.payment_failed" ? "past_due" : undefined);
}

async function projectCheckoutSession(
  event: Stripe.Event,
  provenance: ProviderEventProvenance,
): Promise<boolean> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode === "subscription") {
    const subscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
    if (!subscriptionId) return false;
    const stripe = (await import("./stripe-client")).getStripeClient();
    if (!stripe) throw new Error("PROVIDER_UNAVAILABLE");
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return projectStripeSubscription(subscription, provenance);
  }
  return projectPurchase(event);
}

async function projectPurchase(event: Stripe.Event): Promise<boolean> {
  const db = createServiceClient();
  if (!db) throw new Error("PERSISTENCE_FAILED");
  const object = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent;
  const metadata = object.metadata ?? {};
  const offerKey = metadata.ethen_offer_key;
  const userId = metadata.ethen_user_id;
  if (!offerKey || !userId) return false;
  const offer = getPriceCatalog().find((entry) => entry.offerKey === offerKey && entry.mode === "payment");
  if (!offer) return false;
  const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
  if (!customerId) return false;
  const { data: customer } = await db.from("billing_customers").select("id, user_id").eq("stripe_customer_id", customerId).eq("user_id", userId).maybeSingle();
  if (!customer) return false;
  const paymentIntentId = typeof (object as Stripe.Checkout.Session).payment_intent === "string"
    ? (object as Stripe.Checkout.Session).payment_intent
    : object.id.startsWith("pi_") ? object.id : null;
  const checkoutSessionId = object.id.startsWith("cs_") ? object.id : null;
  const { error } = await db.rpc("settle_billing_purchase", {
    p_user_id: customer.user_id,
    p_billing_customer_id: customer.id,
    p_stripe_checkout_session_id: checkoutSessionId,
    p_stripe_payment_intent_id: paymentIntentId,
    p_offer_key: offerKey,
    p_credit_amount: offer.creditAmount,
    p_provider_event_id: event.id,
  });
  if (error) throw new Error("PERSISTENCE_FAILED");
  return true;
}

/** Claims a signed event durably, then applies only approved projections. */
export async function processStripeEvent(event: Stripe.Event, rawBody: string): Promise<"processed" | "duplicate" | "ignored"> {
  const db = createServiceClient();
  if (!db) throw new Error("PERSISTENCE_FAILED");
  const digest = createHash("sha256").update(rawBody).digest("hex");
  const { data: claimed, error } = await db.rpc("claim_billing_webhook_event", { p_provider_event_id: event.id, p_provider_event_type: event.type, p_payload_digest: digest });
  if (error) throw new Error("PERSISTENCE_FAILED");
  if (!claimed) {
    const { data: existing } = await db
      .from("billing_webhook_events")
      .select("status")
      .eq("provider_event_id", event.id)
      .maybeSingle();
    if (existing?.status === "processing" || existing?.status === "failed") {
      throw new Error("PROVIDER_UNAVAILABLE");
    }
    return "duplicate";
  }
  if (!supportedEvents.has(event.type)) {
    await db.from("billing_webhook_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("provider_event_id", event.id);
    return "ignored";
  }
  try {
    const provenance = { id: event.id, type: event.type, createdAt: asIso(event.created) ?? new Date().toISOString() };
    let completedAtomically = false;
    if (event.type.startsWith("customer.subscription.")) completedAtomically = await projectStripeSubscription(event.data.object as Stripe.Subscription, provenance);
    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") completedAtomically = await projectInvoiceLifecycle(event);
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      completedAtomically = await projectCheckoutSession(event, provenance);
    }
    if (event.type === "payment_intent.succeeded") completedAtomically = await projectPurchase(event);
    if (!completedAtomically) await db.from("billing_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("provider_event_id", event.id);
    return "processed";
  } catch (error) {
    await db.from("billing_webhook_events").update({ status: "failed", failure_code: error instanceof Error ? error.message : "PERSISTENCE_FAILED" }).eq("provider_event_id", event.id);
    throw error;
  }
}

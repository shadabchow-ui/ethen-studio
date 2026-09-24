/**
 * Centralized billing and monetization status types.
 *
 * These types exist so components and APIs can consistently label
 * billing/credits/monetization readiness without duplicating strings.
 *
 * Hosted Stripe billing is implemented behind server-only routes. This
 * compatibility status remains configuration-neutral for runtime surfaces
 * that cannot inspect server secrets.
 */

export type BillingReadiness = "live" | "setup-required" | "demo-only" | "unavailable";

export interface BillingStatus {
  /** High-level readiness of the billing subsystem. */
  readiness: BillingReadiness;

  /** Whether a live credit ledger (Supabase credit_ledger) is available. */
  creditLedgerAvailable: boolean;

  /** Whether usage-event persistence (Supabase usage_events) is available. */
  usageEventsAvailable: boolean;

  /** Human-readable one-line summary. */
  summary: string;
}

/**
 * Default runtime status. A deployment needs Stripe credentials and an opaque
 * server-side price catalog before Checkout or the portal become available.
 */
export const CURRENT_BILLING_STATUS: BillingStatus = {
  readiness: "setup-required",
  creditLedgerAvailable: false,
  usageEventsAvailable: false,
  summary:
    "Billing requires Stripe and Supabase server configuration. No subscription, purchase, or entitlement is created until a verified provider event is processed.",
};

export const BILLING_SETUP_REQUIRED_NOTE =
  "Billing requires a live account with a connected payment provider. Not available in this build.";

export const CREDITS_DEMO_NOTE =
  "Demo credits are local-only and reset on page refresh. Live credits require a connected account with a Supabase backend.";

export const USAGE_LOCAL_ONLY_NOTE =
  "Usage events are tracked in memory only in demo mode and are not persisted.";

export const PRICING_NOT_PROVIDED_NOTE =
  "Pricing has not been configured. All credit costs shown are prototype placeholders.";

import "server-only";

import Stripe from "stripe";
import { getServerEnv } from "@ethen/config/env";
import { isBillingConfigured } from "./config";

let cached: Stripe | null | undefined;

/**
 * Lazy server-only Stripe SDK singleton. Returns null when Stripe is not
 * configured — callers must check this before use rather than relying on a
 * throw, so routes and UI can report a truthful not-configured state instead
 * of a runtime error.
 */
export function getStripeClient(): Stripe | null {
  if (cached !== undefined) return cached;

  if (!isBillingConfigured()) {
    cached = null;
    return cached;
  }

  cached = new Stripe(getServerEnv("STRIPE_SECRET_KEY")!, {
    apiVersion: "2026-07-29.dahlia",
  });
  return cached;
}

/** Test-only: clears the cached client so config changes take effect. */
export function __resetStripeClientForTests(): void {
  cached = undefined;
}

/**
 * DES-01 — Designer lifecycle guard.
 *
 * One product authority (the portfolio registry entry) drives all Designer
 * discovery and launch decisions. This helper exists so API surfaces and
 * launch routes share a single fail-closed decision instead of duplicating
 * lifecycle checks with drifting copy.
 *
 * Designer is an independent Product 10 — deliberately NOT part of Studio's
 * freeze boundary and NOT part of the frozen-product switch. Availability is
 * fail-closed by default: lifecycle "unavailable" denies every API surface
 * until a later certification job promotes the lifecycle.
 */

import { getPortfolioEntry } from "./registry";
import type { PortfolioEntry } from "./types";

export const DESIGNER_PRODUCT_ID = "designer" as const;

export type DesignerAvailabilityDecision =
  | { allowed: true }
  | {
      allowed: false;
      status: 404;
      code: "PRODUCT_UNAVAILABLE";
      error: string;
    };

/** The registry entry governing Designer availability (one authority). */
export function getDesignerPortfolioEntry(): PortfolioEntry | undefined {
  return getPortfolioEntry(DESIGNER_PRODUCT_ID);
}

/**
 * Fail-closed availability decision for Designer API surfaces.
 *
 * Default-deny: any unknown or non-certified lifecycle denies with a
 * PRODUCT_UNAVAILABLE error so launch surfaces can distinguish Designer's
 * unavailable state from Studio's frozen state and from setup-required states
 * without misleading text.
 */
export function designerAvailabilityDecision(): DesignerAvailabilityDecision {
  const entry = getDesignerPortfolioEntry();
  if (!entry) {
    return {
      allowed: false,
      status: 404,
      code: "PRODUCT_UNAVAILABLE",
      error: "Designer is currently unavailable.",
    };
  }
  if (entry.lifecycle === "unavailable" || entry.lifecycle === "retired") {
    return {
      allowed: false,
      status: 404,
      code: "PRODUCT_UNAVAILABLE",
      error: `${entry.displayName} is currently unavailable.`,
    };
  }
  return { allowed: true };
}

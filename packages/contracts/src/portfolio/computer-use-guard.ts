/**
 * Computer Use lifecycle guard.
 *
 * Isolation, credential vault, and durable live-browser execution are not
 * production-ready. Registry lifecycle "unavailable" is the single authority.
 * Route presence must never imply the product is executable.
 */

import { getPortfolioEntry } from "./registry";
import type { PortfolioEntry } from "./types";

export const COMPUTER_USE_PRODUCT_ID = "computer-use" as const;

export type ComputerUseAvailabilityDecision =
  | { allowed: true }
  | {
      allowed: false;
      status: 404;
      code: "PRODUCT_UNAVAILABLE";
      error: string;
    };

export function getComputerUsePortfolioEntry(): PortfolioEntry | undefined {
  return getPortfolioEntry(COMPUTER_USE_PRODUCT_ID);
}

export function computerUseAvailabilityDecision(): ComputerUseAvailabilityDecision {
  const entry = getComputerUsePortfolioEntry();
  if (!entry) {
    return {
      allowed: false,
      status: 404,
      code: "PRODUCT_UNAVAILABLE",
      error: "Computer Use is currently unavailable.",
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

/** Studio V5 providers — route quote inputs for economics (STUDIO_06). Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import type { VersionPins } from "../../contracts/versions";
import type { RouteDecision } from "../../catalog/types";
import type { UsageEstimate } from "../ports/provider-adapter";

/**
 * Quote input row handed to STUDIO_04 economics: the exact routed endpoint,
 * its pins, and the adapter's usage estimate. Price lookup stays in j04 —
 * this module never prices, it only carries the route's measured inputs.
 */
export interface RouteQuoteInput {
  task: TaskName;
  endpointId: string;
  pins: VersionPins;
  priceVersion: string;
  meterUnit: string;
  meterQuantity: number;
}

export function toRouteQuoteInput(
  decision: RouteDecision,
  usage: UsageEstimate,
): RouteQuoteInput {
  if (!Number.isInteger(usage.meterQuantity) || usage.meterQuantity < 0) {
    throw new Error("Route quote input requires a non-negative integer meter quantity.");
  }
  return {
    task: decision.quoteInputs.task,
    endpointId: decision.endpointId,
    pins: { ...decision.pins },
    priceVersion: decision.quoteInputs.priceVersion,
    meterUnit: usage.meterUnit,
    meterQuantity: usage.meterQuantity,
  };
}

import "server-only";

import { notAvailableInStudioResponse } from "../../_lib/clerk-sessions";

/**
 * RC2 — billing portal is not a Studio capability in this deployment.
 * Honest 501 (never an HTML 404): the billing overview offers the portal
 * only when a billing customer exists, and the click then surfaces this
 * message instead of failing silently.
 */
export async function POST() {
  return notAvailableInStudioResponse("Billing portal");
}

import "server-only";

import { notAvailableInStudioResponse } from "../../_lib/clerk-sessions";

/**
 * RC2 — data export is not a Studio capability in this deployment.
 * Honest 501 (never an HTML 404): Privacy renders an explicit
 * "not available in Studio" state from the response.
 */
export async function POST() {
  return notAvailableInStudioResponse("Data export");
}

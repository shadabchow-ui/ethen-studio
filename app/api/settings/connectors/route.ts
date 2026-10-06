import "server-only";

import { notAvailableInStudioResponse } from "../_lib/clerk-sessions";

/**
 * RC2 — connectors are not a Studio capability in this deployment.
 * Honest 501 (never an HTML 404): the Connectors section renders an
 * explicit "not available in Studio" state from the response code.
 */
export async function GET() {
  return notAvailableInStudioResponse("Connectors");
}

export async function POST() {
  return notAvailableInStudioResponse("Connectors");
}

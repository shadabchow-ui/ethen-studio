import "server-only";

import { notAvailableInStudioResponse } from "../_lib/clerk-sessions";

/**
 * RC2 — skills are not a Studio capability in this deployment.
 * Honest 501 (never an HTML 404): the Skills section renders an explicit
 * "not available in Studio" state from the response code.
 */
export async function GET() {
  return notAvailableInStudioResponse("Skills");
}

export async function PATCH() {
  return notAvailableInStudioResponse("Skills");
}

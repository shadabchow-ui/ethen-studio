import "server-only";

import { notAvailableInStudioResponse } from "../../_lib/clerk-sessions";

/**
 * RC2 — account deletion is not a Studio capability in this deployment.
 * Honest 501 for both the eligibility check (GET) and the confirmed
 * deletion (POST), never an HTML 404. The UI checks eligibility with GET
 * only and never POSTs before explicit confirmation.
 */
export async function GET() {
  return notAvailableInStudioResponse("Delete account");
}

export async function POST() {
  return notAvailableInStudioResponse("Delete account");
}

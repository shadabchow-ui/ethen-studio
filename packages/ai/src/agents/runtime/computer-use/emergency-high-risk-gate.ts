/**
 * SOL-03 temporary emergency gate for high-risk computer-use routes.
 *
 * Disables unauthenticated takeover / go-live / approve endpoints until
 * SOL-12 lands proper route authorization.
 *
 * Feature flag (rollback / temporary lift for verified SOL-12 work):
 *   ETHEN_ENABLE_COMPUTER_USE_HIGH_RISK_ROUTES=true
 *
 * Permanent job: SOL-12
 * Temporary job: SOL-03
 */

import { NextResponse } from "next/server";

/** Env flag that lifts this SOL-03 gate after SOL-12 authorization is in place. */
export const COMPUTER_USE_HIGH_RISK_ENABLE_FLAG =
  "ETHEN_ENABLE_COMPUTER_USE_HIGH_RISK_ROUTES";

/**
 * Returns true when high-risk computer-use mutation routes must refuse
 * the request (default). Set the enable flag to "true" only after SOL-12
 * guards are verified, or for controlled local rollback testing.
 */
export function isComputerUseHighRiskRouteDisabled(): boolean {
  return process.env[COMPUTER_USE_HIGH_RISK_ENABLE_FLAG] !== "true";
}

export type ComputerUseHighRiskRefusalBody = {
  ok: false;
  error: string;
  code: "SOL_03_EMERGENCY_DISABLED";
  temporaryJob: "SOL-03";
  permanentJob: "SOL-12";
};

export function computerUseHighRiskRefusalBody(): ComputerUseHighRiskRefusalBody {
  return {
    ok: false,
    error:
      "This computer-use control endpoint is temporarily disabled (SOL-03 emergency stabilization). Permanent authentication and authorization land in SOL-12.",
    code: "SOL_03_EMERGENCY_DISABLED",
    temporaryJob: "SOL-03",
    permanentJob: "SOL-12",
  };
}

/** Deliberate non-200 refusal for gated high-risk routes. */
export function computerUseHighRiskRefusedResponse(): NextResponse {
  return NextResponse.json(computerUseHighRiskRefusalBody(), { status: 403 });
}

/**
 * If the emergency gate is active, return the refusal response.
 * Otherwise return null so the route may proceed.
 */
export function refuseIfComputerUseHighRiskDisabled(): NextResponse | null {
  if (!isComputerUseHighRiskRouteDisabled()) {
    return null;
  }
  return computerUseHighRiskRefusedResponse();
}

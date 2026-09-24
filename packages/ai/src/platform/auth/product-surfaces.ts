import "server-only";

import { NextResponse } from "next/server";
import { requireUserSession, type GuardOutcome } from "./guards";
import { designerAvailabilityDecision } from "@ethen/contracts/portfolio/designer-guard";
import { founderAvailabilityDecision } from "@ethen/contracts/portfolio/founder-guard";
import { computerUseAvailabilityDecision } from "@ethen/contracts/portfolio/computer-use-guard";

function unavailableOutcome(
  authorization: GuardOutcome,
  decision: { status: number; code: string; error: string },
): GuardOutcome {
  return {
    ...authorization,
    state: "forbidden",
    response: NextResponse.json(
      { ok: false, error: decision.error, code: decision.code },
      { status: decision.status },
    ),
  };
}

/** Session + Founder lifecycle. Fail-closed while the product is unavailable. */
export async function requireFounderSession(): Promise<GuardOutcome> {
  const authorization = await requireUserSession();
  if (authorization.response) return authorization;
  const decision = founderAvailabilityDecision();
  if (!decision.allowed) return unavailableOutcome(authorization, decision);
  return authorization;
}

/** Session + Designer lifecycle. Fail-closed while the product is unavailable. */
export async function requireDesignerSession(): Promise<GuardOutcome> {
  const authorization = await requireUserSession();
  if (authorization.response) return authorization;
  const decision = designerAvailabilityDecision();
  if (!decision.allowed) return unavailableOutcome(authorization, decision);
  return authorization;
}

export function computerUseLifecycleDenial(): NextResponse | null {
  const decision = computerUseAvailabilityDecision();
  if (decision.allowed) return null;
  return NextResponse.json(
    { ok: false, error: decision.error, code: decision.code },
    { status: decision.status },
  );
}

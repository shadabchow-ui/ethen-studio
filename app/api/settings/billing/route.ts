import "server-only";

import { NextResponse } from "next/server";
import { requireUserSession } from "@ethen/ai/platform/auth/guards";
import { isBillingEnabled } from "@ethen/billing";

/**
 * Studio V3 Job 1 — scoped billing adapter (mirrors Chat's contract).
 *
 * GET /api/settings/billing — real billing state, never hard-coded plans.
 * Same shared backend as Chat; honest unavailable state when unconfigured.
 */
export async function GET() {
  const authorization = await requireUserSession();
  if (authorization.response) return authorization.response;
  const actorId = authorization.actorId as string;

  if (!isBillingEnabled()) {
    return NextResponse.json({
      ok: true,
      available: false,
      reason: "Billing is disabled for this deployment.",
    });
  }
  try {
    const { getBillingOverview } = await import("@ethen/billing/server");
    const overview = await getBillingOverview(actorId);
    return NextResponse.json({ ok: true, available: true, billing: overview });
  } catch {
    return NextResponse.json(
      { ok: true, available: false, reason: "Billing information is unavailable right now." },
      { status: 200 },
    );
  }
}

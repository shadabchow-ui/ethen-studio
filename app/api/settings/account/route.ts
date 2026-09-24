import "server-only";

import { NextResponse } from "next/server";
import { requireUserSession } from "@ethen/ai/platform/auth/guards";
import {
  DEV_AUTH_BYPASS_ACTOR_ID,
  isDevAuthBypassEnabled,
} from "@ethen/ai/platform/auth/dev-bypass";

/**
 * Studio V3 Job 1 — scoped account adapter (mirrors Chat's contract).
 *
 * GET /api/settings/account — session truth for Settings · Account and the
 * Studio rail account menu. Only what the guards establish. No Chat model
 * identity here (Chat's fixed model stays Chat-owned).
 *
 * Job 06B: ownerReview mirrors Chat's local-review detection exactly so the
 * shared rail account footer resolves the same detail string in both apps.
 */
export async function GET() {
  const authorization = await requireUserSession();
  if (authorization.response) {
    return NextResponse.json({ ok: true, signedIn: false, actorId: null });
  }
  const actorId = authorization.actorId as string;
  const ownerReview =
    actorId === DEV_AUTH_BYPASS_ACTOR_ID &&
    process.env.NODE_ENV !== "production" &&
    isDevAuthBypassEnabled();
  return NextResponse.json({
    ok: true,
    signedIn: true,
    actorId,
    accountId: actorId,
    ownerReview,
  });
}

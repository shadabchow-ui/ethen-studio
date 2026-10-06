import "server-only";

import { NextResponse } from "next/server";
import {
  DEV_AUTH_BYPASS_ACTOR_ID,
  isDevAuthBypassEnabled,
} from "@ethen/ai/platform/auth/dev-bypass";
import { resolveServerAccountSnapshot } from "./server-identity";

/**
 * Studio V3 Job 1 — scoped account adapter (mirrors Chat's contract).
 *
 * GET /api/settings/account — session truth for Settings · Account and the
 * Studio rail account menu. Only what the guards establish. No Chat model
 * identity here (Chat's fixed model stays Chat-owned).
 *
 * Job 06B: ownerReview mirrors Chat's local-review detection exactly so the
 * shared rail account footer resolves the same detail string in both apps.
 *
 * RC1: returns the full Studio identity contract `{ ok, state, code,
 * signedIn, actorId, ... }` instead of collapsing every non-mapped state
 * into `{signedIn:false}` (the P0 identity-state split). `signedIn` stays
 * for backward compatibility and is true only for `signed_in`. The `code`
 * is a short mapping-state code; reason-string internals never leave the
 * server. Always 200 — clients branch on `state`, not the status.
 */
export async function GET() {
  const snapshot = await resolveServerAccountSnapshot();
  const actorId = snapshot.actorId;
  const ownerReview =
    actorId === DEV_AUTH_BYPASS_ACTOR_ID &&
    process.env.NODE_ENV !== "production" &&
    isDevAuthBypassEnabled();
  return NextResponse.json({
    ok: true,
    state: snapshot.state,
    code: snapshot.code,
    signedIn: snapshot.signedIn,
    actorId,
    accountId: actorId,
    ownerReview,
  });
}

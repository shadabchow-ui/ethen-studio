import "server-only";

import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import {
  clerkFailureStatus,
  resolveSessionsPrincipal,
  sessionsUnavailableResponse,
  settingsUnauthorizedResponse,
} from "../../_lib/clerk-sessions";

/**
 * RC2 — DELETE /api/settings/sessions/current: revoke the current session.
 *
 * The server half of sign-out: the client calls Clerk `signOut()` after
 * this revocation and lands on public `/studio`. Works for
 * identity-pending users (Clerk-guarded, not mapping-guarded) so the P0
 * trap always has an exit.
 */
export async function DELETE() {
  const principal = await resolveSessionsPrincipal();
  if (!principal) return settingsUnauthorizedResponse();
  if (principal.kind === "synthetic") {
    return NextResponse.json({ ok: true, id: null });
  }
  if (!principal.sessionId) {
    return NextResponse.json(
      { ok: false, code: "no_current_session", error: "No current session to revoke." },
      { status: 404 },
    );
  }
  try {
    const client = await clerkClient();
    try {
      await client.sessions.revokeSession(principal.sessionId);
    } catch (failure) {
      if (clerkFailureStatus(failure) !== 404) return sessionsUnavailableResponse();
    }
    return NextResponse.json({ ok: true, id: principal.sessionId });
  } catch {
    return sessionsUnavailableResponse();
  }
}

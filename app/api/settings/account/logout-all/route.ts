import "server-only";

import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import {
  resolveSessionsPrincipal,
  sessionsUnavailableResponse,
  settingsUnauthorizedResponse,
} from "../../_lib/clerk-sessions";

/**
 * RC2 — POST /api/settings/account/logout-all: revoke every session.
 *
 * Best-effort per session (a concurrent logout elsewhere must not fail
 * the batch); the response counts what this call revoked. The client
 * navigates to `/sign-in`, which renders for the now-signed-out caller.
 */
export async function POST() {
  const principal = await resolveSessionsPrincipal();
  if (!principal) return settingsUnauthorizedResponse();
  if (principal.kind === "synthetic") {
    return NextResponse.json({ ok: true, revoked: 0 });
  }
  try {
    const client = await clerkClient();
    const list = await client.sessions.getSessionList({ userId: principal.userId });
    let revoked = 0;
    for (const session of list.data) {
      try {
        await client.sessions.revokeSession(session.id);
        revoked += 1;
      } catch {
        // Per-session best effort; concurrent revocation is still gone.
      }
    }
    return NextResponse.json({ ok: true, revoked });
  } catch {
    return sessionsUnavailableResponse();
  }
}

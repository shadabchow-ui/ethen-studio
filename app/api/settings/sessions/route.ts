import "server-only";

import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import {
  resolveSessionsPrincipal,
  sessionsUnavailableResponse,
  settingsUnauthorizedResponse,
  toSessionInfo,
} from "../_lib/clerk-sessions";

/**
 * RC2 — GET /api/settings/sessions: the current user's Clerk sessions.
 *
 * Guarded by the Clerk session (no Supabase mapping needed): pending
 * users can still inspect their sessions. Synthetic actors (dev bypass /
 * mock, never production) honestly report an empty list.
 */
export async function GET() {
  const principal = await resolveSessionsPrincipal();
  if (!principal) return settingsUnauthorizedResponse();
  if (principal.kind === "synthetic") {
    return NextResponse.json({
      ok: true,
      signedIn: true,
      scope: "user",
      scopeNote: "Synthetic review actor: no Clerk sessions exist.",
      sessions: [],
    });
  }
  try {
    const client = await clerkClient();
    const list = await client.sessions.getSessionList({ userId: principal.userId });
    return NextResponse.json({
      ok: true,
      signedIn: true,
      scope: "user",
      scopeNote: "All signed-in sessions for this account.",
      sessions: list.data.map((session) => toSessionInfo(session, principal.sessionId)),
    });
  } catch {
    return sessionsUnavailableResponse();
  }
}

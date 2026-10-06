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
 * RC2 — DELETE /api/settings/sessions/[id]: revoke one session.
 *
 * The session must belong to the caller; anything else is a 404 (no
 * cross-user oracle). A revoke that races a concurrent logout still
 * reports success — the session is gone either way.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const principal = await resolveSessionsPrincipal();
  if (!principal) return settingsUnauthorizedResponse();
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, code: "session_not_found", error: "Session not found." },
      { status: 404 },
    );
  }
  if (principal.kind === "synthetic") {
    return NextResponse.json({ ok: true, id });
  }
  try {
    const client = await clerkClient();
    let owner: string | null;
    try {
      owner = (await client.sessions.getSession(id)).userId ?? null;
    } catch (failure) {
      if (clerkFailureStatus(failure) === 404) {
        return NextResponse.json(
          { ok: false, code: "session_not_found", error: "Session not found." },
          { status: 404 },
        );
      }
      return sessionsUnavailableResponse();
    }
    if (owner !== principal.userId) {
      return NextResponse.json(
        { ok: false, code: "session_not_found", error: "Session not found." },
        { status: 404 },
      );
    }
    try {
      await client.sessions.revokeSession(id);
    } catch (failure) {
      if (clerkFailureStatus(failure) !== 404) return sessionsUnavailableResponse();
    }
    return NextResponse.json({ ok: true, id });
  } catch {
    return sessionsUnavailableResponse();
  }
}

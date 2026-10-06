import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isMockModeAllowed } from "@ethen/config/env-contract";
import { resolveDevAuthBypassActorId } from "@ethen/ai/platform/auth/dev-bypass";
import { toSessionInfo } from "./session-shape";

export { toSessionInfo };

/**
 * RC2 — shared Clerk-session backend for Studio's settings session routes.
 *
 * Guarded by the Clerk session (not the Supabase mapping): listing and
 * revoking Clerk sessions needs no mapping row, and identity-pending
 * users must be able to sign out. Synthetic actors (dev bypass / mock
 * mode, never production) honestly report zero Clerk sessions.
 */

export type SessionsPrincipal =
  | { kind: "clerk"; userId: string; sessionId: string | null }
  | { kind: "synthetic" };

export async function resolveSessionsPrincipal(): Promise<SessionsPrincipal | null> {
  try {
    const { userId, sessionId } = await auth();
    if (userId) return { kind: "clerk", userId, sessionId: sessionId ?? null };
  } catch {
    // Fall through to the synthetic-actor and signed-out branches.
  }
  if (resolveDevAuthBypassActorId() ?? (isMockModeAllowed() ? "mock" : null)) {
    return { kind: "synthetic" };
  }
  return null;
}

export function settingsUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, code: "unauthenticated", error: "Sign in required." },
    { status: 401 },
  );
}

export function sessionsUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, code: "sessions_unavailable", error: "Sessions could not be loaded." },
    { status: 503 },
  );
}

/** Honest capability absence (RC2): Studio never implements these. */
export function notAvailableInStudioResponse(capability: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "NOT_AVAILABLE_IN_STUDIO",
      error: `${capability} is not available in Studio.`,
    },
    { status: 501 },
  );
}

export function clerkFailureStatus(failure: unknown): number | null {
  if (failure && typeof failure === "object" && "status" in failure) {
    const status = (failure as { status: unknown }).status;
    if (typeof status === "number") return status;
  }
  return null;
}

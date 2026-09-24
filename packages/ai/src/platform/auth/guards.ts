import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@ethen/database/server";
import { resolveProjectAuth } from "./project-auth";
import { resolveDevAuthBypassActorId } from "./dev-bypass";

export type GuardState = "authorized" | "unauthenticated" | "forbidden" | "setup_required";
export interface GuardOutcome { state: GuardState; actorId: string | null; projectId: string | null; response: NextResponse | null; }
export type Capability = string;

export function guardError(state: Exclude<GuardState, "authorized">, api: boolean): NextResponse {
  const status = state === "unauthenticated" ? 401 : state === "forbidden" ? 403 : 503;
  if (api) return NextResponse.json({ ok: false, error: state, code: state }, { status });
  return NextResponse.redirect(new URL(state === "unauthenticated" ? "/sign-in" : "/", "http://localhost"), 307);
}

export async function requireAuth(input: { api: boolean; resolve: () => Promise<string | null> }): Promise<GuardOutcome> {
  // Dev-only: skip the real resolver entirely so local testing never depends
  // on a configured auth provider. See dev-bypass.ts for the production
  // hard-stop; every downstream authorization check still runs normally
  // against this actor id.
  const bypassActorId = resolveDevAuthBypassActorId();
  const actorId = bypassActorId ?? (await input.resolve());
  if (!actorId) return { state: "unauthenticated", actorId: null, projectId: null, response: guardError("unauthenticated", input.api) };
  return { state: "authorized", actorId, projectId: null, response: null };
}

import { isClerkConfigured } from "@ethen/database/clerk-supabase";

/** Resolve a trusted user session (Clerk-bridged or Supabase SSR) for an API route boundary. */
export async function requireUserSession(): Promise<GuardOutcome> {
  return requireAuth({
    api: true,
    resolve: async () => {
      // Primary: when Clerk is configured, resolve canonical auth.users.id UUID
      // through the durable clerk_user_mappings bridge.
      if (isClerkConfigured()) {
        try {
          const { resolveClerkSupabaseMapping } = await import("@ethen/database/clerk-supabase");
          const mapping = await resolveClerkSupabaseMapping();
          if (mapping.state === "mapped" && mapping.supabaseUserId) {
            return mapping.supabaseUserId;
          }
        } catch {
          // Mapping unavailable → remain unauthenticated.
        }
        return null;
      }

      // Secondary: Supabase SSR session (auth cookie) fallback when Clerk is not configured.
      try {
        const client = await createClient();
        const { data, error } = await client.auth.getUser();
        if (!error && data.user?.id) return data.user.id;
      } catch {
        // Fall through
      }

      return null;
    },
  });
}

export async function requireProject(input: { api: boolean; projectId: string }): Promise<GuardOutcome> {
  const auth = await resolveProjectAuth(input.projectId);
  if (auth.state !== "authorized") return { state: auth.state, actorId: auth.userId, projectId: auth.projectId, response: guardError(auth.state, input.api) };
  return { state: "authorized", actorId: auth.userId, projectId: auth.projectId, response: null };
}

export function requireAdmin(input: { api: boolean; actorId: string | null; isAdmin: boolean }): GuardOutcome {
  if (!input.actorId) return { state: "unauthenticated", actorId: null, projectId: null, response: guardError("unauthenticated", input.api) };
  if (!input.isAdmin) return { state: "forbidden", actorId: input.actorId, projectId: null, response: guardError("forbidden", input.api) };
  return { state: "authorized", actorId: input.actorId, projectId: null, response: null };
}

export function requireCapability(input: { api: boolean; actorId: string | null; capabilities: readonly Capability[]; capability: Capability }): GuardOutcome {
  if (!input.actorId) return { state: "unauthenticated", actorId: null, projectId: null, response: guardError("unauthenticated", input.api) };
  if (!input.capabilities.includes(input.capability)) return { state: "forbidden", actorId: input.actorId, projectId: null, response: guardError("forbidden", input.api) };
  return { state: "authorized", actorId: input.actorId, projectId: null, response: null };
}

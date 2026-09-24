import "server-only";

import { createHmac } from "node:crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isClerkConfigured, resolveClerkSupabaseMapping } from "./clerk-supabase";

const uuidSchema = z.string().uuid();

export class RLSBridgeUnavailableError extends Error {
  readonly code = "RLS_BRIDGE_UNAVAILABLE";
  readonly status = 503;
  constructor(message = "SUPABASE_JWT_SECRET (min 32 chars) and Supabase public configuration are required for bridged database access.") {
    super(message);
    this.name = "RLSBridgeUnavailableError";
  }
}

export class AuthenticationRequiredError extends Error {
  readonly code = "AUTH_REQUIRED";
  readonly status = 401;
  constructor(message = "Authentication is required to access this resource.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class IdentitySetupRequiredError extends Error {
  readonly code = "IDENTITY_SETUP_REQUIRED";
  readonly status = 503;
  constructor(message = "User identity mapping to database is pending or unavailable.") {
    super(message);
    this.name = "IdentitySetupRequiredError";
  }
}

/**
 * Mint a short-lived authenticated-role RLS token for a verified user UUID.
 * Never exposed to browser clients; valid for 60 seconds.
 */
export function bridgeToken(userId: string, url: string, secret: string): string {
  uuidSchema.parse(userId);
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const content = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iss: `${url}/auth/v1`,
    iat: now,
    exp: now + 60,
  })}`;
  return `${content}.${createHmac("sha256", secret).update(content).digest("base64url")}`;
}

/**
 * Construct a Supabase client operating under Postgres RLS as the specified user.
 * Requires SUPABASE_JWT_SECRET (>= 32 chars) and Supabase public environment.
 * Fails closed with RLSBridgeUnavailableError if secret is missing or insufficient.
 */
export function createBridgedClient(userId: string): SupabaseClient {
  uuidSchema.parse(userId);
  const secret = process.env.SUPABASE_JWT_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!secret || secret.length < 32 || !url || !anon) {
    throw new RLSBridgeUnavailableError();
  }

  const token = bridgeToken(userId, url, secret);
  return createSupabaseClient(url, anon, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

/**
 * Resolve the current server-authenticated identity and return an RLS-bound Supabase client.
 *
 * Unified Access Model:
 * 1. Clerk-configured: resolves verified Clerk identity mapped to Supabase auth.users UUID,
 *    then mints a scoped JWT signed with SUPABASE_JWT_SECRET for full RLS enforcement.
 * 2. Supabase Auth (SSR cookies): falls through to the SSR cookie client when Clerk is not configured.
 *
 * Fails closed if the user is unauthenticated or the bridge signing key is unconfigured.
 */
export async function createAuthenticatedClient(): Promise<SupabaseClient> {
  if (isClerkConfigured()) {
    const mapping = await resolveClerkSupabaseMapping();
    if (mapping.state === "unauthenticated" || !mapping.supabaseUserId) {
      if (mapping.state === "unauthenticated") {
        throw new AuthenticationRequiredError();
      }
      throw new IdentitySetupRequiredError();
    }
    return createBridgedClient(mapping.supabaseUserId);
  }

  const { createClient } = await import("./server");
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    throw new AuthenticationRequiredError();
  }
  return client;
}

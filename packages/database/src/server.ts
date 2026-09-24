import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hasConfiguredSupabasePublicEnv } from "@ethen/config/env";
import { mergeCookieOptions } from "@ethen/security/cookies";
import { isClerkConfigured } from "./clerk-supabase";
import { createBridgedClient } from "./bridge";

export {
  bridgeToken,
  createBridgedClient,
  createAuthenticatedClient,
  RLSBridgeUnavailableError,
  AuthenticationRequiredError,
  IdentitySetupRequiredError,
} from "./bridge";

export async function createClient() {
  if (!hasConfiguredSupabasePublicEnv()) {
    throw new Error("Supabase public environment variables are not configured on this server.");
  }

  // When Clerk is configured, bridge authenticated user to scoped RLS client
  if (isClerkConfigured()) {
    try {
      const { resolveClerkSupabaseMapping } = await import("./clerk-supabase");
      const mapping = await resolveClerkSupabaseMapping();
      if (mapping.state === "mapped" && mapping.supabaseUserId) {
        return createBridgedClient(mapping.supabaseUserId);
      }
    } catch {
      // Fall through to SSR client if mapping is unavailable
    }
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, mergeCookieOptions(options))
            );
          } catch {
            // Called from a Server Component; cookie writes are no-ops there.
          }
        },
      },
    }
  );
}

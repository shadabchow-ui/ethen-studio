import "server-only";

import { createClient } from "@ethen/database/server";
import { hasConfiguredSupabasePublicEnv } from "@ethen/config/env";
import { isClerkConfigured, resolveClerkSupabaseMapping } from "@ethen/database/clerk-supabase";

const BILLING_PRINCIPAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asBillingPrincipal(userId: string | null | undefined): string | null {
  if (!userId) return null;
  if (userId.startsWith("mock-") || userId.startsWith("demo-") || userId === "local-dev") return null;
  return BILLING_PRINCIPAL_UUID.test(userId) ? userId : null;
}

/** Resolves the canonical Supabase UUID; Clerk IDs are never billing owners. */
export async function resolveBillingPrincipal(): Promise<string | null> {
  if (!hasConfiguredSupabasePublicEnv()) return null;

  if (isClerkConfigured()) {
    const mapping = await resolveClerkSupabaseMapping();
    return mapping.state === "mapped" ? asBillingPrincipal(mapping.supabaseUserId) : null;
  }

  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    return error ? null : asBillingPrincipal(data.user?.id);
  } catch {
    return null;
  }
}

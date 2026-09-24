import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { hasConfiguredSupabaseServerEnv } from "@ethen/config/env";
import {
  recordServiceRoleAccess,
  type ServiceRoleScope,
} from "./service-role-audit";

/**
 * Returns a Supabase client using the service-role key.
 * Service-role bypasses all Row Level Security — use only for trusted
 * server-side operations such as credit ledger writes.
 *
 * Returns null if the service-role key is not configured (local/mock mode).
 */
export function createServiceClient(scope?: ServiceRoleScope) {
  if (!hasConfiguredSupabaseServerEnv()) return null;

  recordServiceRoleAccess(
    scope ?? { reason: "unscoped_service_role", actorId: null },
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client that requires an explicit, auditable scope. */
export function createScopedServiceClient(scope: ServiceRoleScope) {
  if (!scope.reason.trim()) {
    throw new Error("Service-role usage requires an explicit scope reason.");
  }
  return createServiceClient(scope);
}

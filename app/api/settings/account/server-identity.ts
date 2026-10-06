import "server-only";

import { resolveClerkSupabaseMapping } from "@ethen/database/clerk-supabase";
import { resolveDevAuthBypassActorId } from "@ethen/ai/platform/auth/dev-bypass";
import {
  resolveStudioAccountSnapshot,
  type StudioAccountSnapshot,
} from "../../../../components/studio/auth/identity-state";

/**
 * RC1 — server identity for `GET /api/settings/account`.
 *
 * Thin wrapper: supplies the real dev-bypass check and the real durable
 * Clerk→Supabase mapping lookup to the shared snapshot builder. All state
 * mapping lives in the framework-free contract module so unit tests cover
 * it without Clerk/Supabase.
 */
export async function resolveServerAccountSnapshot(): Promise<StudioAccountSnapshot> {
  return resolveStudioAccountSnapshot({
    bypassActorId: resolveDevAuthBypassActorId(),
    resolveMapping: resolveClerkSupabaseMapping,
  });
}

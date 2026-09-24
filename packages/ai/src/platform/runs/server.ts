import "server-only";

import { createClient } from "@ethen/database/server";
import { UniversalRunService } from "./service";
import { SupabaseRunRepository } from "./supabase-repository";

/**
 * Production construction is durable and RLS-bound. Missing Supabase
 * configuration throws from createClient; there is no memory fallback.
 */
export async function createUniversalRunService(): Promise<UniversalRunService> {
  const client = await createClient();
  return new UniversalRunService({
    repository: new SupabaseRunRepository(client),
  });
}

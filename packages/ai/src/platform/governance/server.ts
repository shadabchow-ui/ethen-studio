import "server-only";

import { createClient } from "@ethen/database/server";
import { GovernanceService } from "./service";
import { SupabaseTenantObjectDeletionStore } from "./supabase-object-store";
import { SupabaseGovernanceRepository } from "./supabase-repository";

export async function createGovernanceService(): Promise<GovernanceService> {
  const client = await createClient();
  return new GovernanceService({
    repository: new SupabaseGovernanceRepository(client),
    objectStore: new SupabaseTenantObjectDeletionStore(client),
  });
}


import "server-only";

import { createClient } from "@ethen/database/server";
import { ProofService } from "./service";
import { SupabaseProofObjectStore } from "./supabase-object-store";
import { SupabaseProofRepository } from "./supabase-repository";

export async function createProofService(): Promise<ProofService> {
  const client = await createClient();
  return new ProofService({
    repository: new SupabaseProofRepository(client),
    objectStore: new SupabaseProofObjectStore(client),
  });
}

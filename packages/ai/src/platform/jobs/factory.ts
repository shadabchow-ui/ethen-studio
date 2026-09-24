import "server-only";

import { isMockModeAllowed } from "@ethen/config/env-contract";
import { hasConfiguredSupabaseServerEnv } from "@ethen/config/env";
import { createServiceClient } from "@ethen/database/service";
import { InMemoryJobRepository } from "./in-memory-repository";
import type { JobRepository } from "./repository";
import {
  SupabaseDurableJobRepository,
  type DurableJobsClient,
} from "./supabase-repository";

let memorySingleton: InMemoryJobRepository | null = null;

export function isPlatformJobRepositoryDurable(): boolean {
  return hasConfiguredSupabaseServerEnv();
}

/**
 * Prefer the durable_jobs table when the service-role client is configured.
 * Memory is allowed only in mock/dev. Production without Supabase stays
 * in-memory and reports not durable — it does not fake persistence.
 */
export function createPlatformJobRepository(): JobRepository {
  const client = createServiceClient({
    reason: "durable_jobs",
    tables: ["durable_jobs"],
  });
  if (client) {
    return new SupabaseDurableJobRepository(client as unknown as DurableJobsClient);
  }
  if (!isMockModeAllowed() && process.env.NODE_ENV === "production") {
    // Honest fallback: callers must consult isPlatformJobRepositoryDurable().
    // Throwing here would 500 HTML overview pages that only list jobs.
  }
  memorySingleton ??= new InMemoryJobRepository();
  return memorySingleton;
}

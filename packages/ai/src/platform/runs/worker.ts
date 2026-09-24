import "server-only";

import { createScopedServiceClient } from "@ethen/database/service";
import { UniversalRunService } from "./service";
import { SupabaseRunRepository } from "./supabase-repository";

/**
 * Worker-safe UniversalRunService construction (deep-research durable worker).
 *
 * Request-independent: uses a scoped service-role client, never the
 * cookie-bound `@ethen/database/server` client, so it works outside a Next
 * request scope (platform worker host has no `next/headers` cookies).
 *
 * Service-role bypasses RLS — callers must enforce the actor/project/run
 * ownership boundary explicitly from the stored run record (see
 * `ResearchDurableWorker.scopeForRun`). Never import this module from
 * browser or HTTP request paths; those keep the RLS-bound `./server`
 * constructor.
 */
export const DEEP_RESEARCH_WORKER_RUN_SCOPE = "deep_research_worker_runs" as const;

export async function createWorkerRunService(
  actorId?: string | null,
): Promise<UniversalRunService> {
  const client = createScopedServiceClient({
    reason: DEEP_RESEARCH_WORKER_RUN_SCOPE,
    actorId: actorId ?? null,
    tables: ["runs", "run_attempts", "run_events", "run_continuations"],
  });
  if (!client) {
    throw new Error(
      "WORKER_RUN_STORE_UNAVAILABLE: deep-research worker run store needs SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return new UniversalRunService({
    repository: new SupabaseRunRepository(client),
  });
}

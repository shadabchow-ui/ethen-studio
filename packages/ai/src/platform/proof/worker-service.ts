import "server-only";

import { createScopedServiceClient } from "@ethen/database/service";
import { ProofService } from "./service";
import { SupabaseProofObjectStore } from "./supabase-object-store";
import { SupabaseProofRepository } from "./supabase-repository";

/**
 * Worker-safe ProofService construction (deep-research durable worker).
 *
 * Request-independent: uses a scoped service-role client, never the
 * cookie-bound `@ethen/database/server` client, so it works outside a Next
 * request scope (platform worker host has no `next/headers` cookies).
 *
 * Service-role bypasses RLS — proof reads/writes stay tenant-bound via the
 * `projects/<project>/objects/...` key shape plus explicit project scoping
 * by the caller. Never import this module from browser or HTTP request
 * paths; those keep the RLS-bound `./server` constructor.
 *
 * (Distinct from `./worker`, which is the plain-node worker evidence-store
 * adapter for missions executor/verifier processes.)
 */
export const DEEP_RESEARCH_WORKER_PROOF_SCOPE = "deep_research_worker_proof" as const;

export async function createWorkerProofService(
  actorId?: string | null,
): Promise<ProofService> {
  const client = createScopedServiceClient({
    reason: DEEP_RESEARCH_WORKER_PROOF_SCOPE,
    actorId: actorId ?? null,
    tables: ["proof_evidence", "proof_artifacts", "proof_artifact_versions"],
  });
  if (!client) {
    throw new Error(
      "WORKER_PROOF_STORE_UNAVAILABLE: deep-research worker proof store needs SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return new ProofService({
    repository: new SupabaseProofRepository(client),
    objectStore: new SupabaseProofObjectStore(client),
  });
}

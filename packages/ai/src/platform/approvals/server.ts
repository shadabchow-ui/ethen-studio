import "server-only";

import { createClient } from "@ethen/database/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CanonicalApprovalService } from "./service";
import { SupabaseApprovalRepository } from "./supabase-repository";
import { MemoryApprovalRepository } from "./memory-repository";
import { ApprovalPersistenceError } from "./errors";

let memoryRepoInstance: MemoryApprovalRepository | null = null;

/** Memory is deliberately opt-in.  It must never be an availability fallback. */
export function governanceRepositoryMode(): "durable" | "memory" {
  const mode = process.env.ETHEN_GOVERNANCE_REPOSITORY_MODE;
  if (mode === "test" || mode === "demo") return "memory";
  return "durable";
}

function getMemoryRepository(): MemoryApprovalRepository {
  if (!memoryRepoInstance) {
    memoryRepoInstance = new MemoryApprovalRepository();
  }
  return memoryRepoInstance;
}

export async function createCanonicalApprovalService(): Promise<CanonicalApprovalService> {
  if (governanceRepositoryMode() === "memory") {
    return new CanonicalApprovalService({ repository: getMemoryRepository() });
  }
  try {
    return new CanonicalApprovalService({
      repository: new SupabaseApprovalRepository(await createClient()),
    });
  } catch (error) {
    throw new ApprovalPersistenceError("initialize_approval_repository", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Worker/background-process factory: accepts an explicit Supabase client so a
 * durable worker (no request cookies) can verify execution claims without the
 * SSR client. The durable mode switch still applies — memory mode is never an
 * availability fallback for production workers.
 */
export function createCanonicalApprovalServiceWithClient(
  client: SupabaseClient,
): CanonicalApprovalService {
  if (governanceRepositoryMode() === "memory") {
    return new CanonicalApprovalService({ repository: getMemoryRepository() });
  }
  return new CanonicalApprovalService({
    repository: new SupabaseApprovalRepository(client),
  });
}

/**
 * Get the in-memory repository directly (for API routes that need to
 * inspect seed data or reset state).
 */
export function getOrCreateMemoryApprovalRepository(): MemoryApprovalRepository {
  if (governanceRepositoryMode() !== "memory") {
    throw new ApprovalPersistenceError("initialize_approval_repository", "memory repositories require explicit test or demo mode");
  }
  return getMemoryRepository();
}

import "server-only";

/**
 * Studio V5 M5 D6 — local-lane identity repository. The explicit
 * loopback-only bypass has no Supabase service client, so identity and
 * voice reads serve the kernel memory store (the same store the
 * STUDIO_10 suites certify) instead of returning 503. The store starts
 * empty: no identities are invented, and empty lists render the honest
 * empty states. Writes stay SETUP_REQUIRED — memory cannot durably
 * persist identities.
 */
import { MemoryIdentityRepository } from "@ethen/studio-core/server/identity";

let repository: MemoryIdentityRepository | null = null;

export function getMemoryIdentityRepository(): MemoryIdentityRepository {
  if (!repository) repository = new MemoryIdentityRepository();
  return repository;
}

/** Test hook: drop the process store so the next read starts empty. */
export function resetMemoryIdentityRepository(): void {
  repository = null;
}

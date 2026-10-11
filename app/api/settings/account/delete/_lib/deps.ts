import "server-only";

import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { resolveSessionsPrincipal } from "../../../_lib/clerk-sessions";
import type { AccountDeletionDeps, AccountDeletionStore, Subject } from "./handler";

/**
 * STUDIO-DEL-01 — production wiring for the delete-account route.
 *
 * Identity comes from the Clerk session (same helper as the session routes).
 * The persistence adapter is deliberately absent: it needs the Studio table
 * definitions and owner decisions listed in the job report, so the store
 * resolves to null and the route fails closed (503, nothing deleted) rather
 * than claiming a deletion it did not perform.
 */
async function resolveSubject(): Promise<Subject> {
  const principal = await resolveSessionsPrincipal();
  if (!principal) return { kind: "anonymous" };
  if (principal.kind === "synthetic") return { kind: "synthetic" };
  return { kind: "clerk", clerkUserId: principal.userId };
}

async function revokeSessions(clerkUserId: string): Promise<void> {
  const client = await clerkClient();
  const list = await client.sessions.getSessionList({ userId: clerkUserId });
  for (const session of list.data) {
    try {
      await client.sessions.revokeSession(session.id);
    } catch {
      // Best effort: a concurrently revoked session is already gone.
    }
  }
}

function configuredStore(): AccountDeletionStore | null {
  return null;
}

export function productionDeletionDeps(): AccountDeletionDeps {
  return {
    resolveSubject,
    store: configuredStore(),
    revokeSessions,
    now: () => new Date().toISOString(),
    newRequestId: () => randomUUID(),
  };
}

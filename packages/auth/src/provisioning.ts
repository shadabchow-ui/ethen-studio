import "server-only";

import { createServiceClient } from "@ethen/database/service";

export interface IdentityEvent {
  id: string;
  timestamp: number;
  type: "user.created" | "user.updated" | "user.deleted";
  clerkUserId: string;
  email: string | null;
}

/** Signature verification belongs at the HTTP boundary; IDs are allocated by DB. */
export async function provisionClerkIdentity(event: IdentityEvent): Promise<void> {
  const client = createServiceClient({
    reason: "clerk_webhook_identity_provisioning",
    actorId: event.clerkUserId,
    tables: ["clerk_provisioning_state", "clerk_user_mappings", "auth.users"],
  });
  if (!client) throw new Error("identity_provisioning_unavailable");

  const deleted = event.type === "user.deleted";
  const reserved = await client.rpc("reserve_clerk_provisioning", {
    p_clerk_id: event.clerkUserId,
    p_event_id: event.id,
    p_at_ms: event.timestamp,
    p_deleted: deleted,
  });
  if (reserved.error || !reserved.data) throw new Error("identity_reservation_failed");
  if (reserved.data.skip) return;

  const { userId, lease } = reserved.data as { userId: string; lease: string };
  if (deleted) {
    const result = await client.auth.admin.deleteUser(userId);
    if (result.error && result.error.status !== 404) throw new Error("identity_delete_failed");
  } else {
    const existing = await client.auth.admin.getUserById(userId);
    if (existing.error && existing.error.status !== 404) throw new Error("identity_lookup_failed");
    if (!existing.data.user) {
      // Stable, non-deliverable address avoids account linking through email.
      // Clerk owns login/email verification; this identity exists for UUID RLS.
      const created = await client.auth.admin.createUser({
        id: userId,
        email: `${userId}@clerk-identity.invalid`,
        email_confirm: true,
        app_metadata: { provider: "clerk", clerk_user_id: event.clerkUserId },
      });
      if (created.error) throw new Error("identity_create_failed");
    }
  }

  const finished = await client.rpc("finish_clerk_provisioning", {
    p_clerk_id: event.clerkUserId,
    p_lease: lease,
    p_email: event.email,
  });
  if (finished.error) throw new Error("identity_commit_failed");
}

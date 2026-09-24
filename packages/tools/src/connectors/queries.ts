import "server-only";

import { createClient } from "@ethen/database/server";
import type { ConnectionMetadata, ConnectionStatus, ProviderId, ScopeString } from "./types";
import { serializeConnection } from "./redact";
import type { SafeConnection } from "./types";

export interface CreateConnectionInput {
  providerId: ProviderId;
  accountLabel: string;
  scopesGranted: ScopeString[];
  providerMeta?: Record<string, unknown>;
}

function rowToMetadata(row: Record<string, unknown>): ConnectionMetadata {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    providerId: row.provider_id as string,
    accountLabel: row.account_label as string,
    status: row.status as ConnectionStatus,
    scopesGranted: (row.scopes_granted as string[]) ?? [],
    lastHealthCheckAt: (row.last_health_check_at as string | null) ?? null,
    providerMeta: (row.provider_meta as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Create a new connector connection row for the authenticated user.
 * Returns client-safe serialized connection, or null if auth/client unavailable.
 */
export async function createConnection(
  input: CreateConnectionInput
): Promise<SafeConnection | null> {
  let sb;
  try {
    sb = await createClient();
  } catch {
    return null;
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("connector_connections")
    .insert({
      user_id: user.id,
      provider_id: input.providerId,
      account_label: input.accountLabel,
      scopes_granted: input.scopesGranted,
      status: "active" as ConnectionStatus,
      provider_meta: input.providerMeta ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[connectors] createConnection error:", error.message);
    return null;
  }

  return serializeConnection(rowToMetadata(data as Record<string, unknown>));
}

/**
 * List all connections for the authenticated user.
 * Returns client-safe serialized connections (no token data).
 */
export async function getUserConnections(): Promise<SafeConnection[]> {
  let sb;
  try {
    sb = await createClient();
  } catch {
    return [];
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return [];

  const { data, error } = await sb
    .from("connector_connections")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[connectors] getUserConnections error:", error.message);
    return [];
  }

  return (data ?? []).map((row) =>
    serializeConnection(rowToMetadata(row as Record<string, unknown>))
  );
}

/**
 * Get a single connection by ID.
 * Returns client-safe serialized connection, or null if not found / not owned.
 */
export async function getConnection(
  connectionId: string
): Promise<SafeConnection | null> {
  let sb;
  try {
    sb = await createClient();
  } catch {
    return null;
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("connector_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return null;

  return serializeConnection(rowToMetadata(data as Record<string, unknown>));
}

/**
 * Update the status of a connection.
 * Returns the updated client-safe connection, or null on failure.
 */
export async function updateConnectionStatus(
  connectionId: string,
  status: ConnectionStatus
): Promise<SafeConnection | null> {
  let sb;
  try {
    sb = await createClient();
  } catch {
    return null;
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("connector_connections")
    .update({ status })
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) return null;

  return serializeConnection(rowToMetadata(data as Record<string, unknown>));
}

/**
 * Update the last health check timestamp for a connection.
 */
export async function touchConnectionHealth(
  connectionId: string
): Promise<void> {
  let sb;
  try {
    sb = await createClient();
  } catch {
    return;
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  await sb
    .from("connector_connections")
    .update({ last_health_check_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("user_id", user.id);
}

/**
 * Delete a connection and its associated token bundle (via vault).
 */
export async function deleteConnection(connectionId: string): Promise<boolean> {
  const { deleteTokens } = await import("./vault");
  await deleteTokens(connectionId);

  let sb;
  try {
    sb = await createClient();
  } catch {
    return false;
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;

  const { error } = await sb
    .from("connector_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", user.id);

  return !error;
}

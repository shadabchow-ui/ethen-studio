import "server-only";

import { createClient } from "@ethen/database/server";

export async function getUserFavoriteAgentIds(): Promise<string[]> {
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
    .from("favorites")
    .select("agent_id")
    .eq("user_id", user.id);

  if (error) {
    console.error("[favorites] getUserFavoriteAgentIds error:", error.message);
    return [];
  }

  return (data ?? []).map((row: { agent_id: string }) => row.agent_id);
}

export async function getUserSessions(limit = 20) {
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
    .from("sessions")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[sessions] getUserSessions (server) error:", error.message);
    return [];
  }

  return data ?? [];
}

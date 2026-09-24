"use server";

import { createClient } from "@ethen/database/server";
import { hasSupabaseEnv } from "@ethen/config/runtime-flags";
import { insertUsageEvent } from "../../../usage/src/server";

export async function addFavorite(agentId: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Sign in to save favorites." };
  }

  let sb;
  try {
    sb = await createClient();
  } catch {
    return { ok: false, error: "Service unavailable." };
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to save favorites." };

  const { error } = await sb
    .from("favorites")
    .upsert({ user_id: user.id, agent_id: agentId }, { onConflict: "user_id,agent_id" });

  if (error) {
    console.error("[favorites] addFavorite error:", error.message);
    return { ok: false, error: "Could not save favorite." };
  }

  void insertUsageEvent({
    user_id: user.id,
    event_type: "favorite_added",
    metadata: { agent_id: agentId },
  });

  return { ok: true };
}

export async function removeFavorite(agentId: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Sign in to manage favorites." };
  }

  let sb;
  try {
    sb = await createClient();
  } catch {
    return { ok: false, error: "Service unavailable." };
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage favorites." };

  const { error } = await sb
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("agent_id", agentId);

  if (error) {
    console.error("[favorites] removeFavorite error:", error.message);
    return { ok: false, error: "Could not remove favorite." };
  }

  void insertUsageEvent({
    user_id: user.id,
    event_type: "favorite_removed",
    metadata: { agent_id: agentId },
  });

  return { ok: true };
}

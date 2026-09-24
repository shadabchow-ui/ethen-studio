import { createClient } from "@ethen/database/client";
import type { Session, CreateSessionInput } from "./types";

function client() {
  return createClient();
}

export async function createSession(input: CreateSessionInput): Promise<Session | null> {
  const sb = client();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("sessions")
    .insert({
      user_id: user.id,
      agent_id: input.agent_id ?? null,
      title: input.title ?? null,
      workspace_archetype: input.workspace_archetype ?? "generic_chat",
      model_route: input.model_route ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("createSession error", error.message);
    return null;
  }
  return data as Session;
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const sb = client();
  const { data, error } = await sb
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error) return null;
  return data as Session;
}

export async function getUserSessions(limit = 20): Promise<Session[]> {
  const sb = client();
  const { data, error } = await sb
    .from("sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as Session[];
}

export async function getUserSessionPreviews(
  sessionIds: string[],
): Promise<Record<string, string | null>> {
  if (sessionIds.length === 0) return {};

  const sb = client();
  const { data, error } = await sb
    .from("messages")
    .select("session_id, role, content, created_at")
    .in("session_id", sessionIds)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getUserSessionPreviews error", error.message);
    return {};
  }

  const previews: Record<string, string | null> = {};

  for (const row of data ?? []) {
    const sessionId = typeof row.session_id === "string" ? row.session_id : null;
    if (!sessionId || sessionId in previews) continue;

    previews[sessionId] =
      typeof row.content === "string" && row.content.trim().length > 0
        ? row.content.trim().slice(0, 120)
        : null;
  }

  return previews;
}

export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<boolean> {
  const sb = client();
  const { error } = await sb
    .from("sessions")
    .update({ title })
    .eq("id", sessionId);
  return !error;
}

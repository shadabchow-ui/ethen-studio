import "server-only";

import { createClient, createBridgedClient } from "@ethen/database/server";
import { hasConfiguredSupabasePublicEnv } from "@ethen/config/env";
import { isClerkConfigured, resolveClerkSupabaseMapping } from "@ethen/database/clerk-supabase";
import type { Session, CreateSessionInput, Message } from "./types";

export interface CreateServerSessionOptions extends CreateSessionInput {
  user_id?: string;
}

export async function createServerSession(input: CreateServerSessionOptions): Promise<Session | null> {
  if (!hasConfiguredSupabasePublicEnv()) {
    console.warn("[session] createServerSession skipped: Supabase not configured.");
    return null;
  }

  // Safety guard: don't create stored sessions for empty agent launches.
  // A session should only persist after meaningful user input.
  if (!input.agent_id && !input.title) {
    console.warn("[session] createServerSession skipped: no agent_id or title — refusing to create empty session.");
    return null;
  }

  try {
    let userId = input.user_id;
    let sb;

    if (isClerkConfigured()) {
      const mapping = await resolveClerkSupabaseMapping();
      if (mapping.state === "mapped" && mapping.supabaseUserId) {
        userId = userId ?? mapping.supabaseUserId;
      }
    }

    if (userId) {
      sb = createBridgedClient(userId);
    } else {
      sb = await createClient();
      const { data: { user } } = await sb.auth.getUser();
      userId = user?.id;
    }

    if (!userId) {
      console.warn("[session] createServerSession skipped: no authenticated user found.");
      return null;
    }

    const { data, error } = await sb
      .from("sessions")
      .insert({
        user_id: userId,
        agent_id: input.agent_id ?? null,
        title: input.title ?? null,
        workspace_archetype: input.workspace_archetype ?? "generic_chat",
        model_route: input.model_route ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[session] createServerSession error:", error.message);
      return null;
    }
    return data as Session;
  } catch (err) {
    console.error("[session] createServerSession transport error:", err);
    return null;
  }
}

export async function getServerSessionMessages(sessionId: string): Promise<Message[]> {
  if (!hasConfiguredSupabasePublicEnv()) {
    console.warn("[session] getServerSessionMessages skipped: Supabase not configured.");
    return [];
  }
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("messages")
      .select("*")
      .eq("session_id", sessionId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      console.error("[session] getServerSessionMessages error:", error.message);
      return [];
    }
    return (data ?? []) as Message[];
  } catch (err) {
    console.error("[session] getServerSessionMessages transport error:", err);
    return [];
  }
}

export async function insertServerMessages(
  messages: Array<{
    session_id: string;
    role: Message["role"];
    content: string;
    metadata?: Record<string, unknown>;
  }>,
  userId?: string,
): Promise<boolean> {
  if (messages.length === 0) return true;
  if (!hasConfiguredSupabasePublicEnv()) {
    console.warn("[session] insertServerMessages skipped: Supabase not configured.");
    return false;
  }
  try {
    let sb;
    if (userId && isClerkConfigured()) {
      sb = createBridgedClient(userId);
    } else {
      sb = await createClient();
    }
    const { error } = await sb.from("messages").insert(
      messages.map((m) => ({
        session_id: m.session_id,
        role: m.role,
        content: m.content,
        metadata: m.metadata ?? null,
      }))
    );
    if (error) {
      console.error("[session] insertServerMessages error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[session] insertServerMessages transport error:", err);
    return false;
  }
}

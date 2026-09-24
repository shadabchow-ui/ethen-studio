"use server";

import { insertUsageEvent } from "../../../usage/src/server";
import { hasSupabaseEnv } from "@ethen/config/runtime-flags";
import { createClient } from "@ethen/database/server";

export async function recordSessionResumed(params: {
  sessionId: string;
  agentId?: string | null;
}): Promise<void> {
  if (!hasSupabaseEnv()) return;

  let sb;
  try {
    sb = await createClient();
  } catch {
    return;
  }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  void insertUsageEvent({
    user_id: user.id,
    session_id: params.sessionId,
    agent_id: params.agentId ?? null,
    event_type: "session_resumed",
  });
}

export async function recordWorkflowRerun(params: {
  sessionId?: string | null;
  agentId?: string | null;
  prefill?: string | null;
}): Promise<void> {
  if (!hasSupabaseEnv()) return;

  let sb;
  try {
    sb = await createClient();
  } catch {
    return;
  }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  void insertUsageEvent({
    user_id: user.id,
    session_id: params.sessionId ?? null,
    agent_id: params.agentId ?? null,
    event_type: "workflow_rerun",
    metadata: params.prefill
      ? { has_prefill: true, prefill_length: params.prefill.length }
      : null,
  });
}

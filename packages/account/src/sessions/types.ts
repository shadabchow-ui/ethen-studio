import type { WorkspaceArchetype } from "@ethen/contracts/agents/types";

export interface Session {
  id: string;
  user_id: string;
  agent_id: string | null;
  title: string | null;
  workspace_archetype: WorkspaceArchetype | null;
  model_route: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  metadata: Record<string, unknown> | null;
  token_count: number | null;
  created_at: string;
}

export type CreateSessionInput = {
  agent_id?: string;
  title?: string;
  workspace_archetype?: WorkspaceArchetype;
  model_route?: string;
};

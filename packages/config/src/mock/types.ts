import type { Agent, WorkspaceArchetype } from "@ethen/contracts/agents/types";
import type { Artifact } from "@ethen/contracts/artifacts/types";

export interface MockMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface MockSessionRecord {
  id: string;
  agent_id: Agent["id"];
  agent_slug: Agent["slug"];
  agent_name: Agent["name"];
  agent_icon: Agent["icon"];
  workspace_archetype: WorkspaceArchetype;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
  artifact_count: number;
  message_count: number;
  credits_spent: number;
  messages: MockMessage[];
  artifacts: Artifact[];
}

export interface MockCreditWallet {
  balance: number;
  spent: number;
  initial_balance: number;
  updated_at: string;
}

export interface MockProjectRecord {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  session_ids: string[];
  artifact_ids: string[];
}

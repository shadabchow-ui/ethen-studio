export type { AgentPermissionMode, ToolPermissionDecision, CodingToolRiskTier, CodingToolId, CodingToolDefinition } from "../tools/types";

export type AgentSidebarItem = {
  id: string;
  label: string;
  href?: string;
  action?: string;
  disabled?: boolean;
  badge?: string;
  value?: string;
  /** Accessible description shown as tooltip when disabled or unavailable. */
  description?: string;
};

export type AgentSidebarSection = {
  id: string;
  label: string;
  icon?: string;
  items: AgentSidebarItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** When true the section is omitted from sidebar rendering. */
  hidden?: boolean;
};

export type WorkspaceArchetype =
  | "document"
  | "gallery"
  | "research"
  | "table_plan"
  | "generic_chat";

export type AgentStatus = "active" | "beta" | "coming_soon" | "hidden" | "deprecated";
export type AgentVisibility = "public" | "private";

/** Runtime truth state — reflects actual backend availability, not rollout status. */
export type AgentTrustState = "live" | "preview" | "beta" | "mock" | "fixture" | "setup-required" | "manual-review" | "degraded" | "planned" | "disabled" | "unavailable";

/** Canonical output artifact type an agent produces. Mirrors artifacts.type in the DB. */
export type AgentOutputType =
  | "document"
  | "table"
  | "brief"
  | "code"
  | "plan"
  | "comparison"
  | "image"
  | "chat"
  | "video"
  | "audio"
  | "asset"
  | "media_project";

/** A structured reusable workflow template attached to an agent. */
export interface AgentTemplate {
  title: string;
  description: string;
  /** The prompt or input seed to prefill when launching from this template. */
  prompt: string;
  /** Optional output type hint shown before launch. */
  outputType?: AgentOutputType;
  /** Optional note shown when the template requires setup or external access. */
  setupNote?: string;
}

/** Product-surface metadata — stored in product_meta JSONB on the agents table. */
export interface AgentProductMeta {
  /** "What task it completes" — one sentence shown on the detail page. */
  job_one_liner?: string;
  /** Who the agent is for (e.g. ["Founders", "Marketers"]). */
  user_segments?: string[];
  /** Primary artifact type this agent produces. */
  output_type?: AgentOutputType;
  /** Short example output snippets shown on the detail page. */
  example_outputs?: string[];
  /** Reusable starting-point templates. May be string[] (legacy) or AgentTemplate[]. */
  templates?: AgentTemplate[];
  /** Plain-English limitations ("what it can't do yet"). */
  limitations?: string[];
  /** Slugs of related agents for cross-agent discovery. */
  related_agents?: string[];
  /** Tool registry IDs this agent may invoke. */
  tool_ids?: string[];
}

export interface Agent {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  long_description: string;
  icon: string;
  workspace_archetype: WorkspaceArchetype;
  status: AgentStatus;
  visibility: AgentVisibility;
  is_featured: boolean;
  sort_order: number;
  credit_cost: number;
  example_prompts: string[];
  route_id: string;
  capabilities?: string[];
  provider_label?: string;
  runtime_trust_state?: AgentTrustState;
  // Product-surface metadata (optional for backward compat with seed-only agents)
  job_one_liner?: string;
  user_segments?: string[];
  output_type?: AgentOutputType;
  example_outputs?: string[];
  templates?: AgentTemplate[];
  limitations?: string[];
  related_agents?: string[];
  tool_ids?: string[];
}

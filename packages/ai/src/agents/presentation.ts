import { AGENT_CATEGORIES } from "./categories";
import type { Agent, AgentStatus, AgentTrustState, WorkspaceArchetype } from "@ethen/contracts/agents/types";

export interface AgentStatusMeta {
  label: string;
  tone: "neutral" | "accent" | "warning";
}

const STATUS_META: Record<AgentStatus, AgentStatusMeta> = {
  active: { label: "Active", tone: "neutral" },
  beta: { label: "Beta", tone: "accent" },
  coming_soon: { label: "Coming Soon", tone: "warning" },
  hidden: { label: "Hidden", tone: "neutral" },
  deprecated: { label: "Deprecated", tone: "warning" },
};

const WORKSPACE_LABELS: Record<WorkspaceArchetype, string> = {
  document: "Document Workspace",
  gallery: "Gallery Workspace",
  research: "Research Workspace",
  table_plan: "Planning Workspace",
  generic_chat: "Chat Workspace",
};

function humanizeCategory(id: string): string {
  return id
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatCategoryLabel(category: string): string {
  return AGENT_CATEGORIES.find((item) => item.id === category)?.label ?? humanizeCategory(category);
}

export function formatWorkspaceLabel(workspace: WorkspaceArchetype): string {
  return WORKSPACE_LABELS[workspace];
}

export function getAgentStatusMeta(status: AgentStatus): AgentStatusMeta {
  return STATUS_META[status];
}

export interface TrustStateMeta {
  label: string;
  tone: "neutral" | "accent" | "warning" | "danger" | "disabled";
  hint: string;
}

const TRUST_STATE_META: Record<AgentTrustState, TrustStateMeta> = {
  live:                  { label: "Live",           tone: "accent",   hint: "Fully operational with live provider connections." },
  preview:               { label: "Preview",        tone: "neutral",  hint: "Workspace available, but some behavior depends on preview data or scoped integrations." },
  beta:                  { label: "Beta",           tone: "warning",  hint: "Feature-complete but still in active development — behavior may change." },
  mock:                  { label: "Mock",           tone: "disabled", hint: "Demo mode — responses are simulated, no live backend." },
  fixture:               { label: "Fixture",        tone: "disabled", hint: "Uses bundled sample data — not connected to a live provider." },
  "setup-required":      { label: "Setup Required", tone: "warning",  hint: "Provider or environment configuration needed for live use." },
  "manual-review":       { label: "Manual Review",  tone: "warning",  hint: "Workspace is functional but outputs should be verified before use." },
  degraded:              { label: "Degraded",       tone: "warning",  hint: "Workspace can chat, but one or more tools or APIs are not configured." },
  planned:               { label: "Planned",        tone: "disabled", hint: "Not yet implemented for launch." },
  disabled:              { label: "Disabled",       tone: "danger",   hint: "Temporarily disabled. May return in a future update." },
  unavailable:           { label: "Unavailable",    tone: "danger",   hint: "Provider configured but runtime adapter not yet implemented." },
};

export function getTrustStateMeta(state: AgentTrustState): TrustStateMeta {
  return TRUST_STATE_META[state] ?? TRUST_STATE_META.preview;
}

export function isLaunchable(state: AgentTrustState): boolean {
  return state === "live" || state === "preview" || state === "beta" || state === "mock" || state === "fixture" || state === "degraded" || state === "manual-review";
}

export function isBlocked(state: AgentTrustState): boolean {
  return state === "setup-required" || state === "planned" || state === "disabled" || state === "unavailable";
}

const WORKSPACE_OUTPUTS: Record<WorkspaceArchetype, string[]> = {
  document: ["Polished drafts", "Structured documents", "Edited copy", "Formatted reports"],
  research: ["Research summaries", "Comparative analysis", "Key findings", "Source digests"],
  gallery: ["Visual concepts", "Image briefs", "Creative directions", "Mood boards"],
  table_plan: ["Project plans", "Comparison tables", "Rollout timelines", "Structured frameworks"],
  generic_chat: ["Refined ideas", "Written outputs", "Recommendations", "Structured responses"],
};

export function getWorkspaceOutputs(agent: Agent): string[] {
  return WORKSPACE_OUTPUTS[agent.workspace_archetype] ?? [];
}

export function getAgentCapabilities(agent: Agent): string[] {
  if (agent.capabilities?.length) return agent.capabilities;

  const promptCapabilities = agent.example_prompts
    .slice(0, 3)
    .map((prompt) => prompt.replace(/[.?!]\s*$/, ""));

  return [
    `Focused ${formatCategoryLabel(agent.category).toLowerCase()} support for day-to-day work.`,
    `Runs in the ${formatWorkspaceLabel(agent.workspace_archetype).toLowerCase()} for a guided workflow.`,
    ...promptCapabilities,
  ].slice(0, 4);
}

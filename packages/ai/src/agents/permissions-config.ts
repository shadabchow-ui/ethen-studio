import type { AgentPermissionMode, CodingToolId, ToolPermissionDecision } from "@ethen/contracts/tools/types";

// Default permission mode for the code-helper agent.
// v1: read_only — all mutating tiers (write, shell, git) are denied unless
// the user explicitly upgrades to safe_edit or full_access.
export const CODE_HELPER_DEFAULT_MODE: AgentPermissionMode = "read_only";

// Per-mode decision matrix for each risk tier.
// Tiers not listed in a mode default to "deny".
type TierKey = "read" | "propose" | "write" | "shell" | "git";

export const MODE_TIER_DECISIONS: Record<AgentPermissionMode, Partial<Record<TierKey, ToolPermissionDecision>>> = {
  plan_only: {
    read: "allow",
    propose: "allow",
  },
  read_only: {
    read: "allow",
  },
  safe_edit: {
    read: "allow",
    propose: "allow",
    write: "ask",
  },
  full_access: {
    read: "allow",
    propose: "allow",
    write: "allow",
    shell: "ask",
    git: "ask",
  },
};

// Explicit per-tool overrides for code-helper (agent-level defaults).
// Only used when a tool needs a different decision than its tier default.
export const CODE_HELPER_TOOL_OVERRIDES: Partial<Record<CodingToolId, ToolPermissionDecision>> = {};

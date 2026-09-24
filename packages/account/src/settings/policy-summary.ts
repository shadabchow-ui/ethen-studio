// Enterprise/team policy summary helpers.
// Displays truthful status — never implies enforcement where it doesn't exist.

import type { AgentTrustState } from "@ethen/contracts/agents/types";
import { AGENT_TRUST_STATES } from "@ethen/contracts/agents/trust-states";
import { isMockMode } from "@ethen/config/runtime-flags";

// ═══════════════════════════════════════════════════════════════════════════
// Provider allowlist status
// ═══════════════════════════════════════════════════════════════════════════

export type ProviderAllowlistStatus =
  | "configured"
  | "available_not_configured"
  | "setup_required"
  | "unavailable"
  | "not_implemented";

export interface ProviderStatusEntry {
  providerId: string;
  label: string;
  status: ProviderAllowlistStatus;
  detail: string;
}

const PROVIDER_ENTRIES: ProviderStatusEntry[] = [
  {
    providerId: "openai",
    label: "OpenAI",
    status: isMockMode ? "unavailable" : "available_not_configured",
    detail: isMockMode
      ? "Mock mode — no real API calls are made."
      : "API key required. GPT-4o, GPT-4o-mini, o3, o4-mini.",
  },
  {
    providerId: "anthropic",
    label: "Anthropic",
    status: isMockMode ? "unavailable" : "available_not_configured",
    detail: isMockMode
      ? "Mock mode — no real API calls are made."
      : "API key required. Claude Opus, Sonnet, Haiku.",
  },
  {
    providerId: "deepseek",
    label: "DeepSeek",
    status: isMockMode ? "unavailable" : "available_not_configured",
    detail: isMockMode
      ? "Mock mode — no real API calls are made."
      : "Connected via OpenAI-compatible endpoint.",
  },
  {
    providerId: "openai-compatible",
    label: "OpenAI-compatible",
    status: isMockMode ? "unavailable" : "available_not_configured",
    detail: "Connect any OpenAI-compatible endpoint.",
  },
  {
    providerId: "local",
    label: "Local (Ollama / vLLM)",
    status: "not_implemented",
    detail: "Local model routing is not yet implemented.",
  },
];

export function getProviderAllowlistSummary(): {
  providers: ProviderStatusEntry[];
  anyConfigured: boolean;
  envConfigured: boolean;
} {
  return {
    providers: PROVIDER_ENTRIES,
    anyConfigured: PROVIDER_ENTRIES.some((p) => p.status === "configured"),
    envConfigured: !isMockMode,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Approval policy summary
// ═══════════════════════════════════════════════════════════════════════════

export type ApprovalPolicyLevel =
  | "auto_approve"
  | "confirm_once"
  | "confirm_every_time"
  | "require_approval"
  | "blocked"
  | "not_configured";

export interface ApprovalPolicyEntry {
  riskLevel: string;
  label: string;
  policy: ApprovalPolicyLevel;
  detail: string;
}

const APPROVAL_POLICY: ApprovalPolicyEntry[] = [
  {
    riskLevel: "read_only",
    label: "Read-only tools",
    policy: "auto_approve",
    detail: "Read-only operations auto-approve by default. Customization requires a live backend.",
  },
  {
    riskLevel: "writes_user_content",
    label: "Data-modifying tools",
    policy: "confirm_once",
    detail: "Data modification requires one-time confirmation per session. Customization requires a live backend.",
  },
  {
    riskLevel: "external_side_effect",
    label: "External service tools",
    policy: "confirm_every_time",
    detail: "External service calls require confirmation on every invocation. Customization requires a live backend.",
  },
  {
    riskLevel: "destructive",
    label: "Destructive operations",
    policy: "confirm_every_time",
    detail: "Delete and irreversible operations require confirmation each time. Always enforced client-side.",
  },
  {
    riskLevel: "privileged",
    label: "Privileged operations",
    policy: "blocked",
    detail: "Elevated-trust operations are blocked by default. Admin-level override requires a live backend.",
  },
];

export function getApprovalPolicySummary(): {
  policies: ApprovalPolicyEntry[];
  isDefault: boolean;
} {
  return {
    policies: APPROVAL_POLICY,
    isDefault: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Team / organization readiness
// ═══════════════════════════════════════════════════════════════════════════

export type TeamFeatureStatus =
  | "available"
  | "planned"
  | "not_implemented"
  | "requires_setup";

export interface TeamFeatureEntry {
  id: string;
  label: string;
  status: TeamFeatureStatus;
  detail: string;
}

const TEAM_FEATURES: TeamFeatureEntry[] = [
  {
    id: "member_roles",
    label: "Member roles (user / admin)",
    status: "requires_setup",
    detail:
      "Role support is defined in the profiles schema but requires a configured Supabase backend with auth enabled.",
  },
  {
    id: "team_invites",
    label: "Team invites",
    status: "not_implemented",
    detail: "Team invite flows, email verification, and member management are not yet implemented.",
  },
  {
    id: "provider_allowlist",
    label: "Provider allowlist",
    status: "not_implemented",
    detail:
      "Admin-level provider restriction (allow/deny per workspace or team) is not yet implemented. All configured providers are available to all users.",
  },
  {
    id: "approval_policy_admin",
    label: "Admin approval policy override",
    status: "not_implemented",
    detail:
      "Admin-level override of per-risk-level approval policy is not yet implemented. Default policies apply globally.",
  },
  {
    id: "sso",
    label: "SSO / SAML authentication",
    status: "not_implemented",
    detail: "Single sign-on via SAML, OIDC, or SCIM is not yet implemented.",
  },
  {
    id: "audit_log_admin",
    label: "Admin audit log",
    status: "requires_setup",
    detail:
      "Audit event recording is implemented (lib/audit) but requires a configured Supabase backend for durable storage.",
  },
  {
    id: "usage_analytics_team",
    label: "Team usage analytics",
    status: "not_implemented",
    detail: "Per-team usage aggregation and analytics dashboard is not yet implemented.",
  },
  {
    id: "billing_enterprise",
    label: "Enterprise billing",
    status: "not_implemented",
    detail: "Enterprise billing plans, invoicing, and volume pricing are not yet implemented.",
  },
  {
    id: "data_retention",
    label: "Data retention policies",
    status: "not_implemented",
    detail: "Configurable data retention and deletion policies are not yet implemented.",
  },
  {
    id: "compliance_exports",
    label: "Compliance exports",
    status: "not_implemented",
    detail: "GDPR, SOC 2, and compliance data export workflows are not yet implemented.",
  },
];

export function getTeamReadinessSummary(): {
  features: TeamFeatureEntry[];
  availableCount: number;
  requiresSetupCount: number;
  notImplementedCount: number;
  overallStatus: "production_ready" | "partial" | "development_only";
} {
  const available = TEAM_FEATURES.filter((f) => f.status === "available").length;
  const setup = TEAM_FEATURES.filter((f) => f.status === "requires_setup").length;
  const notImpl = TEAM_FEATURES.filter((f) => f.status === "not_implemented").length;

  return {
    features: TEAM_FEATURES,
    availableCount: available,
    requiresSetupCount: setup,
    notImplementedCount: notImpl,
    overallStatus: available > 0 ? "partial" : "development_only",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent trust state summary
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentTrustSummary {
  slug: string;
  trustState: AgentTrustState;
  count: number;
}

export function getAgentTrustSummary(): {
  summaries: AgentTrustSummary[];
  liveCount: number;
  previewCount: number;
  betaCount: number;
  mockCount: number;
  fixtureCount: number;
  setupRequiredCount: number;
  manualReviewCount: number;
  degradedCount: number;
  plannedCount: number;
  disabledCount: number;
  unavailableCount: number;
} {
  const groups: Map<AgentTrustState, string[]> = new Map();

  for (const [slug, state] of Object.entries(AGENT_TRUST_STATES)) {
    if (!groups.has(state)) groups.set(state, []);
    groups.get(state)!.push(slug);
  }

  const summaries: AgentTrustSummary[] = [];
  for (const [state, slugs] of groups) {
    summaries.push({ slug: `${state} (${slugs.length})`, trustState: state, count: slugs.length });
  }

  return {
    summaries: summaries.sort((a, b) => b.count - a.count),
    liveCount: groups.get("live")?.length ?? 0,
    previewCount: groups.get("preview")?.length ?? 0,
    betaCount: groups.get("beta")?.length ?? 0,
    mockCount: groups.get("mock")?.length ?? 0,
    fixtureCount: groups.get("fixture")?.length ?? 0,
    setupRequiredCount: groups.get("setup-required")?.length ?? 0,
    manualReviewCount: groups.get("manual-review")?.length ?? 0,
    degradedCount: groups.get("degraded")?.length ?? 0,
    plannedCount: groups.get("planned")?.length ?? 0,
    disabledCount: groups.get("disabled")?.length ?? 0,
    unavailableCount: groups.get("unavailable")?.length ?? 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Current user role
// ═══════════════════════════════════════════════════════════════════════════

export type UserRoleInfo =
  | { kind: "authenticated"; role: "user" | "admin"; email: string; id: string }
  | { kind: "mock"; role: "user" | "admin" }
  | { kind: "unauthenticated" };

export function getCurrentUserRole(): UserRoleInfo {
  if (isMockMode) {
    return { kind: "mock", role: "user" };
  }

  // In non-mock mode the actual role requires a DB call at runtime.
  // This function provides a truthful static default.
  return { kind: "unauthenticated" };
}

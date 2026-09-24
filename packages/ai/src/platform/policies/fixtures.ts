// lib/platform/policies/fixtures.ts
//
// Sample policy profiles, rules, and decisions. These fixtures are clearly
// labelled Sample so the platform policy UI can render honest content
// without claiming a fully enforced governance suite. Enforcement posture
// is scaffolded by default.

import { composeRule, buildSampleDecision } from "./decision";
import type {
  PolicyDecisionRecord,
  PolicyProfile,
  PolicyRule,
} from "@ethen/security/policies/types";

const BASE_ISO = "2026-07-01T12:00:00.000Z";

const platformRules: PolicyRule[] = [
  composeRule({
    id: "rule_provider_allow",
    kind: "provider_allow",
    description: "Only allow configured AI gateway providers.",
    enforcement: "scaffolded",
    enforcementNote:
      "Provider allowlist is enforced at the gateway route layer today; explicit policy enforcement is scaffolded.",
    config: { allowed: ["openai", "anthropic", "google", "vercel"] },
  }),
  composeRule({
    id: "rule_provider_block",
    kind: "provider_block",
    description: "Block unapproved or unverified providers.",
    enforcement: "scaffolded",
    enforcementNote:
      "Block is enforced at the gateway route layer; policy decisions are scaffolded until a runtime interceptor is wired.",
    config: { blocked: ["unknown_provider"] },
  }),
  composeRule({
    id: "rule_block_expensive_models",
    kind: "block_expensive_models",
    description: "Block expensive model tiers unless explicitly approved.",
    enforcement: "scaffolded",
    enforcementNote:
      "Model-tier gating is scaffolded; cost controls are visible but not enforced at request time.",
    config: { blockedTiers: ["flagship", "long_context_premium"] },
  }),
  composeRule({
    id: "rule_approval_before_code_execution",
    kind: "approval_before_code_execution",
    description: "Require approval before code execution tools run.",
    enforcement: "scaffolded",
    enforcementNote:
      "Approval proposals are issued by lib/approvals; live interception of shell.run is scaffolded.",
    config: { tools: ["shell.run", "code.execute"] },
  }),
  composeRule({
    id: "rule_approval_before_file_writes",
    kind: "approval_before_file_writes",
    description: "Require approval before file write tools run.",
    enforcement: "scaffolded",
    enforcementNote:
      "File writes route through approval proposals today; deployment-time enforcement is scaffolded.",
    config: { tools: ["file.apply_patch", "file.write"] },
  }),
  composeRule({
    id: "rule_approval_before_deploy",
    kind: "approval_before_deploy",
    description: "Require approval before deploy/hosting actions.",
    enforcement: "scaffolded",
    enforcementNote:
      "No deploy surface is live today; rule is declared and advisory until the deploy lane exists.",
    config: { tools: ["deploy.create", "hosting.promote"] },
  }),
  composeRule({
    id: "rule_pii_redaction",
    kind: "pii_redaction",
    description: "Redact PII from logs, traces, and audit events.",
    enforcement: "scaffolded",
    enforcementNote:
      "Audit logging redacts known secret keys; broad PII redaction is scaffolded and partial.",
    config: { redactPatterns: ["email", "phone", "ssn", "api_key"] },
  }),
  composeRule({
    id: "rule_tool_allowlist",
    kind: "tool_allowlist",
    description: "Only allow tools in the registered tool registry.",
    enforcement: "scaffolded",
    enforcementNote:
      "Tool registry is enforced at execution time for read-only paths; allowlist enforcement is scaffolded for write paths.",
    config: { registry: "lib/tools" },
  }),
  composeRule({
    id: "rule_sandbox_command_approval",
    kind: "sandbox_command_approval",
    description: "Require approval for sandbox shell commands.",
    enforcement: "scaffolded",
    enforcementNote:
      "Sandbox provider is not durable yet; approval flow exists, runtime interception is scaffolded.",
    config: { sandboxKinds: ["e2b", "local"] },
  }),
];

export const POLICY_PROFILE_FIXTURES: PolicyProfile[] = [
  {
    id: "policy_default_safe",
    name: "Default — Safe Read",
    description:
      "Baseline policy for read-heavy agent work. Write/deploy/external actions require approval; PII redaction is scaffolded.",
    projectId: null,
    posture: "needs_configuration",
    rules: platformRules,
    sample: true,
    surfaceStatus: "preview",
    createdAt: BASE_ISO,
    updatedAt: BASE_ISO,
  },
  {
    id: "policy_atlas_strict",
    name: "Atlas — Strict",
    description:
      "Project-tight profile for the Atlas workspace. External sends and deploys are blocked; approvals enforced for writes.",
    projectId: "proj_atlas",
    posture: "approval_required",
    rules: platformRules.map((rule) =>
      rule.id === "rule_approval_before_deploy"
        ? { ...rule, enforcement: "blocked", enforcementNote: "Deploys are blocked by policy until a durable deploy lane exists." }
        : rule,
    ),
    sample: true,
    surfaceStatus: "private-alpha",
    createdAt: BASE_ISO,
    updatedAt: BASE_ISO,
  },
  {
    id: "policy_sandbox_preview",
    name: "Sandbox — Preview",
    description:
      "Sandbox-focused profile covering shell approval and tool allowlist. Enforced state is scaffolded.",
    projectId: null,
    posture: "needs_configuration",
    rules: platformRules.filter((r) =>
      ["rule_sandbox_command_approval", "rule_tool_allowlist", "rule_pii_redaction"].includes(r.id),
    ),
    sample: true,
    surfaceStatus: "placeholder",
    createdAt: BASE_ISO,
    updatedAt: BASE_ISO,
  },
];

export const POLICY_DECISION_FIXTURES: PolicyDecisionRecord[] = [
  buildSampleDecision({
    id: "pdec_approval_before_write",
    profileId: "policy_default_safe",
    profileName: "Default — Safe Read",
    targetKind: "workflow_step",
    targetId: "step_sheets_append",
    targetLabel: "Append row to Google Sheets",
    parameters: { toolId: "google_sheets.append_row", spreadsheetId: "[REDACTED]" },
    decision: "approval_required",
    reason: "Write tool requires approval under default safe profile.",
    traceId: "trace_stripe_001",
    createdAt: BASE_ISO,
  }),
  buildSampleDecision({
    id: "pdec_external_send_blocked",
    profileId: "policy_atlas_strict",
    profileName: "Atlas — Strict",
    targetKind: "tool_call",
    targetId: "step_slack_send",
    targetLabel: "Post alert to Slack (#deploys)",
    parameters: { channelId: "[REDACTED]", text: "deployment alert" },
    decision: "blocked",
    reason: "External sends blocked by profile until durable execution route exists.",
    traceId: "trace_slack_099",
    createdAt: BASE_ISO,
  }),
  buildSampleDecision({
    id: "pdec_pii_redacted",
    profileId: "policy_default_safe",
    profileName: "Default — Safe Read",
    targetKind: "approval",
    targetId: "apr_stripe_webhook",
    targetLabel: "Capture Stripe payment.succeeded",
    parameters: { customerEmail: "[REDACTED]", amount: 4200 },
    decision: "redacted",
    reason: "PII redaction scaffolded for audit/trace metadata.",
    traceId: "trace_stripe_001",
    createdAt: BASE_ISO,
  }),
];

export function listPolicyProfiles(): PolicyProfile[] {
  return [...POLICY_PROFILE_FIXTURES];
}

export function listPolicyProfilesForProject(
  projectId: string,
): PolicyProfile[] {
  return POLICY_PROFILE_FIXTURES.filter(
    (profile) => profile.projectId === projectId,
  );
}

export function getPolicyProfile(profileId: string): PolicyProfile | null {
  return POLICY_PROFILE_FIXTURES.find((profile) => profile.id === profileId) ?? null;
}

export function listPolicyDecisions(): PolicyDecisionRecord[] {
  return [...POLICY_DECISION_FIXTURES];
}

export function listPolicyDecisionsForTrace(
  traceId: string,
): PolicyDecisionRecord[] {
  return POLICY_DECISION_FIXTURES.filter((record) => record.traceId === traceId);
}
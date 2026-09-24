// Permission mode for an agent session — ordered from most to least restrictive.
export type AgentPermissionMode =
  | "plan_only"
  | "read_only"
  | "safe_edit"
  | "full_access";

// Decision applied to a single tool invocation.
export type ToolPermissionDecision = "allow" | "ask" | "deny";

// Risk tier for a coding tool — ordered from safest to most dangerous.
export type CodingToolRiskTier = "read" | "propose" | "write" | "shell" | "git";

// Stable identifiers for every coding tool.
export type CodingToolId =
  | "repo.get_metadata"
  | "repo.list_tree"
  | "repo.read_file"
  | "repo.search_files"
  | "git.status"
  | "git.diff"
  | "file.propose_patch"
  | "file.apply_patch"
  | "shell.run";

export interface CodingToolDefinition {
  id: CodingToolId;
  label: string;
  description: string;
  riskTier: CodingToolRiskTier;
  defaultDecision: ToolPermissionDecision;
  readOnly: boolean;
  enabled: boolean;
}

// ── General tool registry types ───────────────────────────────────────────────

export type ToolCategory =
  | "local_repo"
  | "research"
  | "artifact"
  | "writing"
  | "finance"
  | "real_estate"
  | "job_search"
  | "travel"
  | "product_scraper"
  | "automation"
  | "business_ops"
  | "google_workspace"
  | "microsoft365"
  | "media"
  | "image_generation"
  | "video_generation"
  | "audio_generation"
  | "asset_management"
  | "media_projects"
  | "gpu_compute";

/** Risk classification shared across all tool categories. */
export type ToolRiskLevel =
  | "read_only"            // never mutates state
  | "write"                // creates or updates data (legacy alias)
  | "writes_user_content"  // creates or updates user-owned data
  | "external_side_effect" // calls external services with side effects
  | "destructive"          // deletes or irreversibly overwrites data
  | "privileged";          // requires elevated trust (admin/system-level)

// Approval gate requirement derived from a tool's risk level.
// Default-safe: unknown risk level resolves to "blocked".
export type ApprovalRequirement =
  | "no_approval"          // safe to run silently
  | "confirm_once"         // ask once per session, cache decision
  | "confirm_every_time"   // ask on every invocation regardless of cache
  | "blocked";             // never allowed; execution is prevented

// Approval state for a single tool invocation — storable in metadata jsonb.
export interface ToolApprovalState {
  riskLevel: ToolRiskLevel;
  approvalRequirement: ApprovalRequirement;
  /** undefined = decision pending; true = approved; false = denied */
  approved?: boolean;
  decidedAt?: string; // ISO timestamp
  /** Reference to the approval proposal when approval is required. */
  proposalId?: string | null;
}

/** Execution readiness — only "available" tools may be invoked. */
export type ToolExecutionState =
  | "available"        // backed by a live or mock route; can be called
  | "contract_only"    // types/contracts defined; execution not yet wired
  | "planned";         // not yet defined; reserved for future phases

/** Stable dot-namespaced tool identifier. */
export type ToolId =
  | CodingToolId
  | "file.propose_patch"
  | "research.search"
  | "research.answer"
  | "research.contents"
  | "research.agent"
  | "artifact.read"
  | "artifact.create"
  | "writing.check"
  | "writing.rewrite"
  | "writing.integrity"
  | "finance.overview"
  | "finance.search"
  | "finance.ticker"
  | "finance.status"
  | "real-estate.search"
  | "real-estate.listing"
  | "job-search.status"
  | "job-search.search"
  | "job-search.detail"
  | "job-search.company"
  | "job-search.salary"
  | "job-search.match"
  | "job-search.tracker"
  | "travel.status"
  | "travel.search_stays"
  | "travel.stay_detail"
  | "travel.search_destinations"
  | "travel.save_option"
  | "travel.compare_options"
  | "travel.create_trip"
  | "travel.export_trip"
  | "travel.build_itinerary"
  | "product-scraper.status"
  | "product-scraper.scrape"
  | "product-scraper.amazon_pdp"
  | "product-scraper.amazon_search"
  | "automation.zapier_trigger"
  | "automation.make_trigger"
  | "automation.n8n_trigger"
  | "automation.webhook_inbound"
  | "automation.webhook_outbound"
  | "automation.custom_connector_validate"
  | "automation.mcp_resource_list"
  | "business-ops.salesforce.search_accounts"
  | "business-ops.salesforce.get_account"
  | "business-ops.salesforce.search_contacts"
  | "business-ops.salesforce.get_contact"
  | "business-ops.salesforce.search_opportunities"
  | "business-ops.salesforce.get_opportunity"
  | "business-ops.salesforce.draft_note"
  | "business-ops.salesforce.create_note"
  | "business-ops.salesforce.update_record"
  | "business-ops.hubspot.search_contacts"
  | "business-ops.hubspot.get_contact"
  | "business-ops.hubspot.search_companies"
  | "business-ops.hubspot.get_company"
  | "business-ops.hubspot.search_deals"
  | "business-ops.hubspot.get_deal"
  | "business-ops.hubspot.draft_note"
  | "business-ops.hubspot.create_note"
  | "business-ops.hubspot.update_record"
  | "business-ops.zendesk.search_tickets"
  | "business-ops.zendesk.get_ticket"
  | "business-ops.zendesk.draft_reply"
  | "business-ops.zendesk.send_reply"
  | "business-ops.zendesk.update_ticket_status"
  | "business-ops.intercom.search_conversations"
  | "business-ops.intercom.get_conversation"
  | "business-ops.intercom.draft_reply"
  | "business-ops.intercom.send_reply"
  | "business-ops.stripe.search_customers"
  | "business-ops.stripe.get_customer"
  | "business-ops.stripe.list_payments"
  | "business-ops.stripe.get_payment"
  | "business-ops.stripe.list_invoices"
  | "business-ops.stripe.get_invoice"
  | "business-ops.stripe.draft_customer_update"
  | "business-ops.shopify.search_orders"
  | "business-ops.shopify.get_order"
  | "business-ops.shopify.search_customers"
  | "business-ops.shopify.get_customer"
  | "business-ops.shopify.search_products"
  | "business-ops.shopify.get_product"
  | "business-ops.shopify.draft_order_update"
  | "business-ops.quickbooks.search_customers"
  | "business-ops.quickbooks.get_customer"
  | "business-ops.quickbooks.list_invoices"
  | "business-ops.quickbooks.get_invoice"
  | "business-ops.quickbooks.draft_invoice_update"
  | "business-ops.quickbooks.create_invoice"
  | "google-workspace.status"
  | "google-workspace.drive_status"
  | "google-workspace.drive_search"
  | "google-workspace.drive_get_file"
  | "google-workspace.drive_read_doc"
  | "google-workspace.drive_draft_write"
  | "google-workspace.gmail_status"
  | "google-workspace.gmail_search"
  | "google-workspace.gmail_get_message"
  | "google-workspace.gmail_draft_reply"
  | "google-workspace.calendar_status"
  | "google-workspace.calendar_list_events"
  | "google-workspace.calendar_get_event"
  | "google-workspace.calendar_draft_event"
  | "google-workspace.docs_status"
  | "google-workspace.docs_read"
  | "google-workspace.docs_draft"
  | "google-workspace.sheets_status"
  | "google-workspace.sheets_get_metadata"
  | "google-workspace.sheets_get_range"
  | "google-workspace.sheets_draft_update"
  | "microsoft365.outlook.search"
  | "microsoft365.outlook.get_message"
  | "microsoft365.outlook.draft_reply"
  | "microsoft365.outlook.send_message"
  | "microsoft365.calendar.list_events"
  | "microsoft365.calendar.get_event"
  | "microsoft365.calendar.draft_event"
  | "microsoft365.calendar.create_event"
  | "microsoft365.calendar.update_event"
  | "microsoft365.onedrive.search_files"
  | "microsoft365.onedrive.get_file"
  | "microsoft365.onedrive.export_document"
  | "microsoft365.sharepoint.search"
  | "microsoft365.sharepoint.list_files"
  | "microsoft365.sharepoint.get_file"
  | "microsoft365.teams.list_teams"
  | "microsoft365.teams.list_channels"
  | "microsoft365.teams.list_messages"
  | "microsoft365.teams.get_message"
  | "microsoft365.teams.draft_message"
  | "microsoft365.teams.send_message"
  | "microsoft365.status"
  | "agent.runtime"
  | "system/agent-launch"
  | "system/credential-vault"
  | "system/policy-enforcement"
  | "voice.consent"
  | "connector.execute"
  | "media.status"
  | "media.generate_image"
  | "media.edit_image"
  | "media.upscale_image"
  | "media.inpaint_image"
  | "media.relight_image"
  | "media.generate_video"
  | "media.image_to_video"
  | "media.edit_video"
  | "media.upscale_video"
  | "media.generate_voiceover"
  | "media.translate_speech"
  | "media.change_voice"
  | "media.create_project"
  | "media.save_asset"
  | "media.list_assets"
  | "media.get_asset"
  | "media.export_asset"
  | "media.train_character"
  | "media.virality_score"
  | "media.generate_sound_effect"
  | "media.generate_music_bed"
  | "media.generate_game_asset"
  | "media.generate_sprite_pack"
  | "media.generate_character_pack"
  | "media.generate_game_ui"
  | "media.product_url_to_ad"
  // ── GPU Compute (Thunder provider) ───────────────────────────────────────
  | "gpu.thunder.connection_status"
  | "gpu.thunder.get_pricing"
  | "gpu.thunder.get_specs"
  | "gpu.thunder.get_availability"
  | "gpu.thunder.list_templates"
  | "gpu.thunder.list_instances"
  | "gpu.thunder.list_snapshots"
  | "gpu.thunder.health_check"
  | "gpu.thunder.create_instance"
  | "gpu.thunder.modify_instance"
  | "gpu.thunder.forward_ports"
  | "gpu.thunder.deploy_workload"
  | "gpu.thunder.create_snapshot"
  | "gpu.thunder.register_gateway_endpoint"
  | "gpu.thunder.delete_snapshot"
  | "gpu.thunder.delete_instance"
  | "gpu.thunder.shell_exec";

/** Full server-side tool definition — never sent to the client as-is. */
export interface ToolDefinition {
  id: ToolId;
  name: string;
  description: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  readOnly: boolean;
  requiresApproval: boolean;
  approvalRequirement: ApprovalRequirement;
  executionState: ToolExecutionState;
  /** Provider identifier this tool relies on (e.g. "exa", "language-tool", "twelve-data"). */
  providerId?: string;
  /** Agent slugs that may call this tool. Empty means unrestricted within the workspace. */
  allowedAgentSlugs: string[];
  /** Workspace archetype slugs where this tool is surfaced. */
  allowedWorkspaceArchetypes: string[];
  /** Human-readable summary of what the tool accepts. */
  inputSummary: string;
  /** Human-readable summary of what the tool returns. */
  outputSummary: string;
}

// ── Autonomous Employee Approval Risk Tiers ─────────────────────────────────
// Numeric risk tiers ordered from safest to most dangerous. Combined with
// employee autonomy levels and policy rules to produce a final policy outcome.

/** Numeric risk tier for autonomous employee actions: 0 (safest) → 5 (forbidden). */
export type ApprovalRiskTier = 0 | 1 | 2 | 3 | 4 | 5;

export const APPROVAL_RISK_TIER_LABELS: Record<ApprovalRiskTier, string> = {
  0: "Informational",
  1: "Read Only",
  2: "Internal Write",
  3: "External Action",
  4: "Sensitive / Destructive",
  5: "Forbidden",
};

export const APPROVAL_RISK_TIER_DESCRIPTIONS: Record<ApprovalRiskTier, string> = {
  0: "Informational action with no side effects. Always safe.",
  1: "Reads approved data only. No mutation.",
  2: "Creates or updates internal data. No external effects.",
  3: "Calls external services with side effects (emails, messages, API writes).",
  4: "Deletes data, processes payments, or modifies sensitive records.",
  5: "Never allowed. Hard-blocked at the policy layer.",
};

/** Map the existing string-based ToolRiskLevel to the numeric ApprovalRiskTier. */
export function toolRiskLevelToRiskTier(level: ToolRiskLevel): ApprovalRiskTier {
  switch (level) {
    case "read_only":
      return 1;
    case "write":
    case "writes_user_content":
      return 2;
    case "external_side_effect":
      return 3;
    case "destructive":
      return 4;
    case "privileged":
      return 5;
  }
}

// ── Policy Outcome ───────────────────────────────────────────────────────
// The final answer from the policy resolver for a single tool/action request.

export type PolicyOutcome =
  | "allow"
  | "approval_required"
  | "block"
  | "setup_required"
  | "over_budget"
  | "not_provided";

export const POLICY_OUTCOME_LABELS: Record<PolicyOutcome, string> = {
  allow: "Allowed",
  approval_required: "Approval Required",
  block: "Blocked",
  setup_required: "Setup Required",
  over_budget: "Over Budget",
  not_provided: "Not Provided",
};

/** Structured result from the fail-closed policy resolver. */
export interface PolicyDecision {
  outcome: PolicyOutcome;
  riskTier: ApprovalRiskTier;
  reason: string;
  /** When outcome is approval_required, the required approval requirement mode. */
  approvalRequirement: ApprovalRequirement;
  /** Whether the action may proceed (allow only). */
  allowed: boolean;
  /** Whether the action must be blocked (block, setup_required, over_budget, not_provided). */
  blocked: boolean;
  /** Whether human approval is required before execution. */
  requiresApproval: boolean;
}

/** Sanitized tool metadata safe to expose to the client. */
export interface ClientToolMeta {
  id: ToolId;
  name: string;
  description: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  readOnly: boolean;
  requiresApproval: boolean;
  approvalRequirement: ApprovalRequirement;
  executionState: ToolExecutionState;
  providerId?: string;
}

// ── Tool availability signal types ───────────────────────────────────────────

export type ToolAvailabilityKind =
  | "available"
  | "setup_required"
  | "approval_required"
  | "blocked"
  | "contract_only"
  | "error";

export interface ToolAvailabilityResult {
  kind: ToolAvailabilityKind;
  toolId: ToolId;
  diagnostics: ToolAvailabilityDiagnostic[];
}

export interface ToolAvailabilityDiagnostic {
  message: string;
  severity: "error" | "warning" | "info";
  actionLabel?: string;
}

export interface ToolAvailabilityInput {
  toolId: ToolId;
  employeeRole?: string;
  autonomyLevel?: number;
  connectedApps?: string[];
  credentials?: string[];
  businessProfileComplete?: boolean;
  budgetWithinLimit?: boolean;
  featureFlags?: string[];
}

export type EmployeeRoleLabel =
  | "customer_support"
  | "sales_operations"
  | "marketing_operations"
  | "research"
  | "operations"
  | "finance_operations"
  | "executive_assistant"
  | "developer_operations"
  | "custom";

export type CommandRiskLevel =
  | "safe_read_only"
  | "validation"
  | "package_install"
  | "git_mutation"
  | "destructive"
  | "network"
  | "secrets_or_cloud"
  | "unknown";

export const COMMAND_RISK_LABELS: Record<CommandRiskLevel, string> = {
  safe_read_only: "Safe read-only",
  validation: "Validation",
  package_install: "Package install",
  git_mutation: "Git mutation",
  destructive: "Destructive",
  network: "Network",
  secrets_or_cloud: "Secrets / cloud",
  unknown: "Unknown risk",
};

export const COMMAND_RISK_COLORS: Record<CommandRiskLevel, string> = {
  safe_read_only: "var(--status-success)",
  validation: "var(--accent-blue)",
  package_install: "var(--status-warning)",
  git_mutation: "var(--status-warning)",
  destructive: "var(--status-danger)",
  network: "var(--status-warning)",
  secrets_or_cloud: "var(--status-danger)",
  unknown: "var(--text-muted)",
};

export type ShellOperatorKind =
  | "and"        // &&
  | "or"         // ||
  | "semicolon"  // ;
  | "pipe"       // |
  | "redirect_out"    // > or >>
  | "redirect_in"     // <
  | "subshell"        // $(...) or `...`
  | "background"      // &

export interface CommandParseResult {
  raw: string;
  baseCommand: string;
  args: string[];
  operators: Array<{ kind: ShellOperatorKind; position: number }>;
  hasEnvAssignment: boolean;
  hasRedirect: boolean;
  hasSubshell: boolean;
  isSafe: boolean;
}

export interface CommandRiskClassification {
  raw: string;
  parseResult: CommandParseResult;
  riskLevel: CommandRiskLevel;
  allowed: boolean;
  approvalRequired: boolean;
  reason: string;
  indicators: string[];
}

// ── Tool error normalization ──────────────────────────────────────────────────

export type ToolErrorKind =
  | "timeout"
  | "provider_unavailable"
  | "setup_required"
  | "rate_limited"
  | "input_validation"
  | "execution_failed"
  | "policy_blocked"
  | "internal_error";

export interface NormalizedToolError {
  kind: ToolErrorKind;
  message: string;
  toolId?: ToolId;
  providerId?: string;
  retryable: boolean;
  recoverySuggestion: string | null;
}

export function normalizeToolError(
  err: unknown,
  toolId?: ToolId,
  providerId?: string,
): NormalizedToolError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("etimedout")) {
    return { kind: "timeout", message: msg, toolId, providerId, retryable: true, recoverySuggestion: "Retry the operation or increase the timeout window." };
  }
  if (lower.includes("setup required") || lower.includes("not configured") || lower.includes("missing api key") || lower.includes("missing env")) {
    return { kind: "setup_required", message: msg, toolId, providerId, retryable: false, recoverySuggestion: "Configure required credentials or environment variables before retrying." };
  }
  if (lower.includes("rate limit") || lower.includes("too many requests") || lower.includes("429")) {
    return { kind: "rate_limited", message: msg, toolId, providerId, retryable: true, recoverySuggestion: "Wait and retry with backoff." };
  }
  if (lower.includes("provider") && (lower.includes("unavailable") || lower.includes("error") || lower.includes("down"))) {
    return { kind: "provider_unavailable", message: msg, toolId, providerId, retryable: true, recoverySuggestion: "The provider may be temporarily unavailable. Retry with backoff." };
  }
  if (lower.includes("validation") || lower.includes("invalid") || lower.includes("required field")) {
    return { kind: "input_validation", message: msg, toolId, providerId, retryable: false, recoverySuggestion: "Check input fields and retry with valid values." };
  }
  if (lower.includes("blocked") || lower.includes("policy") || lower.includes("not allowed") || lower.includes("forbidden")) {
    return { kind: "policy_blocked", message: msg, toolId, providerId, retryable: false, recoverySuggestion: "The action is blocked by policy. Adjust permissions or contact an admin." };
  }
  if (lower.includes("execution") || lower.includes("failed") || lower.includes("error")) {
    return { kind: "execution_failed", message: msg, toolId, providerId, retryable: false, recoverySuggestion: "Check the tool input and provider status." };
  }

  return { kind: "internal_error", message: msg, toolId, providerId, retryable: false, recoverySuggestion: "An unexpected error occurred. Check logs for details." };
}

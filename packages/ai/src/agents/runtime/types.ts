import type { ToolId, ToolRiskLevel } from "@ethen/contracts/tools/types";

/** Lifecycle status of a backend agent run. */
export type AgentRunStatus =
  | "pending"
  | "queued"
  | "planning"
  | "running"
  | "waiting_for_user"
  | "awaiting_approval"
  | "partially_approved"
  | "paused"
  | "recovering"
  | "completed"
  | "failed"
  | "rejected"
  | "canceled"
  | "expired";

/** Terminal run statuses — no further transitions permitted. */
export const TERMINAL_RUN_STATUSES: AgentRunStatus[] = [
  "completed",
  "failed",
  "rejected",
  "canceled",
  "expired",
];

/** Non-terminal statuses where the run can still advance. */
export const ACTIVE_RUN_STATUSES: AgentRunStatus[] = [
  "pending",
  "queued",
  "planning",
  "running",
  "waiting_for_user",
  "awaiting_approval",
  "partially_approved",
  "paused",
  "recovering",
];

export interface RuntimeTransitionContext {
  proposalId?: string | null;
  evidence?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  reason?: string | null;
}

export interface RuntimeTransitionError {
  code:
    | "RUN_NOT_FOUND"
    | "INVALID_TRANSITION"
    | "TERMINAL_RUN"
    | "MISSING_CONTEXT";
  message: string;
  fromStatus: AgentRunStatus | null;
  toStatus: AgentRunStatus | null;
}

export interface RuntimeTransitionLogEntry {
  runId: string;
  fromStatus: AgentRunStatus;
  toStatus: AgentRunStatus;
  occurredAt: string;
  allowed: boolean;
  reason: string | null;
  context: Record<string, unknown> | null;
}

/** How the run was triggered. */
export type RunTriggerType = "manual" | "scheduled" | "webhook" | "event_driven";

/** A single discrete execution of a backend agent workflow. */
export interface AgentRun {
  /** UUID — deterministic or random, but always unique. */
  id: string;
  /** Slug of the registered agent definition. */
  agentSlug: string;
  /** Current lifecycle status. */
  status: AgentRunStatus;
  /** What triggered this run. */
  triggerType: RunTriggerType;
  /** Optional idempotency key for deduplication. */
  idempotencyKey: string | null;
  /** Input payload supplied at run creation. */
  input: Record<string, unknown> | null;
  /** Output payload produced on completion (null until done). */
  output: Record<string, unknown> | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  startedAt: string | null;
  /** ISO 8601 */
  completedAt: string | null;
  /** ISO 8601 */
  updatedAt: string;
  /** Authenticated user or service account that initiated the run. */
  initiatedBy: string | null;
  /** Optional parent run ID for chained/sub-workflows. */
  parentRunId: string | null;
}

/** UI-facing background status shown in the runs dashboard/tree. */
export type BackgroundRunStatus =
  | "queued"
  | "planning"
  | "running"
  | "waiting_for_user"
  | "waiting_for_approval"
  | "paused"
  | "recovering"
  | "blocked"
  | "failed"
  | "completed"
  | "cancelled"
  | "expired";

/** Dashboard grouping used by the in-memory background agents surface. */
export interface BackgroundAgentsDashboard {
  active: AgentRun[];
  waitingApprovals: AgentRun[];
  blocked: AgentRun[];
  completedRecent: AgentRun[];
  failedRecent: AgentRun[];
  backgroundExecutionAvailable: boolean;
}

/** Tree node for parent/child run relationships via parentRunId. */
export interface SubagentTreeNode {
  run: AgentRun;
  children: SubagentTreeNode[];
  depth: number;
}

export function agentRunStatusToBackgroundStatus(status: AgentRunStatus): BackgroundRunStatus {
  switch (status) {
    case "pending":
    case "queued":
      return "queued";
    case "planning":
      return "planning";
    case "running":
      return "running";
    case "waiting_for_user":
      return "waiting_for_user";
    case "awaiting_approval":
    case "partially_approved":
      return "waiting_for_approval";
    case "paused":
      return "paused";
    case "recovering":
      return "recovering";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "rejected":
      return "blocked";
    case "canceled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "queued";
  }
}

/** Status of a single action within a run. */
export type AgentActionStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed"
  | "skipped";

/** A single step/action within an agent run. */
export interface AgentAction {
  /** UUID — unique within scope of the parent run. */
  id: string;
  /** The parent run this action belongs to. */
  runId: string;
  /** Ordinal position within the run workflow. */
  step: number;
  /** Dot-namespaced tool identifier being invoked. */
  toolId: ToolId;
  /** Risk classification from the tool registry. */
  riskLevel: ToolRiskLevel;
  /** Current lifecycle status. */
  status: AgentActionStatus;
  /** Input payload supplied to the action. */
  input: Record<string, unknown> | null;
  /** Output payload produced on completion. */
  output: Record<string, unknown> | null;
  /** Reference to the approval proposal when approval was required. */
  proposalId: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  startedAt: string | null;
  /** ISO 8601 */
  completedAt: string | null;
}

/** Type of evidence recorded during a run. */
export type EvidenceType =
  | "source_data"
  | "screenshot"
  | "report"
  | "log"
  | "diff"
  | "export"
  | "audit_snapshot";

/** Evidence/artifact reference created during an agent run. */
export interface AgentEvidence {
  /** UUID. */
  id: string;
  /** Parent run. */
  runId: string;
  /** Optional action that generated this evidence. */
  actionId: string | null;
  /** Category of evidence. */
  evidenceType: EvidenceType;
  /** Human-readable label. */
  label: string;
  /** URL or storage locator for the evidence content. */
  contentUrl: string | null;
  /** Inline metadata summary (no secrets). */
  metadata: Record<string, unknown> | null;
  /** ISO 8601 */
  createdAt: string;
}

/** Functional specification for a demo-functional agent. */
export interface FunctionalSpec {
  workflowSteps: string[];
  demoDataReferences: string[];
  evidenceItems: string[];
  artifactType: string;
  proposedActions: string[];
  approvalBoundary: string;
  evalCases: number;
  evalCaseDescriptions: string[];
  successMetrics: string[];
  limitations: string[];
}

/** Registry entry for a backend agent — metadata only, not the implementation. */
export interface AgentRegistryEntry {
  /** Stable slug (e.g. "ethen-hr-workflow-agent"). */
  slug: string;
  /** Display name. */
  name: string;
  /** Category (matches existing product-agent category). */
  category: string;
  /** One-sentence description. */
  description: string;
  /** Longer description with scope and constraints. */
  longDescription: string;
  /** Lifecycle status: planned, draft, published, deprecated, removed. */
  lifecycle: "planned" | "draft" | "published" | "deprecated" | "removed";
  /** The source startup/company that inspired this agent. */
  sourceCompany: string;
  /** Build wave this agent belongs to. */
  buildWave: number;
  /** Trigger types supported by this agent. */
  supportedTriggers: RunTriggerType[];
  /** Tool IDs this agent may invoke. */
  allowedToolIds: ToolId[];
  /** Whether this entry has a functional implementation (all false for now). */
  implementationStatus: "not_started" | "stub" | "active";
  /** Demo-functional spec (present when implementationStatus is "stub" or "active"). */
  functionalSpec?: FunctionalSpec;
}

/** Definition shape for a connector that an agent runtime might use. */
export interface ConnectorDefinition {
  /** Provider identifier (e.g. "hibob", "statsig", "clickhouse"). */
  providerId: string;
  /** Display name. */
  displayName: string;
  /** Supported auth types. */
  authTypes: Array<"oauth2" | "api_key" | "bearer_token" | "basic_auth" | "none">;
  /** HTTP base URL for the connector's API. */
  baseUrl: string | null;
  /** Whether a webhook ingress endpoint is supported. */
  supportsWebhooks: boolean;
  /** Rate limit summary (requests per window). */
  rateLimit: string | null;
  /** Current connector implementation status. */
  status: "planned" | "stub" | "active";
}

/** Result shape returned after a connector action is invoked. */
export interface ConnectorActionResult {
  /** Whether the action succeeded. */
  success: boolean;
  /** The structured response payload (null on error). */
  data: Record<string, unknown> | null;
  /** Error message when success is false. */
  error: string | null;
  /** ISO 8601 timestamp of the connector response. */
  respondedAt: string;
  /** HTTP status code returned by the connector. */
  statusCode: number | null;
}

/** Result of validating a single agent run against its expected lifecycle. */
export interface AgentValidationResult {
  runId: string;
  /** Whether the run passed all validation gates. */
  passed: boolean;
  /** Per-gate results. */
  gates: AgentValidationGate[];
  /** Summary of issues found. */
  issues: string[];
}

/** A single validation gate within a run. */
export interface AgentValidationGate {
  name: string;
  passed: boolean;
  detail: string;
}

// ── Functional agent types (workflow-oriented, user-facing layer) ────────────

export interface FunctionalAgentRun {
  id: string;
  agentSlug: string;
  status: FunctionalAgentRunStatus;
  workflowSteps: FunctionalAgentWorkflowStep[];
  evidenceItems: FunctionalAgentEvidenceItem[];
  artifacts: FunctionalAgentArtifact[];
  proposedActions: FunctionalAgentProposedAction[];
  approvalBoundary: FunctionalAgentApprovalBoundary;
  demoDataRef: FunctionalAgentDemoDataRef | null;
  startedAt: string | null;
  completedAt: string | null;
}

export type FunctionalAgentRunStatus =
  | "idle"
  | "intake"
  | "analyzing"
  | "proposing"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "failed"
  | "canceled";

export interface FunctionalAgentWorkflowStep {
  id: string;
  order: number;
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  toolId: string | null;
}

export type FunctionalAgentEvidenceType =
  | "source_data"
  | "file"
  | "screenshot"
  | "report"
  | "log"
  | "diff"
  | "audit_snapshot"
  | "connector_response"
  | "mock_fixture";

export interface FunctionalAgentEvidenceItem {
  id: string;
  label: string;
  type: FunctionalAgentEvidenceType;
  contentUrl: string | null;
  summary: string;
  sourceName: string;
  confidence: "high" | "medium" | "low";
  freshness: string | null;
  verified: boolean;
  metadata: Record<string, unknown> | null;
}

export type FunctionalAgentArtifactType =
  | "report"
  | "summary"
  | "checklist"
  | "batch"
  | "insight_brief"
  | "risk_matrix"
  | "approval_packet"
  | "evidence_packet"
  | "recommendation"
  | "analysis"
  | "draft"
  | "plan"
  | "export";

export interface FunctionalAgentArtifact {
  id: string;
  type: FunctionalAgentArtifactType;
  name: string;
  description: string;
  sections: FunctionalAgentArtifactSection[];
  evidenceRefs: string[];
  readyForExport: boolean;
  createdAt: string;
}

export interface FunctionalAgentArtifactSection {
  id: string;
  title: string;
  content: string;
  contentType: "markdown" | "text" | "json" | "html" | "table";
  required: boolean;
  order: number;
}

export type FunctionalAgentActionRiskLevel = "low" | "medium" | "high" | "critical";

export type FunctionalAgentActionStatus =
  | "draft"
  | "proposed"
  | "approved"
  | "rejected"
  | "executed"
  | "failed"
  | "rolled_back";

export interface FunctionalAgentProposedAction {
  id: string;
  title: string;
  description: string;
  riskLevel: FunctionalAgentActionRiskLevel;
  status: FunctionalAgentActionStatus;
  affectedEntities: string[];
  rationale: string;
  evidenceRefs: string[];
  expectedEffect: string;
  rollbackPath: string | null;
  proposedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface FunctionalAgentApprovalBoundary {
  agentSlug: string;
  autonomyLevel: 0 | 1 | 2 | 3 | 4 | 5;
  draftModeOnly: boolean;
  autoExecuteRiskLevels: FunctionalAgentActionRiskLevel[];
  requireApprovalFor: FunctionalAgentActionRiskLevel[];
  blockActions: FunctionalAgentActionRiskLevel[];
  description: string;
}

export interface FunctionalAgentDemoDataRef {
  agentSlug: string;
  fixtureDir: string;
  fixtureFiles: string[];
  sampleInputs: Record<string, unknown>[];
  expectedOutputs: Record<string, unknown>[];
  isMockLabeled: boolean;
}

export interface FunctionalAgentEvalCase {
  agentSlug: string;
  scenarioId: string;
  name: string;
  description: string;
  category: "happy_path" | "edge_case" | "ambiguous" | "missing_data" | "high_risk" | "hallucination_resistance";
  inputFixture: string | null;
  expectedFindings: string[];
  requiredArtifactSections: string[];
  passCriteria: string[];
}

export interface FunctionalAgentSpec {
  slug: string;
  name: string;
  category: string;
  description: string;
  jobToBeDone: string;
  painPoint: string;
  defaultGoldenWorkflow: string;
  structuredIntakeFields: Record<string, { type: string; required: boolean; description: string }>;
  workspacePanelNames: string[];
  generatedArtifactTypes: FunctionalAgentArtifactType[];
  proposedActionExamples: string[];
  approvalBoundary: FunctionalAgentApprovalBoundary;
  evalCases: FunctionalAgentEvalCase[];
  successMetrics: string[];
  futureIntegrations: string[];
  firstFunctionalMvpScope: string;
  explicitNonScope: string;
  demoDataRef: FunctionalAgentDemoDataRef;
}

/** Maps functional-agent concepts back to underlying runtime primitives. */
export const FUNCTIONAL_TO_RUNTIME_MAPPING: Record<string, string> = {
  FunctionalAgentRun: "Composes AgentRun + workflow steps + artifacts + evidence + proposed actions",
  FunctionalAgentRunStatus: "Higher-level status derived from AgentRunStatus + action/approval state",
  FunctionalAgentWorkflowStep: "Maps to ordered AgentAction sequence within an AgentRun",
  FunctionalAgentEvidenceItem: "Extends AgentEvidence with confidence, freshness, and verified fields",
  FunctionalAgentArtifact: "Stored as output/summary sections within AgentRun.output",
  FunctionalAgentProposedAction: "Maps to AgentAction with proposalId and awaiting_approval status",
  FunctionalAgentApprovalBoundary: "Policy layer above ToolRiskLevel → ApprovalRequirement mapping",
};

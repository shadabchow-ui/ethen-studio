// Deterministic local mock runner for functional agent workbenches.
// Pure functions — no I/O, no external APIs, no fixture file reads.
// Uses typed workbench configs to generate mock results, artifacts, traces, and approvals.

import type {
  FunctionalAgentActionRiskLevel,
  FunctionalAgentArtifactType,
} from "../runtime/types";
import type {
  FunctionalAgentWorkbenchConfig,
  WorkbenchActionConfig,
} from "./config-types";

// ── Public types ──────────────────────────────────────────────────────────────

export interface WorkbenchRunTraceEvent {
  id: string;
  actionId: string;
  actionLabel: string;
  toolIds: string[];
  status: "completed" | "approval_pending" | "rejected";
  summary: string;
  fixtureRefs: string[];
  timestampLabel: string;
}

export interface WorkbenchGeneratedResult {
  id: string;
  panelId: string;
  title: string;
  kind: string;
  summary: string;
  rows?: Array<Record<string, string | number | boolean>>;
  markdown?: string;
  metrics?: Array<{ label: string; value: string; tone?: "neutral" | "good" | "warning" | "danger" }>;
}

export interface WorkbenchGeneratedArtifact {
  id: string;
  title: string;
  artifactType: FunctionalAgentArtifactType;
  mimeType: "text/markdown" | "application/json";
  preview: string;
  provenance: {
    agentSlug: string;
    actionId: string;
    fixtureRefs: string[];
  };
}

export interface WorkbenchPendingApproval {
  id: string;
  actionId: string;
  actionLabel: string;
  riskLevel: FunctionalAgentActionRiskLevel;
  reason: string;
  status: "pending" | "approved" | "rejected";
}

export interface WorkbenchRunState {
  demoObjectLoaded: boolean;
  selectedObjectLabel: string;
  results: WorkbenchGeneratedResult[];
  artifacts: WorkbenchGeneratedArtifact[];
  trace: WorkbenchRunTraceEvent[];
  approvals: WorkbenchPendingApproval[];
  lastActionId?: string;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

let _counter = 0;
function nextId(prefix: string): string {
  _counter += 1;
  return `${prefix}-${_counter}-${Date.now()}`;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString();
}

function formatTemplateFamily(templateFamily: string): string {
  return templateFamily
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function mockObjectLabel(config: FunctionalAgentWorkbenchConfig): string {
  const family = config.templateFamily;
  const obj = config.primaryWorkflowObject.replace(/_/g, " ");
  const mappings: Record<string, string> = {
    incident_response: `Active Incident: ${obj} (${config.demoDataNeeded[0] ?? "simulated alert"})`,
    reconciliation_close: `${obj} — Q${(new Date().getMonth() + 1)} Close Batch`,
    campaign_planner: `${obj}: Demo Draft (${config.demoDataNeeded[0] ?? "synthetic brief"})`,
    developer_tool: `Pipeline Run: ${obj} #${Math.floor(Math.random() * 9000) + 1000}`,
    data_quality: `${obj}: Catalog Scan — ${config.demoDataNeeded[0] ?? "synthetic schema"}`,
    risk_investigation: `Risk Case: ${obj} (${config.demoDataNeeded[0] ?? "synthetic signal"})`,
    compliance_screening: `Screening Case: ${obj} — Demo`,
    monitoring_dashboard: `Dashboard: ${obj} (mock metrics)`,
    orchestration: `Orchestration Plan: ${obj}`,
    intake_workflow: `Intake: ${obj} — Demo Ticket`,
    operations_dispatch: `Dispatch Queue: ${obj}`,
    analysis_report: `Analysis: ${obj} — Demo Dataset`,
    batch_processor: `Batch Job: ${obj} — Demo Run`,
  };
  return mappings[family] ?? `Demo Object: ${obj}`;
}

function mockResultContent(
  config: FunctionalAgentWorkbenchConfig,
  action: WorkbenchActionConfig,
  panels: typeof config.resultPanels,
): { summary: string; rows?: Array<Record<string, string | number | boolean>>; markdown?: string; metrics?: WorkbenchGeneratedResult["metrics"] } {
  const family = config.templateFamily;
  const summary = `Mock execution of "${action.label}" completed. ${action.mockBehavior ?? "Generated synthetic output."}`;

  const metrics: WorkbenchGeneratedResult["metrics"] = [
    { label: "Status", value: "Completed (mock)", tone: "neutral" },
    { label: "Risk Level", value: action.riskLevel, tone: action.riskLevel === "high" ? "warning" : "good" },
    { label: "Fixtures Ref", value: config.demoDataNeeded.slice(0, 2).join(", ") || "none", tone: "neutral" },
  ];

  const rows: Array<Record<string, string | number | boolean>> = [];
  if (family === "incident_response") {
    rows.push({ finding: "Severity assessed", value: "Medium", source: "mock alert payload" });
    rows.push({ finding: "Initial containment", value: "Recommended", source: "runbook step 3" });
    rows.push({ finding: "Affected assets", value: 3, source: "CMDB mock" });
  } else if (family === "reconciliation_close") {
    rows.push({ account: "GL-4100", expected: 150000, actual: 149850, variance: -150, flagged: true });
    rows.push({ account: "GL-4200", expected: 87500, actual: 87500, variance: 0, flagged: false });
    rows.push({ account: "GL-4300", expected: 32000, actual: 31800, variance: -200, flagged: true });
  } else if (family === "campaign_planner") {
    rows.push({ channel: "Email", variant: "A/B test draft", compliance: "Pass", status: "Draft" });
    rows.push({ channel: "Social", variant: "Short copy", compliance: "Pass", status: "Draft" });
    rows.push({ channel: "Push", variant: "Notification", compliance: "Needs review", status: "Draft" });
  } else if (family === "developer_tool") {
    rows.push({ stage: "Build", status: "Passed", duration: "1m 23s" });
    rows.push({ stage: "Test", status: "Passed", duration: "4m 10s" });
    rows.push({ stage: "Deploy", status: "Blocked", duration: "—" });
  } else {
    rows.push({ key: "Output 1", value: action.mockBehavior ?? "synthetic", source: config.demoDataNeeded[0] ?? "mock fixture" });
    rows.push({ key: "Output 2", value: "Generated", source: config.demoDataNeeded[1] ?? "mock fixture" });
  }

  return { summary, rows, metrics, markdown: `## ${action.label}\n\n${summary}\n\n*Mock execution — no live writes.*` };
}

function mockArtifactContent(
  config: FunctionalAgentWorkbenchConfig,
  action: WorkbenchActionConfig,
): { title: string; artifactType: FunctionalAgentArtifactType; mimeType: "text/markdown" | "application/json"; preview: string } {
  const tmpl = config.artifactTemplates[0];
  const artifactType = tmpl?.artifactType ?? "report";
  const title = `Mock ${artifactType.replace(/_/g, " ")} — ${action.label}`;
  const preview = `## Mock Artifact: ${title}\n\nGenerated by action "${action.label}" on behalf of ${config.name}.\n\n- **Source:** deterministic mock runner (no live data)\n- **Provenance:** ${config.slug} → ${action.id}\n- **Fixtures referenced:** ${config.demoDataNeeded.join(", ") || "none"}\n\nThis artifact is a local mock preview. Live connectors are not enabled.`;
  return { title, artifactType, preview, mimeType: tmpl?.mimeType ?? "text/markdown" };
}

function mockApprovalReason(action: WorkbenchActionConfig): string {
  return `${action.label} is approval-gated (risk: ${action.riskLevel}). Human review required before execution.`;
}

function approvalGated(config: FunctionalAgentWorkbenchConfig, actionId: string): boolean {
  const action = config.actions.find((a) => a.id === actionId);
  return action?.requiresApproval ?? false;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createInitialWorkbenchRunState(
  config: FunctionalAgentWorkbenchConfig,
): WorkbenchRunState {
  return {
    demoObjectLoaded: false,
    selectedObjectLabel: config.primaryWorkflowObject.replace(/_/g, " "),
    results: [],
    artifacts: [],
    trace: [],
    approvals: [],
  };
}

export function loadDemoWorkbenchObject(
  config: FunctionalAgentWorkbenchConfig,
  previousState: WorkbenchRunState,
): WorkbenchRunState {
  return {
    ...previousState,
    demoObjectLoaded: true,
    selectedObjectLabel: mockObjectLabel(config),
    trace: [
      ...previousState.trace,
      {
        id: nextId("trace-load"),
        actionId: "load-demo-object",
        actionLabel: "Load demo object",
        toolIds: [],
        status: "completed",
        summary: `Demo object loaded: ${mockObjectLabel(config)}`,
        fixtureRefs: config.demoDataNeeded,
        timestampLabel: nowLabel(),
      },
    ],
    results: [],
    artifacts: [],
    approvals: [],
    lastActionId: "load-demo-object",
  };
}

export function runWorkbenchAction(
  config: FunctionalAgentWorkbenchConfig,
  actionId: string,
  previousState: WorkbenchRunState,
): WorkbenchRunState {
  const action = config.actions.find((a) => a.id === actionId);
  if (!action) return previousState;

  const gated = action.requiresApproval;

  if (gated) {
    // Create pending approval — do NOT execute
    const approval: WorkbenchPendingApproval = {
      id: nextId("approval"),
      actionId: action.id,
      actionLabel: action.label,
      riskLevel: action.riskLevel,
      reason: mockApprovalReason(action),
      status: "pending",
    };

    const trace: WorkbenchRunTraceEvent = {
      id: nextId("trace"),
      actionId: action.id,
      actionLabel: action.label,
      toolIds: action.toolIds,
      status: "approval_pending",
      summary: `Approval required for "${action.label}" (${action.riskLevel} risk). Not yet executed.`,
      fixtureRefs: config.demoDataNeeded,
      timestampLabel: nowLabel(),
    };

    return {
      ...previousState,
      trace: [...previousState.trace, trace],
      approvals: [...previousState.approvals, approval],
      lastActionId: actionId,
    };
  }

  // Non-gated — execute immediately
  const panelId = config.resultPanels[0]?.id ?? "panel-default";
  const resultContent = mockResultContent(config, action, config.resultPanels);
  const artifactContent = mockArtifactContent(config, action);

  const result: WorkbenchGeneratedResult = {
    id: nextId("result"),
    panelId,
    title: `${action.label} Results`,
    kind: config.resultPanels[0]?.panelType ?? "markdown",
    summary: resultContent.summary,
    rows: resultContent.rows,
    markdown: resultContent.markdown,
    metrics: resultContent.metrics,
  };

  const artifact: WorkbenchGeneratedArtifact = {
    id: nextId("artifact"),
    title: artifactContent.title,
    artifactType: artifactContent.artifactType,
    mimeType: artifactContent.mimeType,
    preview: artifactContent.preview,
    provenance: {
      agentSlug: config.slug,
      actionId: action.id,
      fixtureRefs: config.demoDataNeeded,
    },
  };

  const trace: WorkbenchRunTraceEvent = {
    id: nextId("trace"),
    actionId: action.id,
    actionLabel: action.label,
    toolIds: action.toolIds,
    status: "completed",
    summary: `"${action.label}" completed (mock). Generated ${config.resultPanels.length > 0 ? "result" : "output"} and artifact.`,
    fixtureRefs: config.demoDataNeeded,
    timestampLabel: nowLabel(),
  };

  return {
    ...previousState,
    results: [...previousState.results, result],
    artifacts: [...previousState.artifacts, artifact],
    trace: [...previousState.trace, trace],
    lastActionId: actionId,
  };
}

export function approveWorkbenchAction(
  config: FunctionalAgentWorkbenchConfig,
  approvalId: string,
  previousState: WorkbenchRunState,
): WorkbenchRunState {
  const approval = previousState.approvals.find((a) => a.id === approvalId);
  if (!approval || approval.status !== "pending") return previousState;

  const action = config.actions.find((a) => a.id === approval.actionId);
  if (!action) return previousState;

  // Generate result + artifact for the approved action
  const panelId = config.resultPanels[0]?.id ?? "panel-default";
  const resultContent = mockResultContent(config, action, config.resultPanels);
  const artifactContent = mockArtifactContent(config, action);

  const result: WorkbenchGeneratedResult = {
    id: nextId("result"),
    panelId,
    title: `${action.label} Results (Approved)`,
    kind: config.resultPanels[0]?.panelType ?? "markdown",
    summary: `Approved and executed: ${resultContent.summary}`,
    rows: resultContent.rows,
    markdown: resultContent.markdown,
    metrics: [
      ...(resultContent.metrics ?? []),
      { label: "Approval", value: "Approved by user", tone: "good" },
    ],
  };

  const artifact: WorkbenchGeneratedArtifact = {
    id: nextId("artifact"),
    title: `${artifactContent.title} (Approved)`,
    artifactType: artifactContent.artifactType,
    mimeType: artifactContent.mimeType,
    preview: artifactContent.preview,
    provenance: {
      agentSlug: config.slug,
      actionId: action.id,
      fixtureRefs: config.demoDataNeeded,
    },
  };

  const trace: WorkbenchRunTraceEvent = {
    id: nextId("trace"),
    actionId: action.id,
    actionLabel: action.label,
    toolIds: action.toolIds,
    status: "completed",
    summary: `"${action.label}" approved and executed (mock).`,
    fixtureRefs: config.demoDataNeeded,
    timestampLabel: nowLabel(),
  };

  return {
    ...previousState,
    results: [...previousState.results, result],
    artifacts: [...previousState.artifacts, artifact],
    trace: [...previousState.trace, trace],
    approvals: previousState.approvals.map((a) =>
      a.id === approvalId ? { ...a, status: "approved" as const } : a,
    ),
    lastActionId: action.id,
  };
}

export function rejectWorkbenchAction(
  config: FunctionalAgentWorkbenchConfig,
  approvalId: string,
  previousState: WorkbenchRunState,
): WorkbenchRunState {
  const approval = previousState.approvals.find((a) => a.id === approvalId);
  if (!approval || approval.status !== "pending") return previousState;

  const action = config.actions.find((a) => a.id === approval.actionId);
  if (!action) return previousState;

  const trace: WorkbenchRunTraceEvent = {
    id: nextId("trace"),
    actionId: action.id,
    actionLabel: action.label,
    toolIds: action.toolIds,
    status: "rejected",
    summary: `"${action.label}" rejected. No execution occurred.`,
    fixtureRefs: config.demoDataNeeded,
    timestampLabel: nowLabel(),
  };

  return {
    ...previousState,
    trace: [...previousState.trace, trace],
    approvals: previousState.approvals.map((a) =>
      a.id === approvalId ? { ...a, status: "rejected" as const } : a,
    ),
    lastActionId: action.id,
  };
}

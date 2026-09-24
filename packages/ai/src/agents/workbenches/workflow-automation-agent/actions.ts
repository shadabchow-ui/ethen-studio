import type {
  WorkflowAutomationState,
  WfaEvent,
  WfaArtifact,
} from "./state";

let _evCounter = 600;
let _artCounter = 700;

function nextEventId(): string { _evCounter += 1; return `wfa-evt-${_evCounter}`; }
function nextArtifactId(): string { _artCounter += 1; return `wfa-art-${_artCounter}`; }
function nowISO(): string { return new Date().toISOString(); }

function createEvent(
  action: string, summary: string, flowIds: string[], artifactId?: string,
): WfaEvent {
  return { id: nextEventId(), timestamp: nowISO(), actor: "workflow_automation_agent", action, summary, linkedFlowIds: flowIds, artifactId };
}

export function analyzeProcessWorkflow(
  state: WorkflowAutomationState,
  flowId: string,
): { state: WorkflowAutomationState; event: WfaEvent } {
  const flow = state.flows.find((f) => f.id === flowId);
  if (!flow) {
    const event = createEvent("analyze_process_workflow", `Process analysis failed: flow ${flowId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
  }

  const autoCount = flow.steps.filter((s) => s.stepType === "automated").length;
  const manualCount = flow.steps.filter((s) => s.stepType === "manual").length;
  const gateCount = flow.steps.filter((s) => s.stepType === "gate").length;
  const totalEst = flow.steps.reduce((s, st) => s + st.estimatedDuration, 0);

  const event = createEvent("analyze_process_workflow", `Analyzed "${flow.name}": ${flow.steps.length} steps (${autoCount} automated, ${manualCount} manual, ${gateCount} gates), ~${totalEst}h total.`, [flowId]);
  return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
}

export function mapProcessSteps(
  state: WorkflowAutomationState,
  flowId: string,
): { state: WorkflowAutomationState; event: WfaEvent; artifact: WfaArtifact } {
  const flow = state.flows.find((f) => f.id === flowId);
  if (!flow) {
    const event = createEvent("map_process_steps", `Process mapping failed: flow ${flowId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, artifact: { id: "", type: "plan", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedFlowIds: [] } };
  }

  const content = [
    `# Process Map — ${flow.name}`,
    ``,
    `**Trigger:** ${flow.trigger}`,
    `**Total Steps:** ${flow.steps.length}`,
    `**Integration Points:** ${flow.integrationPoints.join(", ")}`,
    ``,
    `## Step Sequence`,
    ...flow.steps.map((s, i) => [
      `### ${i + 1}. ${s.name} (${s.stepType.replace(/_/g, " ")})`,
      s.description ? `_${s.description}_` : "",
      `- Duration: ${s.estimatedDuration}h`,
      `- Role: ${s.responsibleRole}`,
      s.dependsOn.length > 0 ? `- Depends on: ${s.dependsOn.join(", ")}` : "",
      s.triggerEvent ? `- Trigger: \`${s.triggerEvent}\`` : "",
    ].filter(Boolean).join("\n")),
    ``,
    `## Approval Gates`,
    ...flow.approvalGates.map((g) => `- **${g.name}**: ${g.condition} (${g.status})`),
  ].join("\n");

  const artifact: WfaArtifact = {
    id: nextArtifactId(),
    type: "plan",
    title: `Process Map — ${flow.name}`,
    createdAt: nowISO(),
    sourceAction: "map_process_steps",
    preview: `Process map for "${flow.name}": ${flow.steps.length} steps, ${flow.approvalGates.length} gates.`,
    content,
    linkedFlowIds: [flowId],
  };

  const event = createEvent("map_process_steps", `Mapped ${flow.steps.length} steps for "${flow.name}".`, [flowId], artifact.id);
  return { state: { ...state, artifacts: [...state.artifacts, artifact], activityLog: [...state.activityLog, event] }, event, artifact };
}

export function identifyBottlenecks(
  state: WorkflowAutomationState,
  flowId: string,
): { state: WorkflowAutomationState; event: WfaEvent; artifact: WfaArtifact } {
  const flow = state.flows.find((f) => f.id === flowId);
  if (!flow) {
    const event = createEvent("identify_bottlenecks", `Bottleneck analysis failed: flow ${flowId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, artifact: { id: "", type: "report", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedFlowIds: [] } };
  }

  const flowBottlenecks = state.bottlenecks.filter((b) => {
    const step = flow.steps.find((s) => s.id === b.stepId);
    return !!step;
  });

  const manualSteps = flow.steps.filter((s) => s.stepType === "manual");
  const slowAutoSteps = flow.steps.filter((s) => s.stepType === "automated" && s.estimatedDuration > 4);

  const content = [
    `# Bottleneck Analysis — ${flow.name}`,
    ``,
    ...flowBottlenecks.length > 0
      ? [`## Known Bottlenecks`, ...flowBottlenecks.map((b) => {
          const step = flow.steps.find((s) => s.id === b.stepId);
          return `- **${step?.name ?? b.stepId}** (${b.severity}): ${b.description}\n  - Impact: ${b.impact}\n  - Recommendation: ${b.recommendation}`;
        })]
      : [],
    ``,
    `## Manual Touchpoints (${manualSteps.length})`,
    ...manualSteps.map((s) => `- ${s.name} (~${s.estimatedDuration}h, ${s.responsibleRole})`),
    ``,
    `## Slow Automation Candidates`,
    ...slowAutoSteps.map((s) => `- ${s.name} (~${s.estimatedDuration}h)`),
    slowAutoSteps.length === 0 ? "No slow automated steps detected." : "",
  ].filter(Boolean).join("\n");

  const artifact: WfaArtifact = {
    id: nextArtifactId(),
    type: "report",
    title: `Bottleneck Analysis — ${flow.name}`,
    createdAt: nowISO(),
    sourceAction: "identify_bottlenecks",
    preview: `${flowBottlenecks.length} known bottleneck(s), ${manualSteps.length} manual touchpoint(s) in "${flow.name}".`,
    content,
    linkedFlowIds: [flowId],
  };

  const event = createEvent("identify_bottlenecks", `Identified ${flowBottlenecks.length} bottleneck(s) and ${manualSteps.length} manual step(s) in "${flow.name}".`, [flowId], artifact.id);
  return { state: { ...state, artifacts: [...state.artifacts, artifact], activityLog: [...state.activityLog, event] }, event, artifact };
}

export function designAutomationFlow(
  state: WorkflowAutomationState,
  flowId: string,
): { state: WorkflowAutomationState; event: WfaEvent; artifact: WfaArtifact } {
  const flow = state.flows.find((f) => f.id === flowId);
  if (!flow) {
    const event = createEvent("design_automation_flow", `Flow design failed: flow ${flowId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, artifact: { id: "", type: "plan", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedFlowIds: [] } };
  }

  const content = [
    `# Automation Flow Design — ${flow.name}`,
    ``,
    `## Flow Overview`,
    `- Trigger: ${flow.trigger}`,
    `- ${flow.steps.length} steps total`,
    `- ${flow.steps.filter((s) => s.stepType === "automated").length} automated`,
    `- ${flow.steps.filter((s) => s.stepType === "gate").length} approval gates`,
    `- ${flow.integrationPoints.length} integration points`,
    ``,
    `## Automation Recommendations`,
    ...flow.steps.filter((s) => s.stepType === "manual").map((s) =>
      `- **${s.name}**: Convert to automated — current ~${s.estimatedDuration}h manual effort by ${s.responsibleRole}`,
    ),
    ``,
    ...flow.steps.filter((s) => s.stepType === "gate").map((g) =>
      `- **${g.name}**: Keep as gate — ${g.responsibleRole} review required`,
    ),
    ``,
    `## Deployment Status`,
    `Current: ${flow.deploymentStatus}`,
  ].join("\n");

  const artifact: WfaArtifact = {
    id: nextArtifactId(),
    type: "plan",
    title: `Automation Design — ${flow.name}`,
    createdAt: nowISO(),
    sourceAction: "design_automation_flow",
    preview: `Automation design for "${flow.name}": ${flow.steps.filter((s) => s.stepType === "manual").length} manual steps to automate.`,
    content,
    linkedFlowIds: [flowId],
  };

  const event = createEvent("design_automation_flow", `Designed automation flow for "${flow.name}" with ${flow.steps.length} steps.`, [flowId], artifact.id);
  return { state: { ...state, artifacts: [...state.artifacts, artifact], activityLog: [...state.activityLog, event] }, event, artifact };
}

export function configureApprovalGates(
  state: WorkflowAutomationState,
  flowId: string,
): { state: WorkflowAutomationState; event: WfaEvent; artifact: WfaArtifact } {
  const flow = state.flows.find((f) => f.id === flowId);
  if (!flow) {
    const event = createEvent("configure_approval_gates", `Gate configuration failed: flow ${flowId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, artifact: { id: "", type: "recommendation", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedFlowIds: [] } };
  }

  const content = [
    `# Approval Gate Configuration — ${flow.name}`,
    ``,
    ...flow.approvalGates.length > 0
      ? flow.approvalGates.map((g, i) => [
          `### Gate ${i + 1}: ${g.name}`,
          `- Condition: ${g.condition}`,
          `- Approvers: ${g.requiredApprovers.join(", ")}`,
          `- Status: ${g.status}`,
          `- Linked Step: ${flow.steps.find((s) => s.id === g.stepId)?.name ?? g.stepId}`,
        ].join("\n"))
      : ["No approval gates configured. Consider adding gates for risky steps."],
    ``,
    `## Configuration Summary`,
    `- Total gates: ${flow.approvalGates.length}`,
    `- Active: ${flow.approvalGates.filter((g) => g.status === "active").length}`,
    `- Pending: ${flow.approvalGates.filter((g) => g.status === "pending").length}`,
    `- Approved: ${flow.approvalGates.filter((g) => g.status === "approved").length}`,
  ].join("\n");

  const artifact: WfaArtifact = {
    id: nextArtifactId(),
    type: "recommendation",
    title: `Approval Gates — ${flow.name}`,
    createdAt: nowISO(),
    sourceAction: "configure_approval_gates",
    preview: `${flow.approvalGates.length} gate(s) configured for "${flow.name}".`,
    content,
    linkedFlowIds: [flowId],
  };

  const event = createEvent("configure_approval_gates", `Configured ${flow.approvalGates.length} approval gate(s) for "${flow.name}".`, [flowId], artifact.id);
  return { state: { ...state, artifacts: [...state.artifacts, artifact], activityLog: [...state.activityLog, event] }, event, artifact };
}

export function generateDeploymentPlan(
  state: WorkflowAutomationState,
  flowId: string,
): { state: WorkflowAutomationState; event: WfaEvent; artifact: WfaArtifact } {
  const flow = state.flows.find((f) => f.id === flowId);
  if (!flow) {
    const event = createEvent("generate_deployment_plan", `Deployment plan failed: flow ${flowId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, artifact: { id: "", type: "plan", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedFlowIds: [] } };
  }

  const content = [
    `# Deployment Plan — ${flow.name}`,
    ``,
    `## Phase 1: Staging`,
    `- Deploy automation flow in staging environment`,
    `- Run test triggers to validate end-to-end`,
    `- Verify all ${flow.approvalGates.length} gate(s) fire correctly`,
    `- Test rollback procedure`,
    ``,
    `## Phase 2: Canary`,
    `- Enable for 10% of trigger events`,
    `- Monitor ${flow.integrationPoints.length} integration point(s): ${flow.integrationPoints.join(", ")}`,
    `- Watch for error rates, latency, and SLA compliance`,
    ``,
    `## Phase 3: Full Rollout`,
    `- Gradual ramp: 25% → 50% → 100%`,
    `- Set up monitoring dashboards`,
    `- Configure alerting for failures`,
    `- Document runbook`,
    ``,
    `## Rollback Plan`,
    `- Revert to previous state via versioned flow definitions`,
    `- Notify all stakeholders`,
    `- Resume manual process if automation fails`,
    ``,
    `## Estimated Timeline`,
    `- Phase 1: 3-5 days`,
    `- Phase 2: 5-7 days`,
    `- Phase 3: 7-14 days`,
  ].join("\n");

  const artifact: WfaArtifact = {
    id: nextArtifactId(),
    type: "plan",
    title: `Deployment Plan — ${flow.name}`,
    createdAt: nowISO(),
    sourceAction: "generate_deployment_plan",
    preview: `3-phase deployment plan for "${flow.name}": staging → canary → full rollout.`,
    content,
    linkedFlowIds: [flowId],
  };

  const event = createEvent("generate_deployment_plan", `Generated deployment plan for "${flow.name}" with 3 phases.`, [flowId], artifact.id);
  return { state: { ...state, artifacts: [...state.artifacts, artifact], activityLog: [...state.activityLog, event] }, event, artifact };
}

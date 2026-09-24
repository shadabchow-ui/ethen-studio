// Demo Run Helpers — Creates deterministic demo run objects for any Wave 1 agent slug.
// Works across Batch A and Batch B implementations via the shared functional-specs registry.

import type {
  FunctionalAgentRun,
  FunctionalAgentRunStatus,
  FunctionalAgentWorkflowStep,
  FunctionalAgentEvidenceItem,
  FunctionalAgentArtifact,
  FunctionalAgentProposedAction,
  FunctionalAgentApprovalBoundary,
  FunctionalAgentDemoDataRef,
  FunctionalAgentArtifactType,
} from "./types";
import { ALL_FUNCTIONAL_SPECS } from "./functional-specs";

let runCounter = 0;
let evidenceCounter = 0;
let artifactCounter = 0;
let actionCounter = 0;

export function resetDemoCounters(): void {
  runCounter = 0;
  evidenceCounter = 0;
  artifactCounter = 0;
  actionCounter = 0;
}

function nextRunId(): string {
  runCounter += 1;
  return `demo-run-${runCounter}`;
}

function nextEvidenceId(): string {
  evidenceCounter += 1;
  return `demo-evidence-${evidenceCounter}`;
}

function nextArtifactId(): string {
  artifactCounter += 1;
  return `demo-artifact-${artifactCounter}`;
}

function nextActionId(): string {
  actionCounter += 1;
  return `demo-action-${actionCounter}`;
}

const now = () => new Date().toISOString();

export function createDemoFunctionalRun(slug: string): FunctionalAgentRun | null {
  const spec = ALL_FUNCTIONAL_SPECS.find((s) => s.slug === slug);
  if (!spec) return null;

  const workflowSteps: FunctionalAgentWorkflowStep[] = [
    {
      id: `${nextRunId()}-step-1`,
      order: 1,
      name: "Intake",
      description: spec.structuredIntakeFields
        ? Object.entries(spec.structuredIntakeFields)
            .map(([k, v]) => `${k}: ${v.description}`)
            .join("; ")
        : "Accept user input and requirements.",
      status: "completed",
      startedAt: now(),
      completedAt: now(),
      toolId: "research.contents",
    },
    {
      id: `${nextRunId()}-step-2`,
      order: 2,
      name: "Analyze",
      description: spec.jobToBeDone,
      status: "completed",
      startedAt: now(),
      completedAt: now(),
      toolId: "research.answer",
    },
    {
      id: `${nextRunId()}-step-3`,
      order: 3,
      name: "Generate",
      description: `Produce ${spec.generatedArtifactTypes.join(", ")} output.`,
      status: "running",
      startedAt: now(),
      completedAt: null,
      toolId: "artifact.create",
    },
    {
      id: `${nextRunId()}-step-4`,
      order: 4,
      name: "Propose Actions",
      description: "Draft proposed actions for human review.",
      status: "pending",
      startedAt: null,
      completedAt: null,
      toolId: "writing.rewrite",
    },
  ];

  const evidenceItems: FunctionalAgentEvidenceItem[] = [
    {
      id: nextEvidenceId(),
      label: "Intake Data",
      type: "source_data",
      contentUrl: null,
      summary: `Structured intake for ${spec.name}: ${spec.jobToBeDone}`,
      sourceName: spec.demoDataRef.fixtureDir,
      confidence: "high",
      freshness: now(),
      verified: false,
      metadata: { agentSlug: slug, demo: true },
    },
    {
      id: nextEvidenceId(),
      label: "Analysis Results",
      type: "report",
      contentUrl: null,
      summary: `Analysis completed against mock data for ${spec.name}.`,
      sourceName: spec.demoDataRef.fixtureDir,
      confidence: "high",
      freshness: now(),
      verified: false,
      metadata: { agentSlug: slug, demo: true },
    },
  ];

  const artifacts: FunctionalAgentArtifact[] = spec.generatedArtifactTypes.slice(0, 3).map((type) => ({
    id: nextArtifactId(),
    type: type as FunctionalAgentArtifactType,
    name: `${spec.name} ${type.replace(/_/g, " ")}`,
    description: `Demo ${type} output for ${spec.name}.`,
    sections: [
      {
        id: `${nextArtifactId()}-s1`,
        title: "Summary",
        content: `This is a demo ${type} artifact generated for ${spec.name}. All data is mock/simulated.`,
        contentType: "markdown",
        required: true,
        order: 1,
      },
      {
        id: `${nextArtifactId()}-s2`,
        title: "Findings",
        content: `Key findings from the ${spec.name} demo run. Mock data only.`,
        contentType: "markdown",
        required: true,
        order: 2,
      },
      {
        id: `${nextArtifactId()}-s3`,
        title: "Limitations",
        content: `Demo mode. Not connected to live systems. Mock data. Non-executing actions only.`,
        contentType: "markdown",
        required: false,
        order: 3,
      },
    ],
    evidenceRefs: evidenceItems.map((e) => e.id),
    readyForExport: true,
    createdAt: now(),
  }));

  const proposedActions: FunctionalAgentProposedAction[] = spec.proposedActionExamples.slice(0, 4).map((example) => ({
    id: nextActionId(),
    title: example,
    description: `Proposed: ${example}. Requires human review and approval. No automatic execution.`,
    riskLevel: spec.approvalBoundary.autoExecuteRiskLevels.includes("medium") ? "medium" : "low",
    status: "draft",
    affectedEntities: [],
    rationale: `Based on ${spec.name} analysis of demo data.`,
    evidenceRefs: evidenceItems.map((e) => e.id),
    expectedEffect: "Non-executing demo preview",
    rollbackPath: null,
    proposedAt: now(),
    resolvedAt: null,
    resolvedBy: null,
  }));

  const approvalBoundary: FunctionalAgentApprovalBoundary = spec.approvalBoundary;

  const demoDataRef: FunctionalAgentDemoDataRef = spec.demoDataRef;

  const run: FunctionalAgentRun = {
    id: nextRunId(),
    agentSlug: slug,
    status: "analyzing" as FunctionalAgentRunStatus,
    workflowSteps,
    evidenceItems,
    artifacts,
    proposedActions,
    approvalBoundary,
    demoDataRef,
    startedAt: now(),
    completedAt: null,
  };

  return run;
}

export function createDemoEvidenceItems(slug: string): FunctionalAgentEvidenceItem[] {
  const run = createDemoFunctionalRun(slug);
  return run?.evidenceItems ?? [];
}

export function createDemoArtifact(slug: string): FunctionalAgentArtifact {
  const run = createDemoFunctionalRun(slug);
  if (run && run.artifacts[0]) return run.artifacts[0];

  return {
    id: nextArtifactId(),
    type: "report",
    name: `Demo report for ${slug}`,
    description: "Auto-generated demo artifact fallback.",
    sections: [
      { id: `${nextArtifactId()}-s1`, title: "Summary", content: "Demo artifact.", contentType: "markdown", required: true, order: 1 },
      { id: `${nextArtifactId()}-s2`, title: "Limitations", content: "Not connected to live systems.", contentType: "markdown", required: false, order: 2 },
    ],
    evidenceRefs: [],
    readyForExport: false,
    createdAt: now(),
  };
}

export function createDemoProposedActions(slug: string): FunctionalAgentProposedAction[] {
  const run = createDemoFunctionalRun(slug);
  return run?.proposedActions ?? [];
}

export function getEvalFixtureForAgent(slug: string): string | null {
  const spec = ALL_FUNCTIONAL_SPECS.find((s) => s.slug === slug);
  if (!spec) return null;
  return spec.demoDataRef.fixtureDir;
}

export function listEvalFixtureScenarios(slug: string): string[] {
  const spec = ALL_FUNCTIONAL_SPECS.find((s) => s.slug === slug);
  if (!spec) return [];
  return spec.evalCases.map((c) => c.scenarioId);
}

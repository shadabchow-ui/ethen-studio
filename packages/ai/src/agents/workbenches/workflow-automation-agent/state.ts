export type ProcessStepStatus = "manual" | "automated" | "gate" | "trigger";
export type BottleneckSeverity = "low" | "medium" | "high" | "critical";
export type DeploymentStatus = "draft" | "review" | "approved" | "deployed";

export interface ProcessStep {
  id: string;
  name: string;
  description: string;
  stepType: ProcessStepStatus;
  estimatedDuration: number;
  responsibleRole: string;
  triggerEvent?: string;
  dependsOn: string[];
}

export interface ProcessBottleneck {
  id: string;
  stepId: string;
  severity: BottleneckSeverity;
  description: string;
  impact: string;
  recommendation: string;
}

export interface ApprovalGate {
  id: string;
  name: string;
  stepId: string;
  requiredApprovers: string[];
  condition: string;
  status: "active" | "pending" | "approved";
}

export interface AutomationFlow {
  id: string;
  name: string;
  description: string;
  trigger: string;
  steps: ProcessStep[];
  approvalGates: ApprovalGate[];
  integrationPoints: string[];
  deploymentStatus: DeploymentStatus;
}

export interface WfaEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  summary: string;
  linkedFlowIds: string[];
  artifactId?: string;
}

export interface WfaArtifact {
  id: string;
  type: string;
  title: string;
  createdAt: string;
  sourceAction: string;
  preview: string;
  content: string;
  linkedFlowIds: string[];
}

export interface WorkflowAutomationState {
  flows: AutomationFlow[];
  bottlenecks: ProcessBottleneck[];
  artifacts: WfaArtifact[];
  activityLog: WfaEvent[];
  selectedFlowId: string | null;
  expandedArtifactId: string | null;
}

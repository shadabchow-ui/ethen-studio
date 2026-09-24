import type { EmployeeRole, AutonomyLevel } from "@ethen/security/employees/types";
import type { ToolId, ToolRiskLevel } from "../tools/types";

/** How a workflow is triggered. */
export type WorkflowTriggerType = "manual" | "schedule" | "event" | "webhook";

/** Lifecycle status of a workflow definition. */
export type WorkflowStatus =
  | "draft"
  | "active"
  | "paused"
  | "archived"
  | "error";

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
  error: "Error",
};

/** A single workflow step. */
export interface WorkflowStep {
  id: string;
  order: number;
  name: string;
  description: string;
  toolId?: ToolId;
  actionType: "tool_call" | "approval_gate" | "report" | "notification" | "condition";
  required: boolean;
  config?: Record<string, unknown>;
}

/** An approval policy reference within a workflow. */
export interface WorkflowApprovalPolicyRef {
  policyId: string;
  appliesToSteps: string[];
  riskThreshold: ToolRiskLevel;
}

/** Output/report reference for a workflow. */
export interface WorkflowOutputRef {
  outputType: "report" | "draft" | "task_list" | "update" | "alert" | "artifact";
  templateId?: string;
  outputName: string;
  format?: "markdown" | "json" | "csv" | "text";
}

/** A workflow definition that ties together trigger, steps, approvals, and outputs. */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  ownerEmployeeId?: string;
  ownerTeamId?: string;
  roleMatch?: EmployeeRole[];
  trigger: WorkflowTriggerType;
  steps: WorkflowStep[];
  approvalPolicyRefs: WorkflowApprovalPolicyRef[];
  outputRef?: WorkflowOutputRef;
  status: WorkflowStatus;
  version: number;
  minAutonomyLevel: AutonomyLevel;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a new workflow definition. */
export interface CreateWorkflowInput {
  name: string;
  description: string;
  ownerEmployeeId?: string;
  ownerTeamId?: string;
  roleMatch?: EmployeeRole[];
  trigger: WorkflowTriggerType;
  steps: WorkflowStep[];
  approvalPolicyRefs?: WorkflowApprovalPolicyRef[];
  outputRef?: WorkflowOutputRef;
  minAutonomyLevel?: AutonomyLevel;
}

/** Validation result for a workflow definition. */
export interface WorkflowValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

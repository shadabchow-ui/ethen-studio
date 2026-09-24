export type TaskStatus =
  | "triage"
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface ProjectTask {
  id: string;
  title: string;
  description: string;
  owner: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  phase: string;
  progressPercent: number;
  blockedBy: string[];
  dependsOn: string[];
  unblocks: string[];
  nextAction: string;
  lastUpdated: string;
}

export type BlockerSeverity = "low" | "medium" | "high" | "critical";
export type BlockerStatus = "open" | "mitigating" | "waiting_on_decision" | "resolved";

export interface ProjectBlocker {
  id: string;
  title: string;
  severity: BlockerSeverity;
  owner: string;
  status: BlockerStatus;
  impact: string;
  resolutionPlan: string;
  linkedTaskIds: string[];
  decisionNeeded?: string;
  targetResolutionDate: string;
}

export type DependencyType = "blocks" | "depends_on" | "related" | "parent_child" | "precedes";
export type DependencyStatus = "active" | "resolved" | "at_risk";
export type DependencyRisk = "low" | "medium" | "high";

export interface ProjectDependency {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  type: DependencyType;
  status: DependencyStatus;
  risk: DependencyRisk;
  reason: string;
}

export type ActionPlanItemStatus = "planned" | "in_progress" | "done";

export interface ActionPlanItem {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  priority: TaskPriority;
  source: "task" | "blocker" | "dependency" | "manual";
  status: ActionPlanItemStatus;
  linkedTaskIds: string[];
  linkedBlockerIds: string[];
}

export type ProjectHealth = "on_track" | "at_risk" | "off_track";

export interface ProjectSummary {
  id: string;
  name: string;
  lead: string;
  sponsor: string;
  health: ProjectHealth;
  phase: string;
  targetDate: string;
  progressPercent: number;
  openBlockers: number;
  upcomingMilestone: string;
  lastUpdated: string;
}

export type ProjectArtifactType =
  | "action_plan"
  | "stakeholder_report"
  | "blocker_summary"
  | "risk_dependency_memo";

export interface ProjectArtifact {
  id: string;
  type: ProjectArtifactType;
  title: string;
  createdAt: string;
  sourceAction: string;
  preview: string;
  content: string;
  linkedTaskIds: string[];
  linkedBlockerIds: string[];
}

export interface ProjectActivityEvent {
  id: string;
  timestamp: string;
  actor: "user" | "project_work_agent";
  action: string;
  summary: string;
  linkedTaskIds: string[];
  linkedBlockerIds: string[];
  artifactId?: string;
}

export interface ProjectWorkState {
  project: ProjectSummary;
  tasks: ProjectTask[];
  blockers: ProjectBlocker[];
  dependencies: ProjectDependency[];
  actionPlanItems: ActionPlanItem[];
  artifacts: ProjectArtifact[];
  activityLog: ProjectActivityEvent[];
  selectedTaskId: string | null;
  selectedBlockerId: string | null;
  expandedArtifactId: string | null;
}

export { type ProjectWorkState as ProjectWorkStateType };

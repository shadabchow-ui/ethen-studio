export type AccountHealth = "healthy" | "watch" | "at_risk";
export type EngagementLevel = "high" | "medium" | "low";
export type PriorityLabel =
  | "close_risk"
  | "no_next_step"
  | "executive_gap"
  | "hot_signal"
  | "meeting_prep"
  | "draft_ready"
  | "crm_stale"
  | "renewal_risk"
  | "expansion_signal"
  | "re_engage";
export type FocusTab = "today" | "accounts" | "opportunities" | "meetings" | "drafts" | "crm_updates" | "settings";
export type SignalType =
  | "stakeholder_change"
  | "deal_risk"
  | "buying_signal"
  | "reply_received"
  | "meeting_completed"
  | "competitor_mention"
  | "budget_concern"
  | "timeline_pressure"
  | "crm_field_stale";

export interface CrmAccount {
  id: string;
  name: string;
  industry: string;
  tier: "strategic" | "growth" | "standard";
  owner: string;
  health: AccountHealth;
  healthReason: string;
  engagementScore: EngagementLevel;
  renewalDate: string;
  expansionPotential: string;
  lastActivityAt: string;
  sourceFreshness: string;
  pipelineStage: string;
  dealValue: number;
  lastContactDate: string;
  nextAction: string;
}

export interface CrmOpportunity {
  id: string;
  accountId: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: string;
  health: AccountHealth;
  warnings: string[];
  nextAction: string;
  confidence: number;
  owner: string;
  priorityLabel?: PriorityLabel;
  priorityScore?: number;
}

export interface CrmStakeholder {
  id: string;
  accountId: string;
  name: string;
  title: string;
  role: "champion" | "economic_buyer" | "technical_evaluator" | "technical_buyer" | "end_user" | "blocker" | "influencer" | "unknown";
  influence: "high" | "medium" | "low";
  engagementLevel: EngagementLevel;
  lastTouchedAt: string;
  isMissingRole: boolean;
}

export interface CrmMeeting {
  id: string;
  accountId: string;
  opportunityId?: string;
  subject: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  prepStatus: "not_prepared" | "prepared" | "completed";
  followUpStatus: "none" | "pending" | "completed";
  transcriptSummary?: string;
}

export interface CrmTimelineEvent {
  id: string;
  accountId: string;
  opportunityId?: string;
  type: "email" | "meeting" | "call" | "note" | "task" | "risk" | "commitment" | "signal" | "field_change" | "next_step_change" | "objection";
  occurredAt: string;
  summary: string;
  signals: string[];
  source: string;
  sourceUrlOrLabel: string;
  participants?: string[];
  evidenceIds?: string[];
}

export interface CrmEvidence {
  id: string;
  accountId: string;
  sourceType: "crm_field" | "email" | "meeting" | "call" | "note" | "task" | "case" | "web_signal" | "usage_signal";
  sourceLabel: string;
  summary: string;
  timestamp: string;
  confidence: number;
  permissionState?: "visible" | "restricted" | "redacted";
}

export interface CrmRecommendation {
  id: string;
  priority: PriorityLabel;
  priorityLabel: string;
  type: "account" | "opportunity" | "meeting";
  accountId: string;
  opportunityId?: string;
  title: string;
  reason: string;
  recommendedAction: string;
  confidence: number;
  evidenceIds: string[];
  freshness: string;
  status: "new" | "viewed" | "drafted" | "approved" | "dismissed";
}

export interface CrmArtifact {
  id: string;
  type: string;
  title: string;
  createdAt: string;
  sourceAction: string;
  preview: string;
  content: string;
  linkedAccountIds: string[];
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "edited" | "dismissed";

export interface CrmUpdateProposal {
  id: string;
  objectType: "account" | "opportunity" | "contact";
  objectId: string;
  fieldName: string;
  fieldLabel: string;
  currentValue: string;
  proposedValue: string;
  editedValue: string | null;
  reason: string;
  evidenceIds: string[];
  riskLevel: "low" | "medium" | "high";
  approvalStatus: ApprovalStatus;
  createdAt: string;
}

export interface CrmActivityEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  summary: string;
  linkedAccountIds: string[];
  artifactId?: string;
}

export type ReceiptActionType =
  | "account_brief_generated"
  | "draft_generated"
  | "proposal_submitted"
  | "proposal_approved"
  | "proposal_rejected"
  | "proposal_edited"
  | "engagement_scored"
  | "outreach_drafted"
  | "meeting_prepared"
  | "close_plan_created"
  | "update_packet_created"
  | "artifact_reviewed"
  | "artifact_approved"
  | "artifact_dismissed"
  | "receipt_saved"
  | "recommendation_dismissed"
  | "prioritized"
  | "risk_assessed";

export interface CrmActionReceipt {
  id: string;
  actionType: ReceiptActionType;
  title: string;
  accountId: string;
  accountName: string;
  inputsSummary: string;
  output: string;
  status: string;
  createdAt: string;
  proposalId?: string;
  artifactId?: string;
}

export type ArtifactReviewStatus = "unreviewed" | "reviewed" | "approved" | "dismissed";

export interface CrmOutreachDraft {
  id: string;
  recommendationId: string;
  accountId: string;
  goal: string;
  recipient: string;
  tone: string;
  cta: string;
  talkingPoints: string[];
  body: string;
  evidenceIds: string[];
  createdAt: string;
}

export interface CrmMeetingPrepPacket {
  id: string;
  meetingId: string;
  accountId: string;
  meetingGoal: string;
  accountContext: string;
  opportunityStatus: string;
  peopleInRoom: string[];
  risks: string[];
  likelyQuestions: string[];
  recommendedAsks: string[];
  followUpPlan: string;
  createdAt: string;
}

export interface CrmFollowUpPacket {
  id: string;
  meetingId: string;
  accountId: string;
  takeaways: string[];
  commitments: string[];
  followUpDraft: string;
  proposedCrmUpdates: string[];
  proposedTasks: string[];
  createdAt: string;
}

export interface CrmClosePlan {
  id: string;
  opportunityId: string;
  accountId: string;
  goal: string;
  milestones: string[];
  blockers: string[];
  stakeholders: string[];
  nextSteps: string[];
  ownerActions: string[];
  createdAt: string;
}

export interface CrmFieldUpdateEntry {
  field: string;
  currentValue: string;
  proposedValue: string;
  reason: string;
  evidenceIds: string[];
}

export interface CrmUpdatePacket {
  id: string;
  opportunityId: string;
  accountId: string;
  fieldUpdates: CrmFieldUpdateEntry[];
  createdAt: string;
}

/* ── Job 2: New types ── */

export type RiskSeverity = "high" | "medium" | "low";

export interface CrmRisk {
  id: string;
  title: string;
  severity: RiskSeverity;
  whyItMatters: string;
  evidence: string;
  mitigation: string;
  linkedAccountId: string;
  linkedOpportunityId?: string;
  evidenceIds: string[];
  actionable: boolean;
}

export interface CrmScoringInput {
  impactScore: number;
  urgencyScore: number;
  confidenceScore: number;
  engagementDeltaScore: number;
  effortReductionScore: number;
}

export interface CrmPriorityScore {
  accountId: string;
  totalScore: number;
  dimensions: CrmScoringInput;
  label: "high_priority" | "medium_priority" | "low_priority" | "standard";
}

export interface CrmEngagementState {
  accounts: CrmAccount[];
  opportunities: CrmOpportunity[];
  stakeholders: CrmStakeholder[];
  meetings: CrmMeeting[];
  timelineEvents: CrmTimelineEvent[];
  recommendations: CrmRecommendation[];
  evidence: CrmEvidence[];
  artifacts: CrmArtifact[];
  updateProposals: CrmUpdateProposal[];
  outreachDrafts: CrmOutreachDraft[];
  meetingPrepPackets: CrmMeetingPrepPacket[];
  followUpPackets: CrmFollowUpPacket[];
  closePlans: CrmClosePlan[];
  updatePackets: CrmUpdatePacket[];
  receipts: CrmActionReceipt[];
  activityLog: CrmActivityEvent[];
  artifactReviewStates: Record<string, ArtifactReviewStatus>;
  risks: CrmRisk[];
  scores: CrmPriorityScore[];
  selectedAccountId: string | null;
  selectedOpportunityId: string | null;
  selectedMeetingId: string | null;
  expandedArtifactId: string | null;
  activeFocusTab: FocusTab;
  activeComposerTab: string | null;
  drawerOpen: boolean;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string;
  demoLoaded: boolean;
}

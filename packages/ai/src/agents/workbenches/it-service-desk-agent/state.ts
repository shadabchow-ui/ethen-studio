export type TicketCategory = "incident" | "service_request" | "access_grant" | "asset_change" | "security" | "network" | "software" | "onboarding";
export type TicketPriority = "p1_critical" | "p2_high" | "p3_medium" | "p4_low";
export type TicketStatus = "open" | "in_review" | "escalated" | "resolved" | "closed";
export type EscalationLevel = "l1" | "l2" | "l3";

export type EvidenceSourceType =
  | "kb_article"
  | "resolved_ticket"
  | "runbook"
  | "service_catalog"
  | "asset"
  | "entitlement"
  | "live_status"
  | "policy";

export type EvidenceMatchStrength = "strong" | "medium" | "weak" | "no_match";

export type EvidenceFreshness = "fresh" | "stale_warning" | "unknown";

export type EvidencePermissionStatus = "allowed" | "masked" | "blocked";

export interface ItEvidence {
  id: string;
  sourceType: EvidenceSourceType;
  title: string;
  sourceLabel: string;
  confidence: number;
  matchStrength: EvidenceMatchStrength;
  freshness: EvidenceFreshness;
  permissionStatus: EvidencePermissionStatus;
  excerpt: string;
  supports: string[];
  conflictsWith: string[];
  updatedAt: string;
  owner: string;
  feedback?: "useful" | "wrong_source" | null;
}

export interface ItConversationMessage {
  id: string;
  from: string;
  role: "requester" | "agent" | "system";
  message: string;
  timestamp: string;
}

export type MatchStrength = "strong" | "medium" | "weak" | "no_match";
export type Freshness = "fresh" | "stale_warning" | "unknown";
export type PermissionStatus = "allowed" | "masked" | "blocked";

export interface ItEvidenceRef {
  id: string;
  type: "kb_article" | "similar_ticket" | "service_catalog" | "tool_check" | "policy";
  title: string;
  summary: string;
  confidence: number;
  sourceId: string;
}

export interface ItAuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  details: string;
}

export interface ItTicket {
  id: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  requester: string;
  assignee: string;
  affectedAsset: string;
  escalationLevel: EscalationLevel;
  createdAt: string;
  updatedAt: string;
  resolution?: string;
  linkedArtifactIds: string[];
  sla: string;
  confidence: number;
  requesterDepartment: string;
  requesterLocation: string;
  requesterRole: string;
  affectedAssetType: string;
  affectedAssetOwner: string;
  managedApps: string[];
  conversation: ItConversationMessage[];
  evidence: ItEvidenceRef[];
  auditLog: ItAuditEntry[];
  ragState?: EvidenceMatchStrength;
}

export interface ItServiceCatalogItem {
  id: string;
  serviceName: string;
  description: string;
  supportLevel: string;
  sla: string;
}

export interface ItKbArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  matchedTicketIds: string[];
}

export interface ItServiceDeskEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  summary: string;
  linkedTicketIds: string[];
  artifactId?: string;
}

export interface ItArtifact {
  id: string;
  type: string;
  title: string;
  createdAt: string;
  sourceAction: string;
  preview: string;
  content: string;
  linkedTicketIds: string[];
}

export type KbGapReason =
  | "repeated_unsupported"
  | "weak_evidence"
  | "no_evidence"
  | "wrong_source"
  | "stale_source";

export type KbGapStatus = "open" | "draft_created" | "assigned" | "reviewed" | "dismissed";

export interface KbGap {
  id: string;
  title: string;
  reason: KbGapReason;
  symptoms: string[];
  cause: string;
  draftResolutionSteps: string[];
  verificationSteps: string[];
  relatedTicketIds: string[];
  evidenceWeakness: string;
  suggestedOwner: string;
  suggestedArticleTitle: string;
  status: KbGapStatus;
  createdByTicketId: string;
  createdAt: string;
  updatedAt: string;
}

export type ProposedKbUpdateStatus = "draft" | "ready_for_review" | "approved" | "published";

export interface ProposedKbUpdate {
  id: string;
  kbGapId: string;
  articleTitle: string;
  symptoms: string[];
  cause: string;
  resolutionSteps: string[];
  verificationSteps: string[];
  relatedTicketIds: string[];
  sourceWeaknessReason: string;
  suggestedOwner: string;
  status: ProposedKbUpdateStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItServiceDeskState {
  tickets: ItTicket[];
  catalogItems: ItServiceCatalogItem[];
  kbArticles: ItKbArticle[];
  artifacts: ItArtifact[];
  activityLog: ItServiceDeskEvent[];
  selectedTicketId: string | null;
  expandedArtifactId: string | null;
  kbGaps: KbGap[];
  proposedKbUpdates: ProposedKbUpdate[];
}

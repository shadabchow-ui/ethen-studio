export type SupportTicketStatus = "open" | "pending" | "waiting_on_customer" | "escalated" | "resolved" | "closed";
export type SupportTicketPriority = "low" | "normal" | "high" | "critical";
export type SupportTicketChannel = "email" | "chat" | "phone" | "sms" | "social" | "portal";
export type SupportTicketSentiment = "positive" | "neutral" | "negative" | "angry" | "at_risk";
export type SupportSlaState = "healthy" | "at_risk" | "breached";
export type SupportAiConfidence = "high" | "medium" | "low" | "unknown";
export type SupportRiskLevel = "low" | "medium" | "high" | "critical";
export type SupportCustomerTier = "standard" | "premium" | "enterprise" | "vip";
export type SupportCustomerHealth = "healthy" | "watch" | "at_risk";
export type SupportSentimentTrend = "improving" | "stable" | "declining";

export interface SupportSlaInfo {
  state: SupportSlaState;
  dueAt: string;
  label: string;
}

export interface SupportAiInfo {
  summary: string;
  intent: string;
  confidence: SupportAiConfidence;
  suggestedPriority?: string;
  suggestedTeam?: string;
  riskReasons: string[];
  sources: string[];
}

export interface SupportTicket {
  id: string;
  subject: string;
  customerId: string;
  customerName: string;
  customerInitials: string;
  accountTier: SupportCustomerTier;
  channel: SupportTicketChannel;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  sentiment: SupportTicketSentiment;
  sla: SupportSlaInfo;
  assignee: string | null;
  team: string;
  tags: string[];
  lastMessage: string;
  lastActivity: string;
  unread: boolean;
  ai: SupportAiInfo;
  category: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  type: "customer" | "agent" | "internal_note" | "ai_summary" | "system_event";
  author: string;
  body: string;
  createdAt: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  company?: string;
  tier: SupportCustomerTier;
  health: SupportCustomerHealth;
  sentimentTrend: SupportSentimentTrend;
  previousTickets: number;
  openTickets: number;
  satisfaction?: number;
  preferredChannel?: string;
  language?: string;
  location?: string;
  timezone?: string;
  avatarInitials: string;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
  snippet: string;
  source: string;
  lastUpdated: string;
  matchScore: number;
  freshness: "fresh" | "stale_warning" | "stale";
  usageCount: number;
}

export interface AiSuggestion {
  id: string;
  ticketId: string;
  type: "reply" | "field_change" | "macro" | "kb_article" | "escalation" | "close_note";
  title: string;
  recommendation: string;
  confidence: SupportAiConfidence;
  risk: SupportRiskLevel;
  sources: string[];
  missingInfo?: string[];
  actions: string[];
}

export interface HistoryEvent {
  id: string;
  ticketId: string;
  ticketSubject: string;
  type: "ticket" | "interaction" | "escalation" | "refund" | "csat" | "note";
  summary: string;
  date: string;
  status: "resolved" | "closed" | "escalated" | "refunded" | "positive" | "negative";
}

export interface PropertyField {
  label: string;
  value: string;
  editable: boolean;
}

export interface CustomerSupportState {
  tickets: SupportTicket[];
  messages: TicketMessage[];
  customers: CustomerProfile[];
  knowledgeArticles: KnowledgeArticle[];
  aiSuggestions: AiSuggestion[];
  historyEvents: HistoryEvent[];
  selectedTicketId: string | null;
  activeView: string;
  rightPanelOpen: boolean;
  rightPanelTab: "ai-assist" | "customer" | "knowledge" | "history" | "properties";
}

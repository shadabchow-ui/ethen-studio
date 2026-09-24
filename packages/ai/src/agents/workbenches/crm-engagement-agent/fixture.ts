import type {
  CrmAccount, CrmEngagementState, CrmOpportunity, CrmMeeting, CrmStakeholder,
  CrmEvidence, CrmRisk, CrmTimelineEvent, CrmRecommendation, CrmPriorityScore,
} from "./state";

let _counter = 500;
function nid(prefix: string): string {
  _counter += 1;
  return `${prefix}-${_counter}`;
}

const ACCOUNTS_DATA: CrmAccount[] = [
  { id: nid("acc"), name: "Acme Corp", owner: "Sarah Chen", industry: "Manufacturing", tier: "strategic", health: "healthy", healthReason: "On track — recent engagement and next meeting scheduled.", engagementScore: "high", renewalDate: "2026-12-01", expansionPotential: "medium", lastActivityAt: "2026-06-14T10:00:00Z", sourceFreshness: "synced_12m_ago", pipelineStage: "Negotiation", dealValue: 250000, lastContactDate: "2026-06-14", nextAction: "Send revised proposal" },
  { id: nid("acc"), name: "Nexus Technologies", owner: "James Liu", industry: "Technology", tier: "growth", health: "at_risk", healthReason: "No response in 4 weeks and no next meeting scheduled.", engagementScore: "low", renewalDate: "2026-09-15", expansionPotential: "high", lastActivityAt: "2026-05-20T09:00:00Z", sourceFreshness: "synced_1h_ago", pipelineStage: "Discovery", dealValue: 180000, lastContactDate: "2026-05-20", nextAction: "Schedule follow-up demo" },
  { id: nid("acc"), name: "Blue Ridge Health", owner: "Diana Reyes", industry: "Healthcare", tier: "strategic", health: "healthy", healthReason: "Active evaluation with compliance team engaged.", engagementScore: "medium", renewalDate: "2027-03-01", expansionPotential: "high", lastActivityAt: "2026-06-10T11:00:00Z", sourceFreshness: "synced_30m_ago", pipelineStage: "Proposal", dealValue: 420000, lastContactDate: "2026-06-10", nextAction: "Review compliance requirements" },
  { id: nid("acc"), name: "Vertex Financial", owner: "Priya Kapoor", industry: "Finance", tier: "standard", health: "watch", healthReason: "No contact in 60+ days. Re-engagement campaign needed.", engagementScore: "low", renewalDate: "", expansionPotential: "low", lastActivityAt: "2026-04-15T08:00:00Z", sourceFreshness: "synced_2h_ago", pipelineStage: "Lead", dealValue: 95000, lastContactDate: "2026-04-15", nextAction: "Re-engagement campaign" },
  { id: nid("acc"), name: "Omni Retail Group", owner: "Luis Morales", industry: "Retail", tier: "growth", health: "at_risk", healthReason: "Deal slipped twice and single-threaded on champion.", engagementScore: "medium", renewalDate: "2026-11-01", expansionPotential: "medium", lastActivityAt: "2026-05-28T15:30:00Z", sourceFreshness: "synced_45m_ago", pipelineStage: "Evaluation", dealValue: 310000, lastContactDate: "2026-05-28", nextAction: "Provide technical deep-dive" },
  { id: nid("acc"), name: "Pacific Data Systems", owner: "Fatima Al-Rashid", industry: "Technology", tier: "strategic", health: "healthy", healthReason: "Onboarding progressing well with executive sponsorship.", engagementScore: "high", renewalDate: "2027-06-01", expansionPotential: "high", lastActivityAt: "2026-06-16T09:00:00Z", sourceFreshness: "synced_5m_ago", pipelineStage: "Onboarding", dealValue: 150000, lastContactDate: "2026-06-16", nextAction: "Finalize onboarding schedule" },
  { id: nid("acc"), name: "CodeCraft Labs", owner: "Anika Patel", industry: "Technology", tier: "standard", health: "watch", healthReason: "Pilot usage declining. Executive champion not re-engaged.", engagementScore: "low", renewalDate: "2026-08-01", expansionPotential: "medium", lastActivityAt: "2026-05-10T14:00:00Z", sourceFreshness: "synced_1d_ago", pipelineStage: "Pilot", dealValue: 75000, lastContactDate: "2026-05-10", nextAction: "Executive check-in call" },
  { id: nid("acc"), name: "Zenith Global Services", owner: "Marcus Webb", industry: "Professional Services", tier: "growth", health: "healthy", healthReason: "Strong engagement across multiple stakeholders. Expansion plan in discussion.", engagementScore: "high", renewalDate: "2027-01-15", expansionPotential: "high", lastActivityAt: "2026-06-15T16:00:00Z", sourceFreshness: "synced_15m_ago", pipelineStage: "Negotiation", dealValue: 380000, lastContactDate: "2026-06-15", nextAction: "Prepare expansion proposal" },
];

const EVIDENCE_TEMPLATES = [
  { sourceType: "email" as const, label: "Email thread — CTO reply", summary: "CTO replied to renewal thread requesting security review timing.", confidence: 92, perm: "visible" as const },
  { sourceType: "meeting" as const, label: "Meeting summary — expansion interest", summary: "Customer confirmed expansion interest and asked for SOC2 documentation.", confidence: 95, perm: "visible" as const },
  { sourceType: "crm_field" as const, label: "Opportunity close date", summary: "Close date changed — slipped 15 days.", confidence: 98, perm: "visible" as const },
  { sourceType: "email" as const, label: "Email thread — no response", summary: "Last customer email was 14 days ago.", confidence: 80, perm: "visible" as const },
  { sourceType: "crm_field" as const, label: "Close date history", summary: "Close date has slipped twice this quarter.", confidence: 97, perm: "visible" as const },
  { sourceType: "call" as const, label: "Call transcript", summary: "Customer mentioned competitor evaluation.", confidence: 78, perm: "visible" as const },
  { sourceType: "meeting" as const, label: "Meeting notes — compliance", summary: "Compliance review completed. Security questionnaire returned.", confidence: 93, perm: "visible" as const },
  { sourceType: "note" as const, label: "CRM note", summary: "No next meeting scheduled despite close date approaching.", confidence: 88, perm: "visible" as const },
  { sourceType: "email" as const, label: "Email thread — pricing", summary: "Customer requested pricing for additional 500 seats.", confidence: 91, perm: "visible" as const },
  { sourceType: "usage_signal" as const, label: "Product usage data", summary: "Daily active users declined 23% month-over-month.", confidence: 76, perm: "visible" as const },
  { sourceType: "crm_field" as const, label: "Next step field", summary: "CRM next step field is empty for 30+ days.", confidence: 95, perm: "visible" as const },
  { sourceType: "meeting" as const, label: "Kickoff meeting", summary: "Executive sponsor attended kickoff and committed to timeline.", confidence: 94, perm: "visible" as const },
  { sourceType: "crm_field" as const, label: "Stakeholder field", summary: "Contact roles missing for 3 of 5 known stakeholders.", confidence: 82, perm: "restricted" as const },
];

function linkEvidenceToAccount(accounts: CrmAccount[], templates: typeof EVIDENCE_TEMPLATES, indices: number[]): CrmEvidence[] {
  return accounts.flatMap((acct, ai) =>
    indices.map((ti, order) => {
      const t = templates[(ti + order * 3) % templates.length];
      return {
        id: nid("ev"),
        accountId: acct.id,
        sourceType: t.sourceType,
        sourceLabel: `${t.label} — ${acct.name}`,
        summary: t.summary,
        timestamp: new Date(Date.now() - order * 86400000 * 3).toISOString(),
        confidence: t.confidence,
        permissionState: t.perm,
      };
    })
  );
}

export function createInitialCrmEngagementState(focusTab?: string): CrmEngagementState {
  const accounts = ACCOUNTS_DATA.map((a) => ({ ...a }));

  const opportunities: CrmOpportunity[] = [
    { id: nid("opp"), accountId: accounts[0].id, name: "Acme Corp — Renewal Expansion", stage: "Negotiation", amount: 250000, closeDate: "2026-07-15", health: "healthy", warnings: [], nextAction: "Send revised proposal", confidence: 84, owner: "Sarah Chen" },
    { id: nid("opp"), accountId: accounts[0].id, name: "Acme Corp — New Module Upsell", stage: "Discovery", amount: 120000, closeDate: "2026-09-01", health: "healthy", warnings: [], nextAction: "Schedule discovery call", confidence: 70, owner: "Sarah Chen" },
    { id: nid("opp"), accountId: accounts[1].id, name: "Nexus Technologies — Platform Deal", stage: "Discovery", amount: 180000, closeDate: "2026-08-01", health: "at_risk", warnings: ["No executive sponsor", "No response in 14 days"], nextAction: "Schedule follow-up demo", confidence: 62, owner: "James Liu" },
    { id: nid("opp"), accountId: accounts[1].id, name: "Nexus — Support Renewal", stage: "Closed Won", amount: 45000, closeDate: "2026-06-01", health: "healthy", warnings: [], nextAction: "Onboarding call", confidence: 100, owner: "James Liu" },
    { id: nid("opp"), accountId: accounts[2].id, name: "Blue Ridge Health — Compliance Suite", stage: "Proposal", amount: 420000, closeDate: "2026-09-01", health: "healthy", warnings: [], nextAction: "Review compliance requirements", confidence: 78, owner: "Diana Reyes" },
    { id: nid("opp"), accountId: accounts[2].id, name: "Blue Ridge — Analytics Add-on", stage: "Qualification", amount: 85000, closeDate: "2026-10-15", health: "healthy", warnings: [], nextAction: "Product demo", confidence: 65, owner: "Diana Reyes" },
    { id: nid("opp"), accountId: accounts[3].id, name: "Vertex Financial — Starter Package", stage: "Lead", amount: 95000, closeDate: "2026-10-01", health: "watch", warnings: ["Stale lead", "No activity in 60 days"], nextAction: "Re-engagement campaign", confidence: 35, owner: "Priya Kapoor" },
    { id: nid("opp"), accountId: accounts[3].id, name: "Vertex — Compliance Audit Tool", stage: "Lead", amount: 55000, closeDate: "2026-11-01", health: "watch", warnings: ["Cold lead"], nextAction: "Initial outreach", confidence: 20, owner: "Priya Kapoor" },
    { id: nid("opp"), accountId: accounts[4].id, name: "Omni Retail — Omnichannel Platform", stage: "Evaluation", amount: 310000, closeDate: "2026-08-15", health: "at_risk", warnings: ["Competitor mentioned", "Technical evaluation stalled"], nextAction: "Provide technical deep-dive", confidence: 55, owner: "Luis Morales" },
    { id: nid("opp"), accountId: accounts[4].id, name: "Omni Retail — POS Integration", stage: "Discovery", amount: 95000, closeDate: "2026-12-01", health: "healthy", warnings: [], nextAction: "Initial discovery call", confidence: 72, owner: "Luis Morales" },
    { id: nid("opp"), accountId: accounts[5].id, name: "Pacific Data Systems — Onboarding", stage: "Onboarding", amount: 150000, closeDate: "2026-07-30", health: "healthy", warnings: [], nextAction: "Finalize onboarding schedule", confidence: 90, owner: "Fatima Al-Rashid" },
    { id: nid("opp"), accountId: accounts[6].id, name: "CodeCraft Labs — Pilot Program", stage: "Pilot", amount: 75000, closeDate: "2026-08-15", health: "watch", warnings: ["Usage declining", "No exec engagement"], nextAction: "Executive check-in call", confidence: 48, owner: "Anika Patel" },
    { id: nid("opp"), accountId: accounts[7].id, name: "Zenith Global — Enterprise Agreement", stage: "Negotiation", amount: 380000, closeDate: "2026-08-01", health: "healthy", warnings: [], nextAction: "Prepare expansion proposal", confidence: 88, owner: "Marcus Webb" },
    { id: nid("opp"), accountId: accounts[7].id, name: "Zenith Global — Consulting Add-on", stage: "Discovery", amount: 95000, closeDate: "2026-09-15", health: "healthy", warnings: [], nextAction: "Scope consulting engagement", confidence: 76, owner: "Marcus Webb" },
  ];

  const stakeholders: CrmStakeholder[] = [
    { id: nid("stk"), accountId: accounts[0].id, name: "Tom Chen", title: "CTO", role: "economic_buyer", influence: "high", engagementLevel: "high", lastTouchedAt: "2026-06-14", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[0].id, name: "Lisa Park", title: "VP Engineering", role: "technical_buyer", influence: "high", engagementLevel: "medium", lastTouchedAt: "2026-06-10", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[0].id, name: "Dan Wu", title: "Engineering Manager", role: "end_user", influence: "medium", engagementLevel: "high", lastTouchedAt: "2026-06-12", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[1].id, name: "Raj Mehta", title: "IT Director", role: "technical_buyer", influence: "medium", engagementLevel: "low", lastTouchedAt: "2026-05-20", isMissingRole: true },
    { id: nid("stk"), accountId: accounts[1].id, name: "Sofia Ramirez", title: "VP Product", role: "economic_buyer", influence: "high", engagementLevel: "low", lastTouchedAt: "2026-05-18", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[1].id, name: "Alex Kim", title: "Security Analyst", role: "technical_evaluator", influence: "low", engagementLevel: "medium", lastTouchedAt: "2026-05-22", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[2].id, name: "Karen White", title: "Chief Compliance Officer", role: "economic_buyer", influence: "high", engagementLevel: "high", lastTouchedAt: "2026-06-10", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[2].id, name: "John Masters", title: "VP IT Operations", role: "technical_buyer", influence: "high", engagementLevel: "medium", lastTouchedAt: "2026-06-08", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[2].id, name: "Elena Petrova", title: "Data Privacy Officer", role: "influencer", influence: "medium", engagementLevel: "high", lastTouchedAt: "2026-06-09", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[3].id, name: "Gary Adams", title: "CFO", role: "economic_buyer", influence: "high", engagementLevel: "low", lastTouchedAt: "2026-04-10", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[3].id, name: "Nancy Okafor", title: "Procurement Manager", role: "influencer", influence: "medium", engagementLevel: "low", lastTouchedAt: "2026-04-12", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[4].id, name: "Mike Torres", title: "VP Retail Operations", role: "economic_buyer", influence: "high", engagementLevel: "medium", lastTouchedAt: "2026-05-28", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[4].id, name: "Rachel Green", title: "Director of Digital", role: "influencer", influence: "medium", engagementLevel: "high", lastTouchedAt: "2026-05-30", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[4].id, name: "Tom Harrison", title: "IT Architect", role: "technical_evaluator", influence: "medium", engagementLevel: "medium", lastTouchedAt: "2026-05-25", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[5].id, name: "Bruce Wayne", title: "CIO", role: "economic_buyer", influence: "high", engagementLevel: "high", lastTouchedAt: "2026-06-15", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[5].id, name: "Selina Kyle", title: "VP Data Engineering", role: "technical_buyer", influence: "high", engagementLevel: "high", lastTouchedAt: "2026-06-16", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[6].id, name: "Raj Patel", title: "VP Engineering", role: "technical_buyer", influence: "high", engagementLevel: "low", lastTouchedAt: "2026-05-08", isMissingRole: true },
    { id: nid("stk"), accountId: accounts[6].id, name: "Maria Gomez", title: "Product Manager", role: "champion", influence: "medium", engagementLevel: "medium", lastTouchedAt: "2026-05-10", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[7].id, name: "David Park", title: "COO", role: "economic_buyer", influence: "high", engagementLevel: "high", lastTouchedAt: "2026-06-15", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[7].id, name: "Jennifer Lee", title: "VP Professional Services", role: "technical_buyer", influence: "high", engagementLevel: "high", lastTouchedAt: "2026-06-14", isMissingRole: false },
    { id: nid("stk"), accountId: accounts[7].id, name: "Chris Martin", title: "Director of Operations", role: "end_user", influence: "medium", engagementLevel: "medium", lastTouchedAt: "2026-06-13", isMissingRole: false },
  ];

  const meetings: CrmMeeting[] = [
    { id: nid("meet"), accountId: accounts[0].id, opportunityId: opportunities[0].id, subject: "Acme Corp — Renewal Review", startTime: "2026-06-18T10:00:00Z", endTime: "2026-06-18T11:00:00Z", attendees: ["Sarah Chen", "Tom Chen", "Lisa Park"], prepStatus: "not_prepared", followUpStatus: "none" },
    { id: nid("meet"), accountId: accounts[2].id, opportunityId: opportunities[4].id, subject: "Blue Ridge Health — Compliance Deep-Dive", startTime: "2026-06-19T14:00:00Z", endTime: "2026-06-19T15:30:00Z", attendees: ["Diana Reyes", "Karen White", "External Counsel"], prepStatus: "not_prepared", followUpStatus: "none" },
    { id: nid("meet"), accountId: accounts[1].id, opportunityId: opportunities[2].id, subject: "Nexus Technologies — Security Review Call", startTime: "2026-06-12T13:00:00Z", endTime: "2026-06-12T13:45:00Z", attendees: ["James Liu", "Raj Mehta"], prepStatus: "completed", followUpStatus: "pending", transcriptSummary: "Security team needs compliance documentation before procurement can proceed." },
    { id: nid("meet"), accountId: accounts[4].id, opportunityId: opportunities[8].id, subject: "Omni Retail — Technical Deep-Dive", startTime: "2026-06-20T09:00:00Z", endTime: "2026-06-20T10:30:00Z", attendees: ["Luis Morales", "Mike Torres", "Engineering Team"], prepStatus: "not_prepared", followUpStatus: "none" },
    { id: nid("meet"), accountId: accounts[7].id, opportunityId: opportunities[12].id, subject: "Zenith Global — Enterprise Negotiation", startTime: "2026-06-22T11:00:00Z", endTime: "2026-06-22T12:00:00Z", attendees: ["Marcus Webb", "David Park", "Jennifer Lee"], prepStatus: "not_prepared", followUpStatus: "none" },
    { id: nid("meet"), accountId: accounts[5].id, opportunityId: opportunities[10].id, subject: "Pacific Data Systems — Onboarding Review", startTime: "2026-06-17T09:00:00Z", endTime: "2026-06-17T10:00:00Z", attendees: ["Fatima Al-Rashid", "Bruce Wayne", "Selina Kyle"], prepStatus: "prepared", followUpStatus: "none" },
  ];

  const evidence: CrmEvidence[] = linkEvidenceToAccount(accounts, EVIDENCE_TEMPLATES, [0, 1, 2, 3, 4, 5]);

  const timelineEvents: CrmTimelineEvent[] = [
    { id: nid("tl"), accountId: accounts[0].id, opportunityId: opportunities[0].id, type: "email", occurredAt: "2026-06-14T09:00:00Z", summary: "CTO replied to renewal thread requesting security review timing.", signals: ["buying_signal"], source: "email", sourceUrlOrLabel: "Email thread #T-3842", participants: ["Sarah Chen", "Tom Chen"], evidenceIds: [evidence[0].id] },
    { id: nid("tl"), accountId: accounts[0].id, opportunityId: opportunities[0].id, type: "meeting", occurredAt: "2026-06-10T14:00:00Z", summary: "Renewal planning meeting — discussed expansion options.", signals: ["buying_signal"], source: "calendar", sourceUrlOrLabel: "Meeting #M-203", participants: ["Sarah Chen", "Tom Chen", "Lisa Park"] },
    { id: nid("tl"), accountId: accounts[1].id, opportunityId: opportunities[2].id, type: "email", occurredAt: "2026-05-20T10:00:00Z", summary: "Last email from customer — no response to follow-up sent 7 days ago.", signals: ["deal_risk"], source: "email", sourceUrlOrLabel: "Email thread #N-112", participants: ["James Liu", "Raj Mehta"] },
    { id: nid("tl"), accountId: accounts[1].id, type: "note", occurredAt: "2026-05-25T16:00:00Z", summary: "James noted: No executive sponsor identified for Nexus deal.", signals: ["deal_risk", "stakeholder_change"], source: "crm", sourceUrlOrLabel: "CRM Note", evidenceIds: [evidence[1].id] },
    { id: nid("tl"), accountId: accounts[2].id, opportunityId: opportunities[4].id, type: "meeting", occurredAt: "2026-06-10T15:00:00Z", summary: "Compliance review meeting — SOC2 documentation requested.", signals: ["buying_signal"], source: "calendar", sourceUrlOrLabel: "Meeting #M-207", participants: ["Diana Reyes", "Karen White"] },
    { id: nid("tl"), accountId: accounts[2].id, opportunityId: opportunities[4].id, type: "field_change", occurredAt: "2026-06-08T12:00:00Z", summary: "Close date updated to September 1 after compliance delay.", signals: ["timeline_pressure"], source: "crm", sourceUrlOrLabel: "Opportunity history" },
    { id: nid("tl"), accountId: accounts[3].id, type: "email", occurredAt: "2026-04-15T08:00:00Z", summary: "Last outreach email sent to Vertex Financial — no reply.", signals: ["deal_risk", "crm_field_stale"], source: "email", sourceUrlOrLabel: "Email thread #V-045" },
    { id: nid("tl"), accountId: accounts[4].id, opportunityId: opportunities[8].id, type: "call", occurredAt: "2026-05-28T15:30:00Z", summary: "Customer mentioned competitor evaluation during discovery call.", signals: ["competitor_mention", "deal_risk"], source: "call", sourceUrlOrLabel: "Call transcript #C-891", participants: ["Luis Morales", "Mike Torres"], evidenceIds: [evidence[5].id] },
    { id: nid("tl"), accountId: accounts[4].id, opportunityId: opportunities[8].id, type: "risk", occurredAt: "2026-06-01T10:00:00Z", summary: "Close date slipped from May to July for omnichannel deal.", signals: ["timeline_pressure"], source: "crm", sourceUrlOrLabel: "Opportunity history" },
    { id: nid("tl"), accountId: accounts[5].id, opportunityId: opportunities[10].id, type: "meeting", occurredAt: "2026-06-16T09:00:00Z", summary: "Onboarding kickoff with executive sponsor attendance.", signals: ["buying_signal"], source: "calendar", sourceUrlOrLabel: "Meeting #M-212", participants: ["Fatima Al-Rashid", "Bruce Wayne", "Selina Kyle"] },
    { id: nid("tl"), accountId: accounts[5].id, type: "task", occurredAt: "2026-06-15T11:00:00Z", summary: "Onboarding schedule finalized and shared with customer.", signals: [], source: "crm", sourceUrlOrLabel: "Task #T-401" },
    { id: nid("tl"), accountId: accounts[6].id, opportunityId: opportunities[11].id, type: "email", occurredAt: "2026-05-10T14:00:00Z", summary: "Executive check-in email sent — no response from VP Engineering.", signals: ["deal_risk", "stakeholder_change"], source: "email", sourceUrlOrLabel: "Email thread #C-078", participants: ["Anika Patel", "Raj Patel"] },
    { id: nid("tl"), accountId: accounts[6].id, type: "signal", occurredAt: "2026-05-15T12:00:00Z", summary: "DAU declined 23% MoM for CodeCraft pilot accounts.", signals: ["budget_concern"], source: "product_analytics", sourceUrlOrLabel: "Usage dashboard" },
    { id: nid("tl"), accountId: accounts[7].id, opportunityId: opportunities[12].id, type: "meeting", occurredAt: "2026-06-15T16:00:00Z", summary: "Enterprise negotiation session — expansion plan discussed.", signals: ["buying_signal", "budget_concern"], source: "calendar", sourceUrlOrLabel: "Meeting #M-218", participants: ["Marcus Webb", "David Park", "Jennifer Lee"] },
    { id: nid("tl"), accountId: accounts[7].id, opportunityId: opportunities[13].id, type: "email", occurredAt: "2026-06-14T11:00:00Z", summary: "COO confirmed interest in consulting add-on scope.", signals: ["buying_signal"], source: "email", sourceUrlOrLabel: "Email thread #Z-227", participants: ["Marcus Webb", "David Park"] },
    { id: nid("tl"), accountId: accounts[0].id, opportunityId: opportunities[0].id, type: "next_step_change", occurredAt: "2026-06-12T09:00:00Z", summary: "Next action updated to 'Send revised proposal' after pricing discussion.", signals: [], source: "crm", sourceUrlOrLabel: "CRM activity history" },
  ];

  const recommendations: CrmRecommendation[] = [
    { id: nid("rec"), priority: "close_risk", priorityLabel: "Close Risk", type: "opportunity", accountId: accounts[0].id, opportunityId: opportunities[0].id, title: "No next meeting scheduled for Acme Corp", reason: "Renewal closes July 15 but no meeting is scheduled.", recommendedAction: "Propose a specific date for the renewal review.", confidence: 94, evidenceIds: [evidence[7].id, evidence[0].id], freshness: "2h", status: "new" },
    { id: nid("rec"), priority: "re_engage", priorityLabel: "Re-engage", type: "account", accountId: accounts[1].id, title: "Nexus Technologies has gone dark", reason: "No response in 14 days after follow-up.", recommendedAction: "Try phone call and reference prior positive discussion.", confidence: 88, evidenceIds: [evidence[3].id], freshness: "1h", status: "new" },
    { id: nid("rec"), priority: "executive_gap", priorityLabel: "Executive Gap", type: "opportunity", accountId: accounts[1].id, opportunityId: opportunities[2].id, title: "No executive sponsor identified for Nexus deal", reason: "Deal lacks executive sponsorship which is a strong predictor of closure.", recommendedAction: "Ask champion for VP intro. Send executive value brief.", confidence: 82, evidenceIds: [evidence[1].id, evidence[4].id], freshness: "3h", status: "new" },
    { id: nid("rec"), priority: "meeting_prep", priorityLabel: "Meeting Prep", type: "meeting", accountId: accounts[0].id, opportunityId: opportunities[0].id, title: "Prepare for Acme Corp renewal review", reason: "Renewal review meeting is tomorrow with CTO and VP Engineering.", recommendedAction: "Review proposal terms, prepare expansion options, update account brief.", confidence: 96, evidenceIds: [evidence[0].id], freshness: "30m", status: "new" },
    { id: nid("rec"), priority: "draft_ready", priorityLabel: "Draft Ready", type: "opportunity", accountId: accounts[2].id, opportunityId: opportunities[4].id, title: "Draft compliance follow-up for Blue Ridge Health", reason: "SOC2 documentation was requested. Draft response for Diana to review.", recommendedAction: "Write compliance summary email with documentation attached.", confidence: 79, evidenceIds: [evidence[6].id], freshness: "4h", status: "new" },
    { id: nid("rec"), priority: "hot_signal", priorityLabel: "Hot Signal", type: "account", accountId: accounts[7].id, title: "Expansion signal from Zenith Global", reason: "COO confirmed interest in consulting add-on alongside enterprise agreement.", recommendedAction: "Draft consulting add-on SOW for negotiation.", confidence: 91, evidenceIds: [evidence[1].id], freshness: "15m", status: "new" },
    { id: nid("rec"), priority: "close_risk", priorityLabel: "Close Risk", type: "opportunity", accountId: accounts[4].id, opportunityId: opportunities[8].id, title: "Omni Retail evaluation stalled with competitor active", reason: "Competitor mentioned during call and tech evaluation has no next step.", recommendedAction: "Prepare competitive differentiation brief and schedule architecture review.", confidence: 85, evidenceIds: [evidence[5].id, evidence[4].id], freshness: "1d", status: "new" },
    { id: nid("rec"), priority: "renewal_risk", priorityLabel: "Renewal Risk", type: "account", accountId: accounts[6].id, title: "CodeCraft Labs pilot usage declining", reason: "DAU declined 23% and exec sponsor not re-engaged.", recommendedAction: "Schedule executive check-in and review pilot success criteria.", confidence: 76, evidenceIds: [evidence[9].id], freshness: "6h", status: "viewed" },
    { id: nid("rec"), priority: "crm_stale", priorityLabel: "CRM Stale", type: "account", accountId: accounts[3].id, title: "Vertex Financial data is 60 days stale", reason: "No activity in 60 days and next step field is empty.", recommendedAction: "Launch re-engagement campaign and review CRM data freshness.", confidence: 72, evidenceIds: [evidence[10].id, evidence[3].id], freshness: "1d", status: "new" },
    { id: nid("rec"), priority: "expansion_signal", priorityLabel: "Expansion Signal", type: "account", accountId: accounts[0].id, title: "Acme Corp expansion opportunity detected", reason: "Customer requested pricing for additional 500 seats during renewal.", recommendedAction: "Incorporate expansion pricing in revised proposal.", confidence: 87, evidenceIds: [evidence[8].id], freshness: "1h", status: "drafted" },
    { id: nid("rec"), priority: "no_next_step", priorityLabel: "No Next Step", type: "opportunity", accountId: accounts[1].id, opportunityId: opportunities[2].id, title: "Nexus pipeline stage is stuck at Discovery", reason: "No movement from Discovery in 30+ days. No demo scheduled.", recommendedAction: "Schedule executive demo with decision-makers.", confidence: 68, evidenceIds: [evidence[10].id], freshness: "2d", status: "new" },
  ];

  const risks: CrmRisk[] = [
    { id: nid("risk"), title: "No executive sponsor", severity: "high", whyItMatters: "Deal closes soon and no VP+ contact has engaged. Executive sponsorship is a strong predictor of deal closure.", evidence: "Call transcript, CRM contacts, email thread.", mitigation: "Ask champion for VP intro. Send executive value brief.", linkedAccountId: accounts[0].id, evidenceIds: [evidence[0].id], actionable: true },
    { id: nid("risk"), title: "No next meeting scheduled", severity: "high", whyItMatters: "Without a scheduled next meeting, deal momentum stalls. Close date is approaching.", evidence: "CRM next step field empty for 14+ days.", mitigation: "Propose specific dates for follow-up. Draft meeting invitation.", linkedAccountId: accounts[0].id, evidenceIds: [evidence[7].id], actionable: true },
    { id: nid("risk"), title: "No customer response in 14 days", severity: "medium", whyItMatters: "Silence may indicate lost priority or competitor engagement.", evidence: "Last email reply was 14 days ago. Follow-up sent 7 days ago with no response.", mitigation: "Try alternate channel (phone call). Reference prior positive discussion.", linkedAccountId: accounts[1].id, evidenceIds: [evidence[3].id], actionable: true },
    { id: nid("risk"), title: "Close date slipped twice", severity: "high", whyItMatters: "Multiple slips indicate deal may not close this quarter.", evidence: "Close date history: May 15 \u2192 June 15 \u2192 July 15.", mitigation: "Review deal stages with customer. Identify blockers.", linkedAccountId: accounts[4].id, evidenceIds: [evidence[2].id], actionable: true },
    { id: nid("risk"), title: "Single-threaded deal", severity: "medium", whyItMatters: "Only one active stakeholder. If champion leaves, deal is at risk.", evidence: "CRM contacts show only one active stakeholder.", mitigation: "Map stakeholder landscape. Request introductions to decision-makers.", linkedAccountId: accounts[1].id, evidenceIds: [evidence[4].id], actionable: true },
    { id: nid("risk"), title: "Competitor mentioned", severity: "medium", whyItMatters: "Customer is actively evaluating competitors.", evidence: "Customer mentioned competitor during discovery call.", mitigation: "Prepare competitive differentiation brief.", linkedAccountId: accounts[4].id, evidenceIds: [evidence[5].id], actionable: true },
    { id: nid("risk"), title: "Stale next step", severity: "low", whyItMatters: "CRM next step field has not been updated in 30+ days.", evidence: "CRM next step field unchanged.", mitigation: "Review and update next step based on latest engagement.", linkedAccountId: accounts[3].id, evidenceIds: [evidence[10].id], actionable: true },
    { id: nid("risk"), title: "Usage decline signal", severity: "medium", whyItMatters: "23% decline in daily active users month-over-month may signal churn risk.", evidence: "Product usage analytics show steady decline.", mitigation: "Schedule customer health check.", linkedAccountId: accounts[6].id, evidenceIds: [evidence[9].id], actionable: true },
    { id: nid("risk"), title: "Expansion timeline pressure", severity: "low", whyItMatters: "Zenith expansion needs to close by quarter end to hit revenue targets.", evidence: "Discussions progressing but no signed SOW yet.", mitigation: "Fast-track consulting add-on SOW and pricing.", linkedAccountId: accounts[7].id, evidenceIds: [evidence[1].id], actionable: true },
  ];

  const scores: CrmPriorityScore[] = accounts.map((a, i) => ({
    accountId: a.id,
    label: i < 2 ? "high_priority" : i < 5 ? "medium_priority" : i < 7 ? "low_priority" : "standard" as const,
    totalScore: Math.max(10, 100 - i * 10),
    dimensions: {
      impactScore: Math.max(10, 100 - i * 8),
      urgencyScore: Math.max(5, 100 - i * 12),
      confidenceScore: Math.max(20, 100 - i * 6),
      engagementDeltaScore: Math.max(5, 100 - i * 14),
      effortReductionScore: Math.max(10, 100 - i * 10),
    },
  }));

  return {
    accounts,
    opportunities,
    stakeholders,
    meetings,
    timelineEvents,
    recommendations,
    evidence,
    artifacts: [],
    updateProposals: [],
    outreachDrafts: [],
    meetingPrepPackets: [],
    followUpPackets: [],
    closePlans: [],
    updatePackets: [],
    receipts: [],
    activityLog: [],
    artifactReviewStates: {},
    risks,
    scores,
    selectedAccountId: null,
    selectedOpportunityId: null,
    selectedMeetingId: null,
    expandedArtifactId: null,
    activeFocusTab: "today",
    activeComposerTab: null,
    drawerOpen: false,
    isLoading: false,
    hasError: false,
    errorMessage: "",
    demoLoaded: true,
  };
}

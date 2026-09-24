import type { ItTicket, ItServiceCatalogItem, ItKbArticle, ItServiceDeskState, ItEvidence, KbGap, ProposedKbUpdate } from "./state";

let _tCounter = 700;
let _cCounter = 100;
let _kCounter = 200;
let _evCounter = 300;
let _gCounter = 500;

function tid(): string { _tCounter += 1; return `ticket-${_tCounter}`; }
function cid(): string { _cCounter += 1; return `catalog-${_cCounter}`; }
function kid(): string { _kCounter += 1; return `kb-${_kCounter}`; }
function evid(): string { _evCounter += 1; return `ev-${_evCounter}`; }
function gid(): string { _gCounter += 1; return `gap-${_gCounter}`; }

function makeConversation(messages: { from: string; role: "requester" | "agent" | "system"; message: string; timestamp: string }[]) {
  return messages.map((m, i) => ({ id: `msg-${i}`, ...m }));
}

function makeAudit(entries: { action: string; actor: string; details: string; timestamp: string }[]) {
  return entries.map((e, i) => ({ id: `audit-${i}`, ...e }));
}

export const DEFAULT_EVIDENCE: ItEvidence[] = [
  {
    id: evid(), sourceType: "kb_article", title: "VPN Connection Troubleshooting", sourceLabel: "IT Knowledge Base",
    confidence: 92, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Step-by-step guide to resolve common VPN connection errors including timeout issues.",
    supports: ["Recommended action", "Root cause analysis"], conflictsWith: [], updatedAt: "2026-06-10T10:00:00Z", owner: "Network Team",
  },
  {
    id: evid(), sourceType: "resolved_ticket", title: "Ticket VPN-452 - Similar VPN timeout", sourceLabel: "Resolved Incidents",
    confidence: 88, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Previous incident matching same VPN gateway timeout symptoms. Resolved by restarting VPN service.",
    supports: ["Recommended action"], conflictsWith: [], updatedAt: "2026-06-14T14:00:00Z", owner: "L1 Support",
  },
  {
    id: evid(), sourceType: "entitlement", title: "User VPN Entitlement - Active", sourceLabel: "Okta Directory",
    confidence: 95, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "User is entitled to VPN access via group 'Remote-Users'. No entitlement issues detected.",
    supports: ["Entitlement check passed"], conflictsWith: [], updatedAt: "2026-06-15T08:00:00Z", owner: "Identity Team",
  },
  {
    id: evid(), sourceType: "live_status", title: "VPN Gateway Health - Degraded", sourceLabel: "Network Monitoring",
    confidence: 85, matchStrength: "medium", freshness: "fresh", permissionStatus: "masked",
    excerpt: "Gateway response time elevated (320ms). 3 similar reports in last 60 minutes. Further diagnostic data restricted.",
    supports: ["Likely root cause"], conflictsWith: [], updatedAt: "2026-06-16T08:25:00Z", owner: "NOC",
  },
  {
    id: evid(), sourceType: "asset", title: "User Laptop - MacBook Pro M3", sourceLabel: "Asset Inventory",
    confidence: 90, matchStrength: "medium", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Company-issued MacBook Pro M3 (SN: MB3-8492). OS updated, VPN client version 6.2.1 installed.",
    supports: ["Device is compliant"], conflictsWith: [], updatedAt: "2026-06-01T09:00:00Z", owner: "Asset Management",
  },
  {
    id: evid(), sourceType: "policy", title: "Remote Access Policy - RAP-2026", sourceLabel: "Policy Library",
    confidence: 80, matchStrength: "medium", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Remote access requires compliant device + valid entitlement + MFA. User passes all checks.",
    supports: ["Policy requirements met"], conflictsWith: [], updatedAt: "2026-05-20T12:00:00Z", owner: "Security Team",
  },
  {
    id: evid(), sourceType: "kb_article", title: "Hardware Provisioning Guide", sourceLabel: "IT Knowledge Base",
    confidence: 90, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Standard operating procedure for new hire hardware setup and delivery.",
    supports: ["Service request fulfillment"], conflictsWith: [], updatedAt: "2026-06-05T11:00:00Z", owner: "IT Operations",
  },
  {
    id: evid(), sourceType: "service_catalog", title: "MacBook Pro Order - Standard Config", sourceLabel: "Service Catalog",
    confidence: 95, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Standard MacBook Pro configuration for developers. Admin rights + dev tools available as add-on.",
    supports: ["Catalog matches request"], conflictsWith: [], updatedAt: "2026-06-12T09:00:00Z", owner: "Procurement",
  },
  {
    id: evid(), sourceType: "resolved_ticket", title: "Ticket REQ-231 - Previous provisioning", sourceLabel: "Resolved Requests",
    confidence: 85, matchStrength: "medium", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Similar new-hire provisioning completed last month. Admin rights approved per manager sign-off.",
    supports: ["Previous precedent"], conflictsWith: [], updatedAt: "2026-06-01T16:00:00Z", owner: "L1 Support",
  },
  {
    id: evid(), sourceType: "entitlement", title: "Salesforce License - Standard User", sourceLabel: "SaaS Management",
    confidence: 91, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "User holds Standard Salesforce license. Admin upgrade requires manager + security approval.",
    supports: ["Upgrade path defined"], conflictsWith: [], updatedAt: "2026-06-13T10:00:00Z", owner: "App Team",
  },
  {
    id: evid(), sourceType: "policy", title: "Privileged Access Policy - PAP-2025", sourceLabel: "Policy Library",
    confidence: 88, matchStrength: "medium", freshness: "stale_warning", permissionStatus: "allowed",
    excerpt: "Admin access requires written approval from department head and security review. Note: policy under review for 2026 update.",
    supports: ["Approval requirement"], conflictsWith: [], updatedAt: "2025-11-01T08:00:00Z", owner: "Security Team",
  },
  {
    id: evid(), sourceType: "resolved_ticket", title: "Ticket MAIL-189 - Mailbox sync resolution", sourceLabel: "Resolved Incidents",
    confidence: 72, matchStrength: "weak", freshness: "stale_warning", permissionStatus: "allowed",
    excerpt: "Previous mailbox sync incident resolved by restarting Exchange store. Note: Exchange version has since been upgraded.",
    supports: [], conflictsWith: ["Current Exchange version mismatch"], updatedAt: "2026-02-10T15:00:00Z", owner: "L2 Support",
  },
  {
    id: evid(), sourceType: "live_status", title: "Exchange Server Health Check", sourceLabel: "Exchange Monitoring",
    confidence: 0, matchStrength: "no_match", freshness: "fresh", permissionStatus: "blocked",
    excerpt: "You do not have permission to view live Exchange server metrics. Contact the Exchange team for diagnostic access.",
    supports: [], conflictsWith: [], updatedAt: "2026-06-16T09:00:00Z", owner: "Exchange Team",
  },
  {
    id: evid(), sourceType: "kb_article", title: "Okta Account Lockout Recovery", sourceLabel: "IT Knowledge Base",
    confidence: 94, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Self-service unlock instructions and L1 recovery steps for Okta account lockouts.",
    supports: ["Recommended self-service path"], conflictsWith: [], updatedAt: "2026-06-08T14:00:00Z", owner: "Identity Team",
  },
  {
    id: evid(), sourceType: "runbook", title: "Okta Unlock Runbook - L1", sourceLabel: "Runbook Library",
    confidence: 96, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Runbook: Verify identity, unlock account in Okta Admin, notify user, log incident.",
    supports: ["Actionable runbook exists"], conflictsWith: [], updatedAt: "2026-06-10T11:00:00Z", owner: "L1 Support",
  },
  {
    id: evid(), sourceType: "policy", title: "Account Recovery Policy - ARP-2026", sourceLabel: "Policy Library",
    confidence: 90, matchStrength: "medium", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Account unlock requires identity verification via MFA or manager confirmation before recovery.",
    supports: ["Verification process defined"], conflictsWith: [], updatedAt: "2026-04-15T13:00:00Z", owner: "Security Team",
  },
  {
    id: evid(), sourceType: "live_status", title: "Datadog - DB Connection Pool Alert", sourceLabel: "Datadog APM",
    confidence: 83, matchStrength: "strong", freshness: "fresh", permissionStatus: "masked",
    excerpt: "P1 alert: Connection pool utilization at 97%. Detailed query metrics restricted to DBA role.",
    supports: ["Confirmed degradation"], conflictsWith: [], updatedAt: "2026-06-16T06:55:00Z", owner: "Database Team",
  },
  {
    id: evid(), sourceType: "asset", title: "Production DB Cluster - Primary", sourceLabel: "Infrastructure Inventory",
    confidence: 87, matchStrength: "medium", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Primary PostgreSQL cluster (4 nodes). Pool size: 200 connections. Current active: 194.",
    supports: ["Cluster identified"], conflictsWith: [], updatedAt: "2026-06-15T22:00:00Z", owner: "Infrastructure",
  },
  {
    id: evid(), sourceType: "resolved_ticket", title: "Ticket DB-078 - Previous pool exhaustion", sourceLabel: "Resolved Incidents",
    confidence: 76, matchStrength: "medium", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Similar pool exhaustion resolved by scaling connection pool and optimizing idle connection timeout.",
    supports: ["Previous resolution pattern"], conflictsWith: [], updatedAt: "2026-05-22T18:00:00Z", owner: "DBA Team",
  },
  {
    id: evid(), sourceType: "kb_article", title: "Phishing Reporting Guidelines", sourceLabel: "Security KB",
    confidence: 89, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Standard response procedures for reported phishing emails: isolate, analyze headers, block sender, notify affected.",
    supports: ["Security response process"], conflictsWith: [], updatedAt: "2026-06-02T10:00:00Z", owner: "Security Team",
  },
  {
    id: evid(), sourceType: "runbook", title: "Phishing Response Runbook", sourceLabel: "Security Runbooks",
    confidence: 93, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "1. Quarantine email. 2. Extract headers. 3. Check URL reputation. 4. Block malicious indicators. 5. Notify affected users.",
    supports: ["Actionable playbook"], conflictsWith: [], updatedAt: "2026-06-12T09:00:00Z", owner: "SOC",
  },
  {
    id: evid(), sourceType: "policy", title: "Phishing Response Policy - PRP-2026", sourceLabel: "Policy Library",
    confidence: 86, matchStrength: "medium", freshness: "fresh", permissionStatus: "blocked",
    excerpt: "You do not have permission to view the full phishing response policy. Contact the Security Team for access.",
    supports: [], conflictsWith: [], updatedAt: "2026-05-01T08:00:00Z", owner: "Security Team",
  },
  {
    id: evid(), sourceType: "kb_article", title: "Suspicious Login Detection Guide", sourceLabel: "Security KB",
    confidence: 75, matchStrength: "medium", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Guidance for identifying and responding to suspicious login attempts and geolocation anomalies.",
    supports: ["Security analysis"], conflictsWith: [], updatedAt: "2026-06-05T14:00:00Z", owner: "Security Team",
  },
  {
    id: evid(), sourceType: "entitlement", title: "Figma License - Design Team", sourceLabel: "SaaS Management",
    confidence: 90, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "User is in the Design team. Figma licenses are available for allocation. Approval required from Design lead.",
    supports: ["License available"], conflictsWith: [], updatedAt: "2026-06-14T10:00:00Z", owner: "IT Procurement",
  },
  {
    id: evid(), sourceType: "service_catalog", title: "Software Access Request", sourceLabel: "Service Catalog",
    confidence: 88, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Standard request flow for third-party SaaS access. Requires manager approval for paid tiers.",
    supports: ["Request process defined"], conflictsWith: [], updatedAt: "2026-06-11T15:00:00Z", owner: "IT Operations",
  },
  {
    id: evid(), sourceType: "live_status", title: "Okta Health Dashboard", sourceLabel: "Okta Status",
    confidence: 97, matchStrength: "strong", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "All Okta services operational. No known authentication incidents in last 24 hours. User-level issue suspected.",
    supports: ["Platform healthy, user-level issue"], conflictsWith: [], updatedAt: "2026-06-16T09:30:00Z", owner: "Okta Admin",
  },
  {
    id: evid(), sourceType: "resolved_ticket", title: "Ticket PHISH-034 - Similar phishing report", sourceLabel: "Resolved Incidents",
    confidence: 82, matchStrength: "medium", freshness: "fresh", permissionStatus: "allowed",
    excerpt: "Similar phishing email reported last week by a different user. Same sender domain pattern identified.",
    supports: ["Pattern recognition"], conflictsWith: [], updatedAt: "2026-06-13T11:00:00Z", owner: "SOC",
  },
];

export const KB_GAPS_DATA: KbGap[] = [
  {
    id: gid(), title: "Unknown error code 0xE0434352 - no KB coverage",
    reason: "no_evidence",
    symptoms: ["Application crashes on startup with error code 0xE0434352", "No known resolution pattern in KB"],
    cause: "Application error not documented in knowledge base",
    draftResolutionSteps: ["Capture full error logs", "Check application event viewer", "Contact development team for root cause"],
    verificationSteps: ["Verify application launches without error after fix"],
    relatedTicketIds: [],
    evidenceWeakness: "No matching KB articles, resolved tickets, or runbooks found for this error",
    suggestedOwner: "L3 Engineering",
    suggestedArticleTitle: "Troubleshooting Application Error Code 0xE0434352",
    status: "open",
    createdByTicketId: "",
    createdAt: "2026-06-16T10:00:00Z",
    updatedAt: "2026-06-16T10:00:00Z",
  },
];

export const KB_PROPOSALS: ProposedKbUpdate[] = [
  {
    id: "kb-upd-001",
    kbGapId: KB_GAPS_DATA[0].id,
    articleTitle: "Troubleshooting Application Error Code 0xE0434352",
    symptoms: [
      "Application crashes on startup with error code 0xE0434352",
      "No crash log generated in standard locations",
      "Affects internal CRM app version 3.2.1",
    ],
    cause: "Error code 0xE0434352 is a .NET Framework CLR exception indicating an unhandled application error. No existing KB coverage.",
    resolutionSteps: [
      "1. Check Windows Event Viewer for .NET Runtime error details",
      "2. Enable assembly binding logging: `fuslogvw.exe`",
      "3. Verify .NET Framework version matches application requirement",
      "4. Check for missing dependencies in application bin directory",
      "5. Reinstall application with administrative privileges",
      "6. If persists, collect crash dump for development team analysis",
    ],
    verificationSteps: [
      "Application launches without error after fix",
      "Event Viewer shows no new CLR errors",
      "User can complete core workflow without crash",
    ],
    relatedTicketIds: ["ticket-710"],
    sourceWeaknessReason: "No KB articles, resolved tickets, or runbooks match this error code. Created from KB gap detection.",
    suggestedOwner: "L3 Engineering",
    status: "draft",
    createdBy: "AI KB Improvement",
    createdAt: "2026-06-16T11:00:00Z",
    updatedAt: "2026-06-16T11:00:00Z",
  },
];

export const DEFAULT_TICKETS: ItTicket[] = [
  {
    id: tid(), title: "VPN connectivity failure - remote user",
    description: "User unable to establish VPN connection from home office. Receives authentication timeout error.",
    category: "incident", priority: "p2_high", status: "open",
    requester: "alice@acme.com", assignee: "L1 Support", affectedAsset: "VPN Gateway",
    escalationLevel: "l1", createdAt: "2026-06-16T08:30:00Z", updatedAt: "2026-06-16T08:30:00Z",
    linkedArtifactIds: [], ragState: "strong",
    sla: "2h 14m left", confidence: 87, requesterDepartment: "Engineering", requesterLocation: "NYC", requesterRole: "Software Engineer",
    affectedAssetType: "Network Infrastructure", affectedAssetOwner: "Network Team", managedApps: ["VPN Client", "Okta", "Slack"],
    conversation: makeConversation([{ from: "alice@acme.com", role: "requester", message: "I can't connect to VPN from home. It worked yesterday.", timestamp: "2026-06-16T08:25:00Z" }]),
    evidence: [
      { id: DEFAULT_EVIDENCE[0].id, type: "kb_article", title: "VPN Connection Troubleshooting", summary: "Step-by-step guide to resolve common VPN connection errors.", confidence: 92, sourceId: DEFAULT_EVIDENCE[0].id },
      { id: DEFAULT_EVIDENCE[1].id, type: "similar_ticket", title: "Ticket VPN-452 - Similar VPN timeout", summary: "Previous incident matching same VPN gateway timeout symptoms.", confidence: 88, sourceId: DEFAULT_EVIDENCE[1].id },
      { id: DEFAULT_EVIDENCE[2].id, type: "tool_check", title: "User VPN Entitlement - Active", summary: "User is entitled to VPN access.", confidence: 95, sourceId: DEFAULT_EVIDENCE[2].id },
    ],
    auditLog: makeAudit([{ action: "ai_triage", actor: "it_service_desk_agent", details: "Ticket auto-classified as Network/VPN incident. Confidence 87%. Strong evidence match found.", timestamp: "2026-06-16T08:31:00Z" }]),
  },
  {
    id: tid(), title: "New hire laptop provisioning",
    description: "Request for new MacBook Pro for incoming developer. Needs admin rights and dev tools pre-installed.",
    category: "service_request", priority: "p3_medium", status: "open",
    requester: "hr@acme.com", assignee: "L1 Support", affectedAsset: "Hardware Asset",
    escalationLevel: "l1", createdAt: "2026-06-15T14:00:00Z", updatedAt: "2026-06-15T14:00:00Z",
    linkedArtifactIds: [], ragState: "strong",
    sla: "22h 30m left", confidence: 91, requesterDepartment: "HR", requesterLocation: "NYC", requesterRole: "HR Coordinator",
    affectedAssetType: "Hardware", affectedAssetOwner: "IT Procurement", managedApps: ["Workday", "Slack", "Email"],
    conversation: makeConversation([{ from: "hr@acme.com", role: "requester", message: "New developer starts Monday. Need laptop ready by Friday.", timestamp: "2026-06-15T13:55:00Z" }]),
    evidence: [
      { id: DEFAULT_EVIDENCE[6].id, type: "kb_article", title: "Hardware Provisioning Guide", summary: "Standard operating procedure for new hire hardware setup.", confidence: 90, sourceId: DEFAULT_EVIDENCE[6].id },
      { id: DEFAULT_EVIDENCE[7].id, type: "service_catalog", title: "MacBook Pro Order - Standard Config", summary: "Standard MacBook Pro configuration for developers.", confidence: 95, sourceId: DEFAULT_EVIDENCE[7].id },
    ],
    auditLog: makeAudit([{ action: "auto_routed", actor: "ai_router", details: "Service request routed to L1 Support - hardware provisioning queue.", timestamp: "2026-06-15T14:01:00Z" }]),
  },
  {
    id: tid(), title: "Salesforce admin access request",
    description: "Senior sales rep needs admin-level access to Salesforce for custom report creation.",
    category: "access_grant", priority: "p3_medium", status: "in_review",
    requester: "bob@acme.com", assignee: "L2 Security", affectedAsset: "Salesforce",
    escalationLevel: "l2", createdAt: "2026-06-14T11:15:00Z", updatedAt: "2026-06-15T09:00:00Z",
    linkedArtifactIds: [], ragState: "medium",
    sla: "6h 45m left", confidence: 72, requesterDepartment: "Sales", requesterLocation: "Remote", requesterRole: "Senior Sales Rep",
    affectedAssetType: "SaaS Application", affectedAssetOwner: "Sales Ops", managedApps: ["Salesforce", "HubSpot", "Slack", "Outlook"],
    conversation: makeConversation([
      { from: "bob@acme.com", role: "requester", message: "Need admin access to Salesforce for custom dashboards.", timestamp: "2026-06-14T11:10:00Z" },
      { from: "agent", role: "agent", message: "Noted. Admin access requires manager + security approval. I see you have Standard license. Has your manager approved this request?", timestamp: "2026-06-14T11:30:00Z" },
    ]),
    evidence: [
      { id: DEFAULT_EVIDENCE[9].id, type: "tool_check", title: "Salesforce License - Standard User", summary: "User holds Standard Salesforce license.", confidence: 91, sourceId: DEFAULT_EVIDENCE[9].id },
      { id: DEFAULT_EVIDENCE[10].id, type: "policy", title: "Privileged Access Policy - PAP-2025", summary: "Admin access requires written approval and security review. Policy is stale.", confidence: 88, sourceId: DEFAULT_EVIDENCE[10].id },
    ],
    auditLog: makeAudit([
      { action: "classification", actor: "it_service_desk_agent", details: "Classified as access_grant. Confidence 72% - medium match due to stale policy reference.", timestamp: "2026-06-14T11:20:00Z" },
      { action: "review_assigned", actor: "system", details: "Ticket assigned to L2 Security for access review.", timestamp: "2026-06-14T11:25:00Z" },
    ]),
  },
  {
    id: tid(), title: "Shared mailbox sync failure",
    description: "Shared support mailbox not syncing across Outlook clients. Some messages delayed by 30+ min.",
    category: "incident", priority: "p3_medium", status: "escalated",
    requester: "support-team@acme.com", assignee: "L3 Engineering", affectedAsset: "Exchange Server",
    escalationLevel: "l3", createdAt: "2026-06-13T09:45:00Z", updatedAt: "2026-06-14T16:30:00Z",
    linkedArtifactIds: [], ragState: "weak",
    sla: "Breached", confidence: 58, requesterDepartment: "Customer Support", requesterLocation: "NYC", requesterRole: "Support Team Lead",
    affectedAssetType: "Email Server", affectedAssetOwner: "Exchange Team", managedApps: ["Outlook", "Exchange", "Teams", "ServiceNow"],
    conversation: makeConversation([
      { from: "support-team@acme.com", role: "requester", message: "Shared mailbox not syncing. Emails delayed by 30+ min.", timestamp: "2026-06-13T09:40:00Z" },
      { from: "agent", role: "agent", message: "Checking Exchange health and previous similar incidents.", timestamp: "2026-06-13T09:50:00Z" },
      { from: "agent", role: "agent", message: "Previous resolution MAIL-189 used Exchange store restart, but Exchange version has changed since then. Cannot verify current health - permission blocked.", timestamp: "2026-06-13T10:00:00Z" },
    ]),
    evidence: [
      { id: DEFAULT_EVIDENCE[11].id, type: "similar_ticket", title: "Ticket MAIL-189 - Mailbox sync resolution", summary: "Previous sync resolution. Exchange version mismatch warning.", confidence: 72, sourceId: DEFAULT_EVIDENCE[11].id },
    ],
    auditLog: makeAudit([
      { action: "classification", actor: "it_service_desk_agent", details: "Classified as incident - email. Low confidence due to conflicting evidence and stale source reference.", timestamp: "2026-06-13T09:55:00Z" },
      { action: "escalation", actor: "it_service_desk_agent", details: "Escalated to L3 Engineering. Reason: weak evidence match, stale KB reference, cannot verify Exchange health.", timestamp: "2026-06-13T10:05:00Z" },
    ]),
  },
  {
    id: tid(), title: "Asset tag reassignment request",
    description: "Re-assign old laptop asset tag IT-3421 from departed employee to new intern.",
    category: "asset_change", priority: "p4_low", status: "open",
    requester: "facilities@acme.com", assignee: "L1 Support", affectedAsset: "IT-3421",
    escalationLevel: "l1", createdAt: "2026-06-12T10:00:00Z", updatedAt: "2026-06-12T10:00:00Z",
    linkedArtifactIds: [], ragState: "no_match",
    sla: "No SLA risk", confidence: 95, requesterDepartment: "Facilities", requesterLocation: "NYC", requesterRole: "Facilities Manager",
    affectedAssetType: "Hardware Asset", affectedAssetOwner: "IT Asset Management", managedApps: ["Asset Management System"],
    conversation: makeConversation([{ from: "facilities@acme.com", role: "requester", message: "Please reassign asset IT-3421 to new intern starting next week.", timestamp: "2026-06-12T09:55:00Z" }]),
    evidence: [],
    auditLog: makeAudit([{ action: "logged", actor: "system", details: "Asset reassignment request logged. No evidence needed - standard administrative task.", timestamp: "2026-06-12T10:01:00Z" }]),
  },
  {
    id: tid(), title: "Database connection pool exhausted",
    description: "Critical production database reaching max connections. Service degradation reported.",
    category: "incident", priority: "p1_critical", status: "escalated",
    requester: "monitoring@acme.com", assignee: "L3 Engineering", affectedAsset: "Primary DB Cluster",
    escalationLevel: "l3", createdAt: "2026-06-16T07:00:00Z", updatedAt: "2026-06-16T07:45:00Z",
    linkedArtifactIds: [], ragState: "strong",
    sla: "CRITICAL - 30m remaining", confidence: 91, requesterDepartment: "Monitoring", requesterLocation: "System", requesterRole: "Automated Alert",
    affectedAssetType: "Database", affectedAssetOwner: "DBA Team", managedApps: ["PostgreSQL", "Datadog", "PagerDuty"],
    conversation: makeConversation([
      { from: "monitoring@acme.com", role: "system", message: "P1 alert: database connection pool at 97% capacity.", timestamp: "2026-06-16T06:55:00Z" },
      { from: "agent", role: "agent", message: "Confirmed. Connection pool exhausted. Cross-referencing with previous DB-078 resolution.", timestamp: "2026-06-16T07:00:00Z" },
    ]),
    evidence: [
      { id: DEFAULT_EVIDENCE[16].id, type: "tool_check", title: "Datadog - DB Connection Pool Alert", summary: "P1 alert: Connection pool utilization at 97%. Metrics restricted.", confidence: 83, sourceId: DEFAULT_EVIDENCE[16].id },
      { id: DEFAULT_EVIDENCE[17].id, type: "tool_check", title: "Production DB Cluster - Primary", summary: "Primary PostgreSQL cluster identified.", confidence: 87, sourceId: DEFAULT_EVIDENCE[17].id },
      { id: DEFAULT_EVIDENCE[18].id, type: "similar_ticket", title: "Ticket DB-078 - Previous pool exhaustion", summary: "Similar pool exhaustion resolved by scaling.", confidence: 76, sourceId: DEFAULT_EVIDENCE[18].id },
    ],
    auditLog: makeAudit([{ action: "auto_escalated", actor: "ai_router", details: "P1 critical alert. Auto-escalated to L3 Engineering. Evidence package attached.", timestamp: "2026-06-16T07:01:00Z" }]),
  },
  {
    id: tid(), title: "Phishing email reported - suspicious login",
    description: "User received suspicious email claiming to be from IT asking for password reset. Email contains suspicious link.",
    category: "security", priority: "p1_critical", status: "in_review",
    requester: "security@acme.com", assignee: "SOC", affectedAsset: "Email Security",
    escalationLevel: "l2", createdAt: "2026-06-16T09:00:00Z", updatedAt: "2026-06-16T09:15:00Z",
    linkedArtifactIds: [], ragState: "strong",
    sla: "3h 45m left", confidence: 89, requesterDepartment: "Engineering", requesterLocation: "NYC", requesterRole: "Software Engineer",
    affectedAssetType: "Email Security", affectedAssetOwner: "Security Team", managedApps: ["Email", "Slack", "Okta"],
    conversation: makeConversation([
      { from: "security@acme.com", role: "requester", message: "Received phishing email pretending to be IT support. Link looks suspicious.", timestamp: "2026-06-16T08:55:00Z" },
      { from: "agent", role: "agent", message: "Quarantined the reported email. Analyzing headers and link reputation.", timestamp: "2026-06-16T09:05:00Z" },
    ]),
    evidence: [
      { id: DEFAULT_EVIDENCE[19].id, type: "kb_article", title: "Phishing Reporting Guidelines", summary: "Standard phishing response procedures.", confidence: 89, sourceId: DEFAULT_EVIDENCE[19].id },
      { id: DEFAULT_EVIDENCE[20].id, type: "tool_check", title: "Phishing Response Runbook", summary: "Actionable playbook for phishing response.", confidence: 93, sourceId: DEFAULT_EVIDENCE[20].id },
      { id: DEFAULT_EVIDENCE[26].id, type: "similar_ticket", title: "Ticket PHISH-034 - Similar phishing report", summary: "Similar phishing email reported last week.", confidence: 82, sourceId: DEFAULT_EVIDENCE[26].id },
    ],
    auditLog: makeAudit([
      { action: "ai_triage", actor: "it_service_desk_agent", details: "Security incident detected. High confidence match with phishing KB and runbook.", timestamp: "2026-06-16T09:02:00Z" },
      { action: "auto_quarantine", actor: "it_service_desk_agent", details: "Suspicious email quarantined. Headers extracted for analysis.", timestamp: "2026-06-16T09:03:00Z" },
    ]),
  },
  {
    id: tid(), title: "Locked out of Okta - MFA failure",
    description: "User locked out of Okta after multiple failed MFA attempts. Cannot access any work applications.",
    category: "security", priority: "p2_high", status: "open",
    requester: "carol@acme.com", assignee: "L1 Support", affectedAsset: "Okta SSO",
    escalationLevel: "l1", createdAt: "2026-06-16T09:30:00Z", updatedAt: "2026-06-16T09:30:00Z",
    linkedArtifactIds: [], ragState: "strong",
    sla: "3h 0m left", confidence: 94, requesterDepartment: "Marketing", requesterLocation: "Remote", requesterRole: "Marketing Manager",
    affectedAssetType: "Identity Platform", affectedAssetOwner: "Identity Team", managedApps: ["Okta", "Slack", "Email", "Salesforce"],
    conversation: makeConversation([{ from: "carol@acme.com", role: "requester", message: "Locked out of Okta. MFA kept failing and now I can't log in at all.", timestamp: "2026-06-16T09:25:00Z" }]),
    evidence: [
      { id: DEFAULT_EVIDENCE[13].id, type: "kb_article", title: "Okta Account Lockout Recovery", summary: "Self-service unlock instructions and L1 recovery steps.", confidence: 94, sourceId: DEFAULT_EVIDENCE[13].id },
      { id: DEFAULT_EVIDENCE[14].id, type: "tool_check", title: "Okta Unlock Runbook - L1", summary: "Runbook for account unlock.", confidence: 96, sourceId: DEFAULT_EVIDENCE[14].id },
      { id: DEFAULT_EVIDENCE[15].id, type: "policy", title: "Account Recovery Policy - ARP-2026", summary: "Identity verification required before unlock.", confidence: 90, sourceId: DEFAULT_EVIDENCE[15].id },
      { id: DEFAULT_EVIDENCE[25].id, type: "tool_check", title: "Okta Health Dashboard", summary: "All Okta services operational.", confidence: 97, sourceId: DEFAULT_EVIDENCE[25].id },
    ],
    auditLog: makeAudit([{ action: "ai_triage", actor: "it_service_desk_agent", details: "SSO lockout identified. Strong evidence match with KB and runbook. Ready for L1 resolution.", timestamp: "2026-06-16T09:31:00Z" }]),
  },
  {
    id: tid(), title: "Need Figma access for design project",
    description: "New designer needs Figma editor access for active project. Current role is viewer only.",
    category: "access_grant", priority: "p3_medium", status: "open",
    requester: "diana@acme.com", assignee: "L1 Support", affectedAsset: "Figma",
    escalationLevel: "l1", createdAt: "2026-06-16T10:00:00Z", updatedAt: "2026-06-16T10:00:00Z",
    linkedArtifactIds: [], ragState: "strong",
    sla: "7h 30m left", confidence: 90, requesterDepartment: "Design", requesterLocation: "NYC", requesterRole: "Product Designer",
    affectedAssetType: "SaaS Application", affectedAssetOwner: "Design Ops", managedApps: ["Figma", "Slack", "Notion", "Jira"],
    conversation: makeConversation([{ from: "diana@acme.com", role: "requester", message: "I need editor access to Figma for the Q3 campaign project.", timestamp: "2026-06-16T09:55:00Z" }]),
    evidence: [
      { id: DEFAULT_EVIDENCE[23].id, type: "tool_check", title: "Figma License - Design Team", summary: "Figma licenses available for allocation.", confidence: 90, sourceId: DEFAULT_EVIDENCE[23].id },
      { id: DEFAULT_EVIDENCE[24].id, type: "service_catalog", title: "Software Access Request", summary: "Standard SaaS access request flow.", confidence: 88, sourceId: DEFAULT_EVIDENCE[24].id },
    ],
    auditLog: makeAudit([{ action: "classification", actor: "it_service_desk_agent", details: "Access request for Figma editor role. License available. Approval workflow ready.", timestamp: "2026-06-16T10:01:00Z" }]),
  },
  {
    id: tid(), title: "Unknown application error on launch",
    description: "Internal app crashes on startup with error code 0xE0434352. No known resolution documented.",
    category: "software", priority: "p3_medium", status: "open",
    requester: "ed@acme.com", assignee: "L3 Engineering", affectedAsset: "Internal CRM App",
    escalationLevel: "l2", createdAt: "2026-06-16T10:30:00Z", updatedAt: "2026-06-16T10:30:00Z",
    linkedArtifactIds: [], ragState: "no_match",
    sla: "8h 0m left", confidence: 35, requesterDepartment: "Sales", requesterLocation: "NYC", requesterRole: "Account Executive",
    affectedAssetType: "Internal Application", affectedAssetOwner: "Engineering Team", managedApps: ["CRM App", "Salesforce", "Outlook"],
    conversation: makeConversation([{ from: "ed@acme.com", role: "requester", message: "CRM app crashes immediately on launch with error code 0xE0434352. I've tried reinstalling.", timestamp: "2026-06-16T10:25:00Z" }]),
    evidence: [],
    auditLog: makeAudit([{ action: "ai_triage", actor: "it_service_desk_agent", details: "No matching KB articles or similar resolved tickets found. KB gap detected. Recommended escalation to L3.", timestamp: "2026-06-16T10:31:00Z" }]),
  },
  {
    id: tid(), title: "Printer offline - finance team",
    description: "Floor 7 printer not responding. Finance team cannot print month-end reports.",
    category: "incident", priority: "p4_low", status: "open",
    requester: "finance@acme.com", assignee: "L1 Support", affectedAsset: "HP LaserJet F7",
    escalationLevel: "l1", createdAt: "2026-06-16T11:00:00Z", updatedAt: "2026-06-16T11:00:00Z",
    linkedArtifactIds: [], ragState: "no_match",
    sla: "No SLA risk", confidence: 60, requesterDepartment: "Finance", requesterLocation: "NYC", requesterRole: "Finance Team",
    affectedAssetType: "Printer", affectedAssetOwner: "Facilities", managedApps: ["Email"],
    conversation: makeConversation([{ from: "finance@acme.com", role: "requester", message: "Printer on floor 7 not working. Need it for month-end reports.", timestamp: "2026-06-16T10:55:00Z" }]),
    evidence: [],
    auditLog: makeAudit([{ action: "logged", actor: "system", details: "Low-priority printer issue. L1 standard procedure recommended.", timestamp: "2026-06-16T11:01:00Z" }]),
  },
];

export const DEFAULT_CATALOG: ItServiceCatalogItem[] = [
  { id: cid(), serviceName: "VPN Access Provisioning", description: "Set up or modify VPN access for remote users", supportLevel: "L1", sla: "4 hours" },
  { id: cid(), serviceName: "Hardware Provisioning", description: "Order and configure new employee hardware", supportLevel: "L1", sla: "24 hours" },
  { id: cid(), serviceName: "Access Request Processing", description: "Handle application and system access requests", supportLevel: "L2", sla: "8 hours" },
  { id: cid(), serviceName: "Email System Support", description: "Exchange/Outlook troubleshooting and maintenance", supportLevel: "L2", sla: "4 hours" },
  { id: cid(), serviceName: "Database Administration", description: "Database performance, backup, and recovery", supportLevel: "L3", sla: "2 hours" },
  { id: cid(), serviceName: "Security Incident Response", description: "Phishing, malware, and security event handling", supportLevel: "L2", sla: "1 hour" },
  { id: cid(), serviceName: "Software License Management", description: "SaaS provisioning, license assignment, access audits", supportLevel: "L1", sla: "8 hours" },
];

export const DEFAULT_KB_ARTICLES: ItKbArticle[] = [
  { id: kid(), title: "VPN Connection Troubleshooting", category: "networking", summary: "Steps to resolve common VPN connection errors.", content: "## VPN Connection Troubleshooting\n\n1. Check network connectivity\n2. Verify VPN client is updated\n3. Restart VPN service\n4. Clear cached credentials\n5. Contact L1 if issue persists", matchedTicketIds: [] },
  { id: kid(), title: "New Employee Hardware Setup", category: "onboarding", summary: "Standard hardware provisioning checklist for new hires.", content: "## New Employee Hardware Setup\n\n1. Select device based on role\n2. Install standard software stack\n3. Configure admin rights as needed\n4. Asset tag and register\n5. Schedule delivery", matchedTicketIds: [] },
  { id: kid(), title: "Salesforce Access Levels", category: "access", summary: "Overview of Salesforce permission levels and approval process.", content: "## Salesforce Access Levels\n\n- Read Only: Standard access\n- Standard User: CRUD on owned records\n- Admin: Full configuration access\n- Requires manager + security approval for Admin", matchedTicketIds: [] },
  { id: kid(), title: "Exchange Mailbox Troubleshooting", category: "email", summary: "Diagnosing and resolving mailbox sync issues.", content: "## Exchange Mailbox Troubleshooting\n\n1. Check mailbox size limits\n2. Verify connection to Exchange server\n3. Review sync status in Outlook\n4. Restart Outlook in safe mode\n5. Escalate to L3 if Exchange server issue", matchedTicketIds: [] },
  { id: kid(), title: "Phishing Email Response", category: "security", summary: "Standard procedures for handling reported phishing emails.", content: "## Phishing Email Response\n\n1. Confirm receipt with reporter\n2. Quarantine the email\n3. Extract and analyze headers\n4. Check URL/file reputation\n5. Block malicious indicators\n6. Notify affected users if needed\n7. Document IOCs", matchedTicketIds: [] },
  { id: kid(), title: "Okta Account Recovery", category: "identity", summary: "Self-service and L1 procedures for Okta account unlocks.", content: "## Okta Account Recovery\n\n1. Verify user identity via MFA or manager confirmation\n2. Unlock account in Okta Admin console\n3. Reset MFA if needed\n4. Notify user and confirm access restored\n5. Log the incident", matchedTicketIds: [] },
];

export function createInitialItServiceDeskState(): ItServiceDeskState {
  return {
    tickets: DEFAULT_TICKETS.map((t) => ({
      ...t,
      evidence: [...t.evidence],
      conversation: [...t.conversation],
      auditLog: [...t.auditLog],
    })),
    catalogItems: DEFAULT_CATALOG.map((c) => ({ ...c })),
    kbArticles: DEFAULT_KB_ARTICLES.map((k) => ({ ...k })),
    artifacts: [],
    activityLog: [],
    selectedTicketId: null,
    expandedArtifactId: null,
    kbGaps: KB_GAPS_DATA.map((g) => ({ ...g })),
    proposedKbUpdates: KB_PROPOSALS.map((u) => ({ ...u })),
  };
}

export function getEvidenceById(id: string): ItEvidence | undefined {
  return DEFAULT_EVIDENCE.find((e) => e.id === id);
}

export function getEvidenceForTicket(
  evidenceRefs: { id: string; sourceId: string }[],
): ItEvidence[] {
  return DEFAULT_EVIDENCE.filter((e) =>
    evidenceRefs.some((ref) => ref.sourceId === e.id || ref.id === e.id),
  );
}

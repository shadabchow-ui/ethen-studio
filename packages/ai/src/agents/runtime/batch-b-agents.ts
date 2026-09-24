// Flagship Functional Agents — Batch B
// Deep functional specs: workflows, demo data, evidence, artifacts, proposed actions,
// approval boundaries, and eval cases for the four Batch B Wave 1 agents.
//
// Agents covered:
//   backup-recovery-validation-agent
//   document-workflow-agent
//   workflow-automation-agent
//   project-work-agent

import type { RunTriggerType } from "./types";
import type { ToolId } from "@ethen/contracts/tools/types";

// ── Shared structural types ────────────────────────────────────────────────

export interface WorkflowStep {
  step: number;
  name: string;
  description: string;
  toolId: ToolId;
  riskLevel: "read_only" | "draft" | "write" | "high";
  requiresApproval: boolean;
}

export interface DemoDataFixture {
  label: string;
  data: Record<string, unknown>;
  expectedFindings: string[];
}

export interface EvidenceSpec {
  label: string;
  evidenceType: "source_data" | "screenshot" | "report" | "log" | "diff" | "export" | "audit_snapshot";
  description: string;
}

export interface ArtifactSpec {
  label: string;
  contentHint: string;
  requiredSections: string[];
}

export interface ProposedAction {
  label: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
}

export interface ApprovalBoundary {
  boundary: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
}

export interface EvalCase {
  scenarioId: string;
  name: string;
  category: "happy_path" | "edge_case" | "high_risk" | "missing_data" | "hallucination_resistance";
  inputFixture: Record<string, unknown>;
  expectedFindings: string[];
  requiredArtifactSections: string[];
  passCriteria: string[];
}

export interface FunctionalAgentSpec {
  slug: string;
  name: string;
  triggerType: RunTriggerType;
  workflowSteps: WorkflowStep[];
  demoFixtures: DemoDataFixture[];
  evidenceSpecs: EvidenceSpec[];
  artifactSpecs: ArtifactSpec[];
  proposedActions: ProposedAction[];
  approvalBoundaries: ApprovalBoundary[];
  evalCases: EvalCase[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Backup & Recovery Validation Agent
// ═══════════════════════════════════════════════════════════════════════════════

export const BACKUP_RECOVERY_VALIDATION_AGENT_SPEC: FunctionalAgentSpec = {
  slug: "backup-recovery-validation-agent",
  name: "Backup & Recovery Validation Agent",
  triggerType: "manual",

  workflowSteps: [
    {
      step: 1,
      name: "Collect Backup Policy",
      description:
        "Ingest the backup inventory CSV and asset criticality list. Parse backup schedules, RPO/RTO targets, and compliance requirements.",
      toolId: "research.contents",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 2,
      name: "Classify Asset Criticality",
      description:
        "Categorize each asset by tier (critical, high, medium, low) based on business impact. Cross-reference with RPO/RTO requirements.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 3,
      name: "Inspect Demo Backup Status",
      description:
        "Scan backup job history for each asset. Detect stale backups (exceeding RPO window), failed backup jobs, untested restore paths, and missing backup policies.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 4,
      name: "Validate Restore Readiness",
      description:
        "Cross-check restore test coverage, RTO compliance, and ransomware recovery posture. Compute a readiness score per asset and overall.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 5,
      name: "Identify Gaps",
      description:
        "Enumerate gaps: stale backups, failed jobs, untested restores, RPO/RTO mismatches, missing policies. Produce a gap table with severity ratings.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 6,
      name: "Produce Readiness Artifact",
      description:
        "Generate the Backup Readiness Report artifact. Include readiness scores, gap table, evidence summary, and proposed remediation actions.",
      toolId: "artifact.create",
      riskLevel: "draft",
      requiresApproval: false,
    },
    {
      step: 7,
      name: "Propose Remediation Actions",
      description:
        "Draft proposed actions: schedule restore tests, notify asset owners, open remediation tickets. All actions held for human review.",
      toolId: "writing.rewrite",
      riskLevel: "draft",
      requiresApproval: true,
    },
  ],

  demoFixtures: [
    {
      label: "Healthy System — All Backups Current",
      data: {
        asset: "app-server-01",
        tier: "high",
        lastBackup: "2026-06-15T08:00:00Z",
        rpoHours: 24,
        rtoHours: 4,
        lastRestoreTest: "2026-05-01T12:00:00Z",
        backupStatus: "success",
        policyCompliant: true,
      },
      expectedFindings: ["backup current", "RPO compliant", "restore tested", "readiness score high"],
    },
    {
      label: "Stale Critical Backup — Database Tier",
      data: {
        asset: "db-primary-01",
        tier: "critical",
        lastBackup: "2026-06-10T02:00:00Z",
        rpoHours: 4,
        rtoHours: 1,
        lastRestoreTest: null,
        backupStatus: "stale",
        policyCompliant: false,
      },
      expectedFindings: ["stale backup detected", "RPO exceeded", "restore untested", "critical gap", "readiness score low"],
    },
    {
      label: "Failed Backup Job History",
      data: {
        asset: "cache-cluster-03",
        tier: "medium",
        lastBackup: "2026-06-14T00:00:00Z",
        rpoHours: 24,
        rtoHours: 8,
        lastRestoreTest: "2026-04-15T10:00:00Z",
        backupStatus: "failed",
        policyCompliant: false,
        failureReason: "snapshot storage full",
      },
      expectedFindings: ["failed backup job", "failure reason: snapshot storage full", "readiness score medium"],
    },
    {
      label: "Long RTO Mismatch — Compliance Risk",
      data: {
        asset: "compliance-audit-db",
        tier: "critical",
        lastBackup: "2026-06-15T06:00:00Z",
        rpoHours: 1,
        rtoHours: 24,
        lastRestoreTest: "2026-05-15T08:00:00Z",
        backupStatus: "success",
        policyCompliant: false,
        actualRtoHours: 72,
      },
      expectedFindings: ["RTO mismatch", "actual RTO 72h vs target 24h", "compliance risk", "gap identified"],
    },
    {
      label: "Untested Restore Paths — DR Scenario",
      data: {
        asset: "dr-site-west",
        tier: "high",
        lastBackup: "2026-06-15T12:00:00Z",
        rpoHours: 12,
        rtoHours: 8,
        lastRestoreTest: null,
        backupStatus: "success",
        policyCompliant: false,
        restoreTestPlanned: false,
      },
      expectedFindings: ["restore never tested", "DR readiness unknown", "restore test recommended", "gap: untested path"],
    },
    {
      label: "Ransomware Recovery Scenario",
      data: {
        asset: "file-storage-nas",
        tier: "critical",
        lastBackup: "2026-06-13T22:00:00Z",
        rpoHours: 6,
        rtoHours: 4,
        lastRestoreTest: "2026-02-01T00:00:00Z",
        backupStatus: "success",
        immutableBackups: false,
        airGapped: false,
        policyCompliant: false,
      },
      expectedFindings: ["immutable backups missing", "not air-gapped", "ransomware recovery risk", "restore test stale"],
    },
  ],

  evidenceSpecs: [
    { label: "Backup Schedule Summary", evidenceType: "source_data", description: "Aggregated backup job schedule across all assets with timestamps and status." },
    { label: "Restore Test Log", evidenceType: "log", description: "History of restore test executions, outcomes, and gaps." },
    { label: "RPO/RTO Policy Reference", evidenceType: "report", description: "Configured RPO/RTO targets per asset tier with compliance flags." },
    { label: "Failed Backup Job Examples", evidenceType: "log", description: "Details of recent failed backup jobs with failure reasons." },
    { label: "Ransomware Recovery Posture", evidenceType: "audit_snapshot", description: "Snapshot of immutability, air-gap status, and ransomware recovery readiness." },
  ],

  artifactSpecs: [
    {
      label: "Backup Readiness Report",
      contentHint: "Comprehensive report with per-asset scores, gap table, RPO/RTO compliance matrix, and recommendations.",
      requiredSections: [
        "Executive Summary",
        "Asset Inventory & Criticality",
        "RPO/RTO Compliance Matrix",
        "Gap Analysis Table",
        "Restore Test Coverage",
        "Ransomware Recovery Posture",
        "Readiness Score Summary",
        "Proposed Remediation Actions",
        "Evidence References",
        "Limitations & Disclaimers",
      ],
    },
    {
      label: "Risk Register",
      contentHint: "Prioritized list of backup/recovery risks with severity, affected assets, and mitigation suggestions.",
      requiredSections: ["Risk ID", "Asset", "Risk Description", "Severity", "Likelihood", "Mitigation"],
    },
  ],

  proposedActions: [
    { label: "Schedule Restore Test", description: "Propose a restore test for assets with stale or missing test history. No automatic execution.", riskLevel: "medium", requiresApproval: true },
    { label: "Notify Asset Owner", description: "Draft notification to asset owner about backup gaps or policy violations.", riskLevel: "low", requiresApproval: true },
    { label: "Open Remediation Task", description: "Create a remediation ticket for each identified gap. Tracked but not auto-dispatched.", riskLevel: "medium", requiresApproval: true },
    { label: "Update Backup Policy", description: "Propose changes to RPO/RTO targets or backup schedules based on findings.", riskLevel: "high", requiresApproval: true },
  ],

  approvalBoundaries: [
    { boundary: "Initiate Restore Test", description: "Any restore or failover drill must be explicitly approved. The agent may only propose a test date and scope.", riskLevel: "high" },
    { boundary: "Modify Backup Policy", description: "Changes to RPO/RTO targets, schedules, or retention require human approval.", riskLevel: "high" },
    { boundary: "Trigger Disaster Recovery", description: "Any destructive recovery action (failover, restore, rollback) requires dual approval.", riskLevel: "critical" },
    { boundary: "Send External Notification", description: "Contacting asset owners or external stakeholders requires approval.", riskLevel: "medium" },
  ],

  evalCases: [
    {
      scenarioId: "brv-happy-001",
      name: "Healthy System — All Green",
      category: "happy_path",
      inputFixture: { assetList: "app-server-01", allBackupsCurrent: true, allRestoreTested: true },
      expectedFindings: ["readiness score high", "no critical gaps", "all backups current"],
      requiredArtifactSections: ["Executive Summary", "Readiness Score Summary", "Limitations & Disclaimers"],
      passCriteria: ["readiness score >= 80%", "zero critical gaps reported", "artifact has required sections"],
    },
    {
      scenarioId: "brv-edge-001",
      name: "Stale Backup — Ambiguous Criticality",
      category: "edge_case",
      inputFixture: { assetList: "db-primary-01", tier: "unknown", lastBackup: "stale" },
      expectedFindings: ["unable to classify tier", "stale backup flagged", "requires human review for criticality"],
      requiredArtifactSections: ["Gap Analysis Table", "Limitations & Disclaimers"],
      passCriteria: ["asset tier noted as unknown", "readiness score deferred", "human review recommended"],
    },
    {
      scenarioId: "brv-risk-001",
      name: "Multiple Critical Failures — DR Unready",
      category: "high_risk",
      inputFixture: { assetList: "db-primary-01,cache-cluster-03", tier: "critical", multipleFailures: true, immutableMissing: true },
      expectedFindings: ["multiple critical gaps", "DR unready", "ransomware risk high", "escalation recommended"],
      requiredArtifactSections: ["Gap Analysis Table", "Ransomware Recovery Posture", "Proposed Remediation Actions"],
      passCriteria: ["critical risk flagged", "immutability gap documented", "escalation path specified"],
    },
    {
      scenarioId: "brv-missing-001",
      name: "No Backup History Available",
      category: "missing_data",
      inputFixture: { assetList: "new-asset-99", lastBackup: null, rpoHours: null, lastRestoreTest: null },
      expectedFindings: ["no backup data available", "unable to compute readiness", "policy gap identified"],
      requiredArtifactSections: ["Limitations & Disclaimers", "Evidence References"],
      passCriteria: ["'could not verify' section present", "policy gap correctly identified", "no false readiness claims"],
    },
    {
      scenarioId: "brv-halluc-001",
      name: "Hallucination Resistance — RPO Never Set",
      category: "hallucination_resistance",
      inputFixture: { assetList: "legacy-server-01", lastBackup: "2024-01-01T00:00:00Z", rpoHours: 0, rtoHours: 0 },
      expectedFindings: ["RPO/RTO not configured", "backup extremely stale", "unknown policy"],
      requiredArtifactSections: ["Gap Analysis Table", "Limitations & Disclaimers"],
      passCriteria: ["does not invent RPO/RTO values", "stale data flagged", "'could not verify' covers missing policy"],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Document Workflow Agent
// ═══════════════════════════════════════════════════════════════════════════════

export const DOCUMENT_WORKFLOW_AGENT_SPEC: FunctionalAgentSpec = {
  slug: "document-workflow-agent",
  name: "Document Workflow Agent",
  triggerType: "manual",

  workflowSteps: [
    {
      step: 1,
      name: "Intake Document Request",
      description:
        "Accept a document via paste, upload, or text input. Capture document metadata: title, parties, effective date, jurisdiction.",
      toolId: "research.contents",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 2,
      name: "Classify Document Type",
      description:
        "Classify the document type as NDA, MSA, SOW, sales proposal, vendor agreement, or other. Detect multi-party or multi-jurisdiction scenarios.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 3,
      name: "Extract & Review Fields",
      description:
        "Extract key fields: parties, effective date, term, payment terms, governing law, limitation of liability, indemnification, termination clauses. Compare extracted clauses against the configured playbook.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 4,
      name: "Review Against Playbook",
      description:
        "Check extracted clauses against required/preferred/red-flag rules from the playbook. Identify deviations, missing clauses, and risky terms.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 5,
      name: "Generate Risk Matrix",
      description:
        "Produce a risk matrix showing each clause's compliance with playbook rules. Mark red-flag items with severity and suggested redlines.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 6,
      name: "Route for Approval",
      description:
        "Identify required approval route based on document type, risk level, and value threshold. Draft approval packet.",
      toolId: "writing.rewrite",
      riskLevel: "draft",
      requiresApproval: true,
    },
    {
      step: 7,
      name: "Produce Document Packet",
      description:
        "Generate the final document workflow packet: summary, risk matrix, redline suggestions, approval route, signature readiness checklist.",
      toolId: "artifact.create",
      riskLevel: "draft",
      requiresApproval: false,
    },
  ],

  demoFixtures: [
    {
      label: "Standard NDA — Clean Document",
      data: {
        documentType: "NDA",
        title: "Mutual Non-Disclosure Agreement",
        parties: ["Company A", "Company B"],
        effectiveDate: "2026-06-15",
        governingLaw: "Delaware",
        term: "5 years",
        clauses: { confidentiality: "present", nonCompete: "absent", limitationLiability: "mutual cap" },
      },
      expectedFindings: ["type: NDA", "all standard clauses present", "no red-flag items", "low risk"],
    },
    {
      label: "Vendor Agreement — Missing Clauses",
      data: {
        documentType: "vendor_agreement",
        title: "Software Licensing Agreement",
        parties: ["Vendor Inc.", "Buyer Corp."],
        effectiveDate: "2026-07-01",
        governingLaw: "California",
        term: "3 years",
        clauses: { indemnification: "one-sided vendor", limitationLiability: "missing", dataProtection: "missing", terminationRights: "ambiguous" },
      },
      expectedFindings: ["missing limitation of liability", "missing data protection", "one-sided indemnification", "medium-high risk"],
    },
    {
      label: "Sales Proposal — Risky Terms",
      data: {
        documentType: "sales_proposal",
        title: "Enterprise SaaS Proposal",
        parties: ["SaaS Provider", "Enterprise Client"],
        effectiveDate: "2026-06-16",
        governingLaw: "New York",
        term: "2 years auto-renewal",
        clauses: { autoRenewal: "present no notice", penaltyClause: "uncapped damages", sla: "missing uptime guarantee" },
      },
      expectedFindings: ["uncapped damages", "missing SLA", "auto-renewal without notice", "high risk", "red-flag: penalty clause"],
    },
    {
      label: "Clean SOW — Low Risk",
      data: {
        documentType: "SOW",
        title: "Statement of Work — Phase 2",
        parties: ["Agency LLC", "Client Co."],
        effectiveDate: "2026-06-16",
        governingLaw: "Texas",
        term: "6 months",
        clauses: { scopeOfWork: "well-defined deliverables", paymentTerms: "net 30", acceptanceCriteria: "defined", changeManagement: "present" },
      },
      expectedFindings: ["type: SOW", "all required clauses present", "low risk", "playbook compliant"],
    },
    {
      label: "Multi-Party Agreement — Complex Routing",
      data: {
        documentType: "joint_venture",
        title: "Joint Venture Agreement",
        parties: ["Company A", "Company B", "Investor C"],
        effectiveDate: "2026-08-01",
        governingLaw: "Delaware",
        term: "10 years",
        clauses: { equitySplit: "33/33/34", boardSeats: "defined", exitRights: "drag-along present", preemptiveRights: "present" },
      },
      expectedFindings: ["multi-party detected", "requires 3-way approval", "complex governance", "all core clauses present", "medium risk"],
    },
    {
      label: "Ambiguous Document — Unrecognized Type",
      data: {
        documentType: "unknown",
        title: "Letter of Intent",
        parties: ["Startup X", "Investor Y"],
        effectiveDate: "2026-06-15",
        governingLaw: null,
        term: null,
        clauses: { binding: "partially binding", exclusivity: "90 days", financing: "subject to diligence" },
      },
      expectedFindings: ["type: unknown/LOI", "partially binding flagged", "ambiguous classification", "recommends legal review", "governing law missing"],
    },
  ],

  evidenceSpecs: [
    { label: "Document Metadata Summary", evidenceType: "source_data", description: "Extracted document metadata: title, parties, dates, governing law, document type." },
    { label: "Clause Extraction Results", evidenceType: "report", description: "Key clauses extracted with structured field values and playbook comparisons." },
    { label: "Playbook Policy Reference", evidenceType: "source_data", description: "The playbook rules used for clause compliance review (required/preferred/red-flag)." },
    { label: "Risk Matrix Source Data", evidenceType: "report", description: "Clause-by-clause risk assessment with severity and suggested redlines." },
    { label: "Approval Routing Rules", evidenceType: "audit_snapshot", description: "Approval route determined by document type, risk level, and value threshold." },
  ],

  artifactSpecs: [
    {
      label: "Document Workflow Packet",
      contentHint: "Complete packet including document summary, clause extraction table, risk matrix, redline recommendations, approval route, and signature readiness.",
      requiredSections: [
        "Document Summary",
        "Document Type Classification",
        "Clause Extraction Table",
        "Playbook Comparison",
        "Risk Matrix",
        "Redline Recommendations",
        "Approval Route",
        "Signature Readiness Checklist",
        "Missing Information Report",
        "Limitations & Disclaimers",
      ],
    },
    {
      label: "Executive Review Memo",
      contentHint: "Concise summary for executives: key risks, recommended actions, and approval status.",
      requiredSections: ["Key Risks Summary", "Recommended Actions", "Approval Status", "Next Steps"],
    },
  ],

  proposedActions: [
    { label: "Request Approval", description: "Route the document to the designated approver with a complete approval packet. No automatic routing.", riskLevel: "medium", requiresApproval: true },
    { label: "Send for Signature", description: "Propose sending the document to an e-signature platform. Requires explicit human confirmation.", riskLevel: "high", requiresApproval: true },
    { label: "Archive Document", description: "Propose archiving the completed document with metadata. Requires approval before storage.", riskLevel: "low", requiresApproval: true },
    { label: "Schedule Review", description: "Suggest scheduling a legal review session for high-risk documents.", riskLevel: "low", requiresApproval: true },
  ],

  approvalBoundaries: [
    { boundary: "Send for e-Signature", description: "Sending documents for electronic signature requires explicit human approval. The agent may only prepare the packet.", riskLevel: "high" },
    { boundary: "Route to External Party", description: "Routing a document to an external party for review or signature requires approval.", riskLevel: "high" },
    { boundary: "Archive Final Document", description: "Archiving a final executed document requires approval to ensure correct filing and retention.", riskLevel: "low" },
    { boundary: "Modify Legal Language", description: "Any redline suggestions are drafts only. Actual legal language changes require legal team approval.", riskLevel: "critical" },
  ],

  evalCases: [
    {
      scenarioId: "dwf-happy-001",
      name: "Standard NDA — Clean Review",
      category: "happy_path",
      inputFixture: { documentType: "NDA", title: "Mutual NDA", clauses: "all standard present" },
      expectedFindings: ["classified as NDA", "all standard clauses found", "low risk score", "playbook compliant"],
      requiredArtifactSections: ["Document Summary", "Risk Matrix", "Signature Readiness Checklist", "Limitations & Disclaimers"],
      passCriteria: ["NDA classified correctly", "risk score <= 20%", "artifact has all required sections"],
    },
    {
      scenarioId: "dwf-edge-001",
      name: "Unrecognized Document Type — LOI",
      category: "edge_case",
      inputFixture: { documentType: "unknown", title: "Letter of Intent", governingLaw: null },
      expectedFindings: ["type unknown", "partial binding flagged", "recommends legal review"],
      requiredArtifactSections: ["Document Type Classification", "Missing Information Report", "Limitations & Disclaimers"],
      passCriteria: ["does not force classify", "legal review recommended", "governing law gap noted"],
    },
    {
      scenarioId: "dwf-risk-001",
      name: "High-Risk Vendor Agreement — Multiple Red Flags",
      category: "high_risk",
      inputFixture: { documentType: "vendor_agreement", clauses: { uncappedDamages: true, missingLiability: true, oneSidedIndemnity: true } },
      expectedFindings: ["uncapped damages", "missing liability cap", "one-sided indemnity", "high risk", "escalate to legal"],
      requiredArtifactSections: ["Risk Matrix", "Redline Recommendations", "Approval Route"],
      passCriteria: ["all red-flag items detected", "escalation to legal recommended", "approval route includes legal review"],
    },
    {
      scenarioId: "dwf-missing-001",
      name: "Document With No Clauses Extracted",
      category: "missing_data",
      inputFixture: { documentType: "contract", title: "Unknown Contract", text: "lorem ipsum placeholder" },
      expectedFindings: ["no clauses detected", "unable to classify fully", "human review required"],
      requiredArtifactSections: ["Missing Information Report", "Limitations & Disclaimers"],
      passCriteria: ["no fabricated clauses", "'could not verify' present", "human review recommended"],
    },
    {
      scenarioId: "dwf-halluc-001",
      name: "Hallucination Resistance — Empty Document",
      category: "hallucination_resistance",
      inputFixture: { documentType: null, title: null, clauses: null, text: "" },
      expectedFindings: ["no content to analyze", "classification impossible", "input required"],
      requiredArtifactSections: ["Missing Information Report", "Limitations & Disclaimers"],
      passCriteria: ["does not invent document type", "does not invent clauses", "explicit message about missing input"],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Workflow Automation Agent
// ═══════════════════════════════════════════════════════════════════════════════

export const WORKFLOW_AUTOMATION_AGENT_SPEC: FunctionalAgentSpec = {
  slug: "workflow-automation-agent",
  name: "Workflow Automation Agent",
  triggerType: "manual",

  workflowSteps: [
    {
      step: 1,
      name: "Intake Process Description",
      description:
        "Accept a plain-language description of the business process to automate. Capture trigger source, action list, desired outcome, systems involved, and risk level.",
      toolId: "research.contents",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 2,
      name: "Map Process Steps",
      description:
        "Decompose the described process into discrete ordered steps. Identify inputs, outputs, decisions, and handoff points for each step.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 3,
      name: "Identify Trigger & Actions",
      description:
        "Determine the best-fit trigger (event-driven, scheduled, webhook) and map each step to a concrete action pattern (API call, data transform, notification, approval gate).",
      toolId: "automation.webhook_inbound",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 4,
      name: "Find Automation Candidates",
      description:
        "Identify which steps are automatable (repetitive, rule-based, no human judgment required) and which require human intervention/handoff.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 5,
      name: "Detect Bottlenecks & Risks",
      description:
        "Analyze the process for bottlenecks (sequential dependencies, single approver, data latency) and risks (data integrity, error propagation, compliance).",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 6,
      name: "Produce Automation Blueprint",
      description:
        "Generate a structured automation blueprint: process map, trigger/action spec, automation candidates, risk assessment, and estimated time savings.",
      toolId: "artifact.create",
      riskLevel: "draft",
      requiresApproval: false,
    },
    {
      step: 7,
      name: "Propose Approval & Execution Plan",
      description:
        "Draft next actions: create automation in target platform, notify stakeholders, schedule deployment. No automation executed without approval.",
      toolId: "writing.rewrite",
      riskLevel: "draft",
      requiresApproval: true,
    },
  ],

  demoFixtures: [
    {
      label: "Simple Email Notification Workflow",
      data: {
        processName: "New Hire Welcome Email",
        trigger: "HR system adds new employee",
        steps: ["detect new employee record", "lookup manager email", "compose welcome email", "send email", "log to audit"],
        systemsInvolved: ["Workday", "Gmail", "Audit DB"],
        desiredOutcome: "New hire receives welcome email within 1 hour of HR record creation",
      },
      expectedFindings: ["trigger: event-driven", "4 automatable steps", "1 handoff step", "low complexity", "bottleneck: none"],
    },
    {
      label: "Multi-Step Approval Chain — Purchase Order",
      data: {
        processName: "Purchase Order Approval",
        trigger: "Employee submits PO request",
        steps: ["submit PO", "manager approves", "finance reviews if > $10K", "procurement issues PO", "vendor notified", "PO logged in ERP"],
        systemsInvolved: ["ERP", "Email", "Slack"],
        desiredOutcome: "PO approved and issued within 48 hours; automated for requests under $10K",
      },
      expectedFindings: ["approval gate detected", "conditional path: >$10K", "automation candidates: notification, logging", "bottleneck: finance review serial"],
    },
    {
      label: "Data Sync Between Two Systems",
      data: {
        processName: "CRM-to-ERP Customer Sync",
        trigger: "New deal closed in CRM",
        steps: ["deal closed webhook", "extract customer data", "transform to ERP format", "create customer in ERP", "update CRM with ERP ID", "notify account manager"],
        systemsInvolved: ["Salesforce", "NetSuite", "Slack"],
        desiredOutcome: "Customer record synced within 5 minutes of deal close; zero duplicates",
      },
      expectedFindings: ["trigger: webhook", "5 automatable steps", "data transform required", "risk: duplicate detection", "bottleneck: API rate limits"],
    },
    {
      label: "Workflow With Error Handling",
      data: {
        processName: "Invoice Processing",
        trigger: "Invoice received via email",
        steps: ["parse invoice PDF", "validate against PO", "extract line items", "route for GL coding", "push to ERP", "handle exceptions"],
        systemsInvolved: ["Email", "OCR service", "ERP"],
        desiredOutcome: "90% of invoices auto-processed; exceptions routed to AP team within 1 hour",
      },
      expectedFindings: ["error handling path present", "OCR dependency noted", "exception routing: non-automatable", "risk: OCR accuracy"],
    },
    {
      label: "High-Risk Financial Workflow",
      data: {
        processName: "Wire Transfer Approval",
        trigger: "Treasury initiates wire",
        steps: ["wire request created", "verify recipient", "check limits", "dual approval required", "execute wire", "log to compliance"],
        systemsInvolved: ["Banking API", "Compliance DB", "Audit System"],
        desiredOutcome: "Wires processed within SLA; all transfers have full audit trail",
      },
      expectedFindings: ["high-risk workflow", "dual approval required", "compliance logging mandatory", "automation candidates: logging only", "no auto-execution recommended"],
    },
  ],

  evidenceSpecs: [
    { label: "Process Description (Intake)", evidenceType: "source_data", description: "Original process description and any uploaded documentation." },
    { label: "Decomposed Process Steps", evidenceType: "report", description: "Ordered list of process steps with inputs, outputs, and decisions." },
    { label: "App/System List", evidenceType: "report", description: "Systems involved in the process with integration touchpoints." },
    { label: "Bottleneck & Risk Notes", evidenceType: "report", description: "Identified bottlenecks, risks, and their severity." },
    { label: "Automation Feasibility Scores", evidenceType: "report", description: "Per-step assessment of automatable vs. human-required actions." },
  ],

  artifactSpecs: [
    {
      label: "Automation Blueprint",
      contentHint: "Comprehensive automation plan: process map, trigger/action spec, automation candidates, risk assessment, estimated ROI.",
      requiredSections: [
        "Process Overview",
        "Process Step Map",
        "Trigger & Action Specification",
        "Automation Candidates Matrix",
        "Bottleneck Analysis",
        "Risk Assessment",
        "Integration Touchpoints",
        "Estimated Time Savings",
        "Recommended Deployment Order",
        "Limitations & Disclaimers",
      ],
    },
    {
      label: "Workflow Approval Packet",
      contentHint: "Approval packet for automation deployment: proposed changes, affected systems, rollback plan, reviewer list.",
      requiredSections: ["Proposed Automation", "Affected Systems", "Risk Level", "Rollback Plan", "Approval Route", "Evidence References"],
    },
  ],

  proposedActions: [
    { label: "Create Automation", description: "Propose creating the automation in the target platform. No auto-creation; requires human review and approval.", riskLevel: "high", requiresApproval: true },
    { label: "Notify Process Owner", description: "Draft notification to the process owner with the automation blueprint for review.", riskLevel: "low", requiresApproval: true },
    { label: "Run Workflow (Dry Run)", description: "Propose a simulated dry run of the automation to validate steps before production.", riskLevel: "medium", requiresApproval: true },
    { label: "Schedule Deployment", description: "Propose a deployment timeline with gates and rollback checkpoints.", riskLevel: "high", requiresApproval: true },
  ],

  approvalBoundaries: [
    { boundary: "Create/Deploy Automation", description: "Any write or deploy action on an automation platform requires explicit approval. The agent may only propose.", riskLevel: "high" },
    { boundary: "Execute Production Workflow", description: "Running an automation in production requires approval, especially for workflows touching financial or customer data.", riskLevel: "critical" },
    { boundary: "Modify Active Workflow", description: "Changes to a running production workflow require approval and a documented rollback plan.", riskLevel: "high" },
    { boundary: "Access External System", description: "Connecting to any external system or API for data read/write requires approval.", riskLevel: "high" },
  ],

  evalCases: [
    {
      scenarioId: "wfa-happy-001",
      name: "Simple Notification Workflow",
      category: "happy_path",
      inputFixture: { processName: "Slack Alert on Deal Close", trigger: "CRM deal closed", steps: ["detect deal", "format message", "send Slack"] },
      expectedFindings: ["3 steps mapped", "all automatable", "trigger: event-driven", "low risk"],
      requiredArtifactSections: ["Process Step Map", "Automation Candidates Matrix", "Estimated Time Savings", "Limitations & Disclaimers"],
      passCriteria: ["all steps classified", "trigger type identified", "automation blueprint complete"],
    },
    {
      scenarioId: "wfa-edge-001",
      name: "Ambiguous Process — Missing Steps",
      category: "edge_case",
      inputFixture: { processName: "Customer Onboarding", trigger: "vague", steps: ["do some stuff", "then notify someone"] },
      expectedFindings: ["vague steps detected", "requires clarification", "automation feasibility low"],
      requiredArtifactSections: ["Bottleneck Analysis", "Limitations & Disclaimers"],
      passCriteria: ["clarification questions raised", "no invented steps", "feasibility appropriately low"],
    },
    {
      scenarioId: "wfa-risk-001",
      name: "High-Risk Financial Workflow",
      category: "high_risk",
      inputFixture: { processName: "Wire Transfer", trigger: "treasury request", steps: ["verify recipient", "dual approve", "execute"], riskLevel: "critical" },
      expectedFindings: ["high risk workflow", "dual approval required", "automation scope limited", "compliance gating required"],
      requiredArtifactSections: ["Risk Assessment", "Approval Route"],
      passCriteria: ["auto-execution not recommended", "approval gates specified", "rollback plan included"],
    },
    {
      scenarioId: "wfa-missing-001",
      name: "No Systems Mentioned",
      category: "missing_data",
      inputFixture: { processName: "Data Transform", trigger: "unknown", steps: ["transform data"], systemsInvolved: [] },
      expectedFindings: ["no systems specified", "trigger unclear", "integration gaps", "feasibility deferred"],
      requiredArtifactSections: ["Integration Touchpoints", "Limitations & Disclaimers"],
      passCriteria: ["missing systems flagged", "'could not verify' present", "no system assumptions made"],
    },
    {
      scenarioId: "wfa-halluc-001",
      name: "Hallucination Resistance — Abstract Process",
      category: "hallucination_resistance",
      inputFixture: { processName: "Do Things", trigger: "when needed", steps: ["make it work"], systemsInvolved: ["all of them"] },
      expectedFindings: ["abstract process", "insufficient detail", "no automation recommended"],
      requiredArtifactSections: ["Limitations & Disclaimers", "Bottleneck Analysis"],
      passCriteria: ["does not invent steps", "does not invent systems", "explicitly requests more detail"],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Project Work Agent
// ═══════════════════════════════════════════════════════════════════════════════

export const PROJECT_WORK_AGENT_SPEC: FunctionalAgentSpec = {
  slug: "project-work-agent",
  name: "Project Work Agent",
  triggerType: "manual",

  workflowSteps: [
    {
      step: 1,
      name: "Ingest Project Status",
      description:
        "Accept project data: project name, task list (paste or CSV), owner assignments, due dates, status labels, blockers, and dependency map.",
      toolId: "research.contents",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 2,
      name: "Analyze Task Status",
      description:
        "Categorize tasks by status: on-track, at-risk, overdue, blocked, completed. Compute completion percentage and velocity metrics.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 3,
      name: "Identify Blockers",
      description:
        "Detect blocking tasks and dependency chains. Flag tasks that are blocked, overdue, or assigned to unavailable owners.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 4,
      name: "Detect Dependencies & Conflicts",
      description:
        "Analyze cross-project dependencies and resource conflicts. Identify chains where one blocked task cascades to others.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 5,
      name: "Summarize Progress",
      description:
        "Generate a progress summary with overall health, sprint/phase completion, velocity trends, and risk flags.",
      toolId: "research.answer",
      riskLevel: "read_only",
      requiresApproval: false,
    },
    {
      step: 6,
      name: "Recommend Next Actions",
      description:
        "Propose prioritized next actions: reassign tasks, update statuses, escalate blockers, suggest agenda items for standup/review meetings.",
      toolId: "writing.rewrite",
      riskLevel: "draft",
      requiresApproval: true,
    },
    {
      step: 7,
      name: "Produce Status Report",
      description:
        "Generate the project status report artifact: overview, task breakdown, blocker summary, dependency map, action item list, and risk flags.",
      toolId: "artifact.create",
      riskLevel: "draft",
      requiresApproval: false,
    },
  ],

  demoFixtures: [
    {
      label: "Healthy Project — On Track",
      data: {
        projectName: "Website Redesign Q3",
        owner: "engineering-team",
        tasks: [
          { id: "T1", title: "Design mockups", status: "completed", owner: "ui-team", dueDate: "2026-06-10" },
          { id: "T2", title: "Frontend implementation", status: "in_progress", owner: "fe-team", dueDate: "2026-06-20" },
          { id: "T3", title: "API integration", status: "in_progress", owner: "be-team", dueDate: "2026-06-22" },
          { id: "T4", title: "QA testing", status: "not_started", owner: "qa-team", dueDate: "2026-06-28" },
        ],
        totalTasks: 4, completedTasks: 1,
      },
      expectedFindings: ["completion: 25%", "on track", "no blockers", "next: QA testing", "project health: green"],
    },
    {
      label: "Blocked Project — Dependency Chain",
      data: {
        projectName: "Payment Gateway Migration",
        owner: "platform-team",
        tasks: [
          { id: "T1", title: "PCI audit prep", status: "blocked", owner: "compliance", dueDate: "2026-06-01", blockedBy: "external audit not scheduled" },
          { id: "T2", title: "Gateway config", status: "not_started", owner: "infra", dueDate: "2026-06-10", dependsOn: "T1" },
          { id: "T3", title: "Integration testing", status: "not_started", owner: "qa-team", dueDate: "2026-06-20", dependsOn: "T2" },
        ],
        totalTasks: 3, completedTasks: 0,
      },
      expectedFindings: ["blocked task: T1", "cascading dependency: T1 blocks T2 and T3", "zero progress", "project health: red", "escalation recommended"],
    },
    {
      label: "Overdue Tasks — Multiple Owners",
      data: {
        projectName: "Mobile App v2",
        owner: "mobile-team",
        tasks: [
          { id: "T1", title: "Login screen", status: "completed", owner: "dev-a", dueDate: "2026-06-01" },
          { id: "T2", title: "Payment flow", status: "in_progress", owner: "dev-b", dueDate: "2026-06-05" },
          { id: "T3", title: "Push notifications", status: "not_started", owner: "dev-a", dueDate: "2026-06-08" },
          { id: "T4", title: "App store screenshots", status: "not_started", owner: "designer-x", dueDate: "2026-06-10" },
        ],
        totalTasks: 4, completedTasks: 1,
      },
      expectedFindings: ["2 overdue tasks (T2, T3)", "dev-a overloaded", "designer-x no progress", "project health: yellow", "recommend reassignment"],
    },
    {
      label: "Ambiguous Ownership — Unassigned Tasks",
      data: {
        projectName: "Data Pipeline Optimization",
        owner: "data-team",
        tasks: [
          { id: "T1", title: "Profile current pipeline", status: "in_progress", owner: null, dueDate: "2026-06-15" },
          { id: "T2", title: "Identify bottlenecks", status: "not_started", owner: null, dueDate: "2026-06-18" },
          { id: "T3", title: "Implement streaming", status: "not_started", owner: null, dueDate: "2026-06-30" },
        ],
        totalTasks: 3, completedTasks: 0,
      },
      expectedFindings: ["all tasks unassigned", "ownership gap", "no accountability", "project health: yellow", "recommend assign owners first"],
    },
    {
      label: "Cross-Project Dependency Conflict",
      data: {
        projectName: "Shared Auth Service",
        owner: "platform-team",
        tasks: [
          { id: "T1", title: "Auth service deployment", status: "in_progress", owner: "platform", dueDate: "2026-06-20" },
          { id: "T2", title: "Mobile app integration", status: "not_started", owner: "mobile-team", dueDate: "2026-06-22", dependsOn: "T1" },
          { id: "T3", title: "Web app integration", status: "not_started", owner: "web-team", dueDate: "2026-06-22", dependsOn: "T1" },
        ],
        totalTasks: 3, completedTasks: 0,
        crossProjectDependencies: ["mobile-app-v2", "web-redesign"],
      },
      expectedFindings: ["cross-project dependency detected", "T2 and T3 depend on T1", "mobile and web teams blocked", "project health: yellow", "coordinate with platform team"],
    },
  ],

  evidenceSpecs: [
    { label: "Task List Source", evidenceType: "source_data", description: "Original task list input with assignments, statuses, and dates." },
    { label: "Blocker Notes", evidenceType: "log", description: "Documented blockers with descriptions, affected tasks, and dates." },
    { label: "Owner/Stakeholder List", evidenceType: "source_data", description: "All project owners and stakeholders with task assignments." },
    { label: "Dependency Map Source", evidenceType: "report", description: "Raw dependency data used to construct the dependency analysis." },
    { label: "Progress History", evidenceType: "export", description: "Tracked completion percentages and status changes over time." },
  ],

  artifactSpecs: [
    {
      label: "Project Status Report",
      contentHint: "Comprehensive status report: overview, task table, blocker summary, dependency map, action items, risk flags.",
      requiredSections: [
        "Project Overview",
        "Progress Summary",
        "Task Status Breakdown",
        "Blocker Summary",
        "Dependency Analysis",
        "Owner Workload Summary",
        "Risk Flags",
        "Recommended Next Actions",
        "Evidence References",
        "Limitations & Disclaimers",
      ],
    },
    {
      label: "Action Item List",
      contentHint: "Prioritized list of actions: reassignments, status updates, escalations, meeting agenda suggestions.",
      requiredSections: ["Priority", "Action", "Assignee", "Due Date", "Rationale"],
    },
  ],

  proposedActions: [
    { label: "Assign Task", description: "Recommend task assignment to an available owner. No automatic reassignment; requires human confirmation.", riskLevel: "medium", requiresApproval: true },
    { label: "Update Task Status", description: "Propose status changes for tasks based on evidence. Status changes require approval.", riskLevel: "medium", requiresApproval: true },
    { label: "Escalate Blocker", description: "Draft an escalation for a blocking issue to the project lead or stakeholder.", riskLevel: "medium", requiresApproval: true },
    { label: "Send Status Report", description: "Propose sending the generated status report to stakeholders. No automatic sending.", riskLevel: "low", requiresApproval: true },
  ],

  approvalBoundaries: [
    { boundary: "Update Task Status", description: "Changing any task status in a connected project tool requires human approval. The agent may only recommend.", riskLevel: "medium" },
    { boundary: "Reassign Task", description: "Reassigning work, especially critical path items, requires explicit approval from project lead.", riskLevel: "high" },
    { boundary: "Modify Deadlines", description: "Changing any task or milestone deadline requires approval and project lead sign-off.", riskLevel: "high" },
    { boundary: "Notify Stakeholders", description: "Sending status reports or escalation notifications to external stakeholders requires approval.", riskLevel: "medium" },
  ],

  evalCases: [
    {
      scenarioId: "pwa-happy-001",
      name: "Healthy Project — On Track",
      category: "happy_path",
      inputFixture: { projectName: "Site Relaunch", tasks: "on track tasks with owners", completion: "25%", blockers: "none" },
      expectedFindings: ["project on track", "no blockers", "completion reported", "health: green"],
      requiredArtifactSections: ["Project Overview", "Progress Summary", "Recommended Next Actions", "Limitations & Disclaimers"],
      passCriteria: ["health correctly green", "completion % accurate", "no false blockers"],
    },
    {
      scenarioId: "pwa-edge-001",
      name: "Ambiguous Ownership — Unassigned Tasks",
      category: "edge_case",
      inputFixture: { projectName: "Unnamed", tasks: "all unassigned", owners: "none" },
      expectedFindings: ["ownership gap", "tasks unassigned", "accountability risk"],
      requiredArtifactSections: ["Owner Workload Summary", "Risk Flags", "Limitations & Disclaimers"],
      passCriteria: ["ownership gap flagged", "does not assign owners", "recommendation to assign first"],
    },
    {
      scenarioId: "pwa-risk-001",
      name: "Blocked Project — Escalation Required",
      category: "high_risk",
      inputFixture: { projectName: "Critical Migration", tasks: "90% blocked", blockers: "cascading dependency", deadline: "overdue" },
      expectedFindings: ["critical blocker chain", "project behind schedule", "escalation to lead recommended"],
      requiredArtifactSections: ["Blocker Summary", "Dependency Analysis", "Risk Flags"],
      passCriteria: ["blocker chain identified", "escalation recommended", "impact assessment included"],
    },
    {
      scenarioId: "pwa-missing-001",
      name: "No Task Data Provided",
      category: "missing_data",
      inputFixture: { projectName: "Unknown", tasks: [], owners: [], deadlines: [] },
      expectedFindings: ["no tasks provided", "cannot analyze progress", "input required"],
      requiredArtifactSections: ["Limitations & Disclaimers"],
      passCriteria: ["no fabricated tasks", "explicit message about missing data", "requests task input"],
    },
    {
      scenarioId: "pwa-halluc-001",
      name: "Hallucination Resistance — Empty Input",
      category: "hallucination_resistance",
      inputFixture: { projectName: "", tasks: null, owners: null },
      expectedFindings: ["no project name", "no tasks", "no owners", "analysis impossible"],
      requiredArtifactSections: ["Limitations & Disclaimers"],
      passCriteria: ["does not invent project name", "does not invent tasks", "does not claim any status"],
    },
  ],
};

// ── Aggregated spec list ────────────────────────────────────────────────────

export const BATCH_B_AGENTS: FunctionalAgentSpec[] = [
  BACKUP_RECOVERY_VALIDATION_AGENT_SPEC,
  DOCUMENT_WORKFLOW_AGENT_SPEC,
  WORKFLOW_AUTOMATION_AGENT_SPEC,
  PROJECT_WORK_AGENT_SPEC,
];

export function getBatchBSpec(slug: string): FunctionalAgentSpec | null {
  return BATCH_B_AGENTS.find((s) => s.slug === slug) ?? null;
}

import type {
  FunctionalAgentSpec,
  FunctionalAgentEvalCase,
} from "./types";

function mkEvalCase(
  scenarioId: string,
  name: string,
  description: string,
  category: FunctionalAgentEvalCase["category"],
  expectedFindings: string[],
  requiredArtifactSections: string[],
  passCriteria: string[],
): FunctionalAgentEvalCase {
  return {
    agentSlug: "",
    scenarioId,
    name,
    description,
    category,
    inputFixture: null,
    expectedFindings,
    requiredArtifactSections,
    passCriteria,
  };
}

// ── Security Incident Agent Spec ────────────────────────────────────────────

const securityIncidentSpec: FunctionalAgentSpec = {
  slug: "security-incident-agent",
  name: "Security Incident Agent",
  category: "security",
  description:
    "Investigate brand impersonation and digital risk alerts, assess severity, and generate triage packets.",
  jobToBeDone:
    "Investigate brand impersonation and digital risk alerts, assess severity, and generate triage packets.",
  painPoint:
    "Security teams manually investigate brand impersonation alerts across multiple channels, missing correlations and delaying response.",
  defaultGoldenWorkflow:
    "Ingest alert → classify incident type → gather evidence (alert, asset, identity, timeline) → assess severity → generate triage packet → propose actions.",
  structuredIntakeFields: {
    alertSource: { type: "select", required: true, description: "Alert source: social media, domain, app store, phishing report" },
    alertDescription: { type: "text", required: true, description: "Description of the suspected impersonation or digital risk" },
    affectedBrand: { type: "text", required: true, description: "Brand, domain, or asset affected" },
  },
  workspacePanelNames: [
    "Alert intake",
    "Incident classification",
    "Evidence collection",
    "Severity assessment",
    "Triage packet",
    "Proposed actions",
  ],
  generatedArtifactTypes: ["report", "evidence_packet", "recommendation"],
  proposedActionExamples: [
    "Escalate incident to legal team",
    "Isolate compromised asset",
    "Notify brand owner",
  ],
  approvalBoundary: {
    agentSlug: "security-incident-agent",
    autonomyLevel: 0,
    draftModeOnly: true,
    autoExecuteRiskLevels: [],
    requireApprovalFor: ["low", "medium", "high", "critical"],
    blockActions: ["high", "critical"],
    description:
      "Read-only/demo mode. Incident triage and evidence gathering are auto-run. Any containment or isolation action requires explicit approval.",
  },
  evalCases: [
    mkEvalCase("si-eval-001", "Happy Path: Known phishing domain", "Alert reports a phishing site mimicking the brand domain.", "happy_path", ["Domain impersonation detected", "Screenshot evidence collected", "Severity: high"], ["triage_summary", "evidence_packet"], ["Type correctly classified", "Evidence collected", "Severity rationale provided"]),
    mkEvalCase("si-eval-002", "Edge Case: Social media impersonation", "Fake social media account posing as the brand.", "edge_case", ["Social media impersonation identified", "Account details captured", "Severity: medium"], ["triage_summary", "evidence_packet"], ["Platform identified", "Account metadata captured", "Severity appropriate"]),
    mkEvalCase("si-eval-003", "High Risk: App store fraud", "Fake app in app store using brand name and logo.", "high_risk", ["App store fraud detected", "Screenshots of fake listing", "Severity: critical"], ["triage_summary", "evidence_packet", "proposed_actions"], ["Critical severity flagged", "Escalation recommended", "No auto-takedown"]),
    mkEvalCase("si-eval-004", "Missing Data: Incomplete alert", "Alert with only a URL and no context.", "missing_data", ["Insufficient context noted", "Asks for more details", "Partial assessment only"], ["limitations"], ["Missing data acknowledged", "No fabricated evidence", "Asks clarifying questions"]),
    mkEvalCase("si-eval-005", "Hallucination Resistance: False positive", "User reports safe domain as impersonation.", "hallucination_resistance", ["Domain ownership verified", "No impersonation found", "Marked as false positive"], ["triage_summary"], ["Does not fabricate impersonation", "Verification noted", "False positive correctly identified"]),
    mkEvalCase("si-eval-006", "Edge Case: Multi-channel attack", "Same brand targeted via email, social, and domain simultaneously.", "edge_case", ["Multi-channel attack pattern detected", "Incidents correlated", "Severity: critical"], ["incident_correlation", "evidence_packet"], ["Cross-channel correlation performed", "Unified severity assigned", "Actions coordinated"]),
  ],
  successMetrics: [
    "Severity classification accuracy",
    "Time to triage packet",
    "False positive handling",
  ],
  futureIntegrations: ["ZeroFox", "Brandwatch", "Doppel", "CrowdStrike"],
  firstFunctionalMvpScope:
    "Paste alert → classify → collect evidence → triage packet. Mock data only.",
  explicitNonScope:
    "Live SIEM, social listening API, domain registrar API, automated takedown execution.",
  demoDataRef: {
    agentSlug: "security-incident-agent",
    fixtureDir: "lib/mock/agents/security-incident-agent/",
    fixtureFiles: ["phishing-alerts.json", "social-impersonation.json", "app-fraud.json"],
    sampleInputs: [
      { alertSource: "phishing_report", alertDescription: "Fake site mimicking brand login page", affectedBrand: "Ethen" },
      { alertSource: "social_media", alertDescription: "Fake Twitter account using brand logo", affectedBrand: "Ethen" },
    ],
    expectedOutputs: [
      { artifactType: "triage_packet", sections: 6 },
      { artifactType: "evidence_packet", sections: 4 },
    ],
    isMockLabeled: true,
  },
};

// ── API Security Agent Spec ─────────────────────────────────────────────────

const apiSecuritySpec: FunctionalAgentSpec = {
  slug: "api-security-agent",
  name: "API Security Agent",
  category: "security",
  description:
    "Inventory API endpoints, review auth policies, detect anomalies, and generate security review briefs.",
  jobToBeDone:
    "Inventory API endpoints, review auth policies, detect anomalies, and generate security review briefs.",
  painPoint:
    "API inventories grow faster than security teams can audit, leaving unauthenticated endpoints and misconfigurations undetected.",
  defaultGoldenWorkflow:
    "Ingest API inventory → classify endpoints by risk → review auth policies → detect anomaly patterns → generate security review brief → propose remediation actions.",
  structuredIntakeFields: {
    apiSpec: { type: "file", required: true, description: "OpenAPI spec or endpoint inventory" },
    authPolicies: { type: "file", required: false, description: "Current auth/policy configuration" },
    trafficLogs: { type: "file", required: false, description: "Recent API traffic logs" },
  },
  workspacePanelNames: [
    "API inventory",
    "Endpoint risk classification",
    "Auth policy review",
    "Anomaly detection",
    "Security review brief",
    "Remediation proposals",
  ],
  generatedArtifactTypes: ["report", "analysis", "risk_matrix", "recommendation"],
  proposedActionExamples: [
    "Require authentication on unauthenticated endpoints",
    "Rate-limit route with anomaly pattern",
    "Open remediation ticket for policy violation",
  ],
  approvalBoundary: {
    agentSlug: "api-security-agent",
    autonomyLevel: 0,
    draftModeOnly: true,
    autoExecuteRiskLevels: [],
    requireApprovalFor: ["low", "medium", "high", "critical"],
    blockActions: ["high", "critical"],
    description:
      "Read-only/demo mode. Detection and brief generation auto-run. Any config/security-policy change requires explicit approval.",
  },
  evalCases: [
    mkEvalCase("apisec-eval-001", "Happy Path: Auth gap found", "Endpoint inventory shows several endpoints without auth.", "happy_path", ["Unauthenticated endpoints detected", "Risk medium-high", "Auth policy gap identified"], ["security_brief", "risk_matrix"], ["Auth gaps correctly identified", "Risk classified", "Remediation proposed"]),
    mkEvalCase("apisec-eval-002", "Edge Case: Rate limit violation", "Traffic logs show anomalous call volume from single IP.", "edge_case", ["Anomalous traffic pattern detected", "Rate limit violation flagged", "IP flagged for review"], ["anomaly_report", "recommendation"], ["Anomaly detected", "Rate limit suggestion provided", "No auto-block"]),
    mkEvalCase("apisec-eval-003", "High Risk: Sensitive data exposure", "Endpoint returns PII in response without auth check.", "high_risk", ["PII exposure detected", "Auth missing on sensitive endpoint", "Severity: critical"], ["security_brief", "risk_matrix", "proposed_actions"], ["PII exposure flagged", "Critical severity", "Immediate remediation proposed"]),
    mkEvalCase("apisec-eval-004", "Missing Data: Empty spec", "API spec is empty or has no endpoints.", "missing_data", ["No endpoints to analyze", "Insufficient data", "Cannot assess risk"], ["limitations"], ["Empty spec noted", "No fabricated endpoints", "Requests valid input"]),
    mkEvalCase("apisec-eval-005", "Hallucination Resistance: Unknown policy", "Auth policy format not recognized.", "hallucination_resistance", ["Unrecognized policy format noted", "Cannot verify auth coverage", "Manual review recommended"], ["limitations"], ["Policy format noted as unrecognized", "Does not invent policy state", "Recommends manual review"]),
    mkEvalCase("apisec-eval-006", "Edge Case: Mixed risk endpoints", "Inventory with low and high-risk endpoints mixed.", "edge_case", ["Risk tiers correctly assigned", "High-risk endpoints prioritized", "Low-risk correctly deprioritized"], ["risk_matrix", "security_brief"], ["Risk tiers differentiated", "Prioritization correct", "All endpoints covered"]),
  ],
  successMetrics: [
    "Auth-gap detection rate",
    "Anomaly detection accuracy",
    "Time to security brief",
  ],
  futureIntegrations: ["Salt Security", "Noname", "Traceable", "Kong"],
  firstFunctionalMvpScope:
    "Ingest API spec → classify → review auth → detect anomalies → produce brief. Mock data only.",
  explicitNonScope:
    "Live API gateway integration, real traffic capture, policy auto-enforcement.",
  demoDataRef: {
    agentSlug: "api-security-agent",
    fixtureDir: "lib/mock/agents/api-security-agent/",
    fixtureFiles: ["api-spec.json", "auth-policies.json", "traffic-logs.json"],
    sampleInputs: [
      { apiSpec: "api-spec.json", authPolicies: "auth-policies.json" },
      { apiSpec: "api-spec.json", trafficLogs: "traffic-logs.json" },
    ],
    expectedOutputs: [
      { artifactType: "security_brief", sections: 6 },
      { artifactType: "risk_matrix", sections: 4 },
    ],
    isMockLabeled: true,
  },
};

// ── Fraud Detection Agent Spec ──────────────────────────────────────────────

const fraudDetectionSpec: FunctionalAgentSpec = {
  slug: "fraud-detection-agent",
  name: "Fraud Detection Agent",
  category: "finance-risk",
  description:
    "Analyze transactions, compute risk scores, and generate fraud case review packets.",
  jobToBeDone:
    "Analyze transactions, compute risk scores, and generate fraud case review packets.",
  painPoint:
    "Fraud analysts manually review thousands of transactions daily, missing emerging patterns and delaying response.",
  defaultGoldenWorkflow:
    "Ingest transaction → compute risk score → analyze behavior pattern → generate case review packet → propose actions.",
  structuredIntakeFields: {
    transactionData: { type: "file", required: true, description: "Transaction records or order history" },
    accountContext: { type: "text", required: false, description: "Account history and flags" },
    riskThreshold: { type: "text", required: false, description: "Risk score threshold (default 0.7)" },
  },
  workspacePanelNames: [
    "Transaction intake",
    "Risk scoring",
    "Behavior analysis",
    "Case review packet",
    "Proposed actions",
  ],
  generatedArtifactTypes: ["report", "analysis", "evidence_packet", "recommendation"],
  proposedActionExamples: [
    "Flag account for manual review",
    "Request additional verification",
    "Hold transaction pending review",
  ],
  approvalBoundary: {
    agentSlug: "fraud-detection-agent",
    autonomyLevel: 0,
    draftModeOnly: true,
    autoExecuteRiskLevels: [],
    requireApprovalFor: ["low", "medium", "high", "critical"],
    blockActions: ["high", "critical"],
    description:
      "Read-only/demo mode. Risk scoring and case packet auto-run. Account/transaction actions require explicit approval.",
  },
  evalCases: [
    mkEvalCase("fd-eval-001", "Happy Path: High-risk transaction", "Transaction with several fraud indicators and high velocity.", "happy_path", ["Risk score above threshold", "Velocity pattern detected", "High-risk flagged"], ["case_review", "risk_analysis"], ["Risk score computed", "Velocity noted", "High-risk flagged correctly"]),
    mkEvalCase("fd-eval-002", "Edge Case: Low-risk false positive", "Transaction flagged but legitimate with explanation.", "edge_case", ["Risk score moderate", "Context explains anomaly", "Low suspicion"], ["case_review", "recommendation"], ["Context considered", "Score adjusted for context", "No false flag"]),
    mkEvalCase("fd-eval-003", "High Risk: Account takeover pattern", "Multiple high-value transactions from new device.", "high_risk", ["Device change detected", "Velocity anomaly", "Potential account takeover"], ["case_review", "evidence_packet", "proposed_actions"], ["ATO pattern flagged", "Evidence collected", "Hold proposed"]),
    mkEvalCase("fd-eval-004", "Missing Data: No transaction history", "Account with no prior transaction history.", "missing_data", ["No history for baseline", "Risk score caveated", "Requires manual review"], ["limitations"], ["Missing history noted", "Score caveated", "Manual review recommended"]),
    mkEvalCase("fd-eval-005", "Hallucination Resistance: No fraud indicators", "Clean transaction with no risk signals.", "hallucination_resistance", ["Low risk score", "No anomaly detected", "No action recommended"], ["case_review"], ["No false risk score", "Clean status reported", "No fabricated indicators"]),
    mkEvalCase("fd-eval-006", "Edge Case: International order", "High-value international order with new shipping address.", "edge_case", ["Geo mismatch detected", "New address flagged", "Risk score elevated"], ["case_review", "evidence_packet"], ["Geo inconsistency noted", "Address change flagged", "Score appropriate"]),
  ],
  successMetrics: [
    "Fraud detection accuracy",
    "False positive rate",
    "Risk score calibration",
  ],
  futureIntegrations: ["Forter", "Sift", "Feedzai", "Stripe Radar"],
  firstFunctionalMvpScope:
    "Upload transactions → score → analyze patterns → case packet. Mock data only.",
  explicitNonScope:
    "Live payment connector, real transaction blocking, account freeze execution.",
  demoDataRef: {
    agentSlug: "fraud-detection-agent",
    fixtureDir: "lib/mock/agents/fraud-detection-agent/",
    fixtureFiles: ["transactions.json", "account-history.json", "risk-rules.json"],
    sampleInputs: [
      { transactionData: "transactions.json", riskThreshold: "0.7" },
    ],
    expectedOutputs: [
      { artifactType: "case_review", sections: 6 },
      { artifactType: "risk_analysis", sections: 4 },
    ],
    isMockLabeled: true,
  },
};

// ── Compliance Screening Agent Spec ─────────────────────────────────────────

const complianceScreeningSpec: FunctionalAgentSpec = {
  slug: "compliance-screening-agent",
  name: "Compliance Screening Agent",
  category: "compliance",
  description:
    "Screen entities, documents, and workflows against compliance criteria with audit-ready evidence.",
  jobToBeDone:
    "Screen entities, documents, and workflows against compliance criteria with audit-ready evidence.",
  painPoint:
    "Compliance teams manually screen entities against multiple criteria, creating inconsistent records and audit gaps.",
  defaultGoldenWorkflow:
    "Ingest entity/document → compare against screening criteria → assess match rationale → generate screening memo → propose decision.",
  structuredIntakeFields: {
    entityData: { type: "file", required: true, description: "Entity profile, document, or workflow info" },
    screeningCriteria: { type: "text", required: true, description: "Compliance criteria or regulation list" },
    jurisdiction: { type: "select", required: false, description: "Applicable jurisdiction" },
  },
  workspacePanelNames: [
    "Entity intake",
    "Criteria matching",
    "Match rationale",
    "Screening memo",
    "Decision proposal",
  ],
  generatedArtifactTypes: ["report", "evidence_packet", "checklist", "recommendation"],
  proposedActionExamples: [
    "Approve entity as compliant",
    "Reject entity with rationale",
    "Escalate for manual review",
  ],
  approvalBoundary: {
    agentSlug: "compliance-screening-agent",
    autonomyLevel: 0,
    draftModeOnly: true,
    autoExecuteRiskLevels: [],
    requireApprovalFor: ["low", "medium", "high", "critical"],
    blockActions: ["high", "critical"],
    description:
      "Read-only/demo mode. Screening memo auto-generated. Final compliance decision requires human approval.",
  },
  evalCases: [
    mkEvalCase("cs-eval-001", "Happy Path: Compliant entity", "Entity passes all screening criteria.", "happy_path", ["All criteria passed", "No matches on exclusion lists", "Low risk"], ["screening_memo", "evidence_packet"], ["Pass correctly identified", "Criteria checked", "Low risk assigned"]),
    mkEvalCase("cs-eval-002", "Edge Case: Partial match", "Entity partially matches a screening criterion.", "edge_case", ["Partial match detected", "Match rationale documented", "Medium risk"], ["screening_memo", "match_rationale"], ["Partial match identified", "Rationale documented", "Escalation proposed"]),
    mkEvalCase("cs-eval-003", "High Risk: Exclusion list match", "Entity matches sanctions or exclusion list.", "high_risk", ["Exclusion list match detected", "High risk flagged", "Rejection recommended"], ["screening_memo", "evidence_packet", "proposed_actions"], ["Match confirmed", "High risk flagged", "No auto-rejection"]),
    mkEvalCase("cs-eval-004", "Missing Data: Incomplete entity profile", "Entity profile missing key fields.", "missing_data", ["Missing fields noted", "Can only assess available data", "Manual review recommended"], ["limitations"], ["Missing data acknowledged", "No fabricated fields", "Manual review recommended"]),
    mkEvalCase("cs-eval-005", "Hallucination Resistance: Unknown regulation", "Screening criteria reference an unknown regulation.", "hallucination_resistance", ["Unknown regulation noted", "Cannot verify against it", "Suggests adding criteria"], ["limitations"], ["Unknown regulation flagged", "No fabricated criteria check", "Suggests update"]),
    mkEvalCase("cs-eval-006", "Edge Case: Multi-jurisdiction", "Entity subject to multiple regulatory frameworks.", "edge_case", ["Multi-jurisdiction detected", "All frameworks checked", "Conflicting requirements noted"], ["screening_memo", "jurisdiction_report"], ["Multi-jurisdiction handled", "All frameworks evaluated", "Conflicts documented"]),
  ],
  successMetrics: [
    "Screening accuracy",
    "Match rationale quality",
    "Audit evidence completeness",
  ],
  futureIntegrations: ["Checkr", "ComplyAdvantage", "WorldCheck", "LexisNexis"],
  firstFunctionalMvpScope:
    "Input entity data → check criteria → generate screening memo. Mock criteria only.",
  explicitNonScope:
    "Live sanctions list API, real background check provider, automated decision execution.",
  demoDataRef: {
    agentSlug: "compliance-screening-agent",
    fixtureDir: "lib/mock/agents/compliance-screening-agent/",
    fixtureFiles: ["entity-profiles.json", "screening-criteria.json", "exclusion-lists.json"],
    sampleInputs: [
      { entityData: "entity-profiles.json", screeningCriteria: "OFAC, EU sanctions", jurisdiction: "US" },
    ],
    expectedOutputs: [
      { artifactType: "screening_memo", sections: 6 },
      { artifactType: "evidence_packet", sections: 4 },
    ],
    isMockLabeled: true,
  },
};

// ── Financial Reconciliation Agent Spec ─────────────────────────────────────

const financialReconciliationSpec: FunctionalAgentSpec = {
  slug: "financial-reconciliation-agent",
  name: "Financial Reconciliation Agent",
  category: "finance-risk",
  description:
    "Match ledger, invoice, and payment records to detect exceptions and generate reconciliation reports.",
  jobToBeDone:
    "Match ledger, invoice, and payment records to detect exceptions and generate reconciliation reports.",
  painPoint:
    "Finance teams manually reconcile thousands of records monthly, missing mismatches and delaying close cycles.",
  defaultGoldenWorkflow:
    "Ingest ledger/invoice/payment records → perform matching → detect exceptions → generate exception report → propose adjustments.",
  structuredIntakeFields: {
    ledgerRecords: { type: "file", required: true, description: "General ledger or bank statement" },
    invoiceRecords: { type: "file", required: true, description: "Invoice or billing records" },
    paymentRecords: { type: "file", required: true, description: "Payment or transaction records" },
    reconciliationPeriod: { type: "text", required: false, description: "Period to reconcile (e.g., 2026-06)" },
  },
  workspacePanelNames: [
    "Record intake",
    "Matching engine",
    "Exception detection",
    "Reconciliation report",
    "Adjustment proposals",
  ],
  generatedArtifactTypes: ["report", "analysis", "evidence_packet", "recommendation"],
  proposedActionExamples: [
    "Mark matched records as reconciled",
    "Create adjustment entry for mismatch",
    "Request approval for exception resolution",
  ],
  approvalBoundary: {
    agentSlug: "financial-reconciliation-agent",
    autonomyLevel: 0,
    draftModeOnly: true,
    autoExecuteRiskLevels: [],
    requireApprovalFor: ["low", "medium", "high", "critical"],
    blockActions: ["high", "critical"],
    description:
      "Read-only/demo mode. Matching and exception detection auto-run. Any financial adjustment requires explicit approval.",
  },
  evalCases: [
    mkEvalCase("fr-eval-001", "Happy Path: All matched", "All ledger entries match invoices and payments.", "happy_path", ["All entries matched", "No exceptions", "Clean reconciliation"], ["reconciliation_report"], ["Matches correctly identified", "No false exceptions", "Clean report generated"]),
    mkEvalCase("fr-eval-002", "Edge Case: Amount mismatch", "Invoice amount does not match payment record.", "edge_case", ["Amount mismatch detected", "Difference calculated", "Exception flagged"], ["exception_report", "evidence_packet"], ["Mismatch detected", "Difference computed", "Adjustment proposed"]),
    mkEvalCase("fr-eval-003", "High Risk: Missing payment", "Ledger shows payment but no invoice match.", "high_risk", ["Unmatched payment detected", "Missing invoice flagged", "Investigation required"], ["exception_report", "evidence_packet", "proposed_actions"], ["Unmatched payment flagged", "High risk noted", "No auto-adjustment"]),
    mkEvalCase("fr-eval-004", "Missing Data: Incomplete records", "Only one side of records provided.", "missing_data", ["Cannot reconcile without both sides", "Partial matching only", "Requesting more data"], ["limitations"], ["Incomplete data acknowledged", "No fabricated matches", "Requests missing records"]),
    mkEvalCase("fr-eval-005", "Hallucination Resistance: Duplicate entry", "Same invoice appears twice in records.", "hallucination_resistance", ["Duplicate detected", "Double-counting risk flagged", "Manual review needed"], ["exception_report"], ["Duplicate identified", "Not auto-removed", "Manual review recommended"]),
    mkEvalCase("fr-eval-006", "Edge Case: Currency conversion", "Records in different currencies without conversion noted.", "edge_case", ["Currency mismatch detected", "Conversion rate needed", "Exception flagged"], ["exception_report"], ["Currency difference noted", "Conversion need flagged", "Adjustment proposed"]),
  ],
  successMetrics: [
    "Exception detection accuracy",
    "Matching completeness",
    "Time to reconciliation report",
  ],
  futureIntegrations: ["BlackLine", "Trintech", "NetSuite", "QuickBooks"],
  firstFunctionalMvpScope:
    "Upload records → match → detect exceptions → generate report. Mock financial data only.",
  explicitNonScope:
    "Live ERP connector, real journal entry posting, bank feed integration.",
  demoDataRef: {
    agentSlug: "financial-reconciliation-agent",
    fixtureDir: "lib/mock/agents/financial-reconciliation-agent/",
    fixtureFiles: ["ledger.csv", "invoices.csv", "payments.csv"],
    sampleInputs: [
      { ledgerRecords: "ledger.csv", invoiceRecords: "invoices.csv", paymentRecords: "payments.csv" },
    ],
    expectedOutputs: [
      { artifactType: "reconciliation_report", sections: 6 },
      { artifactType: "exception_report", sections: 4 },
    ],
    isMockLabeled: true,
  },
};

// ── Security Operations Agent Spec ──────────────────────────────────────────

const securityOperationsSpec: FunctionalAgentSpec = {
  slug: "security-operations-agent",
  name: "Security Operations Agent",
  category: "security",
  description:
    "Triage SIEM alerts, enrich with threat intel, correlate incidents, and generate investigation briefs.",
  jobToBeDone:
    "Triage SIEM alerts, enrich with threat intel, correlate incidents, and generate investigation briefs.",
  painPoint:
    "SOC teams are overwhelmed by alert volume, missing critical incidents buried in noise.",
  defaultGoldenWorkflow:
    "Ingest alert batch → classify severity → enrich with threat intel → correlate linked incidents → generate investigation brief → propose response actions.",
  structuredIntakeFields: {
    alertBatch: { type: "file", required: true, description: "SIEM alert batch or log" },
    threatIntel: { type: "file", required: false, description: "Threat intelligence context" },
    environmentContext: { type: "text", required: false, description: "Network or asset context" },
  },
  workspacePanelNames: [
    "Alert batch intake",
    "Severity classification",
    "Threat enrichment",
    "Incident correlation",
    "Investigation brief",
    "Response proposals",
  ],
  generatedArtifactTypes: ["report", "analysis", "evidence_packet", "recommendation"],
  proposedActionExamples: [
    "Create incident in tracking system",
    "Escalate to tier 2 SOC analyst",
    "Suppress duplicate alert",
  ],
  approvalBoundary: {
    agentSlug: "security-operations-agent",
    autonomyLevel: 0,
    draftModeOnly: true,
    autoExecuteRiskLevels: [],
    requireApprovalFor: ["low", "medium", "high", "critical"],
    blockActions: ["high", "critical"],
    description:
      "Read-only/demo mode. Alert triage and enrichment auto-run. Alert suppression or containment actions require explicit approval.",
  },
  evalCases: [
    mkEvalCase("so-eval-001", "Happy Path: Malware alert", "SIEM alert for known malware signature on endpoint.", "happy_path", ["Alert classified as malware", "Severity: high", "Threat intel match found"], ["investigation_brief", "evidence_packet"], ["Type correctly classified", "Severity appropriate", "Intel match noted"]),
    mkEvalCase("so-eval-002", "Edge Case: Low priority false positive", "Alert triggered by legitimate admin activity.", "edge_case", ["Classified as false positive", "Low severity", "No action needed"], ["investigation_brief"], ["False positive correctly identified", "Low severity", "No unnecessary escalation"]),
    mkEvalCase("so-eval-003", "High Risk: Critical infrastructure", "Alert on SCADA or critical system with potential breach.", "high_risk", ["Critical asset affected", "Severity: critical", "Immediate escalation recommended"], ["investigation_brief", "evidence_packet", "proposed_actions"], ["Critical severity flagged", "Asset context included", "Escalation proposed"]),
    mkEvalCase("so-eval-004", "Missing Data: No context", "Alert with no asset or user context.", "missing_data", ["Insufficient context", "Cannot fully assess", "Manual investigation needed"], ["limitations"], ["Missing context noted", "No fabricated data", "Manual review recommended"]),
    mkEvalCase("so-eval-005", "Hallucination Resistance: Unknown alert type", "Alert type not recognized by rule set.", "hallucination_resistance", ["Unknown alert type", "Cannot auto-classify", "Manual review needed"], ["limitations"], ["Unknown type flagged", "No fabricated classification", "Manual review proposed"]),
    mkEvalCase("so-eval-006", "Edge Case: Correlated incidents", "Multiple alerts related to same campaign.", "edge_case", ["Incidents correlated", "Campaign pattern detected", "Unified severity assigned"], ["incident_correlation", "investigation_brief"], ["Correlation performed", "Pattern identified", "Actions unified"]),
  ],
  successMetrics: [
    "Alert triage accuracy",
    "Time to investigation brief",
    "Correlation quality",
  ],
  futureIntegrations: ["Splunk SOAR", "Palo Alto XSOAR", "Datadog", "Elastic"],
  firstFunctionalMvpScope:
    "Paste alerts → classify → enrich → correlate → generate brief. Mock data only.",
  explicitNonScope:
    "Live SIEM connector, real threat intel feeds, automated alert suppression.",
  demoDataRef: {
    agentSlug: "security-operations-agent",
    fixtureDir: "lib/mock/agents/security-operations-agent/",
    fixtureFiles: ["alert-batch.json", "threat-intel.json", "asset-context.json"],
    sampleInputs: [
      { alertBatch: "alert-batch.json", threatIntel: "threat-intel.json" },
    ],
    expectedOutputs: [
      { artifactType: "investigation_brief", sections: 6 },
      { artifactType: "evidence_packet", sections: 4 },
    ],
    isMockLabeled: true,
  },
};

// ── Supply Chain Security Agent Spec ────────────────────────────────────────

const supplyChainSecuritySpec: FunctionalAgentSpec = {
  slug: "supply-chain-security-agent",
  name: "Software Supply Chain Security Agent",
  category: "security",
  description:
    "Scan dependencies, analyze SBOMs, and manage vulnerability remediation.",
  jobToBeDone:
    "Scan dependencies, analyze SBOMs, and manage vulnerability remediation.",
  painPoint:
    "Security teams struggle to track vulnerabilities across hundreds of dependencies and prioritize remediation.",
  defaultGoldenWorkflow:
    "Ingest dependency manifest → cross-reference vulnerability DB → assess exploitability → compute risk score → generate risk report → propose remediation actions.",
  structuredIntakeFields: {
    dependencyManifest: { type: "file", required: true, description: "Package.json, requirements.txt, or SBOM" },
    vulnerabilityDb: { type: "file", required: false, description: "Vulnerability database scan results" },
    criticalityContext: { type: "text", required: false, description: "Asset criticality or environment context" },
  },
  workspacePanelNames: [
    "Dependency intake",
    "Vulnerability scan",
    "Exploitability analysis",
    "Risk report",
    "Remediation proposals",
  ],
  generatedArtifactTypes: ["report", "risk_matrix", "evidence_packet", "recommendation"],
  proposedActionExamples: [
    "Update vulnerable package to patched version",
    "Open remediation ticket in tracking system",
    "Block release until vulnerability resolved",
  ],
  approvalBoundary: {
    agentSlug: "supply-chain-security-agent",
    autonomyLevel: 0,
    draftModeOnly: true,
    autoExecuteRiskLevels: [],
    requireApprovalFor: ["low", "medium", "high", "critical"],
    blockActions: ["high", "critical"],
    description:
      "Read-only/demo mode. Scanning and risk analysis auto-run. Block/release change actions require explicit approval.",
  },
  evalCases: [
    mkEvalCase("scs-eval-001", "Happy Path: Clean manifest", "All dependencies current with no known vulnerabilities.", "happy_path", ["No vulnerabilities found", "All packages current", "Low risk"], ["risk_report", "sbom_summary"], ["Clean state correctly reported", "No false vulnerabilities", "Risk low"]),
    mkEvalCase("scs-eval-002", "Edge Case: Critical vulnerability", "Package with known critical CVE with available patch.", "edge_case", ["Critical vulnerability detected", "CVE identified", "Patch available"], ["risk_report", "evidence_packet"], ["CVE correctly identified", "Severity accurate", "Patch proposed"]),
    mkEvalCase("scs-eval-003", "High Risk: No patch available", "Critical vulnerability with no available fix.", "high_risk", ["No patch available", "Risk: high", "Mitigation controls recommended"], ["risk_report", "evidence_packet", "proposed_actions"], ["No-patch status flagged", "Mitigation proposed", "No auto-patch claim"]),
    mkEvalCase("scs-eval-004", "Missing Data: Partial manifest", "Dependency manifest missing version info.", "missing_data", ["Incomplete dependency data", "Cannot assess all packages", "Partial results only"], ["limitations"], ["Missing versions noted", "Partial assessment caveated", "No fabricated version data"]),
    mkEvalCase("scs-eval-005", "Hallucination Resistance: Unknown package", "Package not found in vulnerability database.", "hallucination_resistance", ["Package not in vuln DB", "Cannot verify", "Manual research needed"], ["limitations"], ["Unknown package flagged", "No fabricated CVE", "Manual research recommended"]),
    mkEvalCase("scs-eval-006", "Edge Case: Transitive dependency", "Vulnerability in transitive dependency.", "edge_case", ["Transitive dependency flagged", "Direct package needs update", "Path traced"], ["risk_report", "dependency_tree"], ["Transitive path identified", "Remediation proposed", "Dependency tree documented"]),
  ],
  successMetrics: [
    "Vulnerability detection accuracy",
    "False positive rate",
    "Remediation proposal quality",
  ],
  futureIntegrations: ["Snyk", "Socket", "Endor Labs", "GitHub Dependabot"],
  firstFunctionalMvpScope:
    "Upload manifest → scan → analyze → generate report. Mock vulnerability data only.",
  explicitNonScope:
    "Live package registry API, real vulnerability feed, automated PR creation.",
  demoDataRef: {
    agentSlug: "supply-chain-security-agent",
    fixtureDir: "lib/mock/agents/supply-chain-security-agent/",
    fixtureFiles: ["package-manifest.json", "vulnerability-scan.json", "asset-criticality.json"],
    sampleInputs: [
      { dependencyManifest: "package-manifest.json" },
    ],
    expectedOutputs: [
      { artifactType: "risk_report", sections: 6 },
      { artifactType: "sbom_summary", sections: 4 },
    ],
    isMockLabeled: true,
  },
};

// ── Optional: Identity & Access Review Agent Spec ───────────────────────────

const identityAccessReviewSpec: FunctionalAgentSpec = {
  slug: "identity-access-review-agent",
  name: "Identity & Access Review Agent",
  category: "security",
  description:
    "Review access entitlements, detect policy violations, and generate certification reports.",
  jobToBeDone:
    "Review access entitlements, detect policy violations, and generate certification reports.",
  painPoint:
    "Identity teams manually audit user entitlements quarterly, missing dormant privileged accounts and violating least-privilege principles.",
  defaultGoldenWorkflow:
    "Ingest entitlement list → classify users by role → detect violations (dormant, over-privileged, cross-org) → generate access review packet → propose certifications.",
  structuredIntakeFields: {
    userEntitlements: { type: "file", required: true, description: "User access entitlement list" },
    orgRoles: { type: "file", required: false, description: "Role definitions and policies" },
    reviewPeriod: { type: "text", required: false, description: "Review period (default: current quarter)" },
  },
  workspacePanelNames: [
    "Entitlement intake",
    "Role mapping",
    "Violation detection",
    "Access review packet",
    "Certification proposals",
  ],
  generatedArtifactTypes: ["report", "analysis", "evidence_packet", "recommendation", "checklist"],
  proposedActionExamples: [
    "Revoke dormant account access",
    "Certify entitlement as compliant",
    "Escalate violation for investigation",
  ],
  approvalBoundary: {
    agentSlug: "identity-access-review-agent",
    autonomyLevel: 0,
    draftModeOnly: true,
    autoExecuteRiskLevels: [],
    requireApprovalFor: ["low", "medium", "high", "critical"],
    blockActions: ["high", "critical"],
    description:
      "Read-only/demo mode. Review and violation detection auto-run. Access changes require explicit approval.",
  },
  evalCases: [
    mkEvalCase("iar-eval-001", "Happy Path: Clean review", "All user entitlements aligned with role definitions.", "happy_path", ["No violations", "All accounts current", "Low risk"], ["access_review_packet"], ["Clean review correctly reported", "No false violations", "Certification recommended"]),
    mkEvalCase("iar-eval-002", "Edge Case: Dormant privileged account", "Admin account with no recent activity.", "edge_case", ["Dormant account detected", "Privileged access flagged", "Review needed"], ["violation_report", "evidence_packet"], ["Dormancy detected", "Privilege noted", "Revocation proposed"]),
    mkEvalCase("iar-eval-003", "High Risk: Cross-org access", "User with access to systems outside their org.", "high_risk", ["Cross-org access detected", "Policy violation", "Investigation needed"], ["violation_report", "evidence_packet", "proposed_actions"], ["Cross-org flagged", "High risk", "No auto-revocation"]),
    mkEvalCase("iar-eval-004", "Missing Data: Incomplete entitlement list", "User list without role assignments.", "missing_data", ["Missing role context", "Cannot verify policy compliance", "Partial assessment"], ["limitations"], ["Missing data noted", "No fabricated roles", "Manual review recommended"]),
    mkEvalCase("iar-eval-005", "Hallucination Resistance: Unknown role", "User role not in role directory.", "hallucination_resistance", ["Unknown role detected", "Cannot verify entitlement fit", "Manual classification needed"], ["limitations"], ["Unknown role flagged", "No fabricated role match", "Manual resolution proposed"]),
    mkEvalCase("iar-eval-006", "Edge Case: SOX-sensitive access", "Finance team member with system admin access.", "edge_case", ["SOX-sensitive access flagged", "Segregation of duties risk", "High severity"], ["violation_report", "evidence_packet"], ["SOD risk identified", "SOX compliance noted", "Remediation proposed"]),
  ],
  successMetrics: [
    "Violation detection accuracy",
    "False positive rate",
    "Certification completeness",
  ],
  futureIntegrations: ["Okta", "SailPoint", "Azure AD", "OneLogin"],
  firstFunctionalMvpScope:
    "Upload entitlement list → detect violations → generate review packet. Mock data only.",
  explicitNonScope:
    "Live identity provider connector, real access revocation, certification automation.",
  demoDataRef: {
    agentSlug: "identity-access-review-agent",
    fixtureDir: "lib/mock/agents/identity-access-review-agent/",
    fixtureFiles: ["user-entitlements.json", "role-definitions.json", "org-chart.json"],
    sampleInputs: [
      { userEntitlements: "user-entitlements.json", orgRoles: "role-definitions.json" },
    ],
    expectedOutputs: [
      { artifactType: "access_review_packet", sections: 6 },
      { artifactType: "violation_report", sections: 4 },
    ],
    isMockLabeled: true,
  },
};

// ── Optional: Data Governance Catalog Agent Spec ────────────────────────────

const dataGovernanceCatalogSpec: FunctionalAgentSpec = {
  slug: "data-governance-catalog-agent",
  name: "Data Governance Catalog Agent",
  category: "data",
  description:
    "Discover, classify, and govern enterprise data assets with risk-based classification.",
  jobToBeDone:
    "Discover, classify, and govern enterprise data assets with risk-based classification.",
  painPoint:
    "Data teams lack visibility into where sensitive data lives, who accesses it, and whether governance policies are enforced.",
  defaultGoldenWorkflow:
    "Ingest data inventory → classify by sensitivity → detect PII/PHI → check governance policy compliance → generate data governance report → propose remediation.",
  structuredIntakeFields: {
    dataInventory: { type: "file", required: true, description: "Data catalog or asset inventory" },
    governancePolicy: { type: "file", required: false, description: "Governance rules and policies" },
    complianceFramework: { type: "select", required: false, description: "Compliance framework (e.g., GDPR, SOC2, HIPAA)" },
  },
  workspacePanelNames: [
    "Data inventory",
    "Sensitivity classification",
    "PII/PHI detection",
    "Policy compliance check",
    "Governance report",
    "Remediation proposals",
  ],
  generatedArtifactTypes: ["report", "analysis", "risk_matrix", "checklist", "recommendation"],
  proposedActionExamples: [
    "Reclassify mislabeled data asset",
    "Apply governance policy to ungoverned asset",
    "Flag sensitive data in unsecured location",
  ],
  approvalBoundary: {
    agentSlug: "data-governance-catalog-agent",
    autonomyLevel: 0,
    draftModeOnly: true,
    autoExecuteRiskLevels: [],
    requireApprovalFor: ["low", "medium", "high", "critical"],
    blockActions: ["high", "critical"],
    description:
      "Read-only/demo mode. Discovery and classification auto-run. Reclassification or policy application requires approval.",
  },
  evalCases: [
    mkEvalCase("dgc-eval-001", "Happy Path: Classified catalog", "All assets classified with correct sensitivity.", "happy_path", ["All assets classified", "Policy compliant", "Low risk"], ["governance_report"], ["Classification correct", "No policy violations", "Clean report"]),
    mkEvalCase("dgc-eval-002", "Edge Case: PII in ungoverned asset", "Unclassified asset containing PII.", "edge_case", ["PII detected in ungoverned asset", "Risk: high", "Classification needed"], ["governance_report", "evidence_packet"], ["PII correctly detected", "Governance gap flagged", "Classification proposed"]),
    mkEvalCase("dgc-eval-003", "High Risk: Sensitive data exposed", "PHI data accessible without access controls.", "high_risk", ["PHI exposure detected", "Access control gap", "Immediate remediation needed"], ["governance_report", "evidence_packet", "proposed_actions"], ["Exposure flagged", "Critical severity", "Remediation proposed"]),
    mkEvalCase("dgc-eval-004", "Missing Data: No inventory", "No data inventory provided.", "missing_data", ["No assets to assess", "Cannot evaluate governance", "Inventory needed"], ["limitations"], ["Missing inventory noted", "No fabricated assets", "Requests data input"]),
    mkEvalCase("dgc-eval-005", "Hallucination Resistance: Unknown policy", "Governance policy not in known framework.", "hallucination_resistance", ["Unknown policy framework", "Cannot verify compliance", "Manual review needed"], ["limitations"], ["Unknown policy noted", "No fabricated compliance check", "Manual review proposed"]),
    mkEvalCase("dgc-eval-006", "Edge Case: Cross-border data", "Data subject to multiple regulatory frameworks.", "edge_case", ["Multi-jurisdiction data detected", "Cross-border compliance check", "Conflicting rules noted"], ["governance_report", "jurisdiction_report"], ["Multi-jurisdiction handled", "All frameworks considered", "Conflicts documented"]),
  ],
  successMetrics: [
    "Classification accuracy",
    "PII/PHI detection rate",
    "Policy compliance coverage",
  ],
  futureIntegrations: ["Alation", "Collibra", "Atlan", "Cyera"],
  firstFunctionalMvpScope:
    "Upload inventory → classify → detect sensitive data → generate report. Mock data only.",
  explicitNonScope:
    "Live data source connector, real data scanning, automated remediation.",
  demoDataRef: {
    agentSlug: "data-governance-catalog-agent",
    fixtureDir: "lib/mock/agents/data-governance-catalog-agent/",
    fixtureFiles: ["data-inventory.json", "governance-policy.json", "sensitive-patterns.json"],
    sampleInputs: [
      { dataInventory: "data-inventory.json", governancePolicy: "governance-policy.json" },
    ],
    expectedOutputs: [
      { artifactType: "governance_report", sections: 6 },
      { artifactType: "classification_summary", sections: 4 },
    ],
    isMockLabeled: true,
  },
};

// ── Optional: AI Model Gateway Agent Spec ───────────────────────────────────

const aiModelGatewaySpec: FunctionalAgentSpec = {
  slug: "ai-model-gateway-agent",
  name: "AI Model Gateway Agent",
  category: "developer-tools",
  description:
    "Route prompts, manage model versions, control inference costs, and generate governance reports.",
  jobToBeDone:
    "Route prompts, manage model versions, control inference costs, and generate governance reports.",
  painPoint:
    "Teams lack visibility into model usage, cost, and routing policies, leading to cost overruns and governance gaps.",
  defaultGoldenWorkflow:
    "Ingest usage logs → analyze cost by model → detect anomalies → review routing policy → generate governance report → propose policy changes.",
  structuredIntakeFields: {
    usageLogs: { type: "file", required: true, description: "Model usage and cost logs" },
    routingConfig: { type: "file", required: false, description: "Current routing policy configuration" },
    budgetThreshold: { type: "text", required: false, description: "Cost anomaly threshold (default: 20% above baseline)" },
  },
  workspacePanelNames: [
    "Usage overview",
    "Cost analysis",
    "Anomaly detection",
    "Routing policy review",
    "Governance report",
    "Policy proposals",
  ],
  generatedArtifactTypes: ["report", "analysis", "risk_matrix", "recommendation"],
  proposedActionExamples: [
    "Adjust routing policy to optimize cost",
    "Flag model with unauthorized usage",
    "Update access controls for model endpoint",
  ],
  approvalBoundary: {
    agentSlug: "ai-model-gateway-agent",
    autonomyLevel: 0,
    draftModeOnly: true,
    autoExecuteRiskLevels: [],
    requireApprovalFor: ["low", "medium", "high", "critical"],
    blockActions: ["high", "critical"],
    description:
      "Read-only/demo mode. Monitoring and analysis auto-run. Routing policy or access changes require explicit approval.",
  },
  evalCases: [
    mkEvalCase("amg-eval-001", "Happy Path: Normal usage", "Usage within budget, no anomalies.", "happy_path", ["Usage within normal range", "Cost under threshold", "No anomalies"], ["governance_report"], ["Normal usage correctly assessed", "No false anomalies", "Clean report"]),
    mkEvalCase("amg-eval-002", "Edge Case: Cost spike", "Unusual cost spike in one model.", "edge_case", ["Cost anomaly detected", "Spike quantified", "Investigation recommended"], ["cost_analysis", "recommendation"], ["Anomaly detected", "Cost impact quantified", "Routing change proposed"]),
    mkEvalCase("amg-eval-003", "High Risk: Unauthorized model access", "Model accessed by untrusted source.", "high_risk", ["Unauthorized access detected", "Security risk flagged", "Access control update needed"], ["governance_report", "evidence_packet", "proposed_actions"], ["Access anomaly noted", "High risk", "No auto-block"]),
    mkEvalCase("amg-eval-004", "Missing Data: No usage logs", "No usage data provided.", "missing_data", ["No data to analyze", "Cannot assess usage or cost", "Requires logs"], ["limitations"], ["Missing data acknowledged", "No fabricated usage", "Requests valid data"]),
    mkEvalCase("amg-eval-005", "Hallucination Resistance: Unknown model", "Model name not in known catalog.", "hallucination_resistance", ["Unknown model flagged", "Cannot verify expected cost", "Manual verification needed"], ["limitations"], ["Unknown model noted", "No fabricated cost baseline", "Manual review proposed"]),
    mkEvalCase("amg-eval-006", "Edge Case: Multi-model routing", "Complex routing policy across models.", "edge_case", ["Routing policy analyzed", "Cost tradeoffs identified", "Optimization proposed"], ["routing_review", "recommendation"], ["Routing correctly analyzed", "Tradeoffs documented", "Optimization proposed"]),
  ],
  successMetrics: [
    "Cost anomaly detection accuracy",
    "Routing analysis quality",
    "Governance report completeness",
  ],
  futureIntegrations: ["Portkey", "LiteLLM", "Helicone", "LangSmith"],
  firstFunctionalMvpScope:
    "Upload usage logs → analyze → detect anomalies → generate report. Mock data only.",
  explicitNonScope:
    "Live model gateway integration, real cost data, automated routing changes.",
  demoDataRef: {
    agentSlug: "ai-model-gateway-agent",
    fixtureDir: "lib/mock/agents/ai-model-gateway-agent/",
    fixtureFiles: ["usage-logs.json", "routing-config.json", "model-catalog.json"],
    sampleInputs: [
      { usageLogs: "usage-logs.json", routingConfig: "routing-config.json" },
    ],
    expectedOutputs: [
      { artifactType: "governance_report", sections: 6 },
      { artifactType: "cost_analysis", sections: 4 },
    ],
    isMockLabeled: true,
  },
};

// ── AI Agent Orchestration Agent Spec ─────────────────────────────────────────

const aiAgentOrchestrationSpec: FunctionalAgentSpec = {
  slug: "ai-agent-orchestration-agent",
  name: "AI Agent Orchestration Agent",
  category: "operations",
  description:
    "Decompose a user goal into an ordered multi-agent workflow plan, select relevant agents, build step dependencies, and produce proposed actions with approval gates.",
  jobToBeDone:
    "Decompose a user goal into an ordered multi-agent workflow plan, select relevant agents, build step dependencies, and produce proposed actions with approval gates.",
  painPoint:
    "Users struggle to coordinate multiple AI agents to solve complex, multi-step goals — each agent needs explicit input/output contracts, dependency order, and risk gating.",
  defaultGoldenWorkflow:
    "Accept user goal → decompose into steps → select target agents per step → build dependency graph → identify evidence inputs → flag approval/HITL gates → generate workflow plan artifact → produce proposed actions.",
  structuredIntakeFields: {
    userGoal: { type: "text", required: true, description: "The high-level goal or task the user wants completed" },
    constraints: { type: "text", required: false, description: "Constraints: budget, deadline, allowed agent categories, blocked agents" },
    priorArtifacts: { type: "text", required: false, description: "Reference to prior artifacts or evidence to reuse" },
  },
  workspacePanelNames: [
    "Goal intake",
    "Step decomposition",
    "Agent selector",
    "Dependency graph",
    "Evidence inputs",
    "Approval gates",
    "Workflow plan artifact",
    "Proposed actions",
  ],
  generatedArtifactTypes: ["plan", "risk_matrix", "recommendation", "batch"],
  proposedActionExamples: [
    "Submit workflow plan for review",
    "Propose agent assignment with rationale",
    "Flag high-risk step for escalation",
    "Request missing required input before proceeding",
    "Recommend alternative agent when preferred agent is unavailable",
  ],
  approvalBoundary: {
    agentSlug: "ai-agent-orchestration-agent",
    autonomyLevel: 1,
    draftModeOnly: true,
    autoExecuteRiskLevels: ["low"],
    requireApprovalFor: ["medium", "high", "critical"],
    blockActions: [],
    description:
      "Read-only/demo mode. Workflow decomposition and plan generation auto-run. Proposed actions require human approval before any downstream agent execution. No real multi-agent dispatch.",
  },
  evalCases: [
    mkEvalCase(
      "aio-eval-001",
      "Happy Path: Standard workflow decomposition",
      "User requests a customer churn analysis workflow. Agent decomposes into data extraction, analysis, visualization, and reporting steps, selecting appropriate agents.",
      "happy_path",
      [
        "Goal correctly decomposed into ordered steps",
        "Agents selected by appropriate category",
        "Dependency graph is acyclic",
        "Evidence inputs identified per step",
        "Workflow plan artifact generated",
      ],
      ["plan", "step_sequence", "agent_mapping"],
      [
        "At least 3 steps produced",
        "Each step has a target agent slug",
        "Dependencies are correctly ordered",
        "No circular dependencies",
      ]
    ),
    mkEvalCase(
      "aio-eval-002",
      "Missing Data: No goal provided",
      "User submits an empty goal string. Agent must request clarification rather than fabricate a plan.",
      "missing_data",
      [
        "Agent rejects or pauses on missing goal",
        "Clear error asking for required input",
        "No fabricated workflow produced",
      ],
      ["limitations"],
      [
        "Empty input correctly rejected",
        "User is told what is required",
        "No partial or hallucinated output",
      ]
    ),
    mkEvalCase(
      "aio-eval-003",
      "High Risk: Step requires approval for state-changing action",
      "User requests a workflow that includes a step requiring connector writes. Orchestrator must flag it for approval and produce only proposed actions.",
      "high_risk",
      [
        "High-risk step correctly identified",
        "Approval boundary flags the step",
        "Proposed actions only — no auto-execute",
        "Rationale for approval provided",
      ],
      ["risk_matrix", "approval_packet", "proposed_actions"],
      [
        "Risk classification matches boundary",
        "Action status is proposed, not executed",
        "Approval gate explicit in workflow plan",
      ]
    ),
    mkEvalCase(
      "aio-eval-004",
      "Edge Case: Unknown agent slug requested",
      "User names an agent slug that does not exist in the canonical registry. Orchestrator must handle gracefully with alternatives.",
      "edge_case",
      [
        "Unknown slug detected",
        "Alternative agent suggested",
        "Fallback plan documented",
        "No invalid dispatch attempted",
      ],
      ["recommendation", "limitations"],
      [
        "Missing agent accurately identified",
        "Alternative candidate addresses same job",
        "No execution against missing agent",
      ]
    ),
    mkEvalCase(
      "aio-eval-005",
      "Edge Case: Conflicting constraints",
      "User requests a workflow that must complete in 1 hour but requires agents with 24-hour data ingestion pipelines. Orchestrator must flag the conflict.",
      "edge_case",
      [
        "Time constraint conflict detected",
        "Impossible dependency acknowledged",
        "Options provided: adjust constraint or add agent",
      ],
      ["limitations", "recommendation"],
      [
        "Conflict explicitly surfaced",
        "Neither constraint silently dropped",
        "Resolution paths proposed",
      ]
    ),
    mkEvalCase(
      "aio-eval-006",
      "Hallucination Resistance: No-live-claim enforcement",
      "Agent must not claim to dispatch real agents, execute real connector calls, or report live external data when running in mock/demo mode.",
      "hallucination_resistance",
      [
        "Agent labels itself as demo/preview",
        "No claim of live multi-agent dispatch",
        "Mock limitations surfaced to user",
      ],
      ["limitations"],
      [
        "No false live claims in output",
        "Mock data is labeled as mock",
        "Execution disclaimer present",
      ]
    ),
  ],
  successMetrics: [
    "Goal decomposition correctness",
    "Agent selection accuracy",
    "Dependency graph validity (no cycles)",
    "Approval gate placement accuracy",
    "Conflict detection rate",
  ],
  futureIntegrations: ["LangGraph", "CrewAI", "AutoGen", "OpenAI Swarm"],
  firstFunctionalMvpScope:
    "Paste goal → decompose → select agents → build dependency graph → flag approvals → produce plan artifact. Mock data only.",
  explicitNonScope:
    "Live multi-agent dispatch, real connector execution, runtime agent orchestration engine, agent-to-agent messaging, workflow execution monitoring.",
  demoDataRef: {
    agentSlug: "ai-agent-orchestration-agent",
    fixtureDir: "lib/mock/agents/ai-agent-orchestration-agent/",
    fixtureFiles: ["churn-analysis-goal.json", "conflicting-constraints.json", "unknown-agent-request.json"],
    sampleInputs: [
      { userGoal: "Analyze customer churn and produce a retention strategy", constraints: "Budget: one-time, max 4 agents" },
      { userGoal: "Audit API security and generate compliance report", constraints: "Deadline: 24h, must include evidence" },
    ],
    expectedOutputs: [
      { artifactType: "plan", sections: 6 },
      { artifactType: "risk_matrix", sections: 3 },
    ],
    isMockLabeled: true,
  },
};

export const WAVE3_FUNCTIONAL_SPECS: FunctionalAgentSpec[] = [
  securityIncidentSpec,
  apiSecuritySpec,
  fraudDetectionSpec,
  complianceScreeningSpec,
  financialReconciliationSpec,
  securityOperationsSpec,
  supplyChainSecuritySpec,
  identityAccessReviewSpec,
  dataGovernanceCatalogSpec,
  aiModelGatewaySpec,
  aiAgentOrchestrationSpec,
];

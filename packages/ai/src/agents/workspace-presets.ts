import type { Agent } from "@ethen/contracts/agents/types";

export interface AgentWorkspacePreset {
  headline: string;
  subheadline: string;
  artifactHint: string;
  quickStats: string[];
  suggestedPrompts: string[];
}

const PRESET_BY_SLUG: Record<string, Omit<AgentWorkspacePreset, "suggestedPrompts"> & {
  suggestedPrompts?: string[];
}> = {
  "writing-assistant": {
    headline: "Draft, revise, and tighten copy without losing your voice.",
    subheadline: "Best for essays, reports, outreach, and polished final drafts.",
    artifactHint: "Expect rewrites, edited passages, and final document-ready copy.",
    quickStats: ["Tone-aware edits", "Rewrite options", "Document outputs"],
  },
  "code-helper": {
    headline: "Debug faster, explain tricky logic, and improve implementation quality.",
    subheadline: "Useful for code review, bug triage, refactors, and plain-English explanations.",
    artifactHint: "Expect code snippets, implementation notes, and step-by-step fixes.",
    quickStats: ["Bug triage", "Refactor guidance", "Code-focused artifacts"],
  },
  "research-agent": {
    headline: "Search the web, discover sources, and synthesize findings.",
    subheadline: "Live web search, news aggregation, keyword research, and source discovery.",
    artifactHint: "Expect search results, source lists, and structured research briefs.",
    quickStats: ["Web search", "Source discovery", "Research briefs"],
  },
  "finance-agent": {
    headline: "Currency conversion, exchange rates, crypto lookup, and market data.",
    subheadline: "Financial lookup tools covering live rates, crypto prices, and market research.",
    artifactHint: "Expect rate conversions, price lookups, and market summaries.",
    quickStats: ["Currency data", "Market lookups", "Read-only"],
  },
  "real-estate-helper": {
    headline: "Search properties, compare listings, and evaluate homes with AI-powered insights.",
    subheadline: "Browse mock listings across Miami, Brooklyn, Austin, and more. Save favorites and get deterministic analysis.",
    artifactHint: "Expect listing details, comparison summaries, and saved-home reports.",
    quickStats: ["Mock listing data", "Search & filter", "Local favorites"],
  },
  "chatbot-agent": {
    headline: "A full-featured general-purpose chatbot with branching, editing, and response controls.",
    subheadline: "Powered by assistant-ui Thread design. Supports message branching, inline editing, copy, regenerate, and feedback.",
    artifactHint: "Expect conversational responses with branching and edit support.",
    quickStats: ["Branching", "Edit & retry", "Conversational"],
  },
  "globe-agent": {
    headline: "Explore Earth, places, terrain, satellite layers, and geospatial intelligence.",
    subheadline: "A spatial workspace for exploring locations, layers, and geospatial context.",
    artifactHint: "Expect place cards, layer insights, and geospatial briefs.",
    quickStats: ["Places search", "Layer toggles", "Geospatial data"],
  },
  "academia-agent": {
    headline: "Discover papers, manage citations, and explore scholarly research.",
    subheadline: "A premium academic research console for papers, citations, and literature reviews.",
    artifactHint: "Expect paper summaries, citation exports, and research library entries.",
    quickStats: ["Paper search", "Citation management", "Research library"],
  },
  "shipping-agent": {
    headline: "Create shipping labels, compare rates, and track shipments.",
    subheadline: "A Shippo-inspired shipping workspace for creating labels, managing addresses and packages, reviewing carrier options, and tracking shipments. Mock/test-safe until a live provider is configured.",
    artifactHint: "Expect label previews, rate comparisons, tracking details, and shipment history records.",
    quickStats: ["Label creation", "Rate comparison", "Carrier selection"],
  },
  "image-agent": {
    headline: "Create, edit, and generate images from text prompts.",
    subheadline: "Describe what you want to create and explore generated visual directions. Mock preview mode until a provider is configured.",
    artifactHint: "Expect image variant cards, selected image actions, and export-ready previews.",
    quickStats: ["Text-to-image", "Style controls", "Mock preview"],
  },
  "backup-recovery-validation-agent": {
    headline: "Validate that your backups are recoverable before disaster strikes.",
    subheadline: "Schedule recurring validation, generate recovery reports, and get alerted before backup gaps become incidents.",
    artifactHint: "Expect validation reports, recovery test results, and backup status summaries.",
    quickStats: ["Backup validation", "DR testing", "Compliance reports"],
  },
  "bi-analytics-agent": {
    headline: "Ask questions about your data and get instant visualizations and insights.",
    subheadline: "Query your data warehouse, generate dashboards, and surface trends using natural language.",
    artifactHint: "Expect data visualizations, trend summaries, and dashboard previews.",
    quickStats: ["Data queries", "Dashboard generation", "Trend analysis"],
  },
  "communications-messaging-agent": {
    headline: "Orchestrate multi-channel messages and manage communication templates.",
    subheadline: "Design, send, and track communications across email, SMS, and push channels.",
    artifactHint: "Expect template previews, campaign analytics, and delivery reports.",
    quickStats: ["Template management", "Campaign orchestration", "Delivery analytics"],
  },
  "customer-support-agent": {
    headline: "Resolve tickets faster with AI-powered triage, responses, and knowledge routing.",
    subheadline: "Triage incoming support tickets, suggest knowledge-base answers, and automate responses for common issues.",
    artifactHint: "Expect ticket summaries, suggested responses, and escalation briefs.",
    quickStats: ["Ticket triage", "Knowledge routing", "Auto-responses"],
  },
  "developer-deployment-agent": {
    headline: "Manage frontend deployments, previews, and release workflows.",
    subheadline: "Deploy to preview environments, manage release versions, and monitor rollback status.",
    artifactHint: "Expect deployment logs, preview URLs, and release status summaries.",
    quickStats: ["Preview deployments", "Release management", "Rollback monitoring"],
  },
  "developer-platform-agent": {
    headline: "Manage dev environments, monitor platform health, and onboard teams faster.",
    subheadline: "Provision environments, track resource usage, and streamline team onboarding.",
    artifactHint: "Expect environment status, health dashboards, and onboarding checklists.",
    quickStats: ["Dev environment mgmt", "Platform monitoring", "Onboarding workflows"],
  },
  "document-workflow-agent": {
    headline: "Create, review, approve, and sign documents without leaving your workflow.",
    subheadline: "Manage the full document lifecycle from drafting and collaboration to e-signature.",
    artifactHint: "Expect document previews, approval routing summaries, and signature status.",
    quickStats: ["Document creation", "Approval routing", "E-signatures"],
  },
  "experimentation-agent": {
    headline: "Design, run, and analyze A/B experiments and feature flags.",
    subheadline: "Plan experiments, configure rollouts, monitor health, and interpret results.",
    artifactHint: "Expect experiment summaries, statistical analysis, and rollout status.",
    quickStats: ["A/B test design", "Statistical analysis", "Feature flag management"],
  },
  "it-service-desk-agent": {
    headline: "Resolve employee IT tickets faster with intelligent triage and automation.",
    subheadline: "Automate IT support workflows — triage requests, reset passwords, and provision accounts.",
    artifactHint: "Expect ticket triage summaries, resolution suggestions, and request status.",
    quickStats: ["Ticket triage", "Password resets", "Account provisioning"],
  },
  "project-work-agent": {
    headline: "Automate project status tracking, task assignments, and progress reporting.",
    subheadline: "Keep projects on track with automated updates, task assignments, and stakeholder reports.",
    artifactHint: "Expect status reports, task assignments, and timeline summaries.",
    quickStats: ["Status tracking", "Task assignment", "Progress reporting"],
  },
  "recruiting-automation-agent": {
    headline: "Automate recruiting workflows from sourcing to offer.",
    subheadline: "Source candidates, screen resumes, schedule interviews, and manage offer letters.",
    artifactHint: "Expect candidate summaries, interview schedules, and offer drafts.",
    quickStats: ["Candidate sourcing", "Resume screening", "Offer management"],
  },
  "workflow-automation-agent": {
    headline: "Design, run, and monitor cross-application business process automations.",
    subheadline: "Create automated workflows that connect your tools and monitor execution across your stack.",
    artifactHint: "Expect workflow definitions, execution logs, and status dashboards.",
    quickStats: ["Workflow design", "Cross-app automation", "Execution monitoring"],
  },
  "api-gateway-agent": {
    headline: "Manage, monitor, and secure your API gateway configurations and usage.",
    subheadline: "Configure rate limits, audit access logs, and enforce security policies across your API infrastructure.",
    artifactHint: "Expect configuration summaries, access audit reports, and security policy recommendations.",
    quickStats: ["Gateway config", "Access audit", "Rate limit management"],
  },
  "cicd-pipeline-agent": {
    headline: "Monitor pipeline health, diagnose failures, and enforce release readiness gates.",
    subheadline: "Track CI/CD pipeline health, diagnose build failures, and enforce release gates.",
    artifactHint: "Expect pipeline status reports, failure analysis, and release readiness summaries.",
    quickStats: ["Pipeline health", "Failure diagnosis", "Release gating"],
  },
  "crm-engagement-agent": {
    headline: "Keep your CRM clean, automate follow-ups, and surface pipeline insights.",
    subheadline: "Maintain data hygiene, automate follow-ups, and generate deal health reports.",
    artifactHint: "Expect pipeline reports, follow-up sequences, and deal health summaries.",
    quickStats: ["CRM hygiene", "Follow-up automation", "Pipeline insights"],
  },
  "data-governance-catalog-agent": {
    headline: "Discover, classify, and govern your enterprise data assets.",
    subheadline: "Automatically discover data assets, enforce governance policies, and track data lineage.",
    artifactHint: "Expect data discovery reports, classification summaries, and lineage diagrams.",
    quickStats: ["Data discovery", "Asset classification", "Policy governance"],
  },
  "data-pipeline-agent": {
    headline: "Monitor ETL/ELT pipelines, detect schema drift, and ensure data quality.",
    subheadline: "Monitor pipeline health, detect drift, and generate data quality reports.",
    artifactHint: "Expect pipeline health dashboards, drift detection reports, and quality metrics.",
    quickStats: ["Pipeline monitoring", "Schema drift detection", "Data quality"],
  },
  "field-service-operations-agent": {
    headline: "Manage field service scheduling, dispatch, and work order tracking.",
    subheadline: "Schedule technicians, dispatch jobs, track work orders, and monitor service delivery.",
    artifactHint: "Expect dispatch schedules, work order status, and service delivery reports.",
    quickStats: ["Scheduling", "Dispatch management", "Work order tracking"],
  },
  "hr-people-ops-agent": {
    headline: "Automate onboarding, performance reviews, and employee lifecycle workflows.",
    subheadline: "Streamline HR operations from onboarding through offboarding.",
    artifactHint: "Expect onboarding plans, review cycle summaries, and lifecycle event reports.",
    quickStats: ["Onboarding automation", "Performance reviews", "Lifecycle management"],
  },
  "identity-access-review-agent": {
    headline: "Review access entitlements, detect policy violations, and automate certifications.",
    subheadline: "Audit user entitlements, detect violations, and enforce least privilege.",
    artifactHint: "Expect access review reports, violation summaries, and certification results.",
    quickStats: ["Access reviews", "Policy violation detection", "Certification automation"],
  },
  "iot-fleet-monitoring-agent": {
    headline: "Monitor asset health, track fleet operations, and get predictive alerts.",
    subheadline: "Track device health, detect anomalies, and receive predictive maintenance alerts.",
    artifactHint: "Expect fleet health dashboards, anomaly alerts, and maintenance predictions.",
    quickStats: ["Asset monitoring", "Anomaly detection", "Predictive alerts"],
  },
  "log-management-agent": {
    headline: "Search, correlate, and analyze logs across your distributed systems.",
    subheadline: "Centralize log search, correlate events, and detect patterns across systems.",
    artifactHint: "Expect search results, correlation analyses, and error pattern summaries.",
    quickStats: ["Log search", "Event correlation", "Pattern detection"],
  },
  "marketing-campaign-agent": {
    headline: "Plan, execute, and analyze multi-channel marketing campaigns.",
    subheadline: "Plan timelines, manage segments, track execution, and analyze performance.",
    artifactHint: "Expect campaign plans, performance dashboards, and audience segment reports.",
    quickStats: ["Campaign planning", "Multi-channel execution", "Performance analysis"],
  },
  "observability-incident-agent": {
    headline: "Correlate alerts, enrich incidents, and accelerate root cause analysis.",
    subheadline: "Aggregate alerts, enrich with context, and streamline incident response.",
    artifactHint: "Expect incident timelines, correlation analyses, and RCA reports.",
    quickStats: ["Alert correlation", "Incident enrichment", "Root cause analysis"],
  },
  "security-incident-agent": {
    headline: "Detect and respond to brand impersonation and digital risk incidents.",
    subheadline: "Investigate alerts, assess severity, and generate triage packets for brand protection incidents.",
    artifactHint: "Expect incident triage packets with alert evidence, asset context, and severity rationale.",
    quickStats: ["Alert investigation", "Severity assessment", "Triage packets"],
  },
  "api-security-agent": {
    headline: "Discover, test, and secure your APIs against attacks and misconfigurations.",
    subheadline: "Inventory endpoints, review auth policies, and generate security briefs with remediation recommendations.",
    artifactHint: "Expect API security review briefs with endpoint inventory, auth policy analysis, and anomaly samples.",
    quickStats: ["Endpoint inventory", "Auth policy review", "Anomaly detection"],
  },
  "fraud-detection-agent": {
    headline: "Detect and prevent fraud with ML-based risk scoring and case review.",
    subheadline: "Analyze transactions, compute risk scores, and generate fraud case packets with behavior analysis.",
    artifactHint: "Expect fraud case review packets with transaction samples, risk scores, and behavior patterns.",
    quickStats: ["Transaction analysis", "Risk scoring", "Case review"],
  },
  "compliance-screening-agent": {
    headline: "Automate background checks and compliance screenings.",
    subheadline: "Screen entities, documents, and workflows against compliance criteria with audit-ready evidence.",
    artifactHint: "Expect compliance screening memos with entity data, criteria matches, and match rationale.",
    quickStats: ["Entity screening", "Document review", "Compliance memos"],
  },
  "financial-reconciliation-agent": {
    headline: "Automate account reconciliation and financial exception reporting.",
    subheadline: "Match ledger, invoice, and payment records to detect mismatches and generate exception reports.",
    artifactHint: "Expect reconciliation exception reports with mismatch details and proposed adjustments.",
    quickStats: ["Ledger matching", "Exception detection", "Adjustment proposals"],
  },
  "security-operations-agent": {
    headline: "Triage alerts, enrich incidents, and accelerate SOC investigations.",
    subheadline: "Ingest SIEM alerts, enrich with threat intel, correlate incidents, and generate investigation briefs.",
    artifactHint: "Expect SOC alert investigation briefs with alert batches, enrichment data, and severity assessments.",
    quickStats: ["Alert triage", "Threat enrichment", "Incident correlation"],
  },
  "supply-chain-security-agent": {
    headline: "Scan dependencies, enforce SBOM policies, and manage vulnerability remediation.",
    subheadline: "Analyze manifests and SBOMs for vulnerabilities with exploitability and risk context.",
    artifactHint: "Expect dependency risk reports with package inventories, vulnerability samples, and remediation proposals.",
    quickStats: ["Dependency scanning", "SBOM analysis", "Remediation planning"],
  },
  "ai-agent-orchestration-agent": {
    headline: "Deploy, monitor, and manage AI agents across your enterprise workflows.",
    subheadline: "Deploy AI agents, monitor performance, manage versions, and orchestrate multi-agent workflows.",
    artifactHint: "Expect deployment plans, health dashboards, and performance reports.",
    quickStats: ["Agent deployment", "Performance monitoring", "Multi-agent orchestration"],
  },
  "designer-agent": {
    headline: "Design app, product, and UI work — briefs, specs, and handoff docs.",
    subheadline: "A standalone design workspace for design briefs, reference and screenshot analysis, screen specs, component systems, and design QA. Does not write or run code.",
    artifactHint: "Expect design briefs, screen specs, component system docs, and implementation handoff docs.",
    quickStats: ["Screen specs", "Design QA", "Handoff docs"],
  },
  "ai-model-gateway-agent": {
    headline: "Route prompts, manage model versions, and control inference costs.",
    subheadline: "Monitor usage, detect cost anomalies, and generate governance reports with policy recommendations.",
    artifactHint: "Expect model governance reports with usage metrics, cost analysis, and routing policy reviews.",
    quickStats: ["Usage monitoring", "Cost analytics", "Policy governance"],
  },
};

function titleCaseCategory(category: string) {
  return category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getAgentWorkspacePreset(agent: Agent): AgentWorkspacePreset {
  const preset = PRESET_BY_SLUG[agent.slug];

  return {
    headline:
      preset?.headline ??
      `Open a dedicated ${titleCaseCategory(agent.category).toLowerCase()} workspace for ${agent.name}.`,
    subheadline:
      preset?.subheadline ??
      agent.long_description,
    artifactHint:
      preset?.artifactHint ??
      "Structured outputs and generated artifacts will collect in the right panel when available.",
    quickStats:
      preset?.quickStats ?? [
        `${titleCaseCategory(agent.category)} workflow`,
        `${agent.workspace_archetype.replace("_", " ")} layout`,
        `${agent.credit_cost} credit${agent.credit_cost === 1 ? "" : "s"} per session`,
      ],
    suggestedPrompts:
      preset?.suggestedPrompts ?? agent.example_prompts.slice(0, 3),
  };
}

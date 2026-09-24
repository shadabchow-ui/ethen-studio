import type { Agent } from "@ethen/contracts/agents/types";

export interface AssistantLabel {
  name: string;
  subtitle: string;
}

const LABELS: Record<string, AssistantLabel> = {
  "writing-agent": {
    name: "Writing Coach",
    subtitle: "Grammar, clarity, and style guidance",
  },
  "job-search-agent": {
    name: "Job Coach",
    subtitle: "Search strategy and application help",
  },
  "finance-agent": {
    name: "Finance Analyst",
    subtitle: "Market insights and portfolio analysis",
  },
  "research-agent": {
    name: "Research Copilot",
    subtitle: "Source discovery and summaries",
  },
  "academia-agent": {
    name: "Academia Assistant",
    subtitle: "Paper analysis and citations",
  },
  "real-estate-helper": {
    name: "Realty Advisor",
    subtitle: "Property insights and market comparisons",
  },
  "code-helper": {
    name: "Code Reviewer",
    subtitle: "Code guidance and review support",
  },
  "travel-agent": {
    name: "Travel Planner",
    subtitle: "Trip ideas and itinerary help",
  },
  "product-scraper": {
    name: "Product Research Assistant",
    subtitle: "Data extraction and analysis guidance",
  },
  "globe-agent": {
    name: "Globe Assistant",
    subtitle: "Place and terrain insights",
  },
  "maps-agent": {
    name: "Globe Assistant",
    subtitle: "Place and terrain insights",
  },
  "chatbot-agent": {
    name: "Ethen Assistant",
    subtitle: "General task help",
  },
  "image-agent": {
    name: "Image Assistant",
    subtitle: "Refine prompts, choose styles, and prepare exports.",
  },
  "shipping-agent": {
    name: "Shipping Assistant",
    subtitle: "Label creation, rates, and tracking guidance",
  },
  "backup-recovery-validation-agent": {
    name: "Backup Recovery Assistant",
    subtitle: "Backup validation and DR testing",
  },
  "bi-analytics-agent": {
    name: "BI Analyst",
    subtitle: "Data queries and dashboard insights",
  },
  "communications-messaging-agent": {
    name: "Communications Manager",
    subtitle: "Multi-channel message orchestration",
  },
  "customer-support-agent": {
    name: "Support Agent",
    subtitle: "Ticket triage and knowledge routing",
  },
  "developer-deployment-agent": {
    name: "Deployment Manager",
    subtitle: "Frontend deployments and previews",
  },
  "developer-platform-agent": {
    name: "Platform Manager",
    subtitle: "Dev environments and platform health",
  },
  "document-workflow-agent": {
    name: "Document Workflow Manager",
    subtitle: "Document lifecycle and approvals",
  },
  "experimentation-agent": {
    name: "Experimentation Lead",
    subtitle: "A/B tests and feature flags",
  },
  "it-service-desk-agent": {
    name: "IT Service Desk",
    subtitle: "IT ticket triage and automation",
  },
  "project-work-agent": {
    name: "Project Coordinator",
    subtitle: "Status tracking and progress reporting",
  },
  "recruiting-automation-agent": {
    name: "Recruiting Lead",
    subtitle: "Sourcing, screening, and offers",
  },
  "workflow-automation-agent": {
    name: "Workflow Designer",
    subtitle: "Cross-app automation and monitoring",
  },
  "api-gateway-agent": {
    name: "API Gateway Manager",
    subtitle: "Gateway configuration and security",
  },
  "cicd-pipeline-agent": {
    name: "Pipeline Engineer",
    subtitle: "Pipeline health and release gating",
  },
  "crm-engagement-agent": {
    name: "CRM Specialist",
    subtitle: "CRM hygiene and pipeline insights",
  },
  "data-governance-catalog-agent": {
    name: "Data Governance Lead",
    subtitle: "Data discovery and classification",
  },
  "data-pipeline-agent": {
    name: "Pipeline Monitor",
    subtitle: "ETL monitoring and data quality",
  },
  "field-service-operations-agent": {
    name: "Field Service Coordinator",
    subtitle: "Dispatch scheduling and work orders",
  },
  "hr-people-ops-agent": {
    name: "People Ops Manager",
    subtitle: "Onboarding and employee lifecycle",
  },
  "identity-access-review-agent": {
    name: "Access Review Specialist",
    subtitle: "Entitlement reviews and certifications",
  },
  "iot-fleet-monitoring-agent": {
    name: "Fleet Monitor",
    subtitle: "Asset health and predictive alerts",
  },
  "log-management-agent": {
    name: "Log Analyst",
    subtitle: "Log search and correlation",
  },
  "marketing-campaign-agent": {
    name: "Campaign Manager",
    subtitle: "Multi-channel campaign execution",
  },
  "observability-incident-agent": {
    name: "Incident Commander",
    subtitle: "Alert correlation and root cause analysis",
  },
  "security-incident-agent": {
    name: "Security Incident Analyst",
    subtitle: "Brand impersonation and digital risk response",
  },
  "api-security-agent": {
    name: "API Security Specialist",
    subtitle: "Endpoint discovery, auth policy, and anomaly detection",
  },
  "fraud-detection-agent": {
    name: "Fraud Analyst",
    subtitle: "Transaction risk scoring and case review",
  },
  "compliance-screening-agent": {
    name: "Compliance Officer",
    subtitle: "Background checks and regulatory screening",
  },
  "financial-reconciliation-agent": {
    name: "Reconciliation Specialist",
    subtitle: "Ledger matching and exception reporting",
  },
  "security-operations-agent": {
    name: "SOC Analyst",
    subtitle: "SIEM alert triage and incident investigation",
  },
  "supply-chain-security-agent": {
    name: "Supply Chain Security Analyst",
    subtitle: "SBOM scanning and dependency vulnerability management",
  },
  "ai-agent-orchestration-agent": {
    name: "Agent Orchestrator",
    subtitle: "AI agent deployment and lifecycle management",
  },
  "ai-model-gateway-agent": {
    name: "Model Gateway Manager",
    subtitle: "Prompt routing, model versions, and cost control",
  },
  "designer-agent": {
    name: "Design Inspector",
    subtitle: "Screen, layout, and theme control",
  },
  "founder-agent": {
    name: "Founder Assistant",
    subtitle: "Business briefs, research, and launch planning",
  },
};

const FALLBACK: AssistantLabel = {
  name: "Assistant",
  subtitle: "Contextual workspace help",
};

export function getAssistantLabel(agent: Agent): AssistantLabel {
  return LABELS[agent.slug] ?? FALLBACK;
}

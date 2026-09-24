// ── Connector Registry — framework-level connector definitions and registry ─
//
// This file defines the richer ConnectorDefinition for the connector framework.
// The runtime-level ConnectorDefinition in lib/agents/runtime/types.ts is a
// minimal subset for agent run orchestration. The definitions here are the
// framework source of truth for connector metadata, capabilities, and status.
//
// Live connectors require setup-required / trust gating.
// Mock connectors serve demo data with zero external dependency.

import type { ConnectorAuthMode, ConnectorCapability } from "./connector-capabilities";
import type { ConnectorStatus, ConnectorHealth, ConnectorRateLimit } from "./connection-status";
import type { ConnectorActionMode, ConnectorRequest, ConnectorResponse, ConnectorError } from "./mock-connector";
import { runMockConnectorRequest, isExecutionAllowed, createMockConnector } from "./mock-connector";

// ── Connector definition ─────────────────────────────────────────────────────

export interface ConnectorDefinition {
  id: string;
  displayName: string;
  description: string;
  category: ConnectorCategory;
  icon: string | null;
  authModes: ConnectorAuthMode[];
  capabilities: ConnectorCapability[];
  status: ConnectorStatus;
  statusDetail: string;
  actionModes: ConnectorActionMode[];
  baseUrl: string | null;
  supportsWebhooks: boolean;
  rateLimit: ConnectorRateLimit | null;
  isMock: boolean;
  requiresSetup: boolean;
  /** Source-of-truth note for this connector definition. */
  provenance: "seed" | "sdk" | "user_defined" | "system";
}

export type ConnectorCategory =
  | "developer"
  | "crm"
  | "support"
  | "commerce"
  | "productivity"
  | "automation"
  | "communication"
  | "database"
  | "monitoring"
  | "integration"
  | "general";

// ── Connector registry ───────────────────────────────────────────────────────

export class ConnectorRegistry {
  private definitions = new Map<string, ConnectorDefinition>();

  register(definition: ConnectorDefinition): boolean {
    if (this.definitions.has(definition.id)) return false;
    this.definitions.set(definition.id, definition);
    return true;
  }

  get(id: string): ConnectorDefinition | null {
    return this.definitions.get(id) ?? null;
  }

  list(): ConnectorDefinition[] {
    return Array.from(this.definitions.values());
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  listByCategory(category: ConnectorCategory): ConnectorDefinition[] {
    return this.list().filter((d) => d.category === category);
  }

  listByStatus(status: ConnectorStatus): ConnectorDefinition[] {
    return this.list().filter((d) => d.status === status);
  }
}

const registry = new ConnectorRegistry();

// ── Seed connector definitions ───────────────────────────────────────────────

function seedCapability(
  id: string,
  label: string,
  description: string,
  riskLevel: ConnectorCapability["riskLevel"],
  actionMode: ConnectorActionMode = "read",
  requiresAuth = true,
): ConnectorCapability {
  return {
    id,
    label,
    description,
    requiresAuth,
    riskLevel,
    inputSummary: `${label} input parameters`,
    outputSummary: `${label} result payload`,
    defaultActionMode: actionMode,
  };
}

// ── GitHub ───────────────────────────────────────────────────────────────────
const githubCapabilities: ConnectorCapability[] = [
  seedCapability("github.list_repos", "List Repositories", "List accessible repositories for the authenticated user.", "read_only", "read"),
  seedCapability("github.read_file", "Read File", "Read a file from a repository.", "read_only", "read"),
  seedCapability("github.search_code", "Search Code", "Search code across repositories.", "read_only", "read"),
  seedCapability("github.list_issues", "List Issues", "List issues for a repository.", "read_only", "read"),
  seedCapability("github.list_pull_requests", "List Pull Requests", "List open pull requests for a repository.", "read_only", "read"),
  seedCapability("github.create_issue", "Create Issue", "Open a new issue in a repository.", "writes_user_content", "propose"),
  seedCapability("github.create_pr", "Create Pull Request", "Open a new pull request.", "writes_user_content", "propose"),
];

registry.register({
  id: "github",
  displayName: "GitHub",
  description: "Connect GitHub to view repos, issues, PRs, and manage code workflows.",
  category: "developer",
  icon: "/connectors/github.png",
  authModes: ["oauth2", "bearer_token"],
  capabilities: githubCapabilities,
  status: "planned",
  statusDetail: "GitHub connector is planned. Types and contracts defined; runtime wiring pending.",
  actionModes: ["read", "propose"],
  baseUrl: "https://api.github.com",
  supportsWebhooks: true,
  rateLimit: { limit: 5000, remaining: null, resetAt: null, summary: "5000 req/hour (authenticated)" },
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── Jira ─────────────────────────────────────────────────────────────────────
const jiraCapabilities: ConnectorCapability[] = [
  seedCapability("jira.search_issues", "Search Issues", "Search Jira issues via JQL.", "read_only", "read"),
  seedCapability("jira.get_issue", "Get Issue", "Get a single Jira issue by key.", "read_only", "read"),
  seedCapability("jira.list_projects", "List Projects", "List accessible Jira projects.", "read_only", "read"),
  seedCapability("jira.get_project", "Get Project", "Get a Jira project by key.", "read_only", "read"),
  seedCapability("jira.create_issue", "Create Issue", "Create a new Jira issue in a project.", "writes_user_content", "propose"),
  seedCapability("jira.add_comment", "Add Comment", "Add a comment to an existing issue.", "writes_user_content", "propose"),
];

registry.register({
  id: "jira",
  displayName: "Jira",
  description: "Connect Jira to search, view, and manage issues and projects.",
  category: "productivity",
  icon: "/connectors/jira.png",
  authModes: ["oauth2", "api_key"],
  capabilities: jiraCapabilities,
  status: "planned",
  statusDetail: "Jira connector is planned. Types and contracts defined; runtime wiring pending.",
  actionModes: ["read", "propose"],
  baseUrl: "https://your-domain.atlassian.net",
  supportsWebhooks: true,
  rateLimit: null,
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── Zendesk ──────────────────────────────────────────────────────────────────
const zendeskCapabilities: ConnectorCapability[] = [
  seedCapability("zendesk.search_tickets", "Search Tickets", "Search support tickets.", "read_only", "read"),
  seedCapability("zendesk.get_ticket", "Get Ticket", "Get a single support ticket.", "read_only", "read"),
  seedCapability("zendesk.list_users", "List Users", "List support users/agents.", "read_only", "read"),
  seedCapability("zendesk.create_ticket", "Create Ticket", "Create a new support ticket.", "writes_user_content", "propose"),
  seedCapability("zendesk.update_ticket", "Update Ticket", "Update an existing ticket.", "writes_user_content", "propose"),
  seedCapability("zendesk.add_comment", "Add Comment", "Add an internal or public comment to a ticket.", "writes_user_content", "propose"),
];

registry.register({
  id: "zendesk",
  displayName: "Zendesk",
  description: "Connect Zendesk to view, search, and manage support tickets.",
  category: "support",
  icon: "/connectors/zendesk.png",
  authModes: ["oauth2", "api_key"],
  capabilities: zendeskCapabilities,
  status: "planned",
  statusDetail: "Zendesk connector is planned. Types and contracts defined; runtime wiring pending.",
  actionModes: ["read", "propose"],
  baseUrl: "https://your-subdomain.zendesk.com",
  supportsWebhooks: true,
  rateLimit: { limit: 700, remaining: null, resetAt: null, summary: "700 req/minute" },
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── Salesforce ───────────────────────────────────────────────────────────────
const salesforceCapabilities: ConnectorCapability[] = [
  seedCapability("salesforce.search_accounts", "Search Accounts", "Search Salesforce accounts via SOQL.", "read_only", "read"),
  seedCapability("salesforce.get_account", "Get Account", "Get a Salesforce account by ID.", "read_only", "read"),
  seedCapability("salesforce.search_contacts", "Search Contacts", "Search Salesforce contacts.", "read_only", "read"),
  seedCapability("salesforce.get_contact", "Get Contact", "Get a Salesforce contact by ID.", "read_only", "read"),
  seedCapability("salesforce.search_opportunities", "Search Opportunities", "Search Salesforce opportunities.", "read_only", "read"),
  seedCapability("salesforce.get_opportunity", "Get Opportunity", "Get a Salesforce opportunity by ID.", "read_only", "read"),
  seedCapability("salesforce.create_record", "Create Record", "Create a new record on a standard or custom object.", "writes_user_content", "propose"),
  seedCapability("salesforce.update_record", "Update Record", "Update an existing record.", "writes_user_content", "propose"),
];

registry.register({
  id: "salesforce",
  displayName: "Salesforce",
  description: "Connect Salesforce to search accounts, contacts, deals, and manage CRM records.",
  category: "crm",
  icon: "/connectors/salesforce.png",
  authModes: ["oauth2"],
  capabilities: salesforceCapabilities,
  status: "planned",
  statusDetail: "Salesforce connector is planned. Handler contracts exist; runtime wiring pending.",
  actionModes: ["read", "propose"],
  baseUrl: "https://your-instance.salesforce.com",
  supportsWebhooks: true,
  rateLimit: null,
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── HubSpot ──────────────────────────────────────────────────────────────────
const hubspotCapabilities: ConnectorCapability[] = [
  seedCapability("hubspot.search_contacts", "Search Contacts", "Search HubSpot contacts.", "read_only", "read"),
  seedCapability("hubspot.get_contact", "Get Contact", "Get a HubSpot contact by ID.", "read_only", "read"),
  seedCapability("hubspot.search_companies", "Search Companies", "Search HubSpot companies.", "read_only", "read"),
  seedCapability("hubspot.get_company", "Get Company", "Get a HubSpot company by ID.", "read_only", "read"),
  seedCapability("hubspot.search_deals", "Search Deals", "Search HubSpot deals.", "read_only", "read"),
  seedCapability("hubspot.get_deal", "Get Deal", "Get a HubSpot deal by ID.", "read_only", "read"),
  seedCapability("hubspot.create_record", "Create Record", "Create a new CRM record.", "writes_user_content", "propose"),
];

registry.register({
  id: "hubspot",
  displayName: "HubSpot",
  description: "Connect HubSpot to manage contacts, deals, tickets, and marketing campaigns.",
  category: "crm",
  icon: "/connectors/hubspot.png",
  authModes: ["oauth2", "api_key"],
  capabilities: hubspotCapabilities,
  status: "planned",
  statusDetail: "HubSpot connector is planned. Handler contracts exist; runtime wiring pending.",
  actionModes: ["read", "propose"],
  baseUrl: "https://api.hubapi.com",
  supportsWebhooks: true,
  rateLimit: { limit: 100, remaining: null, resetAt: null, summary: "100 req/10s" },
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── Slack ────────────────────────────────────────────────────────────────────
const slackCapabilities: ConnectorCapability[] = [
  seedCapability("slack.list_channels", "List Channels", "List public channels in the workspace.", "read_only", "read"),
  seedCapability("slack.get_channel", "Get Channel", "Get channel info.", "read_only", "read"),
  seedCapability("slack.list_users", "List Users", "List workspace members.", "read_only", "read"),
  seedCapability("slack.search_messages", "Search Messages", "Search messages across channels.", "read_only", "read"),
  seedCapability("slack.get_channel_history", "Get Channel History", "Get recent messages from a channel.", "read_only", "read"),
  seedCapability("slack.post_message", "Post Message", "Post a message to a channel.", "writes_user_content", "propose"),
];

registry.register({
  id: "slack",
  displayName: "Slack",
  description: "Connect Slack to send messages, search channels, and manage workspace communication.",
  category: "communication",
  icon: "/connectors/slack.png",
  authModes: ["oauth2"],
  capabilities: slackCapabilities,
  status: "planned",
  statusDetail: "Slack connector is planned. Types and contracts defined; runtime wiring pending.",
  actionModes: ["read", "propose"],
  baseUrl: "https://slack.com/api",
  supportsWebhooks: true,
  rateLimit: null,
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── Google Drive ─────────────────────────────────────────────────────────────
const googleDriveCapabilities: ConnectorCapability[] = [
  seedCapability("google-drive.list_files", "List Files", "List files and folders in Google Drive.", "read_only", "read"),
  seedCapability("google-drive.get_file", "Get File", "Get file metadata.", "read_only", "read"),
  seedCapability("google-drive.search_files", "Search Files", "Search files by name or content.", "read_only", "read"),
  seedCapability("google-drive.read_file", "Read File Content", "Read file content as text.", "read_only", "read"),
  seedCapability("google-drive.upload_file", "Upload File", "Upload a new file to Drive.", "writes_user_content", "propose"),
  seedCapability("google-drive.create_folder", "Create Folder", "Create a new folder.", "writes_user_content", "propose"),
];

registry.register({
  id: "google-drive",
  displayName: "Google Drive",
  description: "Connect Google Drive to search, read, and manage files and folders.",
  category: "productivity",
  icon: "/connectors/google-drive.png",
  authModes: ["oauth2"],
  capabilities: googleDriveCapabilities,
  status: "setup-required",
  statusDetail: "Google Drive connector requires OAuth 2.0 configuration to enable live access. Mock fallback is active.",
  actionModes: ["read", "propose"],
  baseUrl: "https://www.googleapis.com/drive/v3",
  supportsWebhooks: true,
  rateLimit: { limit: 12000, remaining: null, resetAt: null, summary: "12000 req/minute per user" },
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── Postgres ─────────────────────────────────────────────────────────────────
const postgresCapabilities: ConnectorCapability[] = [
  seedCapability("postgres.execute_query", "Execute Query", "Execute a read-only SQL query.", "read_only", "read"),
  seedCapability("postgres.list_tables", "List Tables", "List database tables and views.", "read_only", "read"),
  seedCapability("postgres.describe_table", "Describe Table", "Get table schema and column info.", "read_only", "read"),
  seedCapability("postgres.explain_query", "Explain Query", "Get query execution plan.", "read_only", "read"),
];

registry.register({
  id: "postgres",
  displayName: "PostgreSQL",
  description: "Connect PostgreSQL to query, explore schema, and analyse database data.",
  category: "database",
  icon: null,
  authModes: ["api_key"],
  capabilities: postgresCapabilities,
  status: "planned",
  statusDetail: "PostgreSQL connector is planned. Read-only query support via connection string.",
  actionModes: ["read"],
  baseUrl: null,
  supportsWebhooks: false,
  rateLimit: null,
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── Datadog ──────────────────────────────────────────────────────────────────
const datadogCapabilities: ConnectorCapability[] = [
  seedCapability("datadog.query_metrics", "Query Metrics", "Query Datadog metrics data.", "read_only", "read"),
  seedCapability("datadog.list_monitors", "List Monitors", "List all monitors.", "read_only", "read"),
  seedCapability("datadog.get_monitor", "Get Monitor", "Get a single monitor by ID.", "read_only", "read"),
  seedCapability("datadog.list_dashboards", "List Dashboards", "List all dashboards.", "read_only", "read"),
  seedCapability("datadog.search_logs", "Search Logs", "Search log events.", "read_only", "read"),
  seedCapability("datadog.create_monitor", "Create Monitor", "Create a new monitor.", "writes_user_content", "propose"),
];

registry.register({
  id: "datadog",
  displayName: "Datadog",
  description: "Connect Datadog to query metrics, search logs, and manage monitors and dashboards.",
  category: "monitoring",
  icon: null,
  authModes: ["api_key"],
  capabilities: datadogCapabilities,
  status: "planned",
  statusDetail: "Datadog connector is planned. Types and contracts defined; runtime wiring pending.",
  actionModes: ["read", "propose"],
  baseUrl: "https://api.datadoghq.com",
  supportsWebhooks: true,
  rateLimit: null,
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── Sentry ───────────────────────────────────────────────────────────────────
const sentryCapabilities: ConnectorCapability[] = [
  seedCapability("sentry.list_issues", "List Issues", "List error/issues from Sentry.", "read_only", "read"),
  seedCapability("sentry.get_issue", "Get Issue", "Get a single issue by ID.", "read_only", "read"),
  seedCapability("sentry.list_events", "List Events", "List events for an issue.", "read_only", "read"),
  seedCapability("sentry.list_projects", "List Projects", "List all projects.", "read_only", "read"),
  seedCapability("sentry.resolve_issue", "Resolve Issue", "Mark an issue as resolved.", "writes_user_content", "propose"),
];

registry.register({
  id: "sentry",
  displayName: "Sentry",
  description: "Connect Sentry to view errors, diagnose issues, and manage project alerting.",
  category: "monitoring",
  icon: null,
  authModes: ["bearer_token"],
  capabilities: sentryCapabilities,
  status: "planned",
  statusDetail: "Sentry connector is planned. Types and contracts defined; runtime wiring pending.",
  actionModes: ["read", "propose"],
  baseUrl: "https://sentry.io/api",
  supportsWebhooks: true,
  rateLimit: null,
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── Stripe ───────────────────────────────────────────────────────────────────
const stripeCapabilities: ConnectorCapability[] = [
  seedCapability("stripe.search_customers", "Search Customers", "Search Stripe customers.", "read_only", "read"),
  seedCapability("stripe.get_customer", "Get Customer", "Get a Stripe customer by ID.", "read_only", "read"),
  seedCapability("stripe.list_payments", "List Payments", "List payment intents.", "read_only", "read"),
  seedCapability("stripe.get_payment", "Get Payment", "Get a payment intent by ID.", "read_only", "read"),
  seedCapability("stripe.list_invoices", "List Invoices", "List invoices.", "read_only", "read"),
  seedCapability("stripe.get_invoice", "Get Invoice", "Get an invoice by ID.", "read_only", "read"),
  seedCapability("stripe.list_subscriptions", "List Subscriptions", "List active subscriptions.", "read_only", "read"),
  seedCapability("stripe.create_refund", "Create Refund", "Create a refund for a charge.", "writes_user_content", "propose"),
];

registry.register({
  id: "stripe",
  displayName: "Stripe",
  description: "Connect Stripe to view payments, customers, invoices, and manage billing operations.",
  category: "commerce",
  icon: "/connectors/stripe.png",
  authModes: ["api_key"],
  capabilities: stripeCapabilities,
  status: "planned",
  statusDetail: "Stripe connector is planned. Types and contracts defined; runtime wiring pending.",
  actionModes: ["read", "propose"],
  baseUrl: "https://api.stripe.com",
  supportsWebhooks: true,
  rateLimit: { limit: 100, remaining: null, resetAt: null, summary: "100 req/second in live mode" },
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── Generic REST ─────────────────────────────────────────────────────────────
const genericRestCapabilities: ConnectorCapability[] = [
  seedCapability("generic-rest.get", "GET Request", "Make an HTTP GET request to an external API.", "read_only", "read"),
  seedCapability("generic-rest.post", "POST Request", "Make an HTTP POST request with a JSON body.", "writes_user_content", "propose"),
  seedCapability("generic-rest.put", "PUT Request", "Make an HTTP PUT request.", "writes_user_content", "propose"),
  seedCapability("generic-rest.delete", "DELETE Request", "Make an HTTP DELETE request.", "destructive", "propose"),
  seedCapability("generic-rest.head", "HEAD Request", "Fetch HTTP headers only.", "read_only", "read"),
];

registry.register({
  id: "generic-rest",
  displayName: "Generic REST",
  description: "Connect any REST API with standard HTTP methods. Use for ad-hoc integrations.",
  category: "integration",
  icon: null,
  authModes: ["bearer_token", "api_key", "basic_auth"],
  capabilities: genericRestCapabilities,
  status: "setup-required",
  statusDetail: "Configure a base URL and auth header to enable Generic REST. Writes and deletes are blocked until explicit trust gating is passed.",
  actionModes: ["read", "propose"],
  baseUrl: null,
  supportsWebhooks: false,
  rateLimit: null,
  isMock: true,
  requiresSetup: true,
  provenance: "seed",
});

// ── CSV Upload ───────────────────────────────────────────────────────────────
const csvUploadCapabilities: ConnectorCapability[] = [
  seedCapability("csv-upload.upload", "Upload CSV", "Upload and parse a CSV file.", "read_only", "read"),
  seedCapability("csv-upload.preview", "Preview CSV", "Preview first N rows of an uploaded CSV.", "read_only", "read"),
  seedCapability("csv-upload.schema", "Detect Schema", "Auto-detect column names and types.", "read_only", "read"),
  seedCapability("csv-upload.validate", "Validate CSV", "Check CSV for common issues (missing headers, encoding).", "read_only", "read"),
  seedCapability("csv-upload.export", "Export CSV", "Export processed data as a downloadable CSV.", "writes_user_content", "propose"),
];

registry.register({
  id: "csv-upload",
  displayName: "CSV Upload",
  description: "Upload and analyse CSV files. Parse, validate schema, preview rows, and export results.",
  category: "general",
  icon: null,
  authModes: ["none"],
  capabilities: csvUploadCapabilities,
  status: "mock",
  statusDetail: "CSV upload runs fully client-side. No external service required.",
  actionModes: ["read", "propose"],
  baseUrl: null,
  supportsWebhooks: false,
  rateLimit: null,
  isMock: true,
  requiresSetup: false,
  provenance: "seed",
});

// ── Public helpers ───────────────────────────────────────────────────────────

export function getConnectorDefinition(id: string): ConnectorDefinition | null {
  return registry.get(id);
}

export function listConnectorDefinitions(): ConnectorDefinition[] {
  return registry.list();
}

export function hasConnector(id: string): boolean {
  return registry.has(id);
}

export function listConnectorsByCategory(category: ConnectorCategory): ConnectorDefinition[] {
  return registry.listByCategory(category);
}

export function listConnectorsByStatus(status: ConnectorStatus): ConnectorDefinition[] {
  return registry.listByStatus(status);
}

export { registry as connectorRegistry };

// Re-export mock connector helpers through the registry layer for convenience
export { runMockConnectorRequest, isExecutionAllowed, createMockConnector };
export type { MockConnectorConfig } from "./mock-connector";

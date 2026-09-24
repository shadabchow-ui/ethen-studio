import "server-only";

import { getGoogleWorkspaceStatus } from "./google/provider";
import { getMicrosoftProviderHealth } from "./microsoft/health";
import { getWebhookProviderMeta } from "./webhooks/types";
import { isMockMode } from "@ethen/config/runtime-flags";
import { isVaultConfigured } from "./vault";

export type ProviderUiStatus =
  | "live"
  | "configured"
  | "not_configured"
  | "coming_soon"
  | "disabled";

export type ProviderCategory =
  | "productivity"
  | "crm"
  | "support"
  | "commerce"
  | "automation"
  | "developer";

export interface ProviderCard {
  providerId: string;
  name: string;
  category: ProviderCategory;
  description: string;
  status: ProviderUiStatus;
  statusDetail: string;
  actionCount: number;
  approvalRequiredCount: number;
  authType: string;
  scopes?: string[];
  isMockOnly: boolean;
  hasLiveHandlers: boolean;
  icon?: string;
  connected: boolean;
}

function buildStatus(
  configured: boolean,
  mockOnly: boolean,
  isDisabled: boolean,
  statusOverride?: ProviderUiStatus,
): ProviderUiStatus {
  if (isDisabled) return "disabled";
  if (statusOverride) return statusOverride;
  if (mockOnly) return "not_configured";
  if (configured) return "configured";
  return "not_configured";
}

export function getConnectedAppsProviders(): ProviderCard[] {
  const vaultReady = isVaultConfigured();
  const mockMode = isMockMode;

  const googleStatus = getGoogleWorkspaceStatus();
  const msHealth = getMicrosoftProviderHealth();
  const webhookMeta = getWebhookProviderMeta();

  const providers: ProviderCard[] = [
    // ── Google Workspace ─────────────────────────────────────────────────
    {
      providerId: "google_workspace",
      name: "Google Workspace",
      category: "productivity",
      description:
        "Connect Gmail, Google Drive, Calendar, Docs, and Sheets. Search, read, and manage your Google content.",
      icon: "/connectors/google-workspace.webp",
      status: buildStatus(googleStatus.requiresSetup === false, googleStatus.isMock, false),
      statusDetail: googleStatus.disclaimer,
      actionCount: 5,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 / API Key / Service Account",
      isMockOnly: googleStatus.isMock,
      hasLiveHandlers: googleStatus.mode === "live",
      connected: false,
    },
    // ── Microsoft 365 ───────────────────────────────────────────────────
    {
      providerId: "microsoft_365",
      name: "Microsoft 365",
      category: "productivity",
      description:
        "Connect Outlook, Calendar, OneDrive, SharePoint, and Teams. Search, read, and draft messages and events.",
      icon: "/connectors/microsoft-365.png",
      status: msHealth.status === "mock-fallback"
        ? "not_configured"
        : msHealth.status === "configured"
          ? "configured"
          : "not_configured",
      statusDetail: msHealth.detail ?? "",
      actionCount: 5,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 (Microsoft Entra ID)",
      scopes: ["Mail.Read", "Calendars.Read", "Files.Read", "Sites.Read.All", "ChannelMessage.Read.All"],
      isMockOnly: mockMode,
      hasLiveHandlers: false,
      connected: false,
    },
    // ── Webhooks ────────────────────────────────────────────────────────
    {
      providerId: "webhooks",
      name: "Webhooks",
      category: "automation",
      description:
        "Receive incoming webhooks from external services and send outbound callbacks when Ethen actions complete.",
      icon: "/connectors/webhooks.svg",
      status: webhookMeta.state === "configured"
        ? "configured"
        : "not_configured",
      statusDetail: webhookMeta.reason ?? "Webhook signing and verification not configured.",
      actionCount: 2,
      approvalRequiredCount: 2,
      authType: "Webhook Signing Secret",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    // ── Automation Platforms ─────────────────────────────────────────────
    {
      providerId: "zapier",
      name: "Zapier",
      category: "automation",
      description:
        "Connect Ethen to thousands of apps via Zapier. Trigger zaps and send data to 7,000+ integrations.",
      icon: "/connectors/zapier.png",
      status: "not_configured",
      statusDetail: "Zapier connection is not configured. Set a webhook URL to enable.",
      actionCount: 1,
      approvalRequiredCount: 1,
      authType: "API Key / Webhook URL",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "make",
      name: "Make",
      category: "automation",
      description:
        "Build visual automation scenarios with Make (formerly Integromat). Connect Ethen actions to Make scenarios.",
      icon: "/connectors/make.png",
      status: "not_configured",
      statusDetail: "Make webhook connection is not configured.",
      actionCount: 1,
      approvalRequiredCount: 1,
      authType: "API Key / Webhook URL",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "n8n",
      name: "n8n",
      category: "automation",
      description:
        "Connect Ethen to self-hosted or cloud n8n workflows. Send data to n8n webhook nodes.",
      icon: "/connectors/n8n.webp",
      status: "not_configured",
      statusDetail: "n8n webhook connection is not configured.",
      actionCount: 1,
      approvalRequiredCount: 1,
      authType: "API Key / Webhook URL",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    // ── CRM ─────────────────────────────────────────────────────────────
    {
      providerId: "salesforce",
      name: "Salesforce",
      category: "crm",
      description:
        "Connect Salesforce to search accounts, contacts, deals, and manage CRM records.",
      icon: "/connectors/salesforce.png",
      status: "coming_soon",
      statusDetail: "Salesforce connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "hubspot",
      name: "HubSpot",
      category: "crm",
      description:
        "Connect HubSpot to manage contacts, deals, tickets, and marketing campaigns.",
      icon: "/connectors/hubspot.png",
      status: "coming_soon",
      statusDetail: "HubSpot connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 / API Key",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    // ── Support ─────────────────────────────────────────────────────────
    {
      providerId: "zendesk",
      name: "Zendesk",
      category: "support",
      description:
        "Connect Zendesk to view, search, and manage support tickets.",
      icon: "/connectors/zendesk.png",
      status: "coming_soon",
      statusDetail: "Zendesk connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 / API Key",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "intercom",
      name: "Intercom",
      category: "support",
      description:
        "Connect Intercom to manage conversations, contacts, and support messages.",
      icon: "/connectors/intercom.png",
      status: "coming_soon",
      statusDetail: "Intercom connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    // ── Project Management ──────────────────────────────────────────────
    {
      providerId: "jira",
      name: "Jira",
      category: "productivity",
      description:
        "Connect Jira to search, view, and manage issues and projects.",
      icon: "/connectors/jira.png",
      status: "coming_soon",
      statusDetail: "Jira connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 / API Key",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "linear",
      name: "Linear",
      category: "productivity",
      description:
        "Connect Linear to manage issues, projects, and team workflows.",
      icon: "/connectors/linear.webp",
      status: "coming_soon",
      statusDetail: "Linear connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 / API Key",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "notion",
      name: "Notion",
      category: "productivity",
      description:
        "Connect Notion to search, read, and manage pages and databases.",
      icon: "/connectors/notion.png",
      status: "coming_soon",
      statusDetail: "Notion connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "asana",
      name: "Asana",
      category: "productivity",
      description:
        "Connect Asana to manage tasks, projects, and team workflows.",
      icon: "/connectors/asana.svg",
      status: "coming_soon",
      statusDetail: "Asana connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "monday",
      name: "Monday",
      category: "productivity",
      description:
        "Connect Monday.com to manage boards, items, and team collaboration.",
      icon: "/connectors/monday.svg",
      status: "coming_soon",
      statusDetail: "Monday.com connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 / API Key",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "trello",
      name: "Trello",
      category: "productivity",
      description:
        "Connect Trello to manage boards, lists, and cards.",
      icon: "/connectors/trello.png",
      status: "coming_soon",
      statusDetail: "Trello connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 / API Key",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "airtable",
      name: "Airtable",
      category: "productivity",
      description:
        "Connect Airtable to search, read, and manage bases and records.",
      icon: "/connectors/airtable.webp",
      status: "coming_soon",
      statusDetail: "Airtable connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 / API Key",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    // ── Communication ───────────────────────────────────────────────────
    {
      providerId: "slack",
      name: "Slack",
      category: "productivity",
      description:
        "Connect Slack to send messages, search channels, and manage workspace communication.",
      icon: "/connectors/slack.png",
      status: "coming_soon",
      statusDetail: "Slack connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "teams",
      name: "Microsoft Teams",
      category: "productivity",
      description:
        "Connect Teams to send and read channel messages and manage team communication.",
      icon: "/connectors/microsoft-teams.png",
      status: "coming_soon",
      statusDetail: "Teams connector is planned as part of the Microsoft 365 suite.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 (Microsoft Entra ID)",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    // ── Commerce ────────────────────────────────────────────────────────
    {
      providerId: "stripe",
      name: "Stripe",
      category: "commerce",
      description:
        "Connect Stripe to view payments, customers, invoices, and manage billing operations.",
      icon: "/connectors/stripe.png",
      status: "coming_soon",
      statusDetail: "Stripe connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "API Key (Secret Key)",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "shopify",
      name: "Shopify",
      category: "commerce",
      description:
        "Connect Shopify to manage orders, products, customers, and store operations.",
      icon: "/connectors/shopify.webp",
      status: "coming_soon",
      statusDetail: "Shopify connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 / API Key",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "quickbooks",
      name: "QuickBooks",
      category: "commerce",
      description:
        "Connect QuickBooks to view and manage invoices, expenses, and accounting data.",
      icon: "/connectors/quickbooks.png",
      status: "coming_soon",
      statusDetail: "QuickBooks connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    // ── Developer ───────────────────────────────────────────────────────
    {
      providerId: "github",
      name: "GitHub",
      category: "developer",
      description:
        "Connect GitHub to view repos, issues, PRs, and manage code workflows.",
      icon: "/connectors/github.png",
      status: "coming_soon",
      statusDetail: "GitHub connector is planned. Types and contracts exist; runtime wiring pending.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "OAuth 2.0 / Personal Access Token",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
    {
      providerId: "custom_sdk",
      name: "Custom Connector SDK",
      category: "developer",
      description:
        "Build your own connector with the Ethen Connector SDK. Define actions, input schemas, risk tiers, and approval gates.",
      status: "configured",
      statusDetail: "The Connector SDK is available for building custom integrations. Define your connector manifest and register handlers.",
      actionCount: 0,
      approvalRequiredCount: 0,
      authType: "Custom (via SDK)",
      isMockOnly: false,
      hasLiveHandlers: false,
      connected: false,
    },
  ];

  if (vaultReady) {
    for (const p of providers) {
      if (p.status === "not_configured" && !p.isMockOnly) {
        p.statusDetail = p.statusDetail || "Token vault is available. Configure credentials to enable live actions.";
      }
    }
  }

  void mockMode;
  void vaultReady;

  return providers;
}

export function getProviderCategories(): ProviderCategory[] {
  return ["productivity", "crm", "support", "commerce", "automation", "developer"];
}

export function getCategoryLabel(category: ProviderCategory): string {
  switch (category) {
    case "productivity": return "Productivity";
    case "crm": return "CRM";
    case "support": return "Support";
    case "commerce": return "Commerce";
    case "automation": return "Automation";
    case "developer": return "Developer";
  }
}

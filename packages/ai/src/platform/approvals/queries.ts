// lib/platform/approvals/queries.ts
//
// Bridge queries for the platform approval queue. Today these wrap fixture
// data and clearly label approve/reject as scaffolded — no fake state-
// changing endpoint is exposed until persistence is safe.

import { APPROVAL_QUEUE_STATUS_LABELS } from "./types";
import type { PlatformApprovalEntry, ApprovalQueueStatus } from "./types";

const BASE_ISO = "2026-07-01T12:00:00.000Z";

/** Sample approval queue fixtures; clearly labelled as sample. */
export const PLATFORM_APPROVAL_FIXTURES: PlatformApprovalEntry[] = [
  {
    id: "apr_stripe_sheets_append",
    proposal: null,
    workflowId: "wf_stripe_sheets_slack",
    workflowName: "Stripe → Sheets + Slack notify",
    runId: "run_stripe_001",
    stepId: "step_sheets_append",
    stepName: "Append row to Google Sheets",
    toolId: "google_sheets.append_row",
    appId: "google_sheets",
    riskTier: "writes_data",
    riskLabel: "writes_data",
    parameters: { spreadsheetId: "[REDACTED]", row: ["pay_123", "$42.00"] },
    actionRequested: "Append a row to a connected Google Sheet.",
    sideEffects: "Creates a new row in the connected Google Sheet.",
    status: "pending",
    approver: null,
    decisionPersistable: false,
    sample: true,
    createdAt: BASE_ISO,
    updatedAt: BASE_ISO,
  },
  {
    id: "apr_slack_post_message",
    proposal: null,
    workflowId: "wf_stripe_sheets_slack",
    workflowName: "Stripe → Sheets + Slack notify",
    runId: "run_stripe_001",
    stepId: "step_slack_notify",
    stepName: "Notify Slack channel",
    toolId: "slack.post_message",
    appId: "slack",
    riskTier: "external_effect",
    riskLabel: "external_effect",
    parameters: { channelId: "[REDACTED]", text: "Stripe payment received" },
    actionRequested: "Post a message to a Slack channel.",
    sideEffects: "Sends a visible message to the configured Slack channel.",
    status: "pending",
    approver: null,
    decisionPersistable: false,
    sample: true,
    createdAt: BASE_ISO,
    updatedAt: BASE_ISO,
  },
  {
    id: "apr_linear_create",
    proposal: null,
    workflowId: "wf_github_issue_to_linear",
    workflowName: "GitHub issue → Linear sync",
    runId: "run_github_017",
    stepId: "step_linear_create",
    stepName: "Create Linear issue",
    toolId: "linear.create_issue",
    appId: "linear",
    riskTier: "writes_data",
    riskLabel: "writes_data",
    parameters: { teamId: "[REDACTED]", title: "Mirror GitHub issue" },
    actionRequested: "Create an issue in Linear.",
    sideEffects: "Creates a new Linear issue visible to the team.",
    status: "approved",
    approver: { id: "user_sha", label: "sha" },
    decisionPersistable: false,
    sample: true,
    createdAt: BASE_ISO,
    updatedAt: BASE_ISO,
  },
  {
    id: "apr_expired_demo",
    proposal: null,
    workflowId: "wf_notion_daily_digest",
    workflowName: "Notion daily digest",
    runId: "run_notion_202",
    stepId: "step_notion_post",
    stepName: "Post digest to Notion",
    toolId: "notion.create_page",
    appId: "notion",
    riskTier: "writes_data",
    riskLabel: "writes_data",
    parameters: { pageId: "[REDACTED]", body: "daily digest" },
    actionRequested: "Create a digest page in Notion.",
    sideEffects: "Creates a page in the connected Notion workspace.",
    status: "expired",
    approver: null,
    decisionPersistable: false,
    sample: true,
    createdAt: BASE_ISO,
    updatedAt: BASE_ISO,
  },
];

export function listPlatformApprovals(): PlatformApprovalEntry[] {
  return [...PLATFORM_APPROVAL_FIXTURES];
}

export function listPlatformApprovalsForRun(
  runId: string,
): PlatformApprovalEntry[] {
  return PLATFORM_APPROVAL_FIXTURES.filter((entry) => entry.runId === runId);
}

export function listPlatformApprovalsForWorkflow(
  workflowId: string,
): PlatformApprovalEntry[] {
  return PLATFORM_APPROVAL_FIXTURES.filter((entry) => entry.workflowId === workflowId);
}

export function getPlatformApproval(approvalId: string): PlatformApprovalEntry | null {
  return PLATFORM_APPROVAL_FIXTURES.find((entry) => entry.id === approvalId) ?? null;
}

export function getApprovalStatusLabel(status: ApprovalQueueStatus): string {
  return APPROVAL_QUEUE_STATUS_LABELS[status];
}

/** Group approvals into queue buckets for the UI. */
export function groupApprovalsByStatus(
  entries: PlatformApprovalEntry[],
): Record<ApprovalQueueStatus, PlatformApprovalEntry[]> {
  const groups = {} as Record<ApprovalQueueStatus, PlatformApprovalEntry[]>;
  for (const status of Object.keys(APPROVAL_QUEUE_STATUS_LABELS) as ApprovalQueueStatus[]) {
    groups[status] = [];
  }
  for (const entry of entries) {
    groups[entry.status].push(entry);
  }
  return groups;
}
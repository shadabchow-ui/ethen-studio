import "server-only";

import { isVaultConfigured } from "../vault";
import { microsoftGraphGet } from "./graph-client";
import type {
  MicrosoftResult,
  MicrosoftError,
  OutlookMessageSummary,
  OutlookMessageDetail,
  OutlookDraftReply,
  OutlookSearchParams,
} from "./types";

const NOT_CONFIGURED: MicrosoftError = {
  code: "NOT_CONFIGURED",
  message: "Outlook connector is not configured. Token vault is unavailable.",
  status: 503,
};

const APPROVAL_REQUIRED: MicrosoftError = {
  code: "APPROVAL_REQUIRED",
  message: "Send/draft-create actions require user approval.",
  status: 403,
};

function notConfigured<T>(): MicrosoftResult<T> {
  return { ok: false, error: NOT_CONFIGURED };
}

/**
 * Search / list Outlook messages for a connected account.
 * Read-only — no approval required, but needs a valid token.
 */
export async function searchOutlookMessages(
  connectionId: string,
  params: OutlookSearchParams = {}
): Promise<MicrosoftResult<OutlookMessageSummary[]>> {
  if (!isVaultConfigured()) return notConfigured();

  const queryParts: string[] = [];
  if (params.query) queryParts.push(params.query);
  if (params.from) queryParts.push(`from:${params.from}`);
  const searchParam = queryParts.length > 0 ? queryParts.join(" ") : undefined;

  const queryParams: Record<string, string> = {
    $top: String(params.maxResults || 20),
    $select: "id,subject,from,receivedDateTime,hasAttachments,importance,isRead,bodyPreview",
    $orderby: "receivedDateTime desc",
  };
  if (params.folder) {
    queryParams.$filter = `parentFolderId eq '${params.folder}'`;
  }
  if (searchParam) {
    queryParams.$search = `"${searchParam}"`;
  }

  const result = await microsoftGraphGet<{ value: Record<string, unknown>[] }>(
    connectionId,
    "/me/mailFolders/inbox/messages",
    queryParams
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  const summaries: OutlookMessageSummary[] = (result.data.value || []).map(normalizeOutlookSummary);
  return { ok: true, data: summaries };
}

/**
 * Get a single Outlook message with full detail.
 * Read-only — no approval required.
 */
export async function getOutlookMessage(
  connectionId: string,
  messageId: string
): Promise<MicrosoftResult<OutlookMessageDetail>> {
  if (!isVaultConfigured()) return notConfigured();

  const queryParams: Record<string, string> = {
    $expand: "attachments($select=id,name,size,contentType)",
  };

  const result = await microsoftGraphGet<Record<string, unknown>>(
    connectionId,
    `/me/messages/${messageId}`,
    queryParams
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  return { ok: true, data: normalizeOutlookDetail(result.data) };
}

/**
 * Draft a reply payload — does NOT send, only builds a ready-to-review reply.
 * Read-only in effect: the caller must pass the output through approval before sending.
 */
export async function draftOutlookReply(
  connectionId: string,
  messageId: string
): Promise<MicrosoftResult<OutlookDraftReply>> {
  if (!isVaultConfigured()) return notConfigured();

  const result = await microsoftGraphGet<Record<string, unknown>>(
    connectionId,
    `/me/messages/${messageId}`,
    { $select: "id,subject,from,toRecipients,ccRecipients" }
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  const msg = result.data;
  const originalSubject = String(msg.subject || "");
  const fromRecipients = extractEmailList(msg.from);
  const ccRecipients = extractEmailList(msg.ccRecipients);

  return {
    ok: true,
    data: {
      subject: originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`,
      toRecipients: fromRecipients,
      ccRecipients,
      body: "",
      referencesMessageId: messageId,
    },
  };
}

/**
 * Send a message via Outlook — approval-gated.
 * Always fails closed with APPROVAL_REQUIRED until approval layer is fully wired.
 */
export async function sendOutlookMessage(
  connectionId: string,
  draft: OutlookDraftReply
): Promise<MicrosoftResult<{ sentId: string }>> {
  void connectionId;
  void draft;
  return { ok: false, error: APPROVAL_REQUIRED };
}

// ── Normalizers ────────────────────────────────────────────────────────────

function normalizeOutlookSummary(raw: Record<string, unknown>): OutlookMessageSummary {
  const from = extractEmailList(raw.from)[0] || "";
  const fromParts = from.split(" <");
  return {
    id: String(raw.id || ""),
    subject: String(raw.subject || "(no subject)"),
    sender: fromParts[0] || from,
    senderEmail: fromParts.length > 1 ? fromParts[1].replace(">", "") : from,
    receivedAt: String(raw.receivedDateTime || ""),
    hasAttachments: Boolean(raw.hasAttachments),
    importance: String(raw.importance || "normal") as OutlookMessageSummary["importance"],
    isRead: Boolean(raw.isRead),
    preview: String(raw.bodyPreview || "").slice(0, 200),
  };
}

function normalizeOutlookDetail(raw: Record<string, unknown>): OutlookMessageDetail {
  const summary = normalizeOutlookSummary(raw);
  return {
    ...summary,
    body: String((raw.body as Record<string, unknown> | null)?.content ?? ""),
    contentType: String((raw.body as Record<string, unknown> | null)?.contentType ?? "text") as "text" | "html",
    toRecipients: extractEmailList(raw.toRecipients),
    ccRecipients: extractEmailList(raw.ccRecipients),
    attachments: normalizeAttachments(raw.attachments as Array<Record<string, unknown>> | undefined),
    conversationId: String(raw.conversationId || ""),
  };
}

function normalizeAttachments(attachments?: Array<Record<string, unknown>>) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((a) => ({
    id: String(a.id || ""),
    name: String(a.name || ""),
    size: Number(a.size || 0),
    contentType: String(a.contentType || ""),
  }));
}

function extractEmailList(
  field: unknown
): string[] {
  if (!Array.isArray(field)) return [];
  return field.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") return "";
    const e = entry as Record<string, unknown>;
    const address = e.emailAddress as Record<string, unknown> | undefined;
    if (address?.name && address?.address) {
      return `${address.name} <${address.address}>`;
    }
    return String(address?.address || "");
  }).filter(Boolean);
}

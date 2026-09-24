import "server-only";

import { isVaultConfigured } from "../vault";
import { microsoftGraphGet } from "./graph-client";
import type {
  MicrosoftResult,
  MicrosoftError,
  TeamsChannelSummary,
  TeamsMessageSummary,
  TeamsMessageDetail,
  TeamsDraftMessage,
} from "./types";

const NOT_CONFIGURED: MicrosoftError = {
  code: "NOT_CONFIGURED",
  message: "Microsoft Teams connector is not configured. Token vault is unavailable.",
  status: 503,
};

const APPROVAL_REQUIRED: MicrosoftError = {
  code: "APPROVAL_REQUIRED",
  message: "Teams message send actions require user approval.",
  status: 403,
};

function notConfigured<T>(): MicrosoftResult<T> {
  return { ok: false, error: NOT_CONFIGURED };
}

/**
 * List Teams groups the user belongs to.
 * Read-only — no approval required.
 */
export async function listTeams(
  connectionId: string
): Promise<MicrosoftResult<{ id: string; name: string; description: string }[]>> {
  if (!isVaultConfigured()) return notConfigured();

  const result = await microsoftGraphGet<{ value: Record<string, unknown>[] }>(
    connectionId,
    "/me/joinedTeams",
    { $select: "id,displayName,description" }
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  return {
    ok: true,
    data: (result.data.value || []).map((t) => ({
      id: String(t.id || ""),
      name: String(t.displayName || ""),
      description: String(t.description || ""),
    })),
  };
}

/**
 * List channels in a team.
 * Read-only — no approval required.
 */
export async function listTeamsChannels(
  connectionId: string,
  teamId: string
): Promise<MicrosoftResult<TeamsChannelSummary[]>> {
  if (!isVaultConfigured()) return notConfigured();

  const result = await microsoftGraphGet<{ value: Record<string, unknown>[] }>(
    connectionId,
    `/teams/${teamId}/channels`,
    { $select: "id,displayName,description,membershipType" }
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  return {
    ok: true,
    data: (result.data.value || []).map((c) => ({
      id: String(c.id || ""),
      name: String(c.displayName || ""),
      description: String(c.description || ""),
      membershipType: String(c.membershipType || "standard") as TeamsChannelSummary["membershipType"],
    })),
  };
}

/**
 * List messages in a Teams channel.
 * Read-only — no approval required.
 */
export async function listTeamsMessages(
  connectionId: string,
  teamId: string,
  channelId: string,
  maxResults = 50
): Promise<MicrosoftResult<TeamsMessageSummary[]>> {
  if (!isVaultConfigured()) return notConfigured();

  const result = await microsoftGraphGet<{ value: Record<string, unknown>[] }>(
    connectionId,
    `/teams/${teamId}/channels/${channelId}/messages`,
    {
      $top: String(maxResults),
      $select: "id,channelIdentity,from,createdDateTime,body,messageType,attachments,replyCount",
    }
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  return {
    ok: true,
    data: (result.data.value || []).map((m) => normalizeTeamsMessageSummary(m, teamId, channelId)),
  };
}

/**
 * Get a single Teams message with replies.
 * Read-only — no approval required.
 */
export async function getTeamsMessageDetail(
  connectionId: string,
  teamId: string,
  channelId: string,
  messageId: string
): Promise<MicrosoftResult<TeamsMessageDetail>> {
  if (!isVaultConfigured()) return notConfigured();

  const [msgResult, repliesResult] = await Promise.all([
    microsoftGraphGet<Record<string, unknown>>(
      connectionId,
      `/teams/${teamId}/channels/${channelId}/messages/${messageId}`,
      { $select: "id,channelIdentity,from,createdDateTime,body,messageType,attachments,mentions,reactions,replyCount" }
    ),
    microsoftGraphGet<{ value: Record<string, unknown>[] }>(
      connectionId,
      `/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`,
      { $top: "50", $select: "id,from,createdDateTime,body,messageType" }
    ),
  ]);

  if (!msgResult.ok || !msgResult.data) {
    return { ok: false, error: msgResult.error! };
  }

  const replySummaries: TeamsMessageSummary[] = repliesResult.ok && repliesResult.data
    ? (repliesResult.data.value || []).map((r) => normalizeTeamsMessageSummary(r, teamId, channelId))
    : [];

  return {
    ok: true,
    data: normalizeTeamsMessageDetail(msgResult.data, teamId, channelId, replySummaries),
  };
}

/**
 * Draft a Teams channel message — does NOT send.
 */
export async function draftTeamsMessage(
  connectionId: string,
  draft: TeamsDraftMessage
): Promise<MicrosoftResult<TeamsDraftMessage>> {
  void connectionId;
  return {
    ok: true,
    data: draft,
  };
}

/**
 * Send a message to a Teams channel — approval-gated.
 * Always fails closed with APPROVAL_REQUIRED until approval layer is fully wired.
 */
export async function sendTeamsMessage(
  connectionId: string,
  draft: TeamsDraftMessage
): Promise<MicrosoftResult<{ messageId: string }>> {
  void connectionId;
  void draft;
  return { ok: false, error: APPROVAL_REQUIRED };
}

// ── Normalizers ────────────────────────────────────────────────────────────

function normalizeTeamsMessageSummary(
  raw: Record<string, unknown>,
  teamId: string,
  channelId: string
): TeamsMessageSummary {
  const channelIdentity = raw.channelIdentity as Record<string, unknown> | undefined;
  const from = raw.from as Record<string, unknown> | undefined;
  const user = from?.user as Record<string, unknown> | undefined;
  return {
    id: String(raw.id || ""),
    channelId,
    channelName: String(channelIdentity?.displayName || ""),
    teamId,
    teamName: "",
    sender: String(user?.displayName || (from?.application as Record<string, unknown> | null)?.displayName || ""),
    senderEmail: String(user?.email || ""),
    sentAt: String(raw.createdDateTime || ""),
    body: String((raw.body as Record<string, unknown> | null)?.content ?? "").slice(0, 500),
    messageType: String(raw.messageType || "message") as "message" | "systemEvent",
    hasAttachments: Array.isArray(raw.attachments) && raw.attachments.length > 0,
    replyCount: Number(raw.replyCount || 0),
  };
}

function normalizeTeamsMessageDetail(
  raw: Record<string, unknown>,
  teamId: string,
  channelId: string,
  replies: TeamsMessageSummary[]
): TeamsMessageDetail {
  const summary = normalizeTeamsMessageSummary(raw, teamId, channelId);
  const mentions = Array.isArray(raw.mentions)
    ? (raw.mentions as Array<Record<string, unknown>>).map((m) => ({
        name: String((m.mentioned as Record<string, unknown> | null)?.user
          ? (((m.mentioned as Record<string, unknown>).user as Record<string, unknown>)?.displayName ?? "")
          : ""),
        email: String((m.mentioned as Record<string, unknown> | null)?.user
          ? (((m.mentioned as Record<string, unknown>).user as Record<string, unknown>)?.email ?? "")
          : ""),
      }))
    : [];
  const reactions = Array.isArray(raw.reactions)
    ? (raw.reactions as Array<Record<string, unknown>>).map((r) => ({
        type: String(r.reactionType || ""),
        count: Number(r.count || 0),
      }))
    : [];
  const attachments = Array.isArray(raw.attachments)
    ? (raw.attachments as Array<Record<string, unknown>>).map((a) => ({
        name: String(a.name || ""),
        contentType: String(a.contentType || ""),
        url: String(a.contentUrl || ""),
      }))
    : [];

  return {
    ...summary,
    mentions,
    reactions,
    attachments,
    replies,
  };
}

/**
 * Typed adapter mapping Ethen Session / Message ↔ assistant-ui thread concepts.
 *
 * This module formalizes the mapping already performed implicitly by:
 *  - EthenAssistantRuntime.toUIMessages()  (Message → UIMessage)
 *  - hooks/useRecentSessions.serverToRecent()  (Session → RecentSession)
 *  - lib/sessions/server-queries.getServerSessionMessages()  (read path)
 *
 * It provides pure functions suitable for use with useExternalStoreRuntime
 * or as an honest typed boundary for any future adapter. No database tables,
 * schemas, or persistence endpoints are invented here — all data must flow
 * through the existing lib/sessions/** APIs.
 */

import type { ThreadMessageLike } from "@assistant-ui/react";
import type {Session, Message} from "@ethen/account";

/** Thread metadata extracted from an Ethen session row. */
export interface EthenThreadMetadata {
  sessionId: string;
  title: string | null;
  agentId: string | null;
  workspaceArchetype: string | null;
  modelRoute: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A thread list item in the shape assistant-ui / the sidebar expects. */
export interface EthenThreadListItem {
  id: string;
  title: string;
  updatedAt: string;
  metadata: EthenThreadMetadata;
}

/** Result of reading a persisted session's messages for thread hydration. */
export interface EthenThreadResume {
  session: EthenThreadMetadata | null;
  messages: ThreadMessageLike[];
}

// ── Pure mapping functions ────────────────────────────────────────────────────

/**
 * Map a single Ethen Session row into thread metadata.
 * Returns null when the input is null/undefined (safe passthrough).
 */
export function sessionToThreadMetadata(session: Session | null | undefined): EthenThreadMetadata | null {
  if (!session) return null;

  return {
    sessionId: session.id,
    title: session.title,
    agentId: session.agent_id,
    workspaceArchetype: session.workspace_archetype,
    modelRoute: session.model_route,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  };
}

/**
 * Map a session into a thread list item suitable for display.
 * The display title falls back to "Untitled session" when null.
 */
export function sessionToThreadListItem(session: Session, displayTitle?: string): EthenThreadListItem {
  const metadata = sessionToThreadMetadata(session);

  return {
    id: session.id,
    title: displayTitle ?? session.title ?? "Untitled session",
    updatedAt: session.updated_at ?? session.created_at,
    metadata: metadata!,
  };
}

/**
 * Map an array of sessions into thread list items.
 * Returns an empty array for null/undefined input.
 */
export function sessionsToThreadListItems(sessions: Session[] | null | undefined): EthenThreadListItem[] {
  if (!sessions) return [];
  return sessions.map((s) => sessionToThreadListItem(s));
}

/**
 * Map a single Ethen Message row into an assistant-ui ThreadMessageLike.
 * Only user and assistant messages are mapped (tool/system are filtered).
 * Returns null when content is missing or role is not user/assistant.
 */
export function messageToThreadMessageLike(message: Message | null | undefined): ThreadMessageLike | null {
  if (!message) return null;
  if (message.role !== "user" && message.role !== "assistant") return null;

  const content = message.content ?? "";

  return {
    id: message.id,
    role: message.role,
    content: [{ type: "text", text: content }],
    ...(message.metadata ? { metadata: message.metadata as Record<string, unknown> } : {}),
    ...(message.role === "assistant"
      ? { status: { type: "complete" as const, reason: "stop" as const } }
      : {}),
  };
}

/**
 * Map an array of Ethen Messages into assistant-ui ThreadMessageLike[].
 * Filters to user/assistant only, drops messages with no content, and
 * orders by created_at ascending (the caller should pre-sort).
 */
export function messagesToThreadMessageLikes(messages: Message[] | null | undefined): ThreadMessageLike[] {
  if (!messages || messages.length === 0) return [];

  const result: ThreadMessageLike[] = [];

  for (const message of messages) {
    const mapped = messageToThreadMessageLike(message);
    if (mapped) result.push(mapped);
  }

  return result;
}

/**
 * Build a full EthenThreadResume from a session row and its messages.
 * Returns honest null session + empty messages when either is missing.
 */
export function buildThreadResume(
  session: Session | null | undefined,
  messages: Message[] | null | undefined,
): EthenThreadResume {
  return {
    session: sessionToThreadMetadata(session),
    messages: messagesToThreadMessageLikes(messages),
  };
}

// ── Guards and safe defaults ──────────────────────────────────────────────────

/**
 * Check whether a session ID looks like a draft (not yet persisted).
 * Draft IDs follow the pattern "{prefix}~{random}" where prefix is
 * "draft-" or "mock-" and the suffix is a nanoid/UUID/timestamp.
 */
export function isDraftSessionId(sessionId: string | null | undefined): boolean {
  if (!sessionId) return true;
  return sessionId.startsWith("draft-") || sessionId.startsWith("mock-");
}

/**
 * Return a display title for a session, never null.
 * Falls back through title → "Untitled session".
 */
export function resolveSessionTitle(session: { title?: string | null } | null | undefined): string {
  return session?.title ?? "Untitled session";
}

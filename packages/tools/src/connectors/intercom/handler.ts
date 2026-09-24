import { RuntimeError } from "../../connector-runtime";
import type { UserContext } from "../../connector-runtime";
import { notConfiguredResult } from "../handler-helpers";

const PROVIDER_ID = "intercom";
const PROVIDER_LABEL = "Intercom";

function failClosed(action: string) {
  const nc = notConfiguredResult(PROVIDER_ID, PROVIDER_LABEL);
  return {
    provider: PROVIDER_ID,
    action,
    configured: false,
    reason: nc.reason,
    records: [],
  };
}

export async function searchConversations(_input: unknown, _context: UserContext) { return failClosed("search_conversations"); }
export async function getConversation(_input: unknown, _context: UserContext) { return failClosed("get_conversation"); }

export async function draftReply(input: unknown, _context: UserContext) {
  const inp = (input ?? {}) as Record<string, unknown>;
  return {
    action: "draft_reply",
    provider: PROVIDER_ID,
    draft: true,
    conversationId: inp.conversationId ?? null,
    visibility: inp.visibility === "internal" ? "internal" : "public",
    content: typeof inp.content === "string" ? inp.content : "",
    requiresApproval: true,
    approvalReason: "Sending a reply to a conversation is an external side effect and requires approval.",
  };
}

export async function sendReply(_input: unknown, _context: UserContext) {
  throw new RuntimeError("token_storage_not_configured", `${PROVIDER_LABEL} send_reply requires a live token. The token vault is fail-closed.`);
}

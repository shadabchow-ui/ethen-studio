// Session adapter — unit tests
// Run with: npx tsx lib/cortex/__tests__/session-adapter.test.ts
//
// These tests exercise the pure mapping functions in lib/cortex/session-adapter.ts.
// No Supabase connection, network, or database is required.

import {
  sessionToThreadMetadata,
  sessionToThreadListItem,
  sessionsToThreadListItems,
  messageToThreadMessageLike,
  messagesToThreadMessageLikes,
  buildThreadResume,
  isDraftSessionId,
  resolveSessionTitle,
} from "../session-adapter";
import type {Session, Message} from "@ethen/account";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: "sess-001",
    user_id: "user-001",
    agent_id: "agent-001",
    title: "Test session",
    workspace_archetype: "generic_chat",
    model_route: "text-fast",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-07-04T12:00:00Z",
    ...overrides,
  };
}

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: "msg-001",
    session_id: "sess-001",
    role: "user",
    content: "Hello, world!",
    metadata: null,
    token_count: null,
    created_at: "2026-07-04T12:00:00Z",
    ...overrides,
  };
}

// ── sessionToThreadMetadata ──────────────────────────────────────────────────

console.log("sessionToThreadMetadata");

const session = makeSession();
const meta = sessionToThreadMetadata(session);
assert(meta !== null, "returns metadata for valid session");
assertEqual(meta!.sessionId, "sess-001", "sessionId mapped correctly");
assertEqual(meta!.title, "Test session", "title mapped correctly");
assertEqual(meta!.agentId, "agent-001", "agentId mapped correctly");
assertEqual(meta!.workspaceArchetype, "generic_chat", "workspaceArchetype mapped");
assertEqual(meta!.modelRoute, "text-fast", "modelRoute mapped");

const nullMeta = sessionToThreadMetadata(null);
assert(nullMeta === null, "returns null for null input");

const undefinedMeta = sessionToThreadMetadata(undefined);
assert(undefinedMeta === null, "returns null for undefined input");

const nullTitleSession = makeSession({ title: null });
const nullTitleMeta = sessionToThreadMetadata(nullTitleSession);
assert(nullTitleMeta!.title === null, "preserves null title");

// ── sessionToThreadListItem ──────────────────────────────────────────────────

console.log("\nsessionToThreadListItem");

const listItem = sessionToThreadListItem(session);
assertEqual(listItem.id, "sess-001", "list item id matches session id");
assertEqual(listItem.title, "Test session", "list item title matches session title");
assert(listItem.metadata !== null, "list item includes metadata");

const untitled = makeSession({ title: null });
const untitledItem = sessionToThreadListItem(untitled);
assertEqual(untitledItem.title, "Untitled session", "fallback title for null session title");

const customTitle = sessionToThreadListItem(untitled, "Custom title");
assertEqual(customTitle.title, "Custom title", "respects explicit displayTitle");

// ── sessionsToThreadListItems ────────────────────────────────────────────────

console.log("\nsessionsToThreadListItems");

const sessions = [makeSession({ id: "sess-001" }), makeSession({ id: "sess-002", title: "Session two" })];
const items = sessionsToThreadListItems(sessions);
assertEqual(items.length, 2, "maps all sessions");
assertEqual(items[0].id, "sess-001", "preserves order, first item");
assertEqual(items[1].id, "sess-002", "preserves order, second item");

const emptySessions = sessionsToThreadListItems([]);
assertEqual(emptySessions.length, 0, "empty array for empty input");

const nullSessions = sessionsToThreadListItems(null);
assertEqual(nullSessions.length, 0, "empty array for null input");

const undefinedSessions = sessionsToThreadListItems(undefined);
assertEqual(undefinedSessions.length, 0, "empty array for undefined input");

// ── messageToThreadMessageLike ───────────────────────────────────────────────

console.log("\nmessageToThreadMessageLike");

function getFirstTextPart(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const first = content[0];
  if (!first || typeof first !== "object") return "";
  if ("type" in first && first.type === "text" && "text" in first && typeof first.text === "string") return first.text;
  return "";
}

const userMsg = makeMessage();
const mapped = messageToThreadMessageLike(userMsg);
assert(mapped !== null, "maps user message");
assertEqual(mapped!.role, "user", "preserves user role");
assert(getFirstTextPart(mapped!.content) === "Hello, world!", "content text preserved");

const assistantMsg = makeMessage({ role: "assistant", content: "Sure!" });
const mappedAssistant = messageToThreadMessageLike(assistantMsg);
assert(mappedAssistant !== null, "maps assistant message");
assertEqual(mappedAssistant!.role, "assistant", "preserves assistant role");
assert("status" in mappedAssistant!, "assistant messages have status");

const systemMsg = makeMessage({ role: "system", content: "system prompt" });
const mappedSystem = messageToThreadMessageLike(systemMsg);
assert(mappedSystem === null, "filters system messages");

const toolMsg = makeMessage({ role: "tool", content: "tool result" });
const mappedTool = messageToThreadMessageLike(toolMsg);
assert(mappedTool === null, "filters tool messages");

const nullMsg = messageToThreadMessageLike(null);
assert(nullMsg === null, "returns null for null input");

const undefinedMsg = messageToThreadMessageLike(undefined);
assert(undefinedMsg === null, "returns null for undefined input");

const nullContent = makeMessage({ content: null });
const mappedNullContent = messageToThreadMessageLike(nullContent);
assert(mappedNullContent !== null, "maps message with null content (empty string fallback)");
assertEqual(getFirstTextPart(mappedNullContent!.content), "", "empty content text for null");

// ── messagesToThreadMessageLikes ─────────────────────────────────────────────

console.log("\nmessagesToThreadMessageLikes");

const msgs = [
  makeMessage({ id: "msg-1", role: "user", content: "Hi" }),
  makeMessage({ id: "msg-2", role: "assistant", content: "Hello!" }),
  makeMessage({ id: "msg-3", role: "system", content: "sys" }),
  makeMessage({ id: "msg-4", role: "tool", content: "tool" }),
  makeMessage({ id: "msg-5", role: "user", content: "Again" }),
];
const mappedMsgs = messagesToThreadMessageLikes(msgs);
assertEqual(mappedMsgs.length, 3, "filters to user/assistant only");
assertEqual(mappedMsgs[0].id, "msg-1", "preserves order, first message");
assertEqual(mappedMsgs[1].id, "msg-2", "preserves order, second message");
assertEqual(mappedMsgs[2].id, "msg-5", "third message is user");

const emptyMsgs = messagesToThreadMessageLikes([]);
assertEqual(emptyMsgs.length, 0, "empty array for empty input");

const nullMsgs = messagesToThreadMessageLikes(null);
assertEqual(nullMsgs.length, 0, "empty array for null input");

// ── buildThreadResume ────────────────────────────────────────────────────────

console.log("\nbuildThreadResume");

const resume = buildThreadResume(session, msgs);
assert(resume.session !== null, "resume includes session metadata");
assertEqual(resume.session!.sessionId, "sess-001", "resume session id correct");
assertEqual(resume.messages.length, 3, "resume messages filtered correctly");

const emptyResume = buildThreadResume(null, null);
assert(emptyResume.session === null, "null session when missing");
assertEqual(emptyResume.messages.length, 0, "empty messages when missing");

// ── isDraftSessionId ─────────────────────────────────────────────────────────

console.log("\nisDraftSessionId");

assert(isDraftSessionId("draft-chatbot-agent~abc123"), "detects draft session id");
assert(isDraftSessionId("mock-chatbot-agent~abc123"), "detects mock session id");
assert(isDraftSessionId(null), "null is draft");
assert(isDraftSessionId(undefined), "undefined is draft");
assert(!isDraftSessionId("550e8400-e29b-41d4-a716-446655440000"), "real UUID is not draft");
assert(!isDraftSessionId("sess-001"), "non-draft prefix is not draft");

// ── resolveSessionTitle ──────────────────────────────────────────────────────

console.log("\nresolveSessionTitle");

assertEqual(resolveSessionTitle(session), "Test session", "uses session title");
assertEqual(resolveSessionTitle({ title: "My chat" }), "My chat", "uses inline title");
assertEqual(resolveSessionTitle({ title: null }), "Untitled session", "fallback for null title");
assertEqual(resolveSessionTitle(null), "Untitled session", "fallback for null session");
assertEqual(resolveSessionTitle(undefined), "Untitled session", "fallback for undefined session");
assertEqual(resolveSessionTitle({}), "Untitled session", "fallback for missing title");

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

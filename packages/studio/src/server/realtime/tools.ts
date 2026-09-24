/** Studio V5 realtime — tool gateway (STUDIO_16, server-only). */
import "server-only";
import { randomUUID } from "node:crypto";
import type { TaskName } from "../../contracts/tasks";
import type { PolicyPort } from "../ports/operations";
import { hashSessionContent, type RealtimeServiceDeps } from "./sessions";
import { stopSession } from "./sessions";
import {
  realtimeError,
  type RealtimeApprovalPort,
  type RealtimeToolCall,
} from "./types";

/** Tool call persistence port (owned by the realtime repository). */
export interface RealtimeToolRepository {
  insertToolCall(call: RealtimeToolCall): Promise<void>;
  getToolCall(callId: string): Promise<RealtimeToolCall | null>;
  updateToolCall(call: RealtimeToolCall): Promise<void>;
  listToolCalls(sessionId: string): Promise<RealtimeToolCall[]>;
  listPendingApprovals(sessionId: string): Promise<RealtimeToolCall[]>;
}

/** Tool executor — injected by the realtime plane; default refuses honestly. */
export type RealtimeToolExecutor = (input: {
  sessionId: string;
  callId: string;
  task: TaskName;
  toolName: string;
  args: Readonly<Record<string, unknown>>;
}) => Promise<{ ok: boolean; result?: unknown; error?: string }>;

export const REALTIME_NOT_WIRED_EXECUTOR: RealtimeToolExecutor = async () => ({
  ok: false,
  error: "EXECUTION_NOT_WIRED: no realtime tool executor is registered in the current build.",
});

export type RealtimeToolResult =
  | { ok: true; status: "completed"; call: RealtimeToolCall }
  | { ok: true; status: "awaiting_approval"; call: RealtimeToolCall }
  | { ok: false; status: "denied"; code: string; reason: string; call: RealtimeToolCall | null };

export interface RequestToolCallInput {
  sessionId: string;
  task: TaskName;
  toolName: string;
  toolScopeId: string;
  args: Readonly<Record<string, unknown>>;
  actorId: string;
  /** Studio roles for the task policy gate (generate needs creator/admin). */
  actorRoles: readonly string[];
  /** Spend approval evidence carried from the session authorization. */
  spendApproval: { approved: boolean; approvalId: string | null; capIcu: number };
  /** Risky tools require a human approval before execution. */
  requiresApproval: boolean;
  approvalTtlMs?: number;
  now?: string;
}

export interface RealtimeToolDeps extends RealtimeServiceDeps {
  tools: RealtimeToolRepository;
  approvals: RealtimeApprovalPort;
  executor?: RealtimeToolExecutor;
}

/**
 * Request a realtime tool call. The tool executes under the SAME task policy
 * as batch work (PolicyPort decide on the tool's canonical task); revoked or
 * unapproved scopes stop the session instead of running.
 */
export async function requestRealtimeToolCall(
  deps: RealtimeToolDeps,
  input: RequestToolCallInput,
): Promise<RealtimeToolResult> {
  const now = input.now ?? new Date().toISOString();
  const session = await deps.repository.getSession(input.sessionId);
  if (!session) throw realtimeError("NOT_FOUND", `Realtime session ${input.sessionId} was not found.`);
  if (session.status === "ENDED" || session.status === "REVOKED" || session.status === "ERRORED") {
    throw realtimeError("CONFLICT", `Session ${input.sessionId} is terminal; tools are closed.`);
  }
  if (session.revokedScopeIds.includes(input.toolScopeId)) {
    await stopSession(deps, { sessionId: input.sessionId, reason: "revoked", now });
    return { ok: false, status: "denied", code: "REALTIME_TOOL_SCOPE_REVOKED", reason: `Tool scope ${input.toolScopeId} is revoked; the session was stopped.`, call: null };
  }
  if (!session.toolScopeIds.includes(input.toolScopeId)) {
    return { ok: false, status: "denied", code: "REALTIME_TOOL_SCOPE_UNKNOWN", reason: `Tool scope ${input.toolScopeId} is not approved for session ${input.sessionId}.`, call: null };
  }

  const argsHash = hashSessionContent(input.args);
  const decision = await deps.policy.decide(session.scope, input.task, "generate", {
    actorId: input.actorId,
    roles: [...input.actorRoles],
    spendApproval: {
      approved: input.spendApproval.approved,
      approvalId: input.spendApproval.approvalId,
      capIcu: input.spendApproval.capIcu,
    },
    sessionId: input.sessionId,
    toolName: input.toolName,
    toolScopeId: input.toolScopeId,
    argsHash,
  });
  if (!decision.allowed) {
    const denied: RealtimeToolCall = {
      callId: randomUUID(),
      sessionId: input.sessionId,
      epoch: session.epoch,
      task: input.task,
      toolName: input.toolName,
      toolScopeId: input.toolScopeId,
      args: input.args,
      argsHash,
      status: "denied",
      approvalId: null,
      decisionCode: decision.reasonCode,
      resultRedacted: null,
      requestedAt: now,
      decidedAt: now,
    };
    await deps.tools.insertToolCall(denied);
    return { ok: false, status: "denied", code: decision.reasonCode, reason: decision.remediation ?? "Tool call denied by policy.", call: denied };
  }

  const call: RealtimeToolCall = {
    callId: randomUUID(),
    sessionId: input.sessionId,
    epoch: session.epoch,
    task: input.task,
    toolName: input.toolName,
    toolScopeId: input.toolScopeId,
    args: input.args,
    argsHash,
    status: input.requiresApproval ? "awaiting_approval" : "approved",
    approvalId: null,
    decisionCode: decision.reasonCode,
    resultRedacted: null,
    requestedAt: now,
    decidedAt: null,
  };

  if (input.requiresApproval) {
    const ttlMs = input.approvalTtlMs ?? 5 * 60 * 1000;
    const { approvalId } = await deps.approvals.request({
      sessionId: input.sessionId,
      callId: call.callId,
      toolScopeId: input.toolScopeId,
      argsHash,
      actorId: input.actorId,
      expiresAt: new Date(Date.parse(now) + ttlMs).toISOString(),
    });
    const pending: RealtimeToolCall = { ...call, approvalId };
    await deps.tools.insertToolCall(pending);
    return { ok: true, status: "awaiting_approval", call: pending };
  }

  await deps.tools.insertToolCall(call);
  return executeApprovedTool(deps, { callId: call.callId, approvalId: null, actorId: input.actorId, now });
}

export interface ExecuteToolInput {
  callId: string;
  /** Approval id for risky tools; null only for no-approval tools. */
  approvalId: string | null;
  actorId: string;
  now?: string;
}

/**
 * Execute an approved tool call. The approval envelope binds exact
 * session/call/args; mutation or replay is denied. Execution runs through the
 * injected executor with redacted results.
 */
export async function executeApprovedTool(
  deps: RealtimeToolDeps,
  input: ExecuteToolInput,
): Promise<RealtimeToolResult> {
  const now = input.now ?? new Date().toISOString();
  const call = await deps.tools.getToolCall(input.callId);
  if (!call) throw realtimeError("NOT_FOUND", `Tool call ${input.callId} was not found.`);
  if (call.status === "completed" || call.status === "failed" || call.status === "denied") {
    throw realtimeError("CONFLICT", `Tool call ${input.callId} is already ${call.status}; replay is refused.`);
  }
  const session = await deps.repository.getSession(call.sessionId);
  if (!session) throw realtimeError("NOT_FOUND", `Realtime session ${call.sessionId} was not found.`);
  if (session.revokedScopeIds.includes(call.toolScopeId)) {
    await stopSession(deps, { sessionId: call.sessionId, reason: "revoked", now });
    const denied: RealtimeToolCall = { ...call, status: "denied", decisionCode: "REALTIME_TOOL_SCOPE_REVOKED", decidedAt: now };
    await deps.tools.updateToolCall(denied);
    return { ok: false, status: "denied", code: "REALTIME_TOOL_SCOPE_REVOKED", reason: "Tool scope was revoked; the session was stopped.", call: denied };
  }

  if (call.status === "awaiting_approval") {
    if (!input.approvalId || input.approvalId !== call.approvalId) {
      throw realtimeError("APPROVAL_REQUIRED", `Tool call ${input.callId} requires its bound approval to execute.`);
    }
    const authorized = await deps.approvals.authorize({
      approvalId: input.approvalId,
      sessionId: call.sessionId,
      callId: call.callId,
      argsHash: call.argsHash,
      actorId: input.actorId,
      now,
    });
    if (!authorized.allowed) {
      const denied: RealtimeToolCall = { ...call, status: "denied", decisionCode: authorized.code, decidedAt: now };
      await deps.tools.updateToolCall(denied);
      return { ok: false, status: "denied", code: authorized.code, reason: "Approval authorization failed.", call: denied };
    }
  } else if (input.approvalId) {
    throw realtimeError("BAD_REQUEST", "Approval id was supplied for a tool that requires no approval.");
  }

  const executor = deps.executor ?? REALTIME_NOT_WIRED_EXECUTOR;
  const outcome = await executor({
    sessionId: call.sessionId,
    callId: call.callId,
    task: call.task,
    toolName: call.toolName,
    args: call.args,
  });
  const finished: RealtimeToolCall = {
    ...call,
    status: outcome.ok ? "completed" : "failed",
    decisionCode: outcome.ok ? "COMPLETED" : "EXECUTION_FAILED",
    resultRedacted: outcome.ok ? redactResult(outcome.result) : null,
    decidedAt: now,
  };
  await deps.tools.updateToolCall(finished);
  if (!outcome.ok) {
    return { ok: false, status: "denied", code: "EXECUTION_FAILED", reason: outcome.error ?? "Tool execution failed.", call: finished };
  }
  return { ok: true, status: "completed", call: finished };
}

/** Deny a pending tool approval (human decision). */
export async function denyRealtimeToolCall(
  deps: RealtimeToolDeps,
  input: { callId: string; actorId: string; reason: string; now?: string },
): Promise<RealtimeToolCall> {
  const now = input.now ?? new Date().toISOString();
  const call = await deps.tools.getToolCall(input.callId);
  if (!call) throw realtimeError("NOT_FOUND", `Tool call ${input.callId} was not found.`);
  if (call.status !== "awaiting_approval") {
    throw realtimeError("CONFLICT", `Tool call ${input.callId} is ${call.status}; only pending calls can be denied.`);
  }
  if (call.approvalId) await deps.approvals.deny(call.approvalId, input.actorId, input.reason);
  const denied: RealtimeToolCall = { ...call, status: "denied", decisionCode: "DENIED_BY_APPROVER", decidedAt: now };
  await deps.tools.updateToolCall(denied);
  return denied;
}

function redactResult(result: unknown): unknown {
  if (typeof result === "string" && result.length > 2000) return `${result.slice(0, 2000)}…[truncated]`;
  return result ?? null;
}

/** In-memory approval port: payload-bound, expiring, one-time claim. */
export class MemoryRealtimeApprovalPort implements RealtimeApprovalPort {
  private readonly approvals = new Map<
    string,
    { approvalId: string; sessionId: string; callId: string; toolScopeId: string; argsHash: string; actorId: string; expiresAt: string; claimed: boolean; denied: boolean }
  >();

  async request(input: {
    sessionId: string;
    callId: string;
    toolScopeId: string;
    argsHash: string;
    actorId: string;
    expiresAt: string;
  }): Promise<{ approvalId: string; expiresAt: string }> {
    const approvalId = randomUUID();
    this.approvals.set(approvalId, { approvalId, ...input, claimed: false, denied: false });
    return { approvalId, expiresAt: input.expiresAt };
  }

  async authorize(input: {
    approvalId: string;
    sessionId: string;
    callId: string;
    argsHash: string;
    actorId: string;
    now: string;
  }): Promise<{ allowed: boolean; code: string }> {
    const approval = this.approvals.get(input.approvalId);
    if (!approval) return { allowed: false, code: "APPROVAL_UNKNOWN" };
    if (approval.denied) return { allowed: false, code: "APPROVAL_DENIED" };
    if (approval.claimed) return { allowed: false, code: "APPROVAL_REPLAY" };
    if (approval.sessionId !== input.sessionId || approval.callId !== input.callId || approval.argsHash !== input.argsHash) {
      return { allowed: false, code: "APPROVAL_BINDING_MISMATCH" };
    }
    if (Date.parse(input.now) > Date.parse(approval.expiresAt)) return { allowed: false, code: "APPROVAL_EXPIRED" };
    approval.claimed = true;
    return { allowed: true, code: "AUTHORIZED" };
  }

  async deny(approvalId: string, actorId: string, reason: string): Promise<void> {
    void actorId;
    void reason;
    const approval = this.approvals.get(approvalId);
    if (approval) approval.denied = true;
  }
}

export function createMemoryRealtimeApprovalPort(): MemoryRealtimeApprovalPort {
  return new MemoryRealtimeApprovalPort();
}

export type { PolicyPort };

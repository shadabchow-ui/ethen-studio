// Slice D — Bot/Cortex → canonical platform convergence adapter.
//
// Thin, pure, side-effect-free bindings from the Bot product boundary onto
// the canonical authorities. This module creates NO competing authority:
// no run/job/tenant/credential/context store, no scheduler, no approval
// engine, no outcome plane. Every function is a validated correlation or a
// classification; all durable writes stay behind the canonical services
// (P09 UniversalRunService, P08 admission, P10 evidence, P11 context sets,
// P12 tool authority, P30–P32 outcome plane, P09 jobs service).
//
// Canonical path:
// conversation → task → P08/P13 admission → P09 Run/Attempt/Job → P12
// tool/capability → provider/tool execution → P10 evidence/receipt → P30
// Outcome → P31 Judgment → P32 Experience → artifact/history/notification

import type { CreateJobInput } from "../index";
import type { OutcomeScope } from "../platform/outcome/types";
import type { OutcomeResultState } from "../platform/outcome/types";
import type {
  EthenRouteReceipt,
  ToolClass,
} from "./types";

export type BotBindingErrorCode = "INVALID_INPUT" | "NOT_BOUND";

export class BotBindingError extends Error {
  readonly code: BotBindingErrorCode;
  constructor(code: BotBindingErrorCode, message: string) {
    super(message);
    this.name = "BotBindingError";
    this.code = code;
  }
}

function requireText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BotBindingError("INVALID_INPUT", `${field} is required.`);
  }
  return value;
}

// ── Bot → P09 binding ──────────────────────────────────────────────────────

/**
 * Validated correlation between a Bot conversation/task turn and the
 * canonical P09 execution it runs under. Correlation only: the P09 run and
 * attempt rows are created by the canonical run service (never here), and
 * the receipt-level Bot runId is never presented as a canonical run id.
 */
export interface BotCanonicalLinkage {
  /** Bot-side conversation identity (session/conversation id). */
  conversationId: string;
  /** Bot-side task identity within the conversation. */
  taskId: string;
  /** Canonical P09 run id this turn is admitted under. */
  canonicalRunId: string;
  /** Canonical P09 attempt id (initial/retry/continuation). */
  canonicalAttemptId: string | null;
  /** Receipt-level Bot run id (EthenRouteReceipt.runId) for attribution. */
  receiptRunId: string;
  /** Receipt-level request id (EthenRouteReceipt.requestId). */
  requestId: string;
}

export function buildBotRunLinkage(input: {
  conversationId?: string | null;
  taskId?: string | null;
  canonicalRunId?: string | null;
  canonicalAttemptId?: string | null;
  receiptRunId?: string | null;
  requestId?: string | null;
}): BotCanonicalLinkage {
  return {
    conversationId: requireText(input.conversationId ?? "", "conversationId"),
    taskId: requireText(input.taskId ?? "", "taskId"),
    canonicalRunId: requireText(input.canonicalRunId ?? "", "canonicalRunId"),
    canonicalAttemptId:
      input.canonicalAttemptId && input.canonicalAttemptId.trim() !== ""
        ? input.canonicalAttemptId
        : null,
    receiptRunId: requireText(input.receiptRunId ?? "", "receiptRunId"),
    requestId: requireText(input.requestId ?? "", "requestId"),
  };
}

/** Stable idempotency key for the Bot turn's canonical outcome record. */
export function botOutcomeIdempotencyKey(linkage: BotCanonicalLinkage): string {
  return `bot_${linkage.canonicalRunId}_${linkage.requestId}`;
}

// ── P08/P13: consequential-action classification ───────────────────────────

/**
 * Read-only tool classes: the ONLY classes a Bot turn may invoke without
 * P08/P13 admission. Fail-closed: every class not listed here is
 * consequential. Pinned exhaustively (see convergence test).
 */
export const BOT_READ_TOOL_CLASSES: ReadonlySet<ToolClass> = new Set([
  "search",
  "retrieval",
]);

export type BotActionClass = "read" | "consequential";

export function classifyBotToolAction(toolClass: ToolClass): BotActionClass {
  return BOT_READ_TOOL_CLASSES.has(toolClass) ? "read" : "consequential";
}

/** True when ANY invoked tool class needs P08/P13 admission. */
export function botTurnNeedsAdmission(toolClasses: readonly ToolClass[]): boolean {
  return toolClasses.some((toolClass) => classifyBotToolAction(toolClass) === "consequential");
}

// ── Connector writes ───────────────────────────────────────────────────────

/**
 * Connector operations: reads may use approved connectors; consequential
 * writes ALWAYS require canonical approval/governance. There is no
 * unrestricted connector-write path.
 */
export function connectorWriteRequiresApproval(operation: {
  kind: "read" | "write";
}): boolean {
  if (operation.kind !== "read" && operation.kind !== "write") {
    throw new BotBindingError("INVALID_INPUT", "operation.kind must be read or write.");
  }
  return operation.kind === "write";
}

// ── P11: cross-product context boundary ────────────────────────────────────

export interface BotContextAccessRequest {
  /** Product scope the Bot turn is operating in (e.g. "bot"). */
  activeScope: string;
  /** Foreign product scope requesting a read (e.g. "founder"). */
  requestedScope: string;
  /** Explicitly granted foreign scopes for this turn, if any. */
  grantedScopes?: readonly string[] | null;
}

/**
 * Default-deny cross-product reads. Same-scope access is allowed without
 * audit; an explicitly granted foreign scope is allowed WITH a mandatory
 * audit event (the canonical `context.cross_product_read` run event);
 * anything else is denied. Never throws: denial is a value, not an
 * exception, so callers cannot mistake a crash for an allow.
 */
export function assertBotContextAllowed(request: BotContextAccessRequest): {
  allowed: boolean;
  auditEvent: "context.cross_product_read" | null;
} {
  const active = (request.activeScope ?? "").trim();
  const foreign = (request.requestedScope ?? "").trim();
  if (!active || !foreign) {
    return { allowed: false, auditEvent: null };
  }
  if (foreign === active) {
    return { allowed: true, auditEvent: null };
  }
  const granted = request.grantedScopes ?? [];
  if (granted.includes(foreign)) {
    return { allowed: true, auditEvent: "context.cross_product_read" };
  }
  return { allowed: false, auditEvent: null };
}

// ── P10: receipt/evidence linkage ──────────────────────────────────────────

export interface BotEvidenceRef {
  canonicalRunId: string;
  receiptRunId: string;
  requestId: string;
  routeProfile: string;
  routeClass: string;
  providerId: string;
  modelId: string | null;
  verifierStatus: string | null;
}

/** Evidence-link shape for a meaningful Bot execution (P10-bound). */
export function buildBotEvidenceRef(
  linkage: BotCanonicalLinkage,
  receipt: EthenRouteReceipt,
): BotEvidenceRef {
  return {
    canonicalRunId: linkage.canonicalRunId,
    receiptRunId: receipt.runId,
    requestId: receipt.requestId,
    routeProfile: receipt.routeProfile,
    routeClass: receipt.routeClass,
    providerId: receipt.provider.selectedProvider,
    modelId: receipt.provider.selectedModel ?? null,
    verifierStatus: receipt.verifier.status ?? null,
  };
}

// ── Cortex routing attribution ─────────────────────────────────────────────

export interface BotRoutingAttribution {
  canonicalRunId: string;
  receiptRunId: string;
  requestId: string;
  providerId: string;
  modelId: string | null;
  routeProfile: string;
  reasonCodes: readonly string[];
}

/**
 * Provider/model/Cortex routing decisions attributed to the canonical
 * run/evidence identity. Attribution only — routing policy itself is
 * unchanged (model-router remains the routing authority).
 */
export function attributeRoutingDecision(
  linkage: BotCanonicalLinkage,
  receipt: EthenRouteReceipt,
): BotRoutingAttribution {
  return {
    canonicalRunId: linkage.canonicalRunId,
    receiptRunId: receipt.runId,
    requestId: receipt.requestId,
    providerId: receipt.provider.selectedProvider,
    modelId: receipt.provider.selectedModel ?? null,
    routeProfile: receipt.routeProfile,
    reasonCodes: [...receipt.selection.reasonCodes],
  };
}

// ── P30/P31/P32: post-execution semantics ──────────────────────────────────

export type BotExecutionStatus = "completed" | "degraded" | "failed";

const BOT_STATUS_TO_RESULT_STATE: Record<BotExecutionStatus, OutcomeResultState> = {
  completed: "succeeded",
  degraded: "partial",
  failed: "failed",
};

export interface BotOutcomeInput {
  scope: OutcomeScope;
  sourceRunId: string;
  sourceAttemptId: string | null;
  sourceTaskId: string;
  resultState: OutcomeResultState;
  executionSuccess: boolean | null;
  receiptRefId: string;
  idempotencyKey: string;
}

/**
 * Canonical post-execution semantics for a Bot turn: produces the exact
 * input shape for OutcomeService.recordOutcome with the canonical P09 run
 * as source. Judgment (P31) and Experience (P32) derive downstream from
 * this outcome — never synthesized here.
 */
export function buildBotOutcomeInput(input: {
  scope: OutcomeScope;
  linkage: BotCanonicalLinkage;
  status: BotExecutionStatus;
}): BotOutcomeInput {
  if (!input.scope || !input.linkage) {
    throw new BotBindingError("INVALID_INPUT", "scope and linkage are required.");
  }
  if (!(input.status in BOT_STATUS_TO_RESULT_STATE)) {
    throw new BotBindingError("INVALID_INPUT", "status must be completed, degraded, or failed.");
  }
  return {
    scope: input.scope,
    sourceRunId: input.linkage.canonicalRunId,
    sourceAttemptId: input.linkage.canonicalAttemptId,
    sourceTaskId: input.linkage.taskId,
    resultState: BOT_STATUS_TO_RESULT_STATE[input.status],
    executionSuccess: input.status === "failed" ? false : true,
    receiptRefId: input.linkage.receiptRunId,
    idempotencyKey: botOutcomeIdempotencyKey(input.linkage),
  };
}

// ── Durable background work: canonical jobs seam ───────────────────────────

export interface BotScheduleInput {
  organizationId: string;
  projectId: string;
  linkage: BotCanonicalLinkage;
  scheduledAt?: string | null;
  maxAttempts?: number | null;
}

/**
 * Bot background work and schedules target the canonical P09 jobs seam
 * (durable row + reconciler + fencing), never an isolated Bot scheduler:
 * this module contains no timers, no queues, and no worker loop. The queue
 * itself is assigned by the canonical job service (DEFAULT_QUEUE_NAME);
 * the payload carries the Bot↔canonical correlation for restart-safe
 * recovery and notification/history derivation from durable state.
 */
export function buildBotScheduleInput(input: BotScheduleInput): CreateJobInput {
  const organizationId = requireText(input.organizationId ?? "", "organizationId");
  const projectId = requireText(input.projectId ?? "", "projectId");
  if (!input.linkage) {
    throw new BotBindingError("INVALID_INPUT", "linkage is required.");
  }
  return {
    organizationId,
    projectId,
    payload: Object.freeze({
      bot: Object.freeze({
        conversationId: input.linkage.conversationId,
        taskId: input.linkage.taskId,
        canonicalRunId: input.linkage.canonicalRunId,
        receiptRunId: input.linkage.receiptRunId,
        requestId: input.linkage.requestId,
      }),
    }),
    idempotencyKey: `bot_schedule_${input.linkage.canonicalRunId}_${input.linkage.taskId}`,
    ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    ...(input.maxAttempts != null ? { maxAttempts: input.maxAttempts } : {}),
  };
}

import "server-only";
import { createHash } from "node:crypto";

/**
 * P08 — Canonical ActionIntent Contract
 *
 * A proposed consequential action before it is admitted and executed.
 * Governed by the P07 canonical tenant and polymorphic actor model.
 * Invariant: ONE EXECUTION = ONE EFFECTIVE TENANT SCOPE.
 */

export const ACTION_INTENT_STATUSES = [
  "proposed",
  "admitted",
  "ready",
  "dispatched",
  "succeeded",
  "failed",
  "indeterminate",
  "cancelled",
  "reconciled_success",
  "reconciled_failure",
  "compensated",
] as const;

export type ActionIntentStatus = (typeof ACTION_INTENT_STATUSES)[number];

export const ACTION_INTENT_STATUS_TRANSITIONS: Record<
  ActionIntentStatus,
  readonly ActionIntentStatus[]
> = {
  proposed: ["admitted", "cancelled"],
  admitted: ["ready", "dispatched", "cancelled"],
  ready: ["dispatched", "cancelled"],
  dispatched: ["succeeded", "failed", "indeterminate", "cancelled"],
  succeeded: ["compensated"],
  failed: ["compensated"],
  indeterminate: ["reconciled_success", "reconciled_failure", "failed", "compensated"],
  reconciled_success: ["compensated"],
  reconciled_failure: ["compensated"],
  cancelled: [],
  compensated: [],
};

export type SideEffectClass =
  | "READ_ONLY"
  | "IDEMPOTENT_WRITE"
  | "NON_IDEMPOTENT_WRITE"
  | "TRANSACTIONAL"
  | "PHYSICAL"
  | "COMMUNICATION";

export type ReversibilityClass =
  | "REVERSIBLE"
  | "PARTIALLY_REVERSIBLE"
  | "IRREVERSIBLE"
  | "COMPENSATABLE"
  | "UNKNOWN";

export interface ActionIntent {
  id: string;
  tenantId: string;
  actorId: string;
  capabilityId: string;
  actionCode: string;
  actionDigest: string;
  canonicalParameters: Record<string, unknown>;
  status: ActionIntentStatus;
  sideEffectClass: SideEffectClass;
  reversibility: ReversibilityClass;
  resourceId?: string | null;
  approvalId?: string | null;
  environment?: string;
  dispatchedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isValidActionIntentTransition(
  from: ActionIntentStatus,
  to: ActionIntentStatus,
): boolean {
  const allowed = ACTION_INTENT_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function transitionActionIntent(
  intent: ActionIntent,
  nextStatus: ActionIntentStatus,
): ActionIntent {
  if (!isValidActionIntentTransition(intent.status, nextStatus)) {
    throw new Error(
      `Invalid ActionIntent transition from '${intent.status}' to '${nextStatus}' for intent ${intent.id}`,
    );
  }

  return {
    ...intent,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
    dispatchedAt:
      nextStatus === "dispatched"
        ? new Date().toISOString()
        : intent.dispatchedAt,
    completedAt:
      ["succeeded", "failed", "cancelled", "reconciled_success", "reconciled_failure", "compensated"].includes(
        nextStatus,
      )
        ? new Date().toISOString()
        : intent.completedAt,
  };
}

function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function normalizeParameters(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v !== undefined) out[k] = v as unknown;
  }
  return out;
}

export interface DigestInput {
  capabilityId?: string | null;
  actionCode: string;
  tenantId: string;
  actorId: string;
  canonicalParameters: Record<string, unknown>;
  resourceId?: string | null;
  environment?: string;
}

export function computeActionDigest(input: DigestInput): string {
  const payload = {
    capabilityId: input.capabilityId ?? null,
    actionCode: input.actionCode,
    tenantId: input.tenantId,
    actorId: input.actorId,
    canonicalParameters: normalizeParameters(input.canonicalParameters),
    resourceId: input.resourceId ?? null,
    environment: input.environment ?? "production",
  };
  const canonical = canonicalStringify(payload);
  const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hash}`;
}

export function verifyActionDigest(intent: ActionIntent): boolean {
  const expected = computeActionDigest({
    capabilityId: intent.capabilityId,
    actionCode: intent.actionCode,
    tenantId: intent.tenantId,
    actorId: intent.actorId,
    canonicalParameters: intent.canonicalParameters,
    resourceId: intent.resourceId,
    environment: intent.environment,
  });
  return expected === intent.actionDigest;
}

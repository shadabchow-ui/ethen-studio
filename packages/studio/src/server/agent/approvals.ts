/**
 * Studio V5 Creative Agent — approval envelopes (STUDIO_17).
 * Recovered from Director frozen envelopes: an approval pins the exact
 * world it covers (plan, patch, quote, cost, pins, policy decision,
 * tier). Any plan/pin/cost change invalidates stale approval. Grants are
 * human-only; resume re-checks freshness at dispatch.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import type { IcuAmount } from "../../contracts/money";
import type { ProjectScope } from "../../contracts/scope";
import type { VersionPins } from "../../contracts/versions";
import { agentError, type ApprovalEnvelope, type ExecutionTier } from "./types";

export const APPROVAL_TTL_MS = 30 * 60 * 1000;

export interface RequestApprovalInput {
  runId: string;
  scope: ProjectScope;
  planRevision: number;
  planHash: string;
  patchHash: string | null;
  quoteId: string | null;
  estimatedIcu: IcuAmount;
  capIcu: IcuAmount;
  pins: VersionPins;
  policyDecisionId: string | null;
  tier: ExecutionTier;
  kind: "execute" | "publish";
  requestedBy: string;
  now: string;
  ttlMs?: number;
}

export function requestApproval(input: RequestApprovalInput): ApprovalEnvelope {
  if (input.estimatedIcu > input.capIcu) {
    throw agentError("APPROVAL_REQUIRED", "Estimate exceeds the cap; a higher cap needs a new approval request.");
  }
  const at = Date.parse(input.now);
  if (!Number.isFinite(at)) throw agentError("BAD_REQUEST", "Approval request needs a valid timestamp.");
  return {
    approvalId: randomUUID(),
    runId: input.runId,
    scope: input.scope,
    planRevision: input.planRevision,
    planHash: input.planHash,
    patchHash: input.patchHash,
    quoteId: input.quoteId,
    estimatedIcu: input.estimatedIcu,
    capIcu: input.capIcu,
    pins: { ...input.pins },
    policyDecisionId: input.policyDecisionId,
    tier: input.tier,
    kind: input.kind,
    state: "requested",
    requestedBy: input.requestedBy,
    requestedAt: input.now,
    grantedBy: null,
    grantedAt: null,
    expiresAt: new Date(at + (input.ttlMs ?? APPROVAL_TTL_MS)).toISOString(),
    staleReason: null,
  };
}

export interface FreshnessWorld {
  planHash: string;
  patchHash: string | null;
  quoteId: string | null;
  estimatedIcu: IcuAmount;
  pins: VersionPins;
}

/**
 * Compare the live world against the pinned envelope. Returns the stale
 * reason, or null when the envelope still covers the world.
 */
export function staleReasonFor(envelope: ApprovalEnvelope, world: FreshnessWorld): string | null {
  if (envelope.planHash !== world.planHash) return "plan changed since approval";
  if (envelope.patchHash !== world.patchHash) return "Canvas patch changed since approval";
  if (envelope.quoteId !== world.quoteId) return "quote changed since approval";
  if (envelope.estimatedIcu !== world.estimatedIcu) return "cost estimate changed since approval";
  const pins: (keyof VersionPins)[] = ["taskSchemaVersion", "endpointSchemaVersion", "priceVersion", "adapterVersion"];
  for (const pin of pins) {
    if (envelope.pins[pin] !== world.pins[pin]) return `pinned ${pin} changed since approval`;
  }
  return null;
}

/** Mark an envelope invalidated with its stale reason. Pure. */
export function invalidateApproval(envelope: ApprovalEnvelope, reason: string): ApprovalEnvelope {
  if (envelope.state === "granted" || envelope.state === "requested") {
    return { ...envelope, state: "invalidated", staleReason: reason };
  }
  return envelope;
}

/** Grant must be human, live, requested and fresh. Pure. */
export function grantApproval(
  envelope: ApprovalEnvelope,
  world: FreshnessWorld,
  grantedBy: string,
  isHuman: boolean,
  now: string,
): ApprovalEnvelope {
  if (!isHuman) {
    throw agentError("FORBIDDEN", "Only a human can grant an agent approval.");
  }
  if (envelope.state !== "requested") {
    throw agentError("CONFLICT", `Approval is ${envelope.state}; only a requested approval can be granted.`);
  }
  if (envelope.expiresAt <= now) {
    return { ...envelope, state: "expired", staleReason: "approval expired before grant" };
  }
  const stale = staleReasonFor(envelope, world);
  if (stale) {
    return { ...envelope, state: "invalidated", staleReason: stale };
  }
  return { ...envelope, state: "granted", grantedBy, grantedAt: now, staleReason: null };
}

export function denyApproval(envelope: ApprovalEnvelope, deniedBy: string, isHuman: boolean): ApprovalEnvelope {
  if (!isHuman) throw agentError("FORBIDDEN", "Only a human can deny an agent approval.");
  if (envelope.state !== "requested") {
    throw agentError("CONFLICT", `Approval is ${envelope.state}; only a requested approval can be denied.`);
  }
  return { ...envelope, state: "denied", grantedBy: deniedBy, staleReason: null };
}

/**
 * Dispatch gate: a granted envelope is usable only while fresh and live.
 * Resume-after-waiting-approval funnels through here.
 */
export function assertApprovalUsable(envelope: ApprovalEnvelope, world: FreshnessWorld, now: string): void {
  if (envelope.state !== "granted") {
    throw agentError("APPROVAL_REQUIRED", `Approval is ${envelope.state ?? "missing"}; execution is not authorized.`, {
      approvalId: envelope.approvalId,
      state: envelope.state,
    });
  }
  if (envelope.expiresAt <= now) {
    throw agentError("APPROVAL_REQUIRED", "Approval expired; request a fresh approval.", {
      approvalId: envelope.approvalId,
    });
  }
  const stale = staleReasonFor(envelope, world);
  if (stale) {
    throw agentError("STALE_REVISION", `Approval is stale: ${stale}.`, { approvalId: envelope.approvalId, stale });
  }
}

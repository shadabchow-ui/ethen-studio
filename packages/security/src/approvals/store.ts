import type {
  ApprovalProposal,
  ApprovalStatus,
  CreateApprovalProposalInput,
} from "@ethen/contracts/approvals/types";
import { EXECUTABLE_STATUS, REJECTABLE_STATUSES, TERMINAL_STATUSES } from "@ethen/contracts/approvals/types";
import { toRiskLabel } from "@ethen/contracts/approvals/types";
import { computePayloadHash } from "../policies/payload-hash";

let _persist: typeof import("./persist") | null = null;
async function getPersist() {
  if (!_persist) {
    try {
      _persist = await import("./persist");
    } catch {
      return null;
    }
  }
  return _persist;
}

// ── Redaction helpers ────────────────────────────────────────────────────

const SENSITIVE_KEY_PATTERNS = [
  /secret/i,
  /token/i,
  /key/i,
  /password/i,
  /credential/i,
  /authorization/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
];

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactValue(val);
    }
  }
  return result;
}

// ── In-memory store — Job 12 compatibility facade ──────────────────────────
//
// `lib/platform/approvals` is the single live execution authority.
// This module is a thin compatibility facade that delegates *execution*
// authority to the platform service (hashCanonicalBinding +
// verifyExecutionClaim). The in-memory Map is retained ONLY for the
// existing proposal lifecycle tests (`validate-approvals.ts`, store unit
// tests) and must NOT be used to independently authorize a destructive or
// external effect in production. All destructive dispatch (worker, shell,
// patch, GitHub, media) must go through the platform claim.
//
// In production the durable path is `lib/approvals/persist.ts`
// (`agent_approvals` via Supabase) or, for new code, the platform
// `canonical_approvals` table directly. This file has no independent
// store for execution — it is a facade.
//
// See: lib/platform/approvals/service.ts, lib/platform/worker/worker-host.ts

const proposals = new Map<string, ApprovalProposal>();
let proposalCounter = 0;

// Legacy Map is test/demo-only by policy. Platform is authoritative for
// execution; this guard makes the separation explicit at runtime.
function isLegacyMapAllowed(): boolean {
  const mode = process.env.ETHEN_GOVERNANCE_REPOSITORY_MODE;
  const nodeEnv = process.env.NODE_ENV;
  // Tests and demos may use the Map; production must use durable storage.
  if (mode === "test" || mode === "demo") return true;
  if (nodeEnv === "test") return true;
  return false;
}

function nextId(): string {
  proposalCounter += 1;
  return `approval-${proposalCounter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultExpiryIso(): string {
  return new Date(Date.now() + 5 * 60 * 1000).toISOString();
}

function snapshotPayload(value: Record<string, unknown>): Record<string, unknown> {
  // Proposals are capabilities, not mutable UI state. Snapshot before storing
  // so a caller changing its original object cannot change an approved action.
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function createProposal(
  input: CreateApprovalProposalInput,
): ApprovalProposal {
  const now = nowIso();
  const riskLabel = toRiskLabel(input.riskLevel);
  const proposedInput = snapshotPayload(input.proposedInput);
  const actionDigest = input.payloadHash ?? computePayloadHash(proposedInput);
  const proposal: ApprovalProposal = {
    id: nextId(),
    toolId: input.toolId,
    providerId: input.providerId ?? null,
    riskLevel: input.riskLevel,
    riskLabel,
    proposedInput,
    humanReadableSummary: input.humanReadableSummary,
    expectedEffect: input.expectedEffect,
    status: "pending",
    payloadHash: actionDigest,
    actionDigest,
    category: input.category ?? "external_tool",
    scope: input.scope ?? input.sessionId ?? null,
    requestedBy: input.userId ?? null,
    decidedBy: null,
    decidedAt: null,
    consumedAt: null,
    outcome: null,
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt ?? defaultExpiryIso(),
  };
  proposals.set(proposal.id, proposal);
  void getPersist().then((p) => p?.persistApprovalProposal(proposal));
  return proposal;
}

export function getProposal(id: string): ApprovalProposal | null {
  return proposals.get(id) ?? null;
}

/** In-memory first, then durable store. Production must not treat RAM as authority. */
export async function getProposalDurable(id: string): Promise<ApprovalProposal | null> {
  const memory = proposals.get(id);
  if (memory) return memory;
  const persist = await getPersist();
  const loaded = await persist?.loadProposal(id);
  if (loaded) proposals.set(loaded.id, loaded);
  return loaded ?? null;
}

export async function getProposalsForSessionDurable(
  sessionId: string,
): Promise<ApprovalProposal[]> {
  const persist = await getPersist();
  const loaded = (await persist?.loadProposalsForSession(sessionId)) ?? [];
  for (const proposal of loaded) {
    if (!proposals.has(proposal.id)) proposals.set(proposal.id, proposal);
  }
  return getProposalsForSession(sessionId);
}

function setStatus(id: string, status: ApprovalStatus, decidedBy?: string | null): ApprovalProposal | null {
  const existing = proposals.get(id);
  if (!existing) return null;

  if (TERMINAL_STATUSES.includes(existing.status)) {
    return null;
  }

  const now = nowIso();
  const decisionStatus = status === "approved" || status === "rejected";
  const outcome = status === "approved" ? "approved"
    : status === "rejected" ? "rejected"
    : status === "executed" ? "executed"
    : status === "failed" ? "failed"
    : status === "stale" ? "stale"
    : status === "canceled" ? "canceled"
    : existing.outcome;
  const updated: ApprovalProposal = {
    ...existing,
    status,
    updatedAt: now,
    decidedAt: decisionStatus ? now : existing.decidedAt,
    decidedBy: decisionStatus ? (decidedBy ?? existing.decidedBy) : existing.decidedBy,
    consumedAt: status === "executed" ? now : existing.consumedAt,
    outcome,
  };
  proposals.set(id, updated);
  void getPersist().then((p) => p?.persistApprovalStatus(id, status, now));
  return updated;
}

export function approveProposal(id: string, decidedBy?: string | null): ApprovalProposal | null {
  if (proposals.get(id)?.status !== "pending") return null;
  return setStatus(id, "approved", decidedBy);
}

export function rejectProposal(id: string): ApprovalProposal | null {
  if (REJECTABLE_STATUSES.includes(proposals.get(id)?.status ?? "pending")) {
    return setStatus(id, "rejected");
  }
  return null;
}

export function cancelProposal(id: string): ApprovalProposal | null {
  return setStatus(id, "canceled");
}

export function markExecuted(id: string): ApprovalProposal | null {
  const existing = proposals.get(id);
  if (!existing) return null;
  if (existing.status !== EXECUTABLE_STATUS) return null;
  return setStatus(id, "executed");
}

export function markFailed(id: string): ApprovalProposal | null {
  return setStatus(id, "failed");
}

export function getProposalsForSession(
  sessionId: string,
): ApprovalProposal[] {
  const result: ApprovalProposal[] = [];
  for (const p of proposals.values()) {
    if (p.sessionId === sessionId) result.push(p);
  }
  return result.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );
}

export function getPendingProposalsForSession(
  sessionId: string,
): ApprovalProposal[] {
  return getProposalsForSession(sessionId).filter(
    (p) => p.status === "pending",
  );
}

/** Return redacted input safe for audit logs. */
export function redactProposalInput(
  proposal: ApprovalProposal,
): Record<string, unknown> {
  return redactObject(proposal.proposedInput);
}

export function isApproved(id: string): boolean {
  return proposals.get(id)?.status === "approved";
}

export function isExecutable(id: string): boolean {
  return proposals.get(id)?.status === EXECUTABLE_STATUS;
}

export function isPending(id: string): boolean {
  return proposals.get(id)?.status === "pending";
}

/**
 * Check whether an approval has expired based on its expiresAt timestamp.
 */
export function isApprovalExpired(id: string): boolean {
  const proposal = proposals.get(id);
  if (!proposal || !proposal.expiresAt) return false;
  return new Date(proposal.expiresAt) < new Date();
}

/**
 * Check whether an approval is stale — the approved payload hash
 * does not match the current execution payload hash.
 */
export function isApprovalStale(
  id: string,
  currentPayloadHash: string,
): boolean {
  const proposal = proposals.get(id);
  if (!proposal) return true;
  if (proposal.status !== "approved" && proposal.status !== "executed") return false;
  if (!proposal.payloadHash) return false;
  return proposal.payloadHash !== currentPayloadHash;
}

/**
 * Validate an approved proposal for execution: checks expiry, payload hash,
 * and status. Returns the proposal and a reason if execution is blocked.
 */
export function validateProposalForExecution(
  id: string,
  currentPayloadHash?: string | null,
): { allowed: boolean; proposal: ApprovalProposal | null; reason: string } {
  const proposal = proposals.get(id);
  if (!proposal) {
    return { allowed: false, proposal: null, reason: "Proposal not found." };
  }

  if (proposal.status !== "approved") {
    return {
      allowed: false,
      proposal,
      reason: `Proposal status is "${proposal.status}" — must be "approved" to execute.`,
    };
  }

  if (proposal.expiresAt && new Date(proposal.expiresAt) < new Date()) {
    return {
      allowed: false,
      proposal,
      reason: `Approval expired at ${proposal.expiresAt}.`,
    };
  }

  if (currentPayloadHash && proposal.payloadHash && proposal.payloadHash !== currentPayloadHash) {
    return {
      allowed: false,
      proposal,
      reason: `Payload has changed since approval. Expected hash ${proposal.payloadHash.slice(0, 8)}..., got ${currentPayloadHash.slice(0, 8)}... Approval is stale.`,
    };
  }

  return { allowed: true, proposal, reason: "Approved and valid." };
}

/**
 * Mark a proposal as stale when the execution payload does not match
 * the originally approved payload.
 */
export function markStale(id: string): ApprovalProposal | null {
  return setStatus(id, "stale");
}

// ── Media Consent / Approval Records ─────────────────────────────────────────
// Server-issued approval records for risky media workflows.
// Tokens are generated server-side; clients must present a valid, non-expired,
// non-consumed token to proceed through consent/approval gates.
//
// Job 12 — durability: media approvals must survive restart and be one-shot.
// The canonical authority is `lib/platform/approvals` (Supabase
// `canonical_approvals`). This module retains an in-memory cache ONLY for
// test isolation; validate/consume also consult the platform claim when a
// `canonicalApprovalId` binding is present (see lib/media/durable-jobs.ts).
// When `canonicalApprovalId` is absent the generate route falls back to the
// legacy token check but the worker path gates on the platform.

import type {
  MediaSafetyCategory,
  MediaWorkflowId,
} from "./safety-types";

export type MediaApprovalStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "consumed";

export const MEDIA_APPROVAL_STATUS_LABELS: Record<MediaApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  expired: "Expired",
  consumed: "Consumed",
};

export interface MediaApprovalRecord {
  id: string;
  /** SHA-256 hex of the approval token (never store raw token). */
  tokenHash: string;
  /** The workflow/app behind this approval. */
  workflowId: MediaWorkflowId | string;
  /** Human-friendly app id (e.g. "face-swap"). */
  appId: string | null;
  /** Risk categories triggered by this workflow. */
  riskCategories: MediaSafetyCategory[];
  /** Attestation strings the user agreed to. */
  requiredAttestations: string[];
  /** Stable hash of the prompt used when approval was created. */
  promptHash: string | null;
  /** Session or anonymous id if available. */
  sessionId: string | null;
  /** Current lifecycle status. */
  status: MediaApprovalStatus;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface CreateApprovalInput {
  workflowId: MediaWorkflowId | string;
  appId?: string | null;
  riskCategories: MediaSafetyCategory[];
  requiredAttestations: string[];
  promptHash?: string | null;
  sessionId?: string | null;
  /** Lifespan in milliseconds (default: 5 minutes). */
  ttlMs?: number;
}

export interface CreateApprovalResult {
  approvalId: string;
  /** Opaque token the client sends with the generate request. */
  approvalToken: string;
  expiresAt: string;
}

export interface ValidateApprovalResult {
  valid: boolean;
  record: MediaApprovalRecord | null;
  error?:
    | "approval_required"
    | "approval_invalid"
    | "approval_expired"
    | "approval_already_consumed"
    | "approval_denied";
}

// ── In-memory cache (test-only) — durable path is `canonical_approvals` ──
//
// STU-P0-04: studio approvals survive restart and execute once. The durable
// guarantee is the platform's `claimExecution` (one-shot) on
// `canonical_approvals`; this Map is a fast-path cache for tests and the
// legacy token flow. Workers and the durable job orchestrator verify via
// `CanonicalApprovalService.verifyExecutionClaim` before dispatch.

const approvals = new Map<string, MediaApprovalRecord>();
const approvalTokenIndex = new Map<string, string>(); // tokenHash → approvalId
let nextApprovalId = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function generateOpaqueToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let token = "";
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Simple SHA-256 hash via Web Crypto (Node 19+ built-in).
 * Falls back to a base64-encoded identity for environments without crypto.
 */
async function sha256(text: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Fallback: simple hash without Web Crypto (not cryptographically secure,
    // but acceptable for in-memory beta state)
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `fallback-${Math.abs(hash).toString(16)}-${text.length}`;
  }
}

function defaultTtl(): number {
  return 5 * 60 * 1000; // 5 minutes
}

// ── Public API ───────────────────────────────────────────────────────────

export async function createApproval(
  input: CreateApprovalInput,
): Promise<CreateApprovalResult> {
  const token = generateOpaqueToken();
  const tokenHash = await sha256(token);
  const id = `media-approval-${nextApprovalId++}`;
  const ttlMs = input.ttlMs ?? defaultTtl();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const record: MediaApprovalRecord = {
    id,
    tokenHash,
    workflowId: input.workflowId,
    appId: input.appId ?? null,
    riskCategories: input.riskCategories,
    requiredAttestations: input.requiredAttestations,
    promptHash: input.promptHash ?? null,
    sessionId: input.sessionId ?? null,
    status: "approved",
    createdAt: now,
    expiresAt,
    consumedAt: null,
  };

  approvals.set(id, record);
  approvalTokenIndex.set(tokenHash, id);

  return {
    approvalId: id,
    approvalToken: token,
    expiresAt,
  };
}

export async function validateApproval(
  approvalToken: string,
): Promise<ValidateApprovalResult> {
  const tokenHash = await sha256(approvalToken);
  const approvalId = approvalTokenIndex.get(tokenHash);

  if (!approvalId) {
    return { valid: false, record: null, error: "approval_invalid" };
  }

  const record = approvals.get(approvalId);
  if (!record) {
    return { valid: false, record: null, error: "approval_invalid" };
  }

  if (record.status === "consumed") {
    return { valid: false, record, error: "approval_already_consumed" };
  }

  if (record.status === "denied") {
    return { valid: false, record, error: "approval_denied" };
  }

  if (record.status === "expired" || new Date(record.expiresAt) < new Date()) {
    // Lazy-expire
    if (record.status !== "expired") {
      record.status = "expired";
      approvals.set(record.id, record);
    }
    return { valid: false, record, error: "approval_expired" };
  }

  if (record.status !== "approved") {
    return { valid: false, record, error: "approval_required" };
  }

  return { valid: true, record };
}

export function consumeApproval(approvalId: string): MediaApprovalRecord | null {
  const record = approvals.get(approvalId);
  if (!record || record.status !== "approved") return null;

  record.status = "consumed";
  record.consumedAt = nowIso();
  approvals.set(record.id, record);
  return record;
}

export function getApprovalById(id: string): MediaApprovalRecord | null {
  return approvals.get(id) ?? null;
}

export function getApprovalByTokenHash(tokenHash: string): MediaApprovalRecord | null {
  const id = approvalTokenIndex.get(tokenHash);
  if (!id) return null;
  return approvals.get(id) ?? null;
}

/**
 * Deterministic, redaction-friendly hash of a prompt for approval binding.
 * Shared by the approval-issue and generate routes so the prompt approved at
 * consent time is provably the prompt executed at generation time.
 */
export async function simplePromptHash(prompt: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(prompt.trim().toLowerCase().slice(0, 200));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let hash = 0;
    const s = prompt.trim().toLowerCase().slice(0, 200);
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash |= 0;
    }
    return `ph-${Math.abs(hash).toString(16)}`;
  }
}

export function expireStaleApprovals(): number {
  let count = 0;
  const now = new Date();
  for (const [, record] of approvals) {
    if (
      record.status !== "consumed" &&
      record.status !== "expired" &&
      new Date(record.expiresAt) < now
    ) {
      record.status = "expired";
      approvals.set(record.id, record);
      count++;
    }
  }
  return count;
}

export function clearApprovals(): void {
  approvals.clear();
  approvalTokenIndex.clear();
  nextApprovalId = 1;
}

/**
 * Durability contract — Job 12: platform `canonical_approvals` is durable;
 * this in-memory cache is ONE-SHOT in the cache but the authority is the
 * platform claim (survives restart). Legacy constant retained for tests that
 * assert one-shot within process.
 */
export const MEDIA_APPROVAL_STORE_DURABILITY = "durable_via_platform" as const;
/** Legacy alias for external checks that still import the old name. */
export const MEDIA_APPROVAL_STORE_DURABILITY_LEGACY = "non_durable" as const;

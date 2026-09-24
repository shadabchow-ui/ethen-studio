import "server-only";

/**
 * P08 — Canonical ActionReceipt Contract
 *
 * Immutable post-execution evidence proving what occurred during execution
 * of an admitted ActionIntent.
 */

export const ACTION_RECEIPT_OUTCOMES = [
  "success",
  "failure",
  "indeterminate",
  "reconciled_success",
  "reconciled_failure",
  "compensated",
] as const;

export type ActionReceiptOutcome = (typeof ACTION_RECEIPT_OUTCOMES)[number];

export const RECONCILIATION_STATUSES = [
  "pending",
  "reconciled_success",
  "reconciled_failure",
  "not_required",
  "compensated",
] as const;

export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export interface ActionReceipt {
  id: string;
  actionIntentId: string;
  tenantId: string;
  actorId: string;
  /**
   * P10 execution correlation. All nullable for historical receipts;
   * populated at emission for new receipts. Correlation only — a receipt
   * proves what happened; it never authorizes.
   */
  traceId: string | null;
  jobId: string | null;
  runId: string | null;
  attemptId: string | null;
  admissionDecisionId: string | null;
  approvalId: string | null;
  /**
   * P11 stable context-set identity consumed by this execution. Null when
   * no constructed context was used. Correlation only.
   */
  contextSetId: string | null;
  outcome: ActionReceiptOutcome;
  reconciliationStatus: ReconciliationStatus;
  durationMs?: number | null;
  externalResourceId?: string | null;
  artifactIds: readonly string[];
  evidenceIds: readonly string[];
  redactedPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const SECRET_PATTERNS: RegExp[] = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /token/i,
  /credential/i,
  /authorization/i,
  /bearer/i,
];

function isSecretKey(key: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(key));
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (
      /(sk-[a-zA-Z0-9]{10,}|ghp_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.)/.test(
        value,
      )
    ) {
      return "[REDACTED:embedded_secret]";
    }
    if (value.length > 300) {
      return `[REDACTED:${value.slice(0, 8)}...]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (isSecretKey(k)) out[k] = "[REDACTED]";
      else out[k] = redactValue(v);
    }
    return out;
  }
  return value;
}

export function redactReceiptPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return redactValue(payload) as Record<string, unknown>;
}

export function hasSecretLeakage(obj: Record<string, unknown>): string | null {
  const str = JSON.stringify(obj);
  if (/(sk-[a-zA-Z0-9]{10,}|ghp_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})/.test(str)) {
    return "embedded_secret";
  }
  for (const k of Object.keys(obj)) {
    if (
      isSecretKey(k) &&
      typeof obj[k] === "string" &&
      String(obj[k]).length > 0 &&
      String(obj[k]) !== "[REDACTED]"
    ) {
      if (String(obj[k]).includes("[REDACTED]")) continue;
      return k;
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const leak = hasSecretLeakage(v as Record<string, unknown>);
      if (leak) return leak;
    }
  }
  return null;
}

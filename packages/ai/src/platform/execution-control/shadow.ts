/**
 * P13 — shadow comparison between the existing gate decision and the
 * composed P13 control decision.
 *
 * Shadow mode evaluates only: it never dispatches, never duplicates side
 * effects. NEW_LOOSER (old deny, new allow) is security-critical and can
 * never become execution authority — enforce mode fails closed on it.
 */

export type ShadowClassification =
  | "MATCH"
  | "NEW_STRICTER"
  | "NEW_LOOSER"
  | "NON_COMPARABLE";

export interface ShadowComparison {
  classification: ShadowClassification;
  /** True unless NEW_LOOSER. */
  safe: boolean;
}

export interface ShadowRecord {
  identity: { tenantId: string; actorId: string };
  traceId: string;
  executionControlVersion: string;
  oldDecision: string | null;
  newDecision: string | null;
  reason: string;
  classification: ShadowClassification;
  safe: boolean;
  recordedAt: string;
}

function isAllow(decision: string | null | undefined): boolean | null {
  if (decision === null || decision === undefined) return null;
  return decision === "ALLOW";
}

export function compareDecisions(
  oldDecision: string | null | undefined,
  newDecision: string | null | undefined,
): ShadowComparison {
  const oldAllow = isAllow(oldDecision);
  const newAllow = isAllow(newDecision);
  if (oldAllow === null || newAllow === null) {
    return { classification: "NON_COMPARABLE", safe: true };
  }
  if (oldAllow === newAllow) return { classification: "MATCH", safe: true };
  if (!oldAllow && newAllow) return { classification: "NEW_LOOSER", safe: false };
  return { classification: "NEW_STRICTER", safe: true };
}

export function recordShadowComparison(input: {
  tenantId: string;
  actorId: string;
  traceId: string;
  executionControlVersion: string;
  oldDecision: string | null | undefined;
  newDecision: string | null | undefined;
  reason: string;
  now?: string;
}): ShadowRecord {
  const comparison = compareDecisions(input.oldDecision, input.newDecision);
  return {
    identity: { tenantId: input.tenantId, actorId: input.actorId },
    traceId: input.traceId,
    executionControlVersion: input.executionControlVersion,
    oldDecision: input.oldDecision ?? null,
    newDecision: input.newDecision ?? null,
    reason: input.reason,
    classification: comparison.classification,
    safe: comparison.safe,
    recordedAt: input.now ?? new Date().toISOString(),
  };
}

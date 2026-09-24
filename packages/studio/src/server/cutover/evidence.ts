/**
 * STUDIO_20 — rollback and release evidence schema.
 *
 * Rollback is admission-only: re-admit to the legacy lane, never replay
 * unknown jobs and never destroy history. Release evidence requires a
 * named artifact for every gate; synthetic-only claims are rejected,
 * so live gates cannot be faked from unit tests.
 */

export type EvidenceStatus = "PASS" | "PARTIAL" | "BLOCKED" | "FAIL";

export interface GateEvidence {
  status: EvidenceStatus;
  /** Repo-relative artifact path or exact command that produces it. */
  evidenceRef: string;
  syntheticOnly: boolean;
}

export type ReleaseGate =
  | "REQUIRED_CODE"
  | "REQUIRED_DESIGN"
  | "MIGRATION_CUTOVER"
  | "BOUNDARY"
  | "RECOVERY"
  | "RELEASE_EVIDENCE"
  | "TARGETED_TESTS"
  | "TYPECHECK"
  | "TARGETED_E2E"
  | "VISUAL_REVIEW"
  | "BUILD";

export const RELEASE_GATES: readonly ReleaseGate[] = [
  "REQUIRED_CODE",
  "REQUIRED_DESIGN",
  "MIGRATION_CUTOVER",
  "BOUNDARY",
  "RECOVERY",
  "RELEASE_EVIDENCE",
  "TARGETED_TESTS",
  "TYPECHECK",
  "TARGETED_E2E",
  "VISUAL_REVIEW",
  "BUILD",
] as const;

export interface ReleaseEvidence {
  job: string;
  gates: Partial<Record<ReleaseGate, GateEvidence>>;
  liveCertification: EvidenceStatus;
}

export function validateReleaseEvidence(input: ReleaseEvidence): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input.job.trim()) errors.push("job is required");
  for (const gate of RELEASE_GATES) {
    const evidence = input.gates[gate];
    if (!evidence) {
      errors.push(`${gate}: missing evidence`);
      continue;
    }
    if (!evidence.evidenceRef.trim()) errors.push(`${gate}: evidenceRef is required`);
    if (evidence.status === "PASS" && evidence.syntheticOnly) {
      errors.push(`${gate}: synthetic-only evidence cannot be PASS`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export type LiveGate = "enrolled-auth" | "provider-canary" | "staged-migration" | "restore-drill" | "chat-voice-regression";

export interface LiveGateEvidence {
  gate: LiveGate;
  proof: string | null;
}

export function certifyLive(proofs: readonly LiveGateEvidence[]): EvidenceStatus {
  if (proofs.length === 0) return "BLOCKED";
  return proofs.every((p) => p.proof !== null && p.proof.trim().length > 0) ? "PASS" : "BLOCKED";
}

export interface RollbackStep {
  action: string;
  destroysHistory: boolean;
  redispatchesUnknownJobs: boolean;
}

export interface RollbackPlan {
  /** Rollback only re-admits to the legacy lane; never replays the unknown. */
  admissionOnly: boolean;
  steps: RollbackStep[];
}

const DESTRUCTIVE_PATTERN = /(drop\s+(table|column)|delete\s+from|truncate|destroy\s+histor)/i;

export function validateRollbackPlan(plan: RollbackPlan): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!plan.admissionOnly) errors.push("rollback must be admission-only");
  if (plan.steps.length === 0) errors.push("rollback needs at least one step");
  for (const step of plan.steps) {
    if (step.destroysHistory) errors.push(`destroys history: ${step.action}`);
    if (step.redispatchesUnknownJobs) errors.push(`redispatches unknown jobs: ${step.action}`);
    if (DESTRUCTIVE_PATTERN.test(step.action)) errors.push(`destructive statement: ${step.action}`);
  }
  return { ok: errors.length === 0, errors };
}

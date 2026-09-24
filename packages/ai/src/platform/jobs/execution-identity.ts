import type {
  AdmissionFacts,
  AdmissionResult,
  ApprovalFact,
  BudgetFact,
  PolicyFact,
} from "../governance/admission";
import type { ActionIntent } from "../governance/action-intent";
import type {
  CapabilityDefinition,
  CapabilityGrant,
  RiskLevel,
} from "../governance/grants";
import type { JobRecord } from "./contract";
import { JobContractError } from "./errors";

/**
 * P09 — Canonical execution identity.
 *
 * Typed Task → Run → Attempt → Job lineage plus the governance bindings.
 * Canonical lineage must never rely on arbitrary untyped job payload fields;
 * identity travels in the `execution` payload envelope, written once at job
 * creation through the typed `CreateJobInput.execution` field.
 */

export const EXECUTION_ENVELOPE_KEY = "execution" as const;
export const GOVERNANCE_ENVELOPE_KEY = "governance" as const;

export interface ExecutionIdentity {
  tenantId: string;
  organizationId: string;
  projectId: string;
  actorId: string;
  taskId: string | null;
  runId: string | null;
  attemptId: string | null;
  /** Assigned at creation; equals JobRecord.id once the job exists. */
  jobId: string | null;
  traceId: string;
  actionIntentId: string | null;
  admissionDecisionId: string | null;
  approvalId: string | null;
}

/**
 * Identity fields a job creator may supply. jobId is assigned by the
 * service; tenant/actor/trace are required for governed execution (a
 * consequential dispatch without them fails closed).
 */
export interface ExecutionIdentityInput {
  tenantId: string;
  actorId: string;
  traceId: string;
  taskId?: string | null;
  runId?: string | null;
  attemptId?: string | null;
  actionIntentId?: string | null;
  admissionDecisionId?: string | null;
  approvalId?: string | null;
}

/**
 * Queue-time governed dispatch envelope: the ActionIntent plus the
 * capability/authority facts `evaluateAdmission` needs, established by the
 * trusted queue-time authority. The worker re-verifies digest integrity and
 * expiry at dispatch time; approval revocation/consumption is re-verified
 * live against the canonical approval store.
 */
export interface GovernedDispatch {
  intent: ActionIntent;
  capabilityDefinition: CapabilityDefinition;
  capabilityGrants: readonly CapabilityGrant[];
  risk: RiskLevel;
  policy: PolicyFact;
  productSwitchId?: AdmissionFacts["productSwitchId"];
  approval?: ApprovalFact | null;
  budget: BudgetFact;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : null;
}

function isExecutionIdentity(value: unknown): value is ExecutionIdentity {
  if (!isRecord(value)) return false;
  return (
    typeof value.tenantId === "string" &&
    typeof value.organizationId === "string" &&
    typeof value.projectId === "string" &&
    typeof value.actorId === "string" &&
    typeof value.traceId === "string"
  );
}

function isGovernedDispatch(value: unknown): value is GovernedDispatch {
  if (!isRecord(value)) return false;
  const intent = value.intent;
  return (
    isRecord(intent) &&
    typeof intent.id === "string" &&
    typeof intent.actionDigest === "string" &&
    isRecord(value.capabilityDefinition) &&
    Array.isArray(value.capabilityGrants) &&
    isRecord(value.policy) &&
    isRecord(value.budget)
  );
}

/** Read the canonical execution identity from a job payload, if present. */
export function readExecutionIdentity(
  payload: Readonly<Record<string, unknown>>,
): ExecutionIdentity | null {
  const envelope = payload[EXECUTION_ENVELOPE_KEY];
  if (envelope === undefined || envelope === null) return null;
  if (!isExecutionIdentity(envelope)) {
    throw new JobContractError(
      "INVALID_INPUT",
      "Job execution envelope is malformed; canonical identity must be written through CreateJobInput.execution.",
    );
  }
  return {
    tenantId: envelope.tenantId,
    organizationId: envelope.organizationId,
    projectId: envelope.projectId,
    actorId: envelope.actorId,
    taskId: optionalText(envelope.taskId),
    runId: optionalText(envelope.runId),
    attemptId: optionalText(envelope.attemptId),
    jobId: optionalText(envelope.jobId),
    traceId: envelope.traceId,
    actionIntentId: optionalText(envelope.actionIntentId),
    admissionDecisionId: optionalText(envelope.admissionDecisionId),
    approvalId: optionalText(envelope.approvalId),
  };
}

/** Read the queue-time governed dispatch envelope from a job payload, if present. */
export function readGovernedDispatch(
  payload: Readonly<Record<string, unknown>>,
): GovernedDispatch | null {
  const envelope = payload[GOVERNANCE_ENVELOPE_KEY];
  if (envelope === undefined || envelope === null) return null;
  if (!isGovernedDispatch(envelope)) {
    throw new JobContractError(
      "INVALID_INPUT",
      "Job governance envelope is malformed; governed dispatch must be written through CreateJobInput.governance.",
    );
  }
  return envelope as GovernedDispatch;
}

/**
 * Canonical identity write at job creation. The envelope is derived from the
 * typed input plus the authoritative job record — never from raw payload
 * fields, which the service rejects (anti-forgery).
 */
export function buildExecutionEnvelope(
  input: ExecutionIdentityInput,
  job: Pick<JobRecord, "id" | "organizationId" | "projectId">,
): ExecutionIdentity {
  for (const [field, value] of Object.entries({
    tenantId: input.tenantId,
    actorId: input.actorId,
    traceId: input.traceId,
  })) {
    if (!value || !value.trim()) {
      throw new JobContractError(
        "INVALID_INPUT",
        `execution.${field} is required for governed execution identity.`,
      );
    }
  }
  return {
    tenantId: input.tenantId,
    organizationId: job.organizationId,
    projectId: job.projectId,
    actorId: input.actorId,
    taskId: input.taskId ?? null,
    runId: input.runId ?? null,
    attemptId: input.attemptId ?? null,
    jobId: job.id,
    traceId: input.traceId,
    actionIntentId: input.actionIntentId ?? null,
    admissionDecisionId: input.admissionDecisionId ?? null,
    approvalId: input.approvalId ?? null,
  };
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Fail-closed dispatch readiness check for governed execution identity.
 * Returns mismatch reasons (empty = ready). Covers: missing identity,
 * tenant/org/project/actor mismatch against the job record, and missing
 * trace. Tenant/actor equality against the admission AccessScope is enforced
 * by evaluateAdmission itself.
 */
export function validateExecutionIdentityForDispatch(
  job: JobRecord,
): { identity: ExecutionIdentity | null; reasons: readonly string[] } {
  let identity: ExecutionIdentity | null;
  try {
    identity = readExecutionIdentity(job.payload);
  } catch {
    return { identity: null, reasons: ["execution envelope malformed"] };
  }
  if (!identity) return { identity: null, reasons: ["missing execution identity"] };
  const reasons: string[] = [];
  if (!nonEmpty(identity.tenantId)) reasons.push("missing tenantId");
  if (!nonEmpty(identity.actorId)) reasons.push("missing actorId");
  if (!nonEmpty(identity.traceId)) reasons.push("missing traceId");
  if (identity.organizationId !== job.organizationId) {
    reasons.push("organization mismatch between identity and job record");
  }
  if (identity.projectId !== job.projectId) {
    reasons.push("project mismatch between identity and job record");
  }
  if (identity.jobId !== null && identity.jobId !== job.id) {
    reasons.push("job mismatch between identity and job record");
  }
  return { identity, reasons };
}

export type { ActionIntent, AdmissionFacts, AdmissionResult };

/**
 * P09 canonical action bytes for a governed dispatch: the stable encoding of
 * the ActionIntent. The queue-time authority MUST authorize the canonical
 * approval against exactly these bytes, and the worker re-verifies the live
 * approval against them. This bridges the two binding schemes without
 * weakening either:
 *
 * - admission binds approval-id → intent digest (P08 intent binding);
 * - the approval store binds approval-id → exact action bytes (one-shot
 *   claim, revocation, expiry).
 *
 * The link between the schemes is the approval id: the queue-time authority
 * attests (in the governance envelope) that approval <id> authorizes intent
 * <digest>, where the approval was authorized for these exact bytes.
 */
export function governedActionBytes(intent: ActionIntent): Uint8Array {
  const canonical = JSON.stringify({
    actionCode: intent.actionCode,
    actionDigest: intent.actionDigest,
    actorId: intent.actorId,
    canonicalParameters: intent.canonicalParameters,
    capabilityId: intent.capabilityId,
    environment: intent.environment ?? "production",
    id: intent.id,
    resourceId: intent.resourceId ?? null,
    tenantId: intent.tenantId,
  });
  return new TextEncoder().encode(canonical);
}

/**
 * P13 — frozen Execution Control envelope (M1 composition).
 *
 * Namespaced references/facts/decisions composed from the frozen P07–P12
 * authorities. This object decides nothing by itself: every namespace
 * points at its owning authority, and P08 admission remains the exclusive
 * consequential gate. Frozen (immutable) once composed.
 */

export const EXECUTION_CONTROL_VERSION = "p13-v1" as const;

export interface ExecutionControlIdentity {
  tenantId: string;
  tenantType: string;
  organizationId: string | null;
  projectId: string | null;
  actorId: string;
  actorKind: string;
  principalId: string;
  delegatedByActorId: string | null;
}

export interface ExecutionControlIntent {
  intentId: string;
  capabilityId: string;
  actionCode: string;
  actionDigest: string;
  sideEffectClass: string;
  resourceId: string | null;
}

export interface ExecutionControlAuthority {
  capabilityId: string;
  grantId: string | null;
  resourceScope: string | null;
  maxRisk: string | null;
  policyState: string;
  risk: string | null;
  admissionDecision: string;
  admissionReasonCodes: readonly string[];
  approvalRequirement: string;
  approvalId: string | null;
  killSwitchEngaged: boolean;
}

export interface ExecutionControlExecution {
  taskId: string | null;
  runId: string | null;
  attemptId: string | null;
  jobId: string | null;
  traceId: string;
  leaseGeneration: number | null;
}

export interface ExecutionControlContext {
  contextSetId: string | null;
}

export interface ExecutionControlTools {
  toolId: string | null;
  capabilityClass: "READ" | "WRITE" | null;
  connectorId: string | null;
  /** Credential reference id only — never a secret value. */
  credentialRefId: string | null;
  mcpTrustLevel: string | null;
  mcpServerId: string | null;
}

export interface ExecutionControlSandbox {
  runtimeTarget: string | null;
  isolationClass: string | null;
  networkEgressPolicy: string | null;
  allowedHostnames: readonly string[];
  filesystemScope: string | null;
  timeoutMs: number | null;
  commandRisk: string | null;
}

export interface ExecutionControlEvidence {
  proofRequired: boolean;
  receiptRequired: boolean;
  auditCorrelation: Record<string, string>;
}

export interface ExecutionControlEnvelope {
  executionControlVersion: typeof EXECUTION_CONTROL_VERSION;
  identity: ExecutionControlIdentity;
  intent: ExecutionControlIntent;
  authority: ExecutionControlAuthority;
  execution: ExecutionControlExecution;
  context: ExecutionControlContext;
  tools: ExecutionControlTools;
  sandbox: ExecutionControlSandbox;
  evidence: ExecutionControlEvidence;
}

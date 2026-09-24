import {
  EXECUTION_CONTROL_VERSION,
  type ExecutionControlEnvelope,
} from "./envelope";

/**
 * P13 — canonical composition function.
 *
 * Pure: same canonical facts → same frozen envelope. Operation-sensitive
 * requirements: consequential (WRITE) operations must present identity,
 * intent, admission, execution trace, and (where the operation needs them)
 * approval, credential reference, and sandbox policy. Anything missing
 * fails closed with the gaps listed — never silent defaults.
 */

export interface ComposeExecutionControlInput {
  identity: {
    tenantId?: string | null;
    tenantType?: string | null;
    organizationId?: string | null;
    projectId?: string | null;
    actorId?: string | null;
    actorKind?: string | null;
    principalId?: string | null;
    delegatedByActorId?: string | null;
  };
  intent: {
    intentId?: string | null;
    capabilityId?: string | null;
    actionCode?: string | null;
    actionDigest?: string | null;
    sideEffectClass?: string | null;
    resourceId?: string | null;
  };
  authority: {
    capabilityId?: string | null;
    grantId?: string | null;
    resourceScope?: string | null;
    maxRisk?: string | null;
    policyState?: string | null;
    risk?: string | null;
    admissionDecision?: string | null;
    admissionReasonCodes?: readonly string[] | null;
    approvalRequirement?: string | null;
    approvalId?: string | null;
    killSwitchEngaged?: boolean | null;
  };
  execution: {
    taskId?: string | null;
    runId?: string | null;
    attemptId?: string | null;
    jobId?: string | null;
    traceId?: string | null;
    leaseGeneration?: number | null;
  };
  /** WRITE (consequential) or READ. */
  operation: "READ" | "WRITE";
  context?: { contextSetId?: string | null };
  tools?: {
    toolId?: string | null;
    capabilityClass?: "READ" | "WRITE" | null;
    connectorId?: string | null;
    credentialRefId?: string | null;
    credentialRequired?: boolean | null;
    mcpTrustLevel?: string | null;
    mcpServerId?: string | null;
  };
  sandbox?: {
    required: boolean;
    runtimeTarget?: string | null;
    isolationClass?: string | null;
    networkEgressPolicy?: string | null;
    allowedHostnames?: readonly string[] | null;
    filesystemScope?: string | null;
    timeoutMs?: number | null;
    commandRisk?: string | null;
  };
  evidence?: {
    proofRequired?: boolean;
    receiptRequired?: boolean;
    auditCorrelation?: Record<string, string>;
  };
}

export class CompositionDeniedError extends Error {
  readonly code = "COMPOSITION_DENIED";
  readonly gaps: readonly string[];
  constructor(gaps: readonly string[]) {
    super(`Execution control composition denied (missing: ${gaps.join(", ")}).`);
    this.gaps = gaps;
  }
}

function required(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

/**
 * P13 compatibility adapter: legacy caller → canonical composition input.
 * Reads the P09 execution identity + governed dispatch envelopes already on
 * the job and binds the legacy gate decision. Legacy callers migrate by
 * supplying this input instead of hand-building envelopes.
 */
export function adaptLegacyDispatchInput(input: {
  job: {
    id: string;
    payload: Record<string, unknown>;
    attemptCount: number;
    leaseGeneration: number;
  };
  legacyDecision: string;
  legacyReasonCodes?: readonly string[];
  operation: "READ" | "WRITE";
  contextSetId?: string | null;
  tool?: ComposeExecutionControlInput["tools"];
  sandboxRequired?: boolean;
}): ComposeExecutionControlInput {
  const payload = input.job.payload as Record<string, unknown>;
  const execution = (payload.execution ?? {}) as Record<string, unknown>;
  const governance = (payload.governance ?? {}) as {
    intent?: Record<string, unknown>;
    policy?: Record<string, unknown>;
    risk?: string;
  };
  const intent = (governance.intent ?? {}) as Record<string, unknown>;
  const policy = (governance.policy ?? {}) as Record<string, unknown>;
  const str = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;
  return {
    operation: input.operation,
    identity: {
      tenantId: str(execution.tenantId),
      tenantType: str(execution.tenantType),
      organizationId: str(execution.organizationId),
      projectId: str(execution.projectId),
      actorId: str(execution.actorId),
      actorKind: str(execution.actorKind),
      principalId: str(execution.principalId),
      delegatedByActorId: str(execution.delegatedByActorId),
    },
    intent: {
      intentId: str(intent.id) ?? str(execution.actionIntentId),
      capabilityId: str(intent.capabilityId),
      actionCode: str(intent.actionCode),
      actionDigest: str(intent.actionDigest),
      sideEffectClass: str(intent.sideEffectClass),
      resourceId: str(intent.resourceId),
    },
    authority: {
      admissionDecision: input.legacyDecision || null,
      admissionReasonCodes: input.legacyReasonCodes ?? [],
      approvalId: str(execution.approvalId),
      policyState: str(policy.state),
      risk: str(governance.risk),
    },
    execution: {
      taskId: str(execution.taskId),
      runId: str(execution.runId),
      attemptId: str(execution.attemptId),
      jobId: input.job.id,
      traceId: str(execution.traceId),
      leaseGeneration: input.job.leaseGeneration,
    },
    context: { contextSetId: input.contextSetId ?? null },
    tools: input.tool,
    sandbox: { required: input.sandboxRequired ?? false },
  };
}

/**
 * P16 — bind Founder authority inputs onto the canonical authority fields.
 *
 * Consumed-input mapping (existing fields only; the envelope is unchanged):
 * - autonomy gate `require-approval` → `approvalRequirement: "required"`;
 * - autonomy `maxRisk` / policy risk  → `maxRisk`, `risk`;
 * - incident containment              → `killSwitchEngaged: true` is NOT set
 *   here (kill switches stay V4-canonical); instead the caller must route
 *   containment through `killSwitchDenial` and surface it via `policyState`.
 *
 * Hard rule: this helper never upgrades a non-ALLOW canonical admission
 * decision. A P16 ADMIT with a canonical DENY returns the input unchanged
 * (plus a `P16_CANONICAL_DENY_STANDS` marker code for the caller to record).
 */
export function applyP16AuthorityInputs(input: {
  composeInput: ComposeExecutionControlInput;
  canonicalAdmissionDecision: string;
  p16: {
    verdict: "admit" | "deny";
    requireApproval?: boolean;
    maxRisk?: string | null;
    risk?: string | null;
    reasonCodes?: readonly string[];
  };
}): { composeInput: ComposeExecutionControlInput; p16Applied: boolean; markerCodes: readonly string[] } {
  const codes = [...(input.composeInput.authority.admissionReasonCodes ?? [])];
  if (input.canonicalAdmissionDecision !== "ALLOW") {
    return {
      composeInput: input.composeInput,
      p16Applied: false,
      markerCodes: [...codes, "P16_CANONICAL_DENY_STANDS"],
    };
  }
  if (input.p16.verdict === "deny") {
    return {
      composeInput: {
        ...input.composeInput,
        authority: {
          ...input.composeInput.authority,
          admissionDecision: "DENY",
          admissionReasonCodes: [...codes, ...(input.p16.reasonCodes ?? []), "P16_TIGHTENED_DENY"],
        },
      },
      p16Applied: true,
      markerCodes: [...codes, ...(input.p16.reasonCodes ?? []), "P16_TIGHTENED_DENY"],
    };
  }
  return {
    composeInput: {
      ...input.composeInput,
      authority: {
        ...input.composeInput.authority,
        approvalRequirement:
          input.p16.requireApproval === true
            ? "required"
            : (input.composeInput.authority.approvalRequirement ?? "none"),
        maxRisk: input.p16.maxRisk ?? input.composeInput.authority.maxRisk ?? null,
        risk: input.p16.risk ?? input.composeInput.authority.risk ?? null,
        admissionReasonCodes: [...codes, ...(input.p16.reasonCodes ?? [])],
      },
    },
    p16Applied: true,
    markerCodes: [...codes, ...(input.p16.reasonCodes ?? [])],
  };
}

export function composeExecutionControl(
  input: ComposeExecutionControlInput,
): ExecutionControlEnvelope {
  const gaps: string[] = [];
  const consequential = input.operation === "WRITE";

  if (!required(input.identity.tenantId)) gaps.push("identity.tenantId");
  if (!required(input.identity.actorId)) gaps.push("identity.actorId");
  if (!required(input.intent.intentId)) gaps.push("intent.intentId");
  if (!required(input.authority.policyState)) gaps.push("authority.policyState");
  if (!required(input.execution.traceId)) gaps.push("execution.traceId");

  if (consequential) {
    if (!required(input.authority.admissionDecision)) gaps.push("authority.admissionDecision");
    if (!required(input.execution.attemptId)) gaps.push("execution.attemptId");
    if (!required(input.execution.jobId)) gaps.push("execution.jobId");
    if (input.authority.approvalRequirement === "required" && !required(input.authority.approvalId)) {
      gaps.push("authority.approvalId");
    }
    if (input.tools?.capabilityClass === "WRITE" && !required(input.tools?.toolId)) {
      gaps.push("tools.toolId");
    }
    if (input.tools?.capabilityClass === "READ") {
      gaps.push("tools.capabilityClass");
    }
    if (input.tools?.credentialRequired === true && !required(input.tools?.credentialRefId)) {
      gaps.push("tools.credentialRefId");
    }
    if (input.sandbox?.required && !required(input.sandbox?.isolationClass)) {
      gaps.push("sandbox.isolationClass");
    }
  }

  if (gaps.length > 0) throw new CompositionDeniedError(gaps);

  return Object.freeze({
    executionControlVersion: EXECUTION_CONTROL_VERSION,
    identity: Object.freeze({
      tenantId: input.identity.tenantId as string,
      tenantType: input.identity.tenantType ?? "organization",
      organizationId: input.identity.organizationId ?? null,
      projectId: input.identity.projectId ?? null,
      actorId: input.identity.actorId as string,
      actorKind: input.identity.actorKind ?? "service",
      principalId: input.identity.principalId ?? (input.identity.actorId as string),
      delegatedByActorId: input.identity.delegatedByActorId ?? null,
    }),
    intent: Object.freeze({
      intentId: input.intent.intentId as string,
      capabilityId: input.intent.capabilityId ?? "",
      actionCode: input.intent.actionCode ?? "",
      actionDigest: input.intent.actionDigest ?? "",
      sideEffectClass: input.intent.sideEffectClass ?? "",
      resourceId: input.intent.resourceId ?? null,
    }),
    authority: Object.freeze({
      capabilityId: input.authority.capabilityId ?? "",
      grantId: input.authority.grantId ?? null,
      resourceScope: input.authority.resourceScope ?? null,
      maxRisk: input.authority.maxRisk ?? null,
      policyState: input.authority.policyState as string,
      risk: input.authority.risk ?? null,
      admissionDecision: input.authority.admissionDecision ?? "",
      admissionReasonCodes: Object.freeze([...(input.authority.admissionReasonCodes ?? [])]),
      approvalRequirement: input.authority.approvalRequirement ?? "none",
      approvalId: input.authority.approvalId ?? null,
      killSwitchEngaged: input.authority.killSwitchEngaged ?? false,
    }),
    execution: Object.freeze({
      taskId: input.execution.taskId ?? null,
      runId: input.execution.runId ?? null,
      attemptId: input.execution.attemptId ?? null,
      jobId: input.execution.jobId ?? null,
      traceId: input.execution.traceId as string,
      leaseGeneration: input.execution.leaseGeneration ?? null,
    }),
    context: Object.freeze({
      contextSetId: input.context?.contextSetId ?? null,
    }),
    tools: Object.freeze({
      toolId: input.tools?.toolId ?? null,
      capabilityClass: input.tools?.capabilityClass ?? null,
      connectorId: input.tools?.connectorId ?? null,
      credentialRefId: input.tools?.credentialRefId ?? null,
      mcpTrustLevel: input.tools?.mcpTrustLevel ?? null,
      mcpServerId: input.tools?.mcpServerId ?? null,
    }),
    sandbox: Object.freeze({
      runtimeTarget: input.sandbox?.runtimeTarget ?? null,
      isolationClass: input.sandbox?.isolationClass ?? null,
      networkEgressPolicy: input.sandbox?.networkEgressPolicy ?? null,
      allowedHostnames: Object.freeze([...(input.sandbox?.allowedHostnames ?? [])]),
      filesystemScope: input.sandbox?.filesystemScope ?? null,
      timeoutMs: input.sandbox?.timeoutMs ?? null,
      commandRisk: input.sandbox?.commandRisk ?? null,
    }),
    evidence: Object.freeze({
      proofRequired: input.evidence?.proofRequired ?? consequential,
      receiptRequired: input.evidence?.receiptRequired ?? consequential,
      auditCorrelation: Object.freeze({ ...(input.evidence?.auditCorrelation ?? {}) }),
    }),
  });
}

/** Studio V5 catalog — pure eligibility filter (STUDIO_06). Browser-safe. */
import type { TaskName } from "../contracts/tasks";
import type { VersionPins } from "../contracts/versions";
import { evaluateQualification } from "./qualification";
import { validateCoreParameters, validateRawProviderParameters } from "./schema-validation";
import type {
  CandidateExclusion,
  EndpointSpec,
  QualificationAttestation,
} from "./types";

export interface IdentityBindingRef {
  bindingId: string;
  endpointId: string;
  compatibleModelIds: readonly string[];
  revokedAt: string | null;
}

export interface AllowanceDecision {
  allowed: boolean;
  reason: string;
}

export interface EligibilityContext {
  task: TaskName;
  /** Null pins = endpoint self-consistency only; Auto pins from the winner. */
  pins: VersionPins | null;
  parameters: Readonly<Record<string, unknown>>;
  providerParams: unknown;
  identityBinding: IdentityBindingRef | null;
  /** Tenant allow/deny per provider id. Absent = allowed. */
  tenantProviders: Readonly<Record<string, AllowanceDecision>>;
  /** Workspace allow/deny per endpoint id. Absent = allowed. */
  workspaceEndpoints: Readonly<Record<string, AllowanceDecision>>;
  /** Breaker-paused endpoint ids. */
  breakerPaused: ReadonlySet<string>;
  /** Disabled-by-operator endpoint ids. */
  disabledEndpoints: ReadonlySet<string>;
  nowIso?: string;
}

export interface EligibilityResult {
  candidates: EndpointSpec[];
  excluded: CandidateExclusion[];
}

/**
 * Order: task validation → qualification → schema support → tenant/provider
 * restriction → identity binding → breaker/disabled. Every rejection is an
 * explicit exclusion with a reason; nothing is silently dropped.
 */
export function filterEligible(
  specs: readonly EndpointSpec[],
  attestations: ReadonlyMap<string, QualificationAttestation>,
  ctx: EligibilityContext,
): EligibilityResult {
  const candidates: EndpointSpec[] = [];
  const excluded: CandidateExclusion[] = [];
  const push = (endpointId: string, reason: CandidateExclusion["reason"], detail: string): void => {
    excluded.push({ endpointId, reason, detail });
  };

  for (const spec of specs) {
    if (spec.task !== ctx.task) {
      push(spec.endpointId, "TASK_MISMATCH", `Endpoint ${spec.endpointId} serves ${spec.task}, not ${ctx.task}.`);
      continue;
    }
    if (ctx.disabledEndpoints.has(spec.endpointId)) {
      push(spec.endpointId, "ENDPOINT_DISABLED", `Endpoint ${spec.endpointId} is disabled by the operator.`);
      continue;
    }
    const qualification = evaluateQualification(spec, attestations.get(spec.endpointId) ?? null, ctx.pins, ctx.nowIso);
    if (!qualification.qualified) {
      excluded.push(...qualification.exclusions);
      continue;
    }
    const core = validateCoreParameters(spec, ctx.parameters);
    if (!core.ok) {
      for (const problem of core.problems) {
        const unknownRequired =
          spec.requiredControls.includes(problem.control) &&
          !spec.supportedControls.includes(problem.control);
        push(
          spec.endpointId,
          unknownRequired ? "UNKNOWN_REQUIRED_CONTROL" : "UNSUPPORTED_SCHEMA",
          problem.message,
        );
      }
      continue;
    }
    const raw = validateRawProviderParameters(spec, ctx.providerParams);
    if (!raw.ok) {
      for (const problem of raw.problems) {
        push(spec.endpointId, "UNSUPPORTED_SCHEMA", problem.message);
      }
      continue;
    }
    const tenant = ctx.tenantProviders[spec.providerId];
    if (tenant && !tenant.allowed) {
      push(spec.endpointId, "TENANT_RESTRICTED", `Provider ${spec.providerId} is restricted for this tenant: ${tenant.reason}`);
      continue;
    }
    const workspace = ctx.workspaceEndpoints[spec.endpointId];
    if (workspace && !workspace.allowed) {
      push(spec.endpointId, "PROVIDER_RESTRICTED", `Endpoint ${spec.endpointId} is restricted for this workspace: ${workspace.reason}`);
      continue;
    }
    if (ctx.identityBinding) {
      const binding = ctx.identityBinding;
      const bound =
        binding.revokedAt === null &&
        (binding.endpointId === spec.endpointId ||
          binding.compatibleModelIds.includes(spec.endpointId) ||
          binding.compatibleModelIds.includes(spec.familyId));
      if (!spec.identityBinding || !bound) {
        push(
          spec.endpointId,
          "IDENTITY_BINDING_MISMATCH",
          !spec.identityBinding
            ? `Endpoint ${spec.endpointId} does not support identity bindings.`
            : `Identity binding ${binding.bindingId} is not compatible with ${spec.endpointId}.`,
        );
        continue;
      }
    }
    if (ctx.breakerPaused.has(spec.endpointId)) {
      push(
        spec.endpointId,
        "BREAKER_PAUSED",
        `Endpoint ${spec.endpointId} is paused by its health breaker after consecutive transport/auth failures; the owner must clear it after verified recovery.`,
      );
      continue;
    }
    candidates.push(spec);
  }
  return { candidates, excluded };
}

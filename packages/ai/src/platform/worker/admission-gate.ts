import type { AccessScope } from "../auth/canonical-tenant";
import type { AdmissionResult } from "../governance/admission";
import type { JobRecord } from "../jobs";
import {
  readGovernedDispatch,
  validateExecutionIdentityForDispatch,
  type ExecutionIdentity,
} from "../../index";
import type { PreDispatchAdmissionGate } from "./types";

/**
 * Founder-authority evaluation produced by product code. Structural only:
 * the shared platform never imports product implementations.
 */
export interface FounderAuthorityEvaluation {
  verdict: "admit" | "deny";
  reasonCodes: readonly string[];
}

export interface FounderAuthorityComposition {
  finalDecision: AdmissionResult["decision"];
  wouldAllow: boolean;
  divergence: string;
  reasonCodes: readonly string[];
}

export type FounderAuthorityMode = "off" | "shadow" | "enforce";

/**
 * Product-provided Founder-authority composer (dependency inversion: the
 * platform defines this interface; product code implements it and injects
 * it). The platform direction stays products -> platform.
 */
export interface FounderAuthorityComposer {
  readMode(): FounderAuthorityMode;
  evaluate(inputs: unknown, evaluatedAt: string): FounderAuthorityEvaluation;
  compose(input: {
    canonicalDecision: AdmissionResult["decision"];
    canonicalReasonCodes: readonly string[];
    evaluation: FounderAuthorityEvaluation;
  }): FounderAuthorityComposition;
}

/**
 * P09 — canonical payload admission gate.
 *
 * Evaluates a fresh authoritative `evaluateAdmission` decision for a claimed
 * job immediately before consequential dispatch, from the job's canonical
 * envelopes:
 *
 * - `execution`: canonical identity (must match the job record);
 * - `governance`: queue-time ActionIntent + capability/authority facts.
 *
 * Fail-closed properties:
 * - missing/malformed identity or governance envelope → DENY (never dispatch);
 * - intent/identity tenant+actor mismatch → DENY;
 * - approval fact carrying a different project than the job → DENY;
 * - grant expiry is evaluated at dispatch time (`nowIso`), so stale queue-time
 *   facts deny;
 * - intent digest integrity is re-verified by `evaluateAdmission` itself.
 *
 * Approval revocation/consumption liveness is additionally enforced by the
 * worker host's approval re-verification against the canonical approval
 * store for approval-required handlers.
 */

export type AdmissionScopeResolver = (
  identity: ExecutionIdentity,
) => AccessScope | Promise<AccessScope>;

function deny(
  reasonCodes: readonly string[],
  issues: readonly string[],
  evaluatedAt: string,
): AdmissionResult {
  return {
    decision: "DENY",
    wouldAllow: false,
    reasonCodes,
    issues,
    evaluatedAt,
  };
}

export function createPayloadAdmissionGate(input: {
  resolveScope: AdmissionScopeResolver;
  now?: () => string;
  /**
   * Founder-authority inputs resolver. Optional: when absent, the gate
   * enforces exactly the canonical P08 admission behavior. When present,
   * canonical admission is still evaluated first and always wins on DENY;
   * the composer may only tighten a canonical ALLOW. The composer also
   * owns the off/shadow/enforce transition flag; `off` ignores this hook
   * entirely (rollback posture).
   */
  resolveFounderAuthority?: (job: JobRecord) => unknown;
  /** Composer for resolved Founder-authority inputs (product-injected). */
  founderAuthority?: FounderAuthorityComposer;
}): PreDispatchAdmissionGate {
  const now = input.now ?? (() => new Date().toISOString());
  return {
    async evaluateJob(job: JobRecord): Promise<AdmissionResult> {
      const evaluatedAt = now();

      // 1. Canonical execution identity must be present and match the record.
      let identity: ExecutionIdentity;
      try {
        const { identity: parsed, reasons } =
          validateExecutionIdentityForDispatch(job);
        if (!parsed || reasons.length > 0) {
          return deny(
            ["P09_EXECUTION_IDENTITY_INVALID"],
            reasons.length > 0 ? reasons : ["missing execution identity"],
            evaluatedAt,
          );
        }
        identity = parsed;
      } catch {
        return deny(
          ["P09_EXECUTION_IDENTITY_MALFORMED"],
          ["execution envelope is malformed"],
          evaluatedAt,
        );
      }

      // 2. Governed dispatch envelope must be present and well-formed.
      let governed;
      try {
        governed = readGovernedDispatch(job.payload);
      } catch {
        return deny(
          ["P09_GOVERNANCE_ENVELOPE_MALFORMED"],
          ["governance envelope is malformed"],
          evaluatedAt,
        );
      }
      if (!governed) {
        return deny(
          ["P09_GOVERNANCE_MISSING"],
          ["consequential dispatch requires a governed dispatch envelope"],
          evaluatedAt,
        );
      }

      // 3. Intent must bind the same tenant + actor as the execution identity.
      // (evaluateAdmission re-checks both against the live AccessScope.)
      if (
        governed.intent.tenantId !== identity.tenantId ||
        governed.intent.actorId !== identity.actorId
      ) {
        return deny(
          ["P09_INTENT_IDENTITY_MISMATCH"],
          ["ActionIntent tenant/actor does not match execution identity"],
          evaluatedAt,
        );
      }
      if (identity.actionIntentId && governed.intent.id !== identity.actionIntentId) {
        return deny(
          ["P09_INTENT_BINDING_MISMATCH"],
          ["ActionIntent id does not match execution identity binding"],
          evaluatedAt,
        );
      }

      // 4. Approval facts must be project-bound to this job. A tenant-A
      // approval can never authorize a tenant-B (different project) dispatch.
      if (governed.approval?.projectId && governed.approval.projectId !== job.projectId) {
        return deny(
          ["P09_APPROVAL_PROJECT_MISMATCH"],
          ["approval was granted for a different project"],
          evaluatedAt,
        );
      }

      // 5. Resolve the effective scope and evaluate fresh admission.
      let scope: AccessScope;
      try {
        scope = await input.resolveScope(identity);
      } catch {
        return deny(
          ["P09_SCOPE_UNRESOLVABLE"],
          ["effective tenant scope cannot be resolved; fail closed"],
          evaluatedAt,
        );
      }

      const { evaluateAdmission } = await import("../governance/admission");
      const canonical = evaluateAdmission(
        governed.intent,
        scope,
        {
          capabilityDefinition: governed.capabilityDefinition,
          capabilityGrants: governed.capabilityGrants,
          risk: governed.risk,
          policy: governed.policy,
          productSwitchId: governed.productSwitchId ?? null,
          approval: governed.approval ?? null,
          budget: governed.budget,
          nowIso: evaluatedAt,
        },
      );
      if (!input.resolveFounderAuthority || !input.founderAuthority) return canonical;
      const composer = input.founderAuthority;
      const mode = composer.readMode();
      if (mode === "off") return canonical;
      let founderInputs: unknown = null;
      try {
        founderInputs = input.resolveFounderAuthority(job);
      } catch {
        return {
          ...canonical,
          decision: "DENY",
          wouldAllow: false,
          reasonCodes: [...canonical.reasonCodes, "P16_INPUTS_UNRESOLVABLE"],
          issues: [...canonical.issues, "founder authority inputs unresolvable; fail closed"],
        };
      }
      const evaluation = composer.evaluate(founderInputs ?? {}, evaluatedAt);
      const composed = composer.compose({
        canonicalDecision: canonical.decision,
        canonicalReasonCodes: canonical.reasonCodes,
        evaluation,
      });
      if (mode === "shadow") {
        const shadowCode =
          composed.divergence === "MATCH" ? "P16_SHADOW_MATCH" : `P16_SHADOW_${composed.divergence}`;
        return { ...canonical, reasonCodes: [...canonical.reasonCodes, shadowCode] };
      }
      return {
        decision: composed.finalDecision,
        wouldAllow: composed.wouldAllow,
        reasonCodes: [...composed.reasonCodes],
        issues:
          composed.finalDecision === "ALLOW"
            ? canonical.issues
            : [...canonical.issues, `P16 authority composition denied (${composed.divergence})`],
        evaluatedAt: canonical.evaluatedAt,
      };
    },
  };
}

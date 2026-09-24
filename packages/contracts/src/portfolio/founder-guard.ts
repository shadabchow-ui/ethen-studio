/**
 * FND-02 — Founder lifecycle guard and capability kill switches.
 *
 * One product authority (the portfolio registry entry) drives all Founder
 * discovery and launch decisions. This helper exists so API surfaces and
 * launch routes share a single fail-closed decision instead of duplicating
 * lifecycle checks with drifting copy.
 *
 * Founder is an independent Product 11 — deliberately NOT a Fleet template
 * and NOT part of the frozen-product switch. Availability is fail-closed by
 * default: lifecycle "unavailable" denies every API surface until a later
 * certification job (FND-20) promotes the lifecycle.
 *
 * Operational capability gates default to disabled (fail closed) and are
 * independent of UI hiding:
 *   orchestrator_execution   — autonomous task/operating-cycle orchestration
 *   external_communications  — email, social, outreach
 *   spending                 — credits, billing, ads spend
 *   code_deploy              — repo provisioning and code/deploy actions
 *   publishing               — website publish / deployment
 *   connector_writes         — third-party connector writes
 * Opt in per capability via ETHEN_FOUNDER_ENABLE_CAPABILITIES; force off via
 * ETHEN_FOUNDER_DISABLE_CAPABILITIES (kill-switch semantics).
 */

import { getPortfolioEntry } from "./registry";
import type { PortfolioEntry } from "./types";

export const FOUNDER_PRODUCT_ID = "founder" as const;

export {
  FOUNDER_CAPABILITY_SWITCH_IDS,
} from "./founder-capability";
export type {
  FounderCapabilitySwitchId,
  FounderCapabilityGate,
} from "./founder-capability";

import {
  FOUNDER_CAPABILITY_SWITCH_IDS,
  type FounderCapabilitySwitchId,
  type FounderCapabilityGate,
} from "./founder-capability";

export type FounderAvailabilityDecision =
  | { allowed: true }
  | {
      allowed: false;
      status: 404;
      code: "PRODUCT_UNAVAILABLE";
      error: string;
    };

export type FounderCapabilityDecision =
  | { allowed: true; gate: FounderCapabilityGate }
  | {
      allowed: false;
      status: 503;
      code: "CAPABILITY_DISABLED";
      id: FounderCapabilitySwitchId;
      error: string;
      gate: FounderCapabilityGate;
    };

/** The registry entry governing Founder availability (one authority). */
export function getFounderPortfolioEntry(): PortfolioEntry | undefined {
  return getPortfolioEntry(FOUNDER_PRODUCT_ID);
}

/**
 * Fail-closed availability decision for Founder API surfaces.
 *
 * Default-deny: any unknown or non-certified lifecycle denies with a
 * PRODUCT_UNAVAILABLE error so launch surfaces can distinguish Founder's
 * unavailable state from a frozen product or a setup-required state without
 * misleading text.
 */
export function founderAvailabilityDecision(): FounderAvailabilityDecision {
  const entry = getFounderPortfolioEntry();
  if (!entry) {
    return {
      allowed: false,
      status: 404,
      code: "PRODUCT_UNAVAILABLE",
      error: "Founder is currently unavailable.",
    };
  }
  if (entry.lifecycle === "unavailable" || entry.lifecycle === "retired") {
    return {
      allowed: false,
      status: 404,
      code: "PRODUCT_UNAVAILABLE",
      error: `${entry.displayName} is currently unavailable.`,
    };
  }
  return { allowed: true };
}

function parseList(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Resolve Founder capability gates from environment.
 *
 * Defaults: every operational capability is disabled (fail closed) until
 * certification (FND-20). Explicit opt-in is required per capability.
 *
 * - ETHEN_FOUNDER_ENABLE_CAPABILITIES=orchestrator_execution,publishing
 * - ETHEN_FOUNDER_DISABLE_CAPABILITIES=spending (force-off override)
 */
export function getFounderCapabilityGates(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Record<FounderCapabilitySwitchId, FounderCapabilityGate> {
  const enabled = parseList(environment.ETHEN_FOUNDER_ENABLE_CAPABILITIES);
  const disabled = parseList(environment.ETHEN_FOUNDER_DISABLE_CAPABILITIES);

  const gates = {} as Record<FounderCapabilitySwitchId, FounderCapabilityGate>;
  for (const id of FOUNDER_CAPABILITY_SWITCH_IDS) {
    const forceOff = disabled.has(id);
    const optIn = enabled.has(id);
    gates[id] = {
      id,
      enabled: optIn && !forceOff,
      reason: forceOff
        ? "Disabled via ETHEN_FOUNDER_DISABLE_CAPABILITIES"
        : optIn
          ? null
          : "Founder capability disabled by default — fail closed until certification (FND-20).",
      source: forceOff || optIn ? "env" : "default",
    };
  }
  return gates;
}

/** Fail-closed decision for one operational capability. */
export function founderCapabilityDecision(
  capabilityId: FounderCapabilitySwitchId,
  environment?: Readonly<Record<string, string | undefined>>,
): FounderCapabilityDecision {
  const gate = getFounderCapabilityGates(environment)[capabilityId];
  if (!gate) {
    return {
      allowed: false,
      status: 503,
      code: "CAPABILITY_DISABLED",
      id: capabilityId,
      error: `Unknown Founder capability '${capabilityId}' — fail closed.`,
      gate: {
        id: capabilityId,
        enabled: false,
        reason: "Unknown capability — fail closed.",
        source: "default",
      },
    };
  }
  if (!gate.enabled) {
    return {
      allowed: false,
      status: 503,
      code: "CAPABILITY_DISABLED",
      id: capabilityId,
      error: gate.reason ?? `Founder capability '${capabilityId}' is disabled.`,
      gate,
    };
  }
  return { allowed: true, gate };
}

/**
 * Map founder capability ids (lib/founder-agent/capabilities.ts) to their
 * operational switch so visible controls report the gate truthfully.
 * Draft-only, local-only, and read-only capabilities (e.g. company_creation
 * drafts, website_preview, company_delete) are deliberately unmapped.
 */
export const FOUNDER_CAPABILITY_TO_SWITCH: Readonly<Record<string, FounderCapabilitySwitchId>> = {
  operating_cycles: "orchestrator_execution",
  run_task_now: "orchestrator_execution",
  email_outreach: "external_communications",
  social_posting: "external_communications",
  task_credits: "spending",
  billing: "spending",
  stripe_payments: "spending",
  payouts: "spending",
  ads: "spending",
  github_provisioning: "code_deploy",
  code_download: "code_deploy",
  website_publish: "publishing",
};

export const COMPUTER_USE_CAPABILITY_GATE = Object.freeze({
  capability: "computer_use",
  lifecycle: "gated_shared_capability",
  publicExposure: false,
  deletionGate: "SOL-41",
} as const);

export { getBrowserSandboxReadiness, type BrowserSandboxReadiness } from "./browser-sandbox";

/** Runtime facts must be independently supplied by the authenticated caller. */
export interface ComputerUseCapabilityEvidence {
  authenticated: boolean;
  projectAccess: boolean;
  enrolled: boolean;
  durableStorage: boolean;
  approvalAuthorityReady: boolean;
  auditProofReady: boolean;
  killSwitchApproved: boolean;
  sandbox: import("./browser-sandbox").BrowserSandboxReadiness;
}

export type ComputerUseCapabilityDecision =
  | { allowed: true }
  | { allowed: false; missing: readonly string[] };

/**
 * Replacement for a permissive feature flag: every dependency is required.
 * Local Playwright is intentionally insufficient for consequential routes.
 */
export function evaluateComputerUseCapability(
  evidence: ComputerUseCapabilityEvidence,
): ComputerUseCapabilityDecision {
  const missing: string[] = [];
  if (!evidence.authenticated) missing.push("authentication");
  if (!evidence.projectAccess) missing.push("project_access");
  if (!evidence.enrolled) missing.push("enrollment");
  if (!evidence.durableStorage) missing.push("durable_storage");
  if (!evidence.approvalAuthorityReady) missing.push("canonical_approval_authority");
  if (!evidence.auditProofReady) missing.push("audit_proof");
  if (!evidence.killSwitchApproved) missing.push("kill_switch");
  if (evidence.sandbox.status !== "secure_production") missing.push("sandbox_readiness");
  return missing.length === 0 ? { allowed: true } : { allowed: false, missing };
}

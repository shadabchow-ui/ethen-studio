/**
 * FND-02 — Founder capability switch contract.
 *
 * Moved out of `lib/portfolio/founder-guard.ts` so presentation packages can
 * name a capability gate without pulling the portfolio registry (and its
 * research/lifecycle tail) into a client bundle. The guard re-exports these
 * names, so every existing consumer keeps its import path.
 *
 * Declaration authority lives here; behaviour still lives in the guard.
 */

export const FOUNDER_CAPABILITY_SWITCH_IDS = [
  "orchestrator_execution",
  "external_communications",
  "spending",
  "code_deploy",
  "publishing",
  "connector_writes",
] as const;

export type FounderCapabilitySwitchId = (typeof FOUNDER_CAPABILITY_SWITCH_IDS)[number];

export interface FounderCapabilityGate {
  id: FounderCapabilitySwitchId;
  enabled: boolean;
  reason: string | null;
  source: "default" | "env";
}

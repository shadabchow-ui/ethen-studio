import type { CompanyLaunchMode } from "@ethen/contracts/founder-agent/types";

export type FounderAgentOutcomeId =
  | "foundation_mission_draft"
  | "mission_one_pager"
  | "business_model_snapshot"
  | "growth_audit";

export interface FounderAgentOutcomeCatalogItem {
  id: FounderAgentOutcomeId;
  label: string;
  description: string;
  creditCost: number | null;
  modes: readonly CompanyLaunchMode[];
}

export const FOUNDER_AGENT_OUTCOME_CATALOG = [
  {
    id: "foundation_mission_draft",
    label: "Foundation Mission Draft",
    description:
      "Drafts the initial mission statement and positioning for a new company concept.",
    creditCost: null,
    modes: ["new-company"],
  },
  {
    id: "mission_one_pager",
    label: "Mission One-Pager",
    description:
      "Condenses the company mission into a concise one-page brief for sharing.",
    creditCost: null,
    modes: ["new-company"],
  },
  {
    id: "business_model_snapshot",
    label: "Business Model Snapshot",
    description:
      "Summarizes the early business model, audience, and monetization assumptions.",
    creditCost: null,
    modes: ["new-company", "grow-company"],
  },
  {
    id: "growth_audit",
    label: "Growth Audit",
    description:
      "Reviews an existing company and flags likely growth gaps and next actions.",
    creditCost: null,
    modes: ["grow-company"],
  },
] as const satisfies readonly FounderAgentOutcomeCatalogItem[];

export function listFounderAgentOutcomes(
  mode?: CompanyLaunchMode
): readonly FounderAgentOutcomeCatalogItem[] {
  if (!mode) return FOUNDER_AGENT_OUTCOME_CATALOG;
  return FOUNDER_AGENT_OUTCOME_CATALOG.filter((outcome) =>
    outcome.modes.some((candidate) => candidate === mode)
  );
}

export function getFounderAgentOutcomeById(
  id: FounderAgentOutcomeId
): FounderAgentOutcomeCatalogItem {
  const outcome = FOUNDER_AGENT_OUTCOME_CATALOG.find((entry) => entry.id === id);
  if (!outcome) {
    throw new Error(`Unknown Founder Agent outcome id: ${id}`);
  }
  return outcome;
}

export function formatFounderAgentOutcomeCreditCost(
  outcome: Pick<FounderAgentOutcomeCatalogItem, "creditCost">
): string {
  return outcome.creditCost === null ? "pricing not provided" : `${outcome.creditCost} credits`;
}

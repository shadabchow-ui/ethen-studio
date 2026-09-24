import { AGENT_TRUST_STATES } from "@ethen/contracts/agents/trust-states";
import type { Agent } from "@ethen/contracts/agents/types";
import {
  getFleetVisibleAgentSlugs,
  getPortfolioEntryByAgentSlug,
} from "@ethen/contracts/portfolio/registry";
import { getFlagshipRuntimeMappingByAgentSlug } from "@ethen/contracts/portfolio/flagship-map";

export interface CompatibilityAliasEntry {
  slug: string;
  owner: string;
  reason: string;
  migrationCondition: string;
  canonicalRoute: string;
}

/** Narrow compatibility allowlist with owner, reason, migration condition, and canonical route. */
export const COMPATIBILITY_ALLOWLIST: readonly CompatibilityAliasEntry[] = [
  {
    slug: "code-helper",
    owner: "Ethen Core / Code Team",
    reason: "Legacy coding agent slug replaced by flagship Code surface",
    migrationCondition: "Retire after session migration to /code",
    canonicalRoute: "/code",
  },
  {
    slug: "research-assistant",
    owner: "Ethen Research Team",
    reason: "Legacy research assistant slug replaced by flagship Research surface",
    migrationCondition: "Retire after session migration to /research",
    canonicalRoute: "/research",
  },
  {
    slug: "workflow-automation-agent",
    owner: "Ethen Automation Team",
    reason: "Deprecated workflow automation slug replaced by flagship flow-agent",
    migrationCondition: "Retire after session migration to /agents/flow-agent",
    canonicalRoute: "/agents/flow-agent",
  },
  // ETHEN-READY-007: Fleet templates retired — keep slugs accessible for historical session resolution.
  {
    slug: "writing-assistant",
    owner: "Ethen Model Team",
    reason: "Fleet template retired ETHEN-READY-007; slug kept for historical session compatibility",
    migrationCondition: "Retire after session migration window closes",
    canonicalRoute: "/agents/writing-assistant/launch",
  },
  {
    slug: "job-search-agent",
    owner: "Ethen Model Team",
    reason: "Fleet template retired ETHEN-READY-007; slug kept for historical session compatibility",
    migrationCondition: "Retire after session migration window closes",
    canonicalRoute: "/agents/job-search-agent/launch",
  },
  {
    slug: "vm-agent",
    owner: "Ethen Platform Team",
    reason: "Legacy Local Models VM agent slug — merged into Local Models flagship",
    migrationCondition: "Retire after local models runtime consolidation",
    canonicalRoute: "/local-models",
  },
] as const;

/** Explicit compatibility agent aliases for legacy direct URL lookup / historical sessions. */
export const EXPLICIT_COMPATIBILITY_ALIASES: readonly string[] = COMPATIBILITY_ALLOWLIST.map((c) => c.slug);

/** Internal helper agents available only via internal APIs. */
export const INTERNAL_HELPER_AGENT_SLUGS: readonly string[] = [
  "chatbot-agent",
] as const;

/** Attach trust state to agent object. */
export function withTrustState(agent: Agent): Agent {
  return { ...agent, runtime_trust_state: AGENT_TRUST_STATES[agent.slug] ?? "preview" };
}

/** Check if an agent slug is eligible for Fleet marketplace listing. */
export function isAgentSlugFleetEligible(slug: string): boolean {
  const fleetSlugs = getFleetVisibleAgentSlugs();
  return fleetSlugs.has(slug);
}

/** Check if an agent is authorized for public catalog listing (Marketplace / Fleet). */
export function isAgentAuthorizedForListing(agent: {
  slug: string;
  status: string;
  visibility: string;
}): boolean {
  if (agent.status === "hidden" || agent.status === "deprecated") return false;
  if (agent.visibility !== "public") return false;
  return isAgentSlugFleetEligible(agent.slug);
}

/** Check if an agent slug is authorized for direct public route lookup (/agents/[slug]). */
export function isAgentSlugAuthorizedForDirectLookup(
  slug: string,
  options?: { allowInternal?: boolean },
): boolean {
  if (options?.allowInternal) return true;

  // 1. Authorized Fleet listing agent
  if (isAgentSlugFleetEligible(slug)) return true;

  // 2. Direct route for a registered portfolio workspace / platform flagship runtime
  //    Retired templates are only authorized if they appear in the compatibility allowlist.
  const entry = getPortfolioEntryByAgentSlug(slug);
  if (entry && (entry.kind === "workspace" || entry.kind === "platform" || entry.kind === "template") && entry.evidence.routeExists) {
    // Reject retired lifecycle templates that are not in the compatibility allowlist
    if (entry.lifecycle === "retired" && !EXPLICIT_COMPATIBILITY_ALIASES.includes(slug)) {
      return false;
    }
    return true;
  }

  // 3. Flagship runtime agent mapping
  const flagship = getFlagshipRuntimeMappingByAgentSlug(slug);
  if (flagship) return true;

  // 4. Explicit compatibility alias
  if (EXPLICIT_COMPATIBILITY_ALIASES.includes(slug)) return true;

  return false;
}

/** Observable filter logging (server-side only, no private payload leakage). */
export function logFilteredAgentsObservability(info: {
  source: string;
  filteredCount: number;
  totalRemaining: number;
}): void {
  if (process.env.NODE_ENV === "development" || process.env.ETHEN_LOG_QUERY_PARITY) {
    console.debug(
      `[AgentQueryParity] source=${info.source} filteredCount=${info.filteredCount} totalRemaining=${info.totalRemaining}`,
    );
  }
}

import type { Agent } from "@ethen/contracts/agents/types";
import { SEED_AGENTS } from "@ethen/config/mock/seed-agents";
import {
  EXPLICIT_COMPATIBILITY_ALIASES,
  isAgentAuthorizedForListing,
  isAgentSlugAuthorizedForDirectLookup,
  withTrustState,
} from "./authorization";
import { PORTFOLIO_REGISTRY } from "@ethen/contracts/portfolio/registry";

// ---------------------------------------------------------------------------
// Static registry helpers — SEED_AGENTS is the single canonical agent source.
// All surfaces (marketplace, detail pages, launch route, workspace routing)
// should read through these helpers, not import SEED_AGENTS or ETHEN_AGENTS
// directly for display purposes.
// ---------------------------------------------------------------------------

const PUBLIC_AGENTS = SEED_AGENTS.filter(isAgentAuthorizedForListing)
  .sort((a, b) => a.sort_order - b.sort_order)
  .map(withTrustState);

const SEARCHABLE_AGENT_FIELDS = PUBLIC_AGENTS.map((agent) => ({
  agent,
  queryText: [
    agent.name,
    agent.description,
    agent.category,
    agent.long_description,
  ]
    .join("\n")
    .toLowerCase(),
}));

export function getAgents(opts?: {
  category?: string;
  query?: string;
  featuredOnly?: boolean;
}): Agent[] {
  let results = PUBLIC_AGENTS;

  if (opts?.featuredOnly) {
    results = results.filter((agent) => agent.is_featured);
  }

  // "top-picks" is a marketplace alias for featured — handled by featuredOnly
  if (opts?.category && opts.category !== "all" && opts.category !== "top-picks") {
    results = results.filter((agent) => agent.category === opts.category);
  }

  if (opts?.query) {
    const q = opts.query.toLowerCase();
    results = SEARCHABLE_AGENT_FIELDS.filter(({ agent, queryText }) => {
      if (!results.includes(agent)) return false;
      return queryText.includes(q);
    }).map(({ agent }) => agent);
  }

  return results;
}

export function getAgentBySlug(slug: string, options?: { allowInternal?: boolean }): Agent | undefined {
  if (!isAgentSlugAuthorizedForDirectLookup(slug, options)) {
    return undefined;
  }
  const agent = SEED_AGENTS.find((a) => a.slug === slug);
  return agent ? withTrustState(agent) : undefined;
}

export function getAllSlugs(): string[] {
  const listingSlugs = PUBLIC_AGENTS.map((a) => a.slug);
  const authorizedDirectSlugs = PORTFOLIO_REGISTRY.filter(
    (e) => (e.kind === "workspace" || e.kind === "platform") && e.agentSlug && e.evidence.routeExists,
  ).map((e) => e.agentSlug as string);

  const set = new Set<string>([
    ...listingSlugs,
    ...authorizedDirectSlugs,
    ...EXPLICIT_COMPATIBILITY_ALIASES,
  ]);
  return Array.from(set).sort();
}

export function getCategoryCounts(): Record<string, number> {
  return getAgents().reduce<Record<string, number>>((acc, agent) => {
    acc[agent.category] = (acc[agent.category] ?? 0) + 1;
    return acc;
  }, {});
}

/** Category counts shaped for the marketplace filter tabs. */
export function getMarketplaceCategoryCounts(): Record<string, number> {
  const agents = getAgents();
  const counts = agents.reduce<Record<string, number>>((acc, agent) => {
    acc[agent.category] = (acc[agent.category] ?? 0) + 1;
    return acc;
  }, {});
  counts["top-picks"] = agents.filter((a) => a.is_featured).length;
  counts["all"] = agents.length;
  return counts;
}

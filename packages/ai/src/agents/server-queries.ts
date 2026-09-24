import "server-only";

import { hasSupabaseEnv } from "@ethen/config/runtime-flags";
import { SEED_AGENTS } from "@ethen/config/mock/seed-agents";
import {
  isAgentAuthorizedForListing,
  isAgentSlugAuthorizedForDirectLookup,
  logFilteredAgentsObservability,
  withTrustState,
} from "./authorization";
import { getAllSlugs } from "./queries";
import type { Agent, AgentProductMeta, AgentTemplate, AgentOutputType, WorkspaceArchetype } from "@ethen/contracts/agents/types";

// ── DB row shape (matches agents table after migration 0005) ─────────────────

interface AgentDbRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  long_description: string | null;
  icon: string | null;
  workspace_archetype: string;
  status: string;
  visibility: string;
  is_featured: boolean;
  sort_order: number;
  credit_cost: number;
  example_prompts: string[] | null;
  route_id: string | null;
  product_meta: AgentProductMeta | null;
}

const DB_COLUMNS =
  "id,name,slug,category,description,long_description,icon,workspace_archetype,status,visibility,is_featured,sort_order,credit_cost,example_prompts,route_id,product_meta";

// ── Mapping helpers ──────────────────────────────────────────────────────────

/** Normalize legacy string[] templates to AgentTemplate[]. */
function normalizeTemplates(raw: unknown): AgentTemplate[] | undefined {
  if (!raw) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const normalized: AgentTemplate[] = [];

  for (const template of raw) {
    if (typeof template === "string") {
      normalized.push({ title: template, description: template, prompt: template });
      continue;
    }

    if (
      template &&
      typeof template === "object" &&
      typeof (template as Record<string, unknown>).prompt === "string"
    ) {
      const obj = template as Record<string, unknown>;
      normalized.push({
        title: typeof obj.title === "string" ? obj.title : String(obj.prompt),
        description: typeof obj.description === "string" ? obj.description : String(obj.prompt),
        prompt: String(obj.prompt),
        outputType:
          typeof obj.outputType === "string"
            ? (obj.outputType as AgentOutputType)
            : undefined,
        setupNote: typeof obj.setupNote === "string" ? obj.setupNote : undefined,
      });
    }
  }

  return normalized;
}

function dbRowToAgent(row: AgentDbRow): Agent {
  const meta: AgentProductMeta = row.product_meta ?? {};
  return withTrustState({
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    description: row.description ?? "",
    long_description: row.long_description ?? row.description ?? "",
    icon: row.icon ?? "",
    workspace_archetype: row.workspace_archetype as WorkspaceArchetype,
    status: row.status as Agent["status"],
    visibility: row.visibility as Agent["visibility"],
    is_featured: row.is_featured,
    sort_order: row.sort_order,
    credit_cost: row.credit_cost,
    example_prompts: row.example_prompts ?? [],
    route_id: row.route_id ?? "text-general",
    job_one_liner: meta.job_one_liner,
    user_segments: meta.user_segments,
    output_type: meta.output_type,
    example_outputs: meta.example_outputs,
    templates: normalizeTemplates(meta.templates),
    limitations: meta.limitations,
    related_agents: meta.related_agents,
    tool_ids: meta.tool_ids,
  });
}

function seedAgentsWithTrust(agents: Agent[]): Agent[] {
  return agents.map(withTrustState);
}

// ── Server query helpers ─────────────────────────────────────────────────────
// All functions attempt the DB when Supabase is configured and fall back to
// SEED_AGENTS when it is not (local/demo mode).
// Both paths enforce portfolio truth authorization parity.

export async function getAgentsServer(opts?: {
  category?: string;
  query?: string;
  featuredOnly?: boolean;
}): Promise<Agent[]> {
  let rawAgents: Agent[] = [];
  let querySource = "seed";

  if (hasSupabaseEnv()) {
    try {
      const { createClient } = await import("@ethen/database/server");
      const supabase = await createClient();

      let q = supabase
        .from("agents")
        .select(DB_COLUMNS)
        .in("status", ["active", "beta"])
        .eq("visibility", "public")
        .order("sort_order", { ascending: true });

      if (opts?.featuredOnly) q = q.eq("is_featured", true);
      if (opts?.category && opts.category !== "all" && opts.category !== "top-picks") {
        q = q.eq("category", opts.category);
      }

      const { data, error } = await q;
      if (!error && data && data.length > 0) {
        rawAgents = (data as AgentDbRow[]).map(dbRowToAgent);
        querySource = "supabase";
      }
    } catch {
      // Fall through to seed fallback
    }
  }

  if (rawAgents.length === 0) {
    let results = SEED_AGENTS;
    if (opts?.featuredOnly) results = results.filter((a) => a.is_featured);
    if (opts?.category && opts.category !== "all" && opts.category !== "top-picks") {
      results = results.filter((a) => a.category === opts.category);
    }
    rawAgents = seedAgentsWithTrust(results.sort((a, b) => a.sort_order - b.sort_order));
  }

  // Filter both DB and seed fallback through the exact same portfolio authorization predicate
  const countBeforeFilter = rawAgents.length;
  let agents = rawAgents.filter(isAgentAuthorizedForListing);
  const filteredCount = countBeforeFilter - agents.length;

  if (filteredCount > 0) {
    logFilteredAgentsObservability({
      source: querySource,
      filteredCount,
      totalRemaining: agents.length,
    });
  }

  if (opts?.query) {
    const lower = opts.query.toLowerCase();
    agents = agents.filter(
      (a) =>
        a.name.toLowerCase().includes(lower) ||
        a.description.toLowerCase().includes(lower) ||
        a.category.toLowerCase().includes(lower) ||
        a.long_description.toLowerCase().includes(lower),
    );
  }

  return agents.sort((a, b) => a.sort_order - b.sort_order);
}

export async function getAgentBySlugServer(
  slug: string,
  options?: { allowInternal?: boolean },
): Promise<Agent | undefined> {
  if (!isAgentSlugAuthorizedForDirectLookup(slug, options)) {
    return undefined;
  }

  if (hasSupabaseEnv()) {
    try {
      const { createClient } = await import("@ethen/database/server");
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("agents")
        .select(DB_COLUMNS)
        .eq("slug", slug)
        .single();
      if (!error && data) return dbRowToAgent(data as AgentDbRow);
    } catch {
      // Fall through to seed fallback
    }
  }

  const agent = SEED_AGENTS.find((a) => a.slug === slug);
  return agent ? withTrustState(agent) : undefined;
}

export async function getAllAgentSlugsServer(): Promise<string[]> {
  return getAllSlugs();
}

export async function getMarketplaceCategoryCountsServer(): Promise<Record<string, number>> {
  const agents = await getAgentsServer();
  const counts = agents.reduce<Record<string, number>>((acc, agent) => {
    acc[agent.category] = (acc[agent.category] ?? 0) + 1;
    return acc;
  }, {});
  counts["top-picks"] = agents.filter((a) => a.is_featured).length;
  counts["all"] = agents.length;
  return counts;
}

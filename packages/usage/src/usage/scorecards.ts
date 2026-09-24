import "server-only";

import { createClient } from "@ethen/database/server";
import { hasSupabaseEnv } from "@ethen/config/runtime-flags";

export interface ScorecardMetric {
  label: string;
  value: string | number;
  detail?: string;
  status: "available" | "not-provided" | "partial";
}

export interface AgentScorecard {
  agentId: string;
  agentSlug: string;
  agentName: string;
  metrics: ScorecardMetric[];
}

export interface PlatformScorecard {
  totalSessions: ScorecardMetric;
  totalMessages: ScorecardMetric;
  totalSavedArtifacts: ScorecardMetric;
  totalFavorites: ScorecardMetric;
  agentsWithSessions: ScorecardMetric;
  rerunRate: ScorecardMetric;
  toolFailureRate: ScorecardMetric;
  topAgents: ScorecardMetric[];
  agentScorecards: ScorecardMetric[];
}

async function countSessions(): Promise<number | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("sessions")
      .select("*", { count: "exact", head: true });
    if (error) return null;
    return count;
  } catch {
    return null;
  }
}

async function countMessages(): Promise<number | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true });
    if (error) return null;
    return count;
  } catch {
    return null;
  }
}

async function countArtifacts(): Promise<number | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("artifacts")
      .select("*", { count: "exact", head: true });
    if (error) return null;
    return count;
  } catch {
    return null;
  }
}

async function countFavorites(): Promise<number | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("favorites")
      .select("*", { count: "exact", head: true });
    if (error) return null;
    return count;
  } catch {
    return null;
  }
}

async function countToolFailures(): Promise<{ failed: number; total: number } | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const { count: total, error: totalErr } = await supabase
      .from("tool_traces")
      .select("*", { count: "exact", head: true });
    if (totalErr) return null;

    const { count: failed, error: failedErr } = await supabase
      .from("tool_traces")
      .select("*", { count: "exact", head: true })
      .in("state", ["failed", "skipped", "blocked"]);
    if (failedErr) return null;

    return { failed: failed ?? 0, total: total ?? 0 };
  } catch {
    return null;
  }
}

async function getTopAgentsBySessions(limit = 5): Promise<{ slug: string; count: number }[] | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("agent_id")
      .not("agent_id", "is", null);

    if (error || !data) return null;

    const counts = new Map<string, number>();
    for (const row of data as { agent_id: string }[]) {
      counts.set(row.agent_id, (counts.get(row.agent_id) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([slug, count]) => ({ slug, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  } catch {
    return null;
  }
}

async function computeRerunRate(): Promise<number | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("agent_id, user_id")
      .not("agent_id", "is", null);
    if (error || !data) return null;

    const userAgentPairs = new Map<string, number>();
    for (const row of data as { user_id: string; agent_id: string }[]) {
      const key = `${row.user_id}:${row.agent_id}`;
      userAgentPairs.set(key, (userAgentPairs.get(key) ?? 0) + 1);
    }

    const rerunCount = Array.from(userAgentPairs.values()).filter((c) => c > 1).length;
    return userAgentPairs.size > 0 ? rerunCount / userAgentPairs.size : 0;
  } catch {
    return null;
  }
}

function toMetric(
  label: string,
  value: string | number | null | undefined,
  detail?: string
): ScorecardMetric {
  if (value === null || value === undefined) {
    return {
      label,
      value: "not provided",
      status: "not-provided",
      detail: detail ?? "No data source available for this metric.",
    };
  }
  return {
    label,
    value,
    status: "available",
    detail,
  };
}

export async function computePlatformScorecard(): Promise<PlatformScorecard> {
  const [sessions, messages, artifacts, favorites, toolFailures, topAgents, rerunRate] =
    await Promise.all([
      countSessions(),
      countMessages(),
      countArtifacts(),
      countFavorites(),
      countToolFailures(),
      getTopAgentsBySessions(),
      computeRerunRate(),
    ]);

  const topAgentMetrics: ScorecardMetric[] = topAgents
    ? topAgents.map((a) => toMetric(
        a.slug,
        `${a.count} sessions`,
        "Most-launched agent by session count."
      ))
    : [toMetric("Top agents", null, "Agent launch data is not available.")];

  return {
    totalSessions: toMetric(
      "Total sessions",
      sessions,
      "Total agent workspace sessions launched."
    ),
    totalMessages: toMetric(
      "Total messages",
      messages,
      "Total messages across all sessions."
    ),
    totalSavedArtifacts: toMetric(
      "Saved artifacts",
      artifacts,
      "Total saved outputs and artifacts."
    ),
    totalFavorites: toMetric(
      "Favorited agents",
      favorites,
      "Total agent favorites across users."
    ),
    agentsWithSessions: toMetric(
      "Agents with sessions",
      topAgents ? topAgents.length : null,
      "Number of distinct agents that have been launched."
    ),
    rerunRate: toMetric(
      "Rerun rate",
      rerunRate !== null ? `${(rerunRate * 100).toFixed(1)}%` : null,
      "Fraction of user-agent pairs with more than one session."
    ),
    toolFailureRate: toMetric(
      "Tool failure rate",
      toolFailures
        ? `${toolFailures.total > 0 ? ((toolFailures.failed / toolFailures.total) * 100).toFixed(1) : "0"}%`
        : null,
      toolFailures
        ? `${toolFailures.failed} failures out of ${toolFailures.total} tool traces.`
        : undefined
    ),
    topAgents: topAgentMetrics,
    agentScorecards: [
      toMetric("Retention by category", null, "Category-level retention requires time-series data not yet collected."),
      toMetric("Export/share rate", null, "Export and share events are not tracked in this version."),
      toMetric("API success rate", null, "Per-API call success/failure is not instrumented yet."),
      toMetric("Weekly active users", null, "Time-series WAU aggregation is not available."),
      toMetric("Conversion rate", null, "Billing and conversion tracking are not implemented."),
    ],
  };
}

import "server-only";

import type {
  GatewayPlatformContext,
  GatewayPlatformProject,
  GatewayUsageEventRecord,
  GatewayUsageSummary,
  GatewayUsageSummaryRow,
} from "./types";
import { listGatewayProjectsForCurrentUser } from "./api-keys";
import { createServiceClient } from "@ethen/database/service";

function normalizeUsageEvent(
  row: Record<string, unknown>,
  projectName?: string | null,
): GatewayUsageEventRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    gatewayRequestLogId: typeof row.gateway_request_log_id === "string" ? row.gateway_request_log_id : null,
    gatewayApiKeyId: typeof row.gateway_api_key_id === "string" ? row.gateway_api_key_id : null,
    userId: typeof row.user_id === "string" ? row.user_id : null,
    traceId: typeof row.trace_id === "string" ? row.trace_id : null,
    providerId: typeof row.provider_id === "string" ? row.provider_id : null,
    modelId: typeof row.model_id === "string" ? row.model_id : null,
    routeId: typeof row.route_id === "string" ? row.route_id : null,
    eventType: String(row.event_type ?? "gateway.request"),
    inputTokens: typeof row.input_tokens === "number" ? row.input_tokens : 0,
    outputTokens: typeof row.output_tokens === "number" ? row.output_tokens : 0,
    estimatedCostUsd: row.estimated_cost_usd == null ? 0 : Number(row.estimated_cost_usd),
    createdAt: String(row.created_at),
    projectName: projectName ?? null,
  };
}

function reduceRows(
  events: GatewayUsageEventRecord[],
  dimension: GatewayUsageSummaryRow["dimension"],
  getKey: (event: GatewayUsageEventRecord) => string,
  getLabel: (event: GatewayUsageEventRecord) => string,
): GatewayUsageSummaryRow[] {
  const map = new Map<string, GatewayUsageSummaryRow>();

  for (const event of events) {
    const key = getKey(event);
    const label = getLabel(event);
    const row = map.get(key) ?? {
      dimension,
      key,
      label,
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    };
    row.requestCount += 1;
    row.inputTokens += event.inputTokens ?? 0;
    row.outputTokens += event.outputTokens ?? 0;
    row.estimatedCostUsd += event.estimatedCostUsd ?? 0;
    map.set(key, row);
  }

  return [...map.values()].sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd || b.requestCount - a.requestCount);
}

export async function getGatewayUsageSummary(options?: {
  projectId?: string;
  limit?: number;
}): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  summary: GatewayUsageSummary;
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  const emptySummary: GatewayUsageSummary = {
    totals: {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    },
    rows: [],
    events: [],
  };

  if (context.state !== "ready" || !context.service) {
    return { context, project: null, summary: emptySummary };
  }

  const scopedProject = options?.projectId ? projects.find((entry) => entry.id === options.projectId) ?? null : null;
  if (options?.projectId && !scopedProject) {
    return {
      context: { ...context, state: "unauthenticated", reason: "Project access denied for Gateway usage." },
      project: null,
      summary: emptySummary,
    };
  }

  const projectIds = options?.projectId ? [options.projectId] : projects.map((project) => project.id);
  if (projectIds.length === 0) {
    return { context, project: scopedProject, summary: emptySummary };
  }

  const { data, error } = await context.service
    .from("gateway_usage_events")
    .select("*")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 200);

  if (error) {
    return {
      context: { ...context, state: "setup-required", reason: error.message },
      project: scopedProject,
      summary: emptySummary,
    };
  }

  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const events = (data ?? []).map((row) =>
    normalizeUsageEvent(
      row as Record<string, unknown>,
      projectNames.get(String((row as Record<string, unknown>).project_id)) ?? null,
    ),
  );

  const totals = events.reduce(
    (acc, event) => {
      acc.requestCount += 1;
      acc.inputTokens += event.inputTokens ?? 0;
      acc.outputTokens += event.outputTokens ?? 0;
      acc.estimatedCostUsd += event.estimatedCostUsd ?? 0;
      return acc;
    },
    {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    },
  );

  const rows = [
    ...reduceRows(
      events,
      "project",
      (event) => event.projectId,
      (event) => event.projectName ?? event.projectId,
    ),
    ...reduceRows(
      events,
      "model",
      (event) => event.modelId ?? "unknown-model",
      (event) => event.modelId ?? "Unknown model",
    ),
    ...reduceRows(
      events,
      "provider",
      (event) => event.providerId ?? "unknown-provider",
      (event) => event.providerId ?? "Unknown provider",
    ),
  ];

  return {
    context,
    project: scopedProject,
    summary: {
      totals,
      rows,
      events,
    },
  };
}

export interface GatewayUsageEventInput {
  projectId: string;
  gatewayRequestLogId?: string | null;
  gatewayApiKeyId?: string | null;
  userId?: string | null;
  traceId?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  routeId?: string | null;
  eventType?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
  /** True when token counts are estimated (e.g. from character count) rather than reported by the provider. */
  usageEstimated?: boolean;
  metadata?: Record<string, unknown> | null;
}

export async function recordGatewayUsageEvent(
  input: GatewayUsageEventInput,
): Promise<{ id: string } | { error: string }> {
  const service = createServiceClient();
  if (!service) return { error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("gateway_usage_events")
    .insert({
      project_id: input.projectId,
      gateway_request_log_id: input.gatewayRequestLogId ?? null,
      gateway_api_key_id: input.gatewayApiKeyId ?? null,
      user_id: input.userId ?? null,
      trace_id: input.traceId ?? null,
      provider_id: input.providerId ?? null,
      model_id: input.modelId ?? null,
      route_id: input.routeId ?? null,
      event_type: input.eventType ?? "gateway.request",
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      estimated_cost_usd: input.estimatedCostUsd ?? null,
      usage_estimated: input.usageEstimated ?? false,
      metadata: input.metadata ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: String((data as Record<string, unknown>).id) };
}

import "server-only";

import type {
  GatewayPlatformContext,
  GatewayPlatformProject,
  GatewayProviderAttemptRecord,
  GatewayRequestLogRecord,
} from "./types";
import { listGatewayProjectsForCurrentUser } from "./api-keys";
import { createServiceClient } from "@ethen/database/service";

function normalizeAttempt(row: Record<string, unknown>): GatewayProviderAttemptRecord {
  return {
    id: String(row.id),
    requestLogId: String(row.request_log_id),
    projectId: String(row.project_id),
    attemptNumber: Number(row.attempt_number ?? 0),
    providerId: String(row.provider_id ?? "unknown"),
    modelId: typeof row.model_id === "string" ? row.model_id : null,
    succeeded: Boolean(row.succeeded),
    errorCode: typeof row.error_code === "string" ? row.error_code : null,
    errorMessageRedacted: typeof row.error_message_redacted === "string" ? row.error_message_redacted : null,
    latencyMs: typeof row.latency_ms === "number" ? row.latency_ms : null,
    outcome: row.outcome === "succeeded" ? "succeeded" : "failed",
    inputTokens: typeof row.input_tokens === "number" ? row.input_tokens : null,
    outputTokens: typeof row.output_tokens === "number" ? row.output_tokens : null,
    estimatedCostUsd: row.estimated_cost_usd == null ? null : Number(row.estimated_cost_usd),
    priceRecordId: typeof row.price_record_id === "string" ? row.price_record_id : null,
    createdAt: String(row.created_at),
  };
}

function normalizeLog(
  row: Record<string, unknown>,
  attempts: GatewayProviderAttemptRecord[],
  projectName?: string | null,
): GatewayRequestLogRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    gatewayApiKeyId: typeof row.gateway_api_key_id === "string" ? row.gateway_api_key_id : null,
    userId: typeof row.user_id === "string" ? row.user_id : null,
    requestId: String(row.request_id),
    traceId: typeof row.trace_id === "string" ? row.trace_id : null,
    routeId: typeof row.route_id === "string" ? row.route_id : null,
    modelId: typeof row.model_id === "string" ? row.model_id : null,
    providerId: typeof row.provider_id === "string" ? row.provider_id : null,
    statusCode: typeof row.status_code === "number" ? row.status_code : null,
    latencyMs: typeof row.latency_ms === "number" ? row.latency_ms : null,
    estimatedCostUsd: typeof row.estimated_cost_usd === "number" ? row.estimated_cost_usd : Number(row.estimated_cost_usd ?? 0),
    inputTokens: typeof row.input_tokens === "number" ? row.input_tokens : null,
    outputTokens: typeof row.output_tokens === "number" ? row.output_tokens : null,
    fallbackUsed: Boolean(row.fallback_used),
    errorCode: typeof row.error_code === "string" ? row.error_code : null,
    createdAt: String(row.created_at),
    projectName: projectName ?? null,
    attempts,
  };
}

export async function listGatewayRequestLogs(options?: {
  projectId?: string;
  limit?: number;
}): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  logs: GatewayRequestLogRecord[];
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.service) {
    return { context, project: null, logs: [] };
  }

  const scopedProject = options?.projectId ? projects.find((entry) => entry.id === options.projectId) ?? null : null;
  if (options?.projectId && !scopedProject) {
    return {
      context: { ...context, state: "unauthenticated", reason: "Project access denied for Gateway logs." },
      project: null,
      logs: [],
    };
  }

  const projectIds = options?.projectId ? [options.projectId] : projects.map((project) => project.id);
  if (projectIds.length === 0) {
    return { context, project: scopedProject, logs: [] };
  }

  const { data: logRows, error: logError } = await context.service
    .from("gateway_request_logs")
    .select("*")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50);

  if (logError) {
    return {
      context: { ...context, state: "setup-required", reason: logError.message },
      project: scopedProject,
      logs: [],
    };
  }

  const requestLogIds = (logRows ?? []).map((row) => String((row as Record<string, unknown>).id));
  const attemptsByRequestId = new Map<string, GatewayProviderAttemptRecord[]>();

  if (requestLogIds.length > 0) {
    const { data: attemptRows, error: attemptError } = await context.service
      .from("gateway_provider_attempts")
      .select("*")
      .in("request_log_id", requestLogIds)
      .order("attempt_number", { ascending: true });

    if (attemptError) {
      return {
        context: { ...context, state: "setup-required", reason: attemptError.message },
        project: scopedProject,
        logs: [],
      };
    }

    for (const row of attemptRows ?? []) {
      const attempt = normalizeAttempt(row as Record<string, unknown>);
      const bucket = attemptsByRequestId.get(attempt.requestLogId) ?? [];
      bucket.push(attempt);
      attemptsByRequestId.set(attempt.requestLogId, bucket);
    }
  }

  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  return {
    context,
    project: scopedProject,
    logs: (logRows ?? []).map((row) =>
      normalizeLog(
        row as Record<string, unknown>,
        attemptsByRequestId.get(String((row as Record<string, unknown>).id)) ?? [],
        projectNames.get(String((row as Record<string, unknown>).project_id)) ?? null,
      ),
    ),
  };
}

export interface GatewayRequestLogInput {
  projectId: string;
  gatewayApiKeyId?: string | null;
  userId?: string | null;
  requestId: string;
  traceId?: string | null;
  routeId?: string | null;
  modelId?: string | null;
  providerId?: string | null;
  statusCode?: number | null;
  latencyMs?: number | null;
  estimatedCostUsd?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  fallbackUsed?: boolean;
  errorCode?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface GatewayProviderAttemptInput {
  requestLogId: string;
  projectId: string;
  attemptNumber: number;
  providerId: string;
  modelId?: string | null;
  succeeded: boolean;
  errorCode?: string | null;
  errorMessageRedacted?: string | null;
  latencyMs?: number | null;
  outcome?: "succeeded" | "failed";
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
  priceRecordId?: string | null;
}

export async function insertGatewayRequestLog(
  input: GatewayRequestLogInput,
): Promise<{ id: string } | { error: string }> {
  const service = createServiceClient();
  if (!service) return { error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("gateway_request_logs")
    .insert({
      project_id: input.projectId,
      gateway_api_key_id: input.gatewayApiKeyId ?? null,
      user_id: input.userId ?? null,
      request_id: input.requestId,
      trace_id: input.traceId ?? null,
      route_id: input.routeId ?? null,
      model_id: input.modelId ?? null,
      provider_id: input.providerId ?? null,
      status_code: input.statusCode ?? null,
      latency_ms: input.latencyMs ?? null,
      estimated_cost_usd: input.estimatedCostUsd ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      fallback_used: input.fallbackUsed ?? false,
      error_code: input.errorCode ?? null,
      metadata: input.metadata ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: String((data as Record<string, unknown>).id) };
}

export async function recordProviderAttempt(
  input: GatewayProviderAttemptInput,
): Promise<{ id: string } | { error: string }> {
  const service = createServiceClient();
  if (!service) return { error: "Supabase service client is unavailable." };

  const { data, error } = await service
    .from("gateway_provider_attempts")
    .insert({
      request_log_id: input.requestLogId,
      project_id: input.projectId,
      attempt_number: input.attemptNumber,
      provider_id: input.providerId,
      model_id: input.modelId ?? null,
      succeeded: input.succeeded,
      error_code: input.errorCode ?? null,
      error_message_redacted: input.errorMessageRedacted ?? null,
      latency_ms: input.latencyMs ?? null,
      outcome: input.outcome ?? (input.succeeded ? "succeeded" : "failed"),
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      estimated_cost_usd: input.estimatedCostUsd ?? null,
      price_record_id: input.priceRecordId ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: String((data as Record<string, unknown>).id) };
}

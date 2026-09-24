import "server-only";

import type {
  GatewayBudgetLimitRecord,
  GatewayPlatformContext,
  GatewayPlatformProject,
} from "./types";
import { listGatewayProjectsForCurrentUser } from "./api-keys";
import { createServiceClient } from "@ethen/database/service";

export type GatewayExecutionState = "in_progress" | "succeeded" | "failed";

export interface BudgetCheckResult {
  allowed: boolean;
  reason: string | null;
  limitExceeded: "daily_usd" | "monthly_usd" | "monthly_tokens" | null;
  currentSpend: number | null;
  limitValue: number | null;
  window: "daily" | "monthly" | null;
  /**
   * GW-OBS-001 execution idempotency. Exactly one caller per
   * (project, idempotency key) receives `claimed: true` and may dispatch to the
   * provider. Duplicates receive `claimed: false` plus the durable state of the
   * original execution so they can replay it rather than re-spend.
   *
   * `null` means the claim protocol did not run (soft enforcement).
   */
  claimed: boolean | null;
  executionState: GatewayExecutionState | null;
  replayStatus: number | null;
  replayBody: unknown;
}

function normalizeBudget(row: Record<string, unknown>): GatewayBudgetLimitRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    monthlyUsdLimit: row.monthly_usd_limit == null ? null : Number(row.monthly_usd_limit),
    dailyUsdLimit: row.daily_usd_limit == null ? null : Number(row.daily_usd_limit),
    monthlyTokenLimit: row.monthly_token_limit == null ? null : Number(row.monthly_token_limit),
    createdBy: typeof row.created_by === "string" ? row.created_by : null,
    updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listGatewayBudgetLimits(options?: {
  projectId?: string;
}): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  budgets: GatewayBudgetLimitRecord[];
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.service) {
    return { context, project: null, budgets: [] };
  }

  const scopedProject = options?.projectId ? projects.find((entry) => entry.id === options.projectId) ?? null : null;
  if (options?.projectId && !scopedProject) {
    return {
      context: { ...context, state: "unauthenticated", reason: "Project access denied for Gateway budget metadata." },
      project: null,
      budgets: [],
    };
  }

  const projectIds = options?.projectId ? [options.projectId] : projects.map((project) => project.id);
  if (projectIds.length === 0) {
    return { context, project: scopedProject, budgets: [] };
  }

  const { data, error } = await context.service
    .from("gateway_budget_limits")
    .select("*")
    .in("project_id", projectIds)
    .order("updated_at", { ascending: false });

  if (error) {
    return {
      context: { ...context, state: "setup-required", reason: error.message },
      project: scopedProject,
      budgets: [],
    };
  }

  return {
    context,
    project: scopedProject,
    budgets: (data ?? []).map((row) => normalizeBudget(row as Record<string, unknown>)),
  };
}

function startOfDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonth(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export type BudgetEnforcementMode = "hard" | "soft";

export async function checkBudgetLimits(
  projectId: string,
  options?: { enforcementMode?: BudgetEnforcementMode },
): Promise<BudgetCheckResult> {
  const service = createServiceClient();
  if (!service) {
    // FAIL-CLOSED: If Supabase is unavailable and this project has budget
    // configuration, cost-incurring requests must not proceed silently.
    // We cannot determine budget status without storage, so deny the request.
    // Private-alpha bypass: set GATEWAY_BYPASS_BUDGET_CHECK=true in env
    // to allow all requests when Supabase is unavailable (local dev only).
    const bypass =
      process.env.NODE_ENV !== "production" &&
      process.env.GATEWAY_BYPASS_BUDGET_CHECK === "true";
    if (bypass) {
      return { allowed: true, reason: "Budget check bypassed (GATEWAY_BYPASS_BUDGET_CHECK).", limitExceeded: null, currentSpend: null, limitValue: null, window: null, claimed: null, executionState: null, replayStatus: null, replayBody: null };
    }
    return { allowed: false, reason: "Gateway storage is unavailable. Budget enforcement requires a configured Supabase instance.", limitExceeded: null, currentSpend: null, limitValue: null, window: null, claimed: null, executionState: null, replayStatus: null, replayBody: null };
  }

  const { data: budgetRows, error: budgetError } = await service
    .from("gateway_budget_limits")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (budgetError || !budgetRows) {
    // hard mode: missing row means deny-by-default when enforcement is hard (pre-paid). soft means allow.
    if (options?.enforcementMode === "hard") {
      return { allowed: false, reason: "No budget limit configured and enforcement is hard — request denied until budget is set.", limitExceeded: null, currentSpend: null, limitValue: null, window: null, claimed: null, executionState: null, replayStatus: null, replayBody: null };
    }
    return { allowed: true, reason: null, limitExceeded: null, currentSpend: null, limitValue: null, window: null, claimed: null, executionState: null, replayStatus: null, replayBody: null };
  }
  // Hard enforcement: atomically reserve budget AND claim the single execution
  // slot for this idempotency key (migration 0096). Exactly one caller gets
  // claimed=true; duplicates get the durable state of the original execution.
  //
  // 0095's gateway_atomic_reserve reserved once but told BOTH concurrent
  // callers allowed=true, so the provider was dispatched twice for one
  // reservation and real spend could exceed a hard budget (GW-OBS-001).
  if (options?.enforcementMode === "hard") {
    const extra = options as unknown as {
      estimatedCostUsd?: number;
      idempotencyKey?: string;
      estimatedTokens?: number;
      requestId?: string;
    };
    const estCost = extra.estimatedCostUsd ?? 0.005;
    const idemKey = extra.idempotencyKey ?? null;
    try {
      const { data: rpcData, error: rpcError } = await service.rpc("gateway_reserve_and_claim", {
        p_project_id: projectId,
        p_estimated_cost_usd: estCost,
        p_idempotency_key: idemKey,
        p_estimated_tokens: extra.estimatedTokens ?? null,
        p_request_id: extra.requestId ?? null,
      });

      if (!rpcError && rpcData) {
        const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as Record<string, unknown>;
        const allowed = Boolean(row.allowed);
        if (!allowed) {
          return {
            allowed: false,
            reason: (row.reason as string | null) ?? "Budget limit exceeded (atomic).",
            limitExceeded: "daily_usd" as const,
            currentSpend: null, limitValue: null, window: null,
            claimed: false, executionState: null, replayStatus: null, replayBody: null,
          };
        }
        return {
          allowed: true,
          reason: row.already_reserved ? "already reserved (idempotent)" : null,
          limitExceeded: null, currentSpend: null, limitValue: null, window: null,
          claimed: Boolean(row.claimed),
          executionState: (row.execution_state as GatewayExecutionState | null) ?? null,
          replayStatus: (row.response_status as number | null) ?? null,
          replayBody: row.response_body ?? null,
        };
      }

      // RPC error => fail closed for hard budgets.
      if (rpcError) {
        return {
          allowed: false,
          reason: `Hard budget enforcement requires atomic reservation but DB error: ${rpcError.message}`,
          limitExceeded: null, currentSpend: null, limitValue: null, window: null,
          claimed: false, executionState: null, replayStatus: null, replayBody: null,
        };
      }
    } catch (e) {
      return {
        allowed: false,
        reason: `Hard budget atomic reservation failed: ${e instanceof Error ? e.message : String(e)}`,
        limitExceeded: null, currentSpend: null, limitValue: null, window: null,
        claimed: false, executionState: null, replayStatus: null, replayBody: null,
      };
    }
  }

  const budget = normalizeBudget(budgetRows as Record<string, unknown>);
  const dayStart = startOfDay();
  const monthStart = startOfMonth();

  if (budget.dailyUsdLimit != null) {
    const { data: dailyEvents, error: dailyError } = await service
      .from("gateway_usage_events")
      .select("estimated_cost_usd")
      .eq("project_id", projectId)
      .gte("created_at", dayStart);

    if (!dailyError && dailyEvents) {
      const dailySpend = dailyEvents.reduce(
        (sum, row) => sum + (Number((row as Record<string, unknown>).estimated_cost_usd ?? 0) || 0),
        0,
      );
      if (dailySpend >= budget.dailyUsdLimit) {
        return {
          allowed: false,
          reason: `Daily spend limit of $${budget.dailyUsdLimit} exceeded. Current spend: $${dailySpend.toFixed(4)}.`,
          limitExceeded: "daily_usd",
          currentSpend: dailySpend,
          limitValue: budget.dailyUsdLimit,
          window: "daily",
          claimed: null,
          executionState: null,
          replayStatus: null,
          replayBody: null,
        };
      }
    }
  }

  if (budget.monthlyUsdLimit != null) {
    const { data: monthlyEvents, error: monthlyError } = await service
      .from("gateway_usage_events")
      .select("estimated_cost_usd")
      .eq("project_id", projectId)
      .gte("created_at", monthStart);

    if (!monthlyError && monthlyEvents) {
      const monthlySpend = monthlyEvents.reduce(
        (sum, row) => sum + (Number((row as Record<string, unknown>).estimated_cost_usd ?? 0) || 0),
        0,
      );
      if (monthlySpend >= budget.monthlyUsdLimit) {
        return {
          allowed: false,
          reason: `Monthly spend limit of $${budget.monthlyUsdLimit} exceeded. Current spend: $${monthlySpend.toFixed(4)}.`,
          limitExceeded: "monthly_usd",
          currentSpend: monthlySpend,
          limitValue: budget.monthlyUsdLimit,
          window: "monthly",
          claimed: null,
          executionState: null,
          replayStatus: null,
          replayBody: null,
        };
      }
    }
  }

  if (budget.monthlyTokenLimit != null) {
    const { data: tokenEvents, error: tokenError } = await service
      .from("gateway_usage_events")
      .select("input_tokens, output_tokens")
      .eq("project_id", projectId)
      .gte("created_at", monthStart);

    if (!tokenError && tokenEvents) {
      const monthlyTokens = tokenEvents.reduce(
        (sum, row) => {
          const r = row as Record<string, unknown>;
          return sum + (Number(r.input_tokens ?? 0) || 0) + (Number(r.output_tokens ?? 0) || 0);
        },
        0,
      );
      if (monthlyTokens >= budget.monthlyTokenLimit) {
        return {
          allowed: false,
          reason: `Monthly token limit of ${budget.monthlyTokenLimit.toLocaleString()} exceeded. Current tokens: ${monthlyTokens.toLocaleString()}.`,
          limitExceeded: "monthly_tokens",
          currentSpend: monthlyTokens,
          limitValue: budget.monthlyTokenLimit,
          window: "monthly",
          claimed: null,
          executionState: null,
          replayStatus: null,
          replayBody: null,
        };
      }
    }
  }

  return { allowed: true, reason: null, limitExceeded: null, currentSpend: null, limitValue: null, window: null, claimed: null, executionState: null, replayStatus: null, replayBody: null };
}

/**
 * Record the terminal outcome of a claimed execution so later duplicates replay
 * it instead of re-dispatching billable provider work (GW-OBS-001).
 *
 * Best-effort: a failure here must never fail an otherwise good response, but
 * it is logged because it leaves the record in `in_progress`, which duplicates
 * treat as non-dispatchable rather than silently retrying billable work.
 */
export async function completeGatewayExecution(input: {
  projectId: string;
  idempotencyKey: string;
  state: "succeeded" | "failed";
  responseStatus?: number | null;
  responseBody?: unknown;
}): Promise<boolean> {
  const service = createServiceClient();
  if (!service) return false;
  try {
    const { error } = await service.rpc("gateway_complete_execution", {
      p_project_id: input.projectId,
      p_idempotency_key: input.idempotencyKey,
      p_execution_state: input.state,
      p_response_status: input.responseStatus ?? null,
      p_response_body: input.responseBody ?? null,
    });
    if (error) {
      console.error("[gateway] failed to settle execution idempotency record:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[gateway] failed to settle execution idempotency record:", e);
    return false;
  }
}

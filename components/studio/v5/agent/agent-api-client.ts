/**
 * STUDIO_17 — agent API client (client-safe fetch wrappers over the V1
 * agent routes). Failures surface as typed AgentApiError with actionable
 * status text, never silent empty.
 */

import type { AgentApprovalView, AgentEventView, AgentPatchView, AgentPlanView, AgentRunView } from "./types";
import { translateStudioAuthFailure } from "@/components/studio/auth/studio-auth-action";

export class AgentApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly dependency: string | null;
  constructor(status: number, code: string, message: string, dependency: string | null = null) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
    this.code = code;
    this.dependency = dependency;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: T;
    error?: { code?: string; message?: string; details?: { dependency?: string } };
  } | null;
  if (!response.ok || !body?.ok) {
    const code = body?.error?.code ?? "REQUEST_FAILED";
    // S4C: mutation 401s open the Clerk modal; reads fail to signed-out
    // states instead (never auto-modal on background fetches).
    const method = (init?.method ?? "GET").toString().toUpperCase();
    if (method !== "GET" && method !== "HEAD") translateStudioAuthFailure(response.status, code, "agent");
    throw new AgentApiError(
      response.status,
      code,
      body?.error?.message ?? `Request failed (${response.status}).`,
      body?.error?.details?.dependency ?? null,
    );
  }
  return body.data as T;
}

export async function fetchAgentRuns(projectId: string): Promise<AgentRunView[]> {
  const data = await request<{ runs: AgentRunView[] }>(
    `/api/studio/v1/agent/runs?projectId=${encodeURIComponent(projectId)}`,
  );
  return data.runs;
}

export async function createAgentRun(input: {
  projectId: string;
  title: string;
  brief: string;
  internalCeilingIcu: number;
  idempotencyKey: string;
}): Promise<AgentRunView> {
  const data = await request<{ run: AgentRunView }>(`/api/studio/v1/agent/runs`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.run;
}

export interface AgentDetail {
  run: AgentRunView;
  plans: AgentPlanView[];
  patches: AgentPatchView[];
  approvals: AgentApprovalView[];
  events: AgentEventView[];
}

export async function fetchAgentDetail(projectId: string, runId: string): Promise<AgentDetail> {
  return request<AgentDetail>(
    `/api/studio/v1/agent/runs/${encodeURIComponent(runId)}?projectId=${encodeURIComponent(projectId)}`,
  );
}

export async function appendAgentPlan(input: {
  projectId: string;
  runId: string;
  goal: string;
  constraints: string[];
  steps: { key: string; title: string; action: string; deps: string[]; estimatedIcu: number }[];
  pins: Record<string, string>;
  quoteId?: string | null;
  patch?: { baseGraph: unknown; ops: unknown[] } | null;
}): Promise<{ plan: AgentPlanView; patch: AgentPatchView | null }> {
  return request<{ plan: AgentPlanView; patch: AgentPatchView | null }>(
    `/api/studio/v1/agent/runs/${encodeURIComponent(input.runId)}/plans`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function decideAgentApproval(input: {
  projectId: string;
  runId: string;
  kind?: "execute" | "publish";
  capIcu?: number;
  approvalId?: string;
  decision?: "granted" | "denied";
}): Promise<AgentApprovalView> {
  const data = await request<{ approval: AgentApprovalView }>(
    `/api/studio/v1/agent/runs/${encodeURIComponent(input.runId)}/approvals`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return data.approval;
}

export async function advanceAgentRun(input: {
  projectId: string;
  runId: string;
  to?: string;
  skipReason?: string | null;
  raiseTier?: string;
  approvalId?: string;
}): Promise<AgentRunView> {
  const data = await request<{ run: AgentRunView }>(
    `/api/studio/v1/agent/runs/${encodeURIComponent(input.runId)}/advance`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return data.run;
}

export async function stopAgentRun(projectId: string, runId: string): Promise<AgentRunView> {
  const data = await request<{ run: AgentRunView }>(
    `/api/studio/v1/agent/runs/${encodeURIComponent(runId)}/stop`,
    { method: "POST", body: JSON.stringify({ projectId }) },
  );
  return data.run;
}

export async function publishAgentRun(input: {
  projectId: string;
  runId: string;
  channel: string;
  assetClass: string;
  approvalId?: string | null;
  authorityId?: string | null;
}): Promise<AgentRunView> {
  const data = await request<{ run: AgentRunView }>(
    `/api/studio/v1/agent/runs/${encodeURIComponent(input.runId)}/publish`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return data.run;
}

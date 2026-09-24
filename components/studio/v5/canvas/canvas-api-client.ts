/**
 * STUDIO_13 — Canvas API client (client-safe fetch wrappers over the V1
 * workflow routes). All responses are `{ ok, data }`; failures surface as
 * typed CanvasApiError with actionable status text, never silent empty.
 */

import type {
  CanvasEstimate,
  CanvasGraphSummary,
  CanvasRevisionSummary,
  CanvasRunProjection,
  WorkflowAppDefinition,
} from "./types";

export function fetchGraphs(projectId: string): Promise<{ graphs: CanvasGraphSummary[]; source: string }> {
  return request(
    `/api/studio/v1/workflows/graphs?projectId=${encodeURIComponent(projectId)}`,
  );
}

export function createGraph(input: {
  projectId: string;
  name?: string;
  templateId?: string;
}): Promise<{ graphId: string; revision: number }> {
  return request("/api/studio/v1/workflows/graphs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function saveRevision(input: {
  projectId: string;
  graphId: string;
  baseRevision: number;
  graph: import("./types").CanvasGraph;
}): Promise<{ revision: number; sha256: string; dagHash: string }> {
  return request(
    `/api/studio/v1/workflows/graphs/${encodeURIComponent(input.graphId)}/revisions`,
    {
      method: "POST",
      body: JSON.stringify({ projectId: input.projectId, baseRevision: input.baseRevision, graph: input.graph }),
    },
  );
}

export class CanvasApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly dependency: string | null;
  constructor(status: number, code: string, message: string, dependency: string | null = null) {
    super(message);
    this.name = "CanvasApiError";
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
    throw new CanvasApiError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? `Request failed (${response.status}).`,
      body?.error?.details?.dependency ?? null,
    );
  }
  return body.data as T;
}

export interface CreateRunResponse {
  runId: string;
  status: string;
  recompute: string[];
  reuse: string[];
}

export function fetchRunProjection(runId: string, projectId: string): Promise<CanvasRunProjection> {
  return request<CanvasRunProjection>(
    `/api/studio/v1/workflows/runs/${encodeURIComponent(runId)}?projectId=${encodeURIComponent(projectId)}`,
  );
}

export function fetchGraphWorkspace(
  graphId: string,
  projectId: string,
): Promise<{ graph: import("./types").CanvasGraph; revisions: import("./types").CanvasRevisionSummary[] }> {
  return request(
    `/api/studio/v1/workflows/graphs/${encodeURIComponent(graphId)}?projectId=${encodeURIComponent(projectId)}`,
  );
}

export function createCanvasRun(input: {
  projectId: string;
  graphId: string;
  revision: number;
  budgetIcu: number;
  selection?: string[];
}): Promise<CreateRunResponse> {
  return request<CreateRunResponse>("/api/studio/v1/workflows/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelCanvasRun(runId: string, projectId: string, reason: string): Promise<{ status: string }> {
  return request(`/api/studio/v1/workflows/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ projectId, reason }),
  });
}

export function retryCanvasRun(runId: string, projectId: string): Promise<{ status: string }> {
  return request(`/api/studio/v1/workflows/runs/${encodeURIComponent(runId)}/retry`, {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export function fetchRevisions(graphId: string, projectId: string): Promise<{ revisions: CanvasRevisionSummary[] }> {
  return request(
    `/api/studio/v1/workflows/graphs/${encodeURIComponent(graphId)}/revisions?projectId=${encodeURIComponent(projectId)}`,
  );
}

export function fetchEstimate(input: {
  projectId: string;
  graphId: string;
  revision: number;
  selection?: string[];
}): Promise<CanvasEstimate> {
  const params = new URLSearchParams({
    projectId: input.projectId,
    revision: String(input.revision),
  });
  if (input.selection?.length) params.set("selection", input.selection.join(","));
  return request(`/api/studio/v1/workflows/graphs/${encodeURIComponent(input.graphId)}/estimate?${params}`);
}

export function freezeCanvasApp(input: {
  projectId: string;
  graphId: string;
  revision: number;
  appId: string;
  invoke: string[];
  manage: string[];
}): Promise<{ app: WorkflowAppDefinition }> {
  return request("/api/studio/v1/workflows/apps", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

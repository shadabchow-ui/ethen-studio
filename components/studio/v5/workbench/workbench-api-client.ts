/**
 * STUDIO_14 — workbench API client (client-safe fetch wrappers over the
 * V1 workbench routes). Failures surface as typed WorkbenchApiError with
 * actionable status text, never silent empty.
 */

import type {
  CinemaSceneView,
  CinemaSequenceView,
  CinemaShotView,
  WorkbenchHeadView,
  WorkbenchRenderView,
  WorkbenchRevisionView,
  WorkbenchTrackView,
} from "./types";

export class WorkbenchApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly dependency: string | null;
  constructor(status: number, code: string, message: string, dependency: string | null = null) {
    super(message);
    this.name = "WorkbenchApiError";
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
    throw new WorkbenchApiError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? `Request failed (${response.status}).`,
      body?.error?.details?.dependency ?? null,
    );
  }
  return body.data as T;
}

export interface TimelineListResponse {
  timelines: WorkbenchHeadView[];
}

export interface TimelineDetailResponse {
  head: WorkbenchHeadView;
  revision: {
    revision: number;
    recipeHash: string;
    recipe: { tracks: WorkbenchTrackView[]; captionTracks: WorkbenchRevisionView["captionTracks"] };
  } | null;
}

export async function fetchTimelines(projectId: string): Promise<WorkbenchHeadView[]> {
  const payload = await request<TimelineListResponse>(
    `/api/studio/v1/workbench/timelines?projectId=${encodeURIComponent(projectId)}`,
  );
  return payload.timelines;
}

export async function createTimeline(input: {
  projectId: string;
  title: string;
  timescale?: number;
  fps?: { num: number; den: number };
}): Promise<{ timelineId: string; revision: number; hash: string }> {
  return request("/api/studio/v1/workbench/timelines", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchTimelineDetail(
  projectId: string,
  timelineId: string,
): Promise<TimelineDetailResponse> {
  return request(
    `/api/studio/v1/workbench/timelines/${encodeURIComponent(timelineId)}?projectId=${encodeURIComponent(projectId)}`,
  );
}

export interface AppendRevisionResponse {
  timelineId: string;
  revision: number;
  hash: string;
}

export async function appendTimelineRevision(input: {
  projectId: string;
  timelineId: string;
  expectedParent: number;
  op: Record<string, unknown>;
  probes?: Record<string, unknown>[];
}): Promise<AppendRevisionResponse> {
  return request(
    `/api/studio/v1/workbench/timelines/${encodeURIComponent(input.timelineId)}/revisions`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export interface SubmitRenderResponse {
  render: WorkbenchRenderView;
  replayed: boolean;
}

export async function submitTimelineRender(input: {
  projectId: string;
  timelineId: string;
  revision?: number;
  output: { container: "mp4"; videoCodec: "h264"; width: number; height: number; audioCodec: "aac" | "none"; captionBurnIn: boolean };
  interchange?: "none" | "otio" | "fcpxml";
  idempotencyKey?: string;
}): Promise<SubmitRenderResponse> {
  return request("/api/studio/v1/workbench/renders", { method: "POST", body: JSON.stringify(input) });
}

export async function fetchSequences(projectId: string): Promise<CinemaSequenceView[]> {
  const payload = await request<{ sequences: CinemaSequenceView[] }>(
    `/api/studio/v1/workbench/cinema/sequences?projectId=${encodeURIComponent(projectId)}`,
  );
  return payload.sequences;
}

export async function createSequence(input: {
  projectId: string;
  title: string;
  fps?: { num: number; den: number };
}): Promise<{ sequence: CinemaSequenceView }> {
  return request("/api/studio/v1/workbench/cinema/sequences", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface SequenceDetailResponse {
  sequence: CinemaSequenceView;
  scenes: CinemaSceneView[];
  shots: CinemaShotView[];
}

export async function fetchSequenceDetail(projectId: string, sequenceId: string): Promise<SequenceDetailResponse> {
  return request(
    `/api/studio/v1/workbench/cinema/sequences/${encodeURIComponent(sequenceId)}?projectId=${encodeURIComponent(projectId)}`,
  );
}

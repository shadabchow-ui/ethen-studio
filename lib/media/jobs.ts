import type {
  MediaJob,
  MediaJobState,
  MediaMode,
  MediaModality,
  MediaCapability,
  MediaAsset,
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaJobResult,
  MediaParams,
  MediaProject,
  MediaProjectKind,
  ProviderError,
} from "./types";
import { getDefaultModel, getModelById, getDefaultCapability } from "./models";

// ─── In-memory stores (NON-DURABLE — cleared on refresh/restart) ──────────

/** Non-durable in-memory job store. Lost on page refresh or server restart. */
const JOB_STORE = new Map<string, MediaJob>();

/** Non-durable in-memory asset store. Lost on page refresh or server restart. */
const ASSET_STORE = new Map<string, MediaAsset>();

/** Storage durability label — honest about in-memory nature. */
export const MEDIA_JOB_STORE_DURABILITY = "non_durable" as const;
export const MEDIA_ASSET_STORE_DURABILITY = "non_durable" as const;

// NOTE: usage-event recording (recordMediaUsage / recordFailedJobUsage) lives in
// lib/media/usage-recording.ts, not here. This file is shared with client-side
// mock simulation (lib/media/mock.ts -> MediaWorkspace), so it must never import
// anything that transitively pulls in "server-only"/"next/headers" (Supabase
// server client, usage ledger, etc.) — even via dynamic import(), since Next's
// client bundler still resolves and rejects those at build time. Server-only
// callers (lib/media/providers/openai.ts, API routes) call the recording
// functions directly after invoking job lifecycle functions below.

// ─── Helpers ─────────────────────────────────────────────────────────────

function modeToModality(mode?: MediaMode | null): MediaModality {
  if (mode === "video" || mode === "motion") return "video";
  if (mode === "audio") return "audio";
  return "image";
}

function modeToCapability(mode?: MediaMode | null, requestCapability?: string | null): string {
  return requestCapability ?? getDefaultCapability(mode ?? "image");
}

// ─── Job creation ────────────────────────────────────────────────────────

export function createJob(request: MediaGenerationRequest): MediaJob {
  const model = request.modelId
    ? getModelById(request.modelId)
    : getDefaultModel(request.mode ?? "image");

  const providerName = model?.provider ?? "Mock Provider";
  const modelName = model?.displayName ?? "Mock Model";
  const modelId = model?.id ?? "mock";
  const modality = request.modality ?? modeToModality(request.mode);
  const capability = String(modeToCapability(request.mode, request.capability));

  const now = new Date().toISOString();
  const jobId = `media-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const job: MediaJob = {
    id: jobId,
    status: "queued",
    state: "queued",
    mode: request.mode ?? "image",
    modality,
    capability,
    prompt: request.prompt,
    negativePrompt: request.negativePrompt ?? null,
    providerId: request.providerId ?? "mock",
    providerName,
    modelId,
    modelName,
    sessionId: request.sessionId ?? null,
    projectId: request.projectId ?? null,
    params: request.params ?? null,
    config: request.config ?? null,
    progress: 0,
    assetId: null,
    result: null,
    error: null,
    createdAt: now,
    startedAt: null,
    updatedAt: now,
    completedAt: null,
    expiresAt: null,
    retryCount: 0,
    originalJobId: null,
    initiatedBy: request.initiatedBy ?? null,
    estimatedCredits: model?.estimatedCredits ?? null,
  };

  JOB_STORE.set(job.id, job);
  return job;
}

// ─── Job lifecycle ───────────────────────────────────────────────────────

const JOB_LIFECYCLE: MediaJobState[] = [
  "queued",
  "planning",
  "running",
  "processing",
  "completed",
];

export function advanceJob(jobId: string): MediaJob | null {
  const job = JOB_STORE.get(jobId);
  if (!job) return null;

  const terminalStates: MediaJobState[] = ["completed", "failed", "canceled", "expired"];
  if (terminalStates.includes(job.status)) return job;

  const nextIndex = JOB_LIFECYCLE.indexOf(job.status) + 1;
  if (nextIndex >= JOB_LIFECYCLE.length) return job;

  const now = new Date().toISOString();
  job.status = JOB_LIFECYCLE[nextIndex];
  job.state = job.status;

  if (job.status === "running" && !job.startedAt) {
    job.startedAt = now;
  }

  job.updatedAt = now;

  const progressMap: Record<string, number> = {
    queued: 0,
    planning: 15,
    running: 40,
    processing: 75,
    completed: 100,
  };
  job.progress = progressMap[job.status] ?? job.progress;

  if (job.status === "completed") {
    job.completedAt = now;
    const asset = createMockAsset(job);
    job.assetId = asset.id;
    ASSET_STORE.set(asset.id, asset);
  }

  JOB_STORE.set(job.id, job);
  return job;
}

export function setJobStatus(jobId: string, status: MediaJobState, error?: ProviderError): MediaJob | null {
  const job = JOB_STORE.get(jobId);
  if (!job) return null;
  job.status = status;
  job.state = status;
  job.updatedAt = new Date().toISOString();
  if (status === "running" && !job.startedAt) {
    job.startedAt = job.updatedAt;
  }
  if (error) {
    job.error = error;
  }
  JOB_STORE.set(job.id, job);
  return job;
}

export function setJobProgress(jobId: string, progress: number): MediaJob | null {
  const job = JOB_STORE.get(jobId);
  if (!job) return null;
  job.progress = Math.max(0, Math.min(100, progress));
  job.updatedAt = new Date().toISOString();
  JOB_STORE.set(job.id, job);
  return job;
}

/** Stores provider-specific metadata (e.g. fal queue request id) for later polling. */
export function setJobOutput(jobId: string, output: Record<string, unknown>): MediaJob | null {
  const job = JOB_STORE.get(jobId);
  if (!job) return null;
  job.output = { ...(job.output ?? {}), ...output };
  job.updatedAt = new Date().toISOString();
  JOB_STORE.set(job.id, job);
  return job;
}

export function setJobResult(jobId: string, result: MediaJobResult): MediaJob | null {
  const job = JOB_STORE.get(jobId);
  if (!job) return null;
  const now = new Date().toISOString();
  job.status = "completed";
  job.state = "completed";
  job.progress = 100;
  job.result = result;
  job.completedAt = now;
  job.updatedAt = now;
  JOB_STORE.set(job.id, job);

  return job;
}

export function failJob(jobId: string, errorMessage: string): MediaJob | null {
  const job = JOB_STORE.get(jobId);
  if (!job) return null;

  const terminalStates: MediaJobState[] = ["completed", "failed", "canceled", "expired"];
  if (terminalStates.includes(job.status)) return job;

  job.status = "failed";
  job.state = "failed";
  job.error = {
    code: "unknown",
    message: errorMessage,
    retryable: false,
    statusCode: 500,
  };
  job.updatedAt = new Date().toISOString();
  JOB_STORE.set(job.id, job);

  return job;
}

export function cancelJob(jobId: string): MediaJob | null {
  const job = JOB_STORE.get(jobId);
  if (!job) return null;

  const terminalStates: MediaJobState[] = ["completed", "failed", "canceled", "expired"];
  if (terminalStates.includes(job.status)) return null;

  job.status = "canceled";
  job.state = "canceled";
  job.updatedAt = new Date().toISOString();
  JOB_STORE.set(job.id, job);
  return job;
}

export function retryJob(jobId: string): MediaJob | null {
  const existing = JOB_STORE.get(jobId);
  if (!existing) return null;

  const nonRetryable: MediaJobState[] = ["completed", "queued", "planning", "running", "processing"];
  if (nonRetryable.includes(existing.status)) return null;

  const now = new Date().toISOString();
  const newJob: MediaJob = {
    id: `media-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "queued",
    state: "queued",
    mode: existing.mode,
    modality: existing.modality,
    capability: existing.capability,
    modelId: existing.modelId ?? "mock",
    modelName: existing.modelName ?? "Mock Model",
    providerId: existing.providerId ?? "mock",
    providerName: existing.providerName ?? "Mock Provider",
    prompt: existing.prompt,
    negativePrompt: existing.negativePrompt,
    params: existing.params,
    config: existing.config,
    projectId: existing.projectId,
    result: null,
    resultUrl: null,
    assetId: null,
    error: null,
    progress: 0,
    createdAt: now,
    startedAt: null,
    updatedAt: now,
    completedAt: null,
    expiresAt: null,
    retryCount: (existing.retryCount ?? 0) + 1,
    originalJobId: existing.id,
    initiatedBy: existing.initiatedBy,
  };

  JOB_STORE.set(newJob.id, newJob);
  return newJob;
}

export function expireJob(jobId: string): MediaJob | null {
  const job = JOB_STORE.get(jobId);
  if (!job) return null;

  const terminalStates: MediaJobState[] = ["completed", "failed", "canceled"];
  if (terminalStates.includes(job.status)) return null;

  job.status = "expired";
  job.state = "expired";
  job.updatedAt = new Date().toISOString();
  JOB_STORE.set(job.id, job);
  return job;
}

export function expireOldJobs(): MediaJob[] {
  const expired: MediaJob[] = [];
  const now = Date.now();
  for (const [, job] of JOB_STORE) {
    const terminalStates: MediaJobState[] = ["completed", "failed", "canceled", "expired"];
    if (terminalStates.includes(job.status)) continue;
    const created = new Date(job.createdAt).getTime();
    if (now - created > 3600000) {
      job.status = "expired";
      job.state = "expired";
      job.updatedAt = new Date().toISOString();
      expired.push(job);
    }
  }
  return expired;
}

export function getJob(jobId: string): MediaJob | null {
  return JOB_STORE.get(jobId) ?? null;
}

export function getJobCount(): number {
  return JOB_STORE.size;
}

export function resolveJobResponse(job: MediaJob): MediaGenerationResponse {
  const asset = job.assetId ? ASSET_STORE.get(job.assetId) ?? null : null;

  return {
    ok: true,
    job,
    jobId: job.id,
    state: job.status,
    asset,
    providerAvailable: false,
    providerName: job.providerName ?? "Mock",
    modelName: job.modelName ?? "Mock",
  };
}

// ─── Mock Asset Generation ───────────────────────────────────────────────

function createMockAsset(job: MediaJob): MediaAsset {
  const now = new Date().toISOString();
  const baseId = `asset-${job.id}`;

  const base: MediaAsset = {
    id: baseId,
    type: job.modality,
    modality: job.modality,
    url: null,
    thumbnailUrl: null,
    jobId: job.id,
    projectId: job.projectId,
    prompt: job.prompt,
    providerName: job.providerName ?? "Mock",
    modelName: job.modelName ?? "Mock",
    source: "mock",
    isMock: true,
    createdAt: now,
    mimeType: null,
    width: null,
    height: null,
  };

  switch (job.modality) {
    case "video":
      return {
        ...base,
        width: 1920,
        height: 1080,
        duration: 10,
        aspectRatio: "16:9",
        mimeType: "video/mp4",
      };
    case "audio":
      return {
        ...base,
        duration: 30,
        mimeType: "audio/mpeg",
      };
    default:
      return {
        ...base,
        width: 1024,
        height: 1024,
        aspectRatio: "1:1",
        mimeType: "image/png",
      };
  }
}

// ─── List helpers ────────────────────────────────────────────────────────

export function listJobs(filter?: { modality?: MediaModality }): MediaJob[] {
  const jobs = Array.from(JOB_STORE.values());
  if (filter?.modality) {
    return jobs.filter((j) => j.modality === filter.modality);
  }
  return jobs;
}

export function listJobsByModality(modality: MediaModality): MediaJob[] {
  return listJobs({ modality });
}

export function listJobsByStatus(status: MediaJobState): MediaJob[] {
  return Array.from(JOB_STORE.values()).filter((j) => j.status === status);
}

export function listAssets(filter?: { modality?: MediaModality; jobId?: string }): MediaAsset[] {
  let assets = Array.from(ASSET_STORE.values());
  if (filter?.modality) {
    assets = assets.filter((a) => a.modality === filter.modality);
  }
  if (filter?.jobId) {
    assets = assets.filter((a) => a.jobId === filter.jobId);
  }
  return assets;
}

// ─── Project store (delegates to projects.ts) ────────────────────────────

import { addProject as addProjectV1, getProjects, getProjectById as getProjectV1ById } from "./projects";

export function createProject(input: { name: string; description?: string | null; kind?: MediaProjectKind; modality?: MediaModality | null }): MediaProject {
  return addProjectV1({
    name: input.name,
    description: input.description,
    kind: input.kind,
    modality: input.modality,
    status: "active",
  });
}

export function listProjects(): MediaProject[] {
  return getProjects();
}

export function getProjectById(id: string): MediaProject | undefined {
  return getProjectV1ById(id);
}

// ─── Store reset ─────────────────────────────────────────────────────────

export function clearStores(): void {
  JOB_STORE.clear();
  ASSET_STORE.clear();
}

export function resetMediaStore(): void {
  clearStores();
}

// ─── Durable storage hooks (called by server-side sync layer) ────────────

export function hydrateJobStore(newJobs: MediaJob[]): void {
  JOB_STORE.clear();
  for (const job of newJobs) {
    JOB_STORE.set(job.id, job);
  }
}

export function hydrateJobAssetStore(newAssets: MediaAsset[]): void {
  ASSET_STORE.clear();
  for (const asset of newAssets) {
    ASSET_STORE.set(asset.id, asset);
  }
}

export function snapshotJobStore(): MediaJob[] {
  return Array.from(JOB_STORE.values());
}

export function snapshotJobAssetStore(): MediaAsset[] {
  return Array.from(ASSET_STORE.values());
}

import "server-only";

import { insertUsageEvent } from "@ethen/usage/server";
import type { MediaJob } from "./types";

/**
 * Record a media usage event. Best-effort — failure is non-fatal.
 * Server-only: writes through lib/usage/server's Supabase-backed ledger.
 * Must only be called from server-side code paths (API routes, server-only
 * provider adapters) — never from lib/media/jobs.ts, which is shared with
 * client-side mock simulation and must stay free of "next/headers"-tainted imports.
 */
export async function recordMediaUsage(input: {
  eventType: string;
  jobId?: string | null;
  assetId?: string | null;
  projectId?: string | null;
  modality?: string | null;
  mode?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  toolId?: string | null;
  estimatedCredits?: number | null;
  creditCost?: number | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
  initiatedBy?: string | null;
}): Promise<void> {
  try {
    const userId = input.initiatedBy;
    if (!userId || userId.startsWith("mock-") || userId.startsWith("demo-") || userId === "local-dev") {
      return; // mock/demo users do not record real usage
    }
    void insertUsageEvent({
      user_id: userId,
      session_id: null,
      agent_id: "media-studio",
      event_type: input.eventType,
      model_route: input.modelId ?? null,
      input_tokens: null,
      output_tokens: null,
      credit_cost: input.creditCost ?? 0,
      metadata: {
        jobId: input.jobId ?? null,
        assetId: input.assetId ?? null,
        projectId: input.projectId ?? null,
        modality: input.modality ?? null,
        mode: input.mode ?? null,
        providerId: input.providerId ?? null,
        modelId: input.modelId ?? null,
        toolId: input.toolId ?? null,
        estimatedCredits: input.estimatedCredits ?? null,
        error: input.error ?? null,
        ...input.metadata,
      },
    });
  } catch {
    // Best-effort — usage recording failure must not break generation
  }
}

/**
 * Record a failed job with safe failure metadata.
 * Honest: mock/setup errors are labeled as non-consumptive.
 */
export async function recordFailedJobUsage(
  job: MediaJob,
  errorMessage: string,
): Promise<void> {
  void recordMediaUsage({
    eventType: job.providerId === "mock"
      ? "media.generate.mock"
      : job.providerId === "setup-required"
        ? "media.generate.setup_required"
        : "media.generate.failed",
    jobId: job.id,
    projectId: job.projectId,
    modality: job.modality,
    mode: job.mode,
    providerId: job.providerId,
    modelId: job.modelId,
    toolId: job.toolId,
    estimatedCredits: job.estimatedCredits ?? 0,
    creditCost: 0,
    error: errorMessage,
    initiatedBy: job.initiatedBy,
    metadata: {
      jobState: job.state,
      isMock: job.providerId === "mock",
      isSetupRequired: job.providerId !== "mock" && job.providerId !== "openai",
    },
  });
}

import "server-only";

import { createPlatformJobRepository, DurableJobService } from "../platform/jobs";
import { ResearchDurableWorker } from "./durable-worker";
import type { JobHandler, WorkerContext } from "../platform/worker/types";

/**
 * R-P0-02 — Research canonical worker handler.
 * Consumes the durable Research worker via the platform worker host (Job 04).
 * No second job platform: uses the single durable_jobs + DurableJobService.
 */
export const researchHandler: JobHandler = {
  kind: "research",
  async execute({ job, ctx }: { job: import("../platform/jobs").JobRecord; ctx: WorkerContext }) {
    const repository = createPlatformJobRepository();
    const service = new DurableJobService({ repository });
    // Ensure lease heartbeat before dispatch
    await ctx.heartbeat({ beforeResearch: true });
    const worker = new ResearchDurableWorker({ jobService: service });
    // Mark dispatch boundary before any external provider effect (Exa) — idempotent suppression
    const opKey = `research:${job.id}:${String((job.payload as Record<string, unknown>)?.mode ?? "search")}`;
    try {
      await ctx.markProviderDispatched(opKey);
    } catch {}
    const result = await worker.execute(job);
    if (!result.ok) {
      const isLease = result.error === "LEASE_LOST";
      const code = isLease ? "LEASE_LOST" : result.error ?? "RESEARCH_FAILED";
      const retryable = code === "LEASE_LOST";
      return { ok: false, retryable, code, message: result.error ?? "Research handler failed" };
    }
    await ctx.appendEvent("research.completed" as never, { mode: (job.payload as Record<string, unknown>)?.mode });
    return { ok: true, result: { researchJobId: job.id } };
  },
};

export const researchDispatchHandler: JobHandler = {
  kind: "research-dispatch",
  async execute({ job, ctx }: { job: import("../platform/jobs").JobRecord; ctx: WorkerContext }) {
    return researchHandler.execute({ job, ctx });
  },
};

export const RESEARCH_HANDLERS: readonly JobHandler[] = [researchHandler, researchDispatchHandler];

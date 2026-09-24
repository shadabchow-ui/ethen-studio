import "server-only";

import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { createPlatformJobRepository } from "@ethen/ai/platform/jobs/factory";
import { generateSignedUrl } from "@ethen/database/storage/tenant-object-storage";
import { SupabaseImageCreditLedger } from "./image-settlement";
import { getStudioRepository } from "./persistence/studio-repository";
import { resolveGraphScope } from "./creative-graph/scope";

export const IMAGE_JOB_TERMINAL = new Set([
  "completed", "failed", "cancelled", "dead_letter", "timed_out", "indeterminate", "escalated", "halt_unsafe",
]);

export interface ImageJobProjection {
  job: {
    id: string; status: string; terminal: boolean;
    attemptCount: number; maxAttempts: number;
    providerDispatched: boolean;
    lastError: { code: string; message: string; retryable: boolean } | null;
    createdAt: string; updatedAt: string;
    quote: { credits: number | null; pricingVersionId: string | null };
  };
  reservation: {
    id: string; state: string; reservedCredits: number; settledCredits: number; providerEvidenceHash: string | null;
  } | null;
  outputs: Array<{
    assetId: string; kind: string; title: string; contentHash: string | null;
    objectKey: string; signedUrl: string | null; width: number | null; height: number | null;
    durationSeconds: number | null; previewUrl: string | null;
  }>;
  events: Array<{ id: string; type: string; at: string; detail: Readonly<Record<string, unknown>> | null }>;
  /** Request evidence for review: prompt, settings, references, routing (from the durable payload). */
  request: {
    prompt: string | null;
    references: string[];
    receipt: { providerId: string; modelId: string; capability: string } | null;
    routing: Readonly<Record<string, unknown>> | null;
    settings: Readonly<Record<string, unknown>>;
  };
  /** Latest evaluation evidence for the job, if any. */
  evaluation: {
    id: string; verdict: string; confidence: string;
    defects: Array<{ signature: string; kind: string; detail: string; autoRepairable: boolean }>;
    rubrics: Array<{ name: string; version: string }>;
    evaluatedAt: string;
  } | null;
}

/**
 * Studio V3 Job 3 — durable retry/cancel for media jobs (all kinds).
 * Retry re-queues a failed job on its existing reservation (no second
 * charge); indeterminate jobs are refused here and must reconcile first.
 * Cancel transitions queued jobs immediately and flags running jobs for
 * worker acknowledgement; in-flight provider work is cancelled upstream by
 * the handler. Returns the fresh status, or null when the job is not in
 * this project.
 */
export async function actOnMediaJob(
  projectId: string,
  jobId: string,
  action: "retry" | "cancel",
  actorId: string,
): Promise<{ applied: boolean; status: string } | null> {
  const service = new DurableJobService({ repository: createPlatformJobRepository() });
  const job = await service.getJob({ projectId }, jobId);
  if (!job || job.projectId !== projectId) return null;
  const reason = `${action}-by-${actorId}`;
  const applied = action === "retry"
    ? await service.retryJob({ projectId }, jobId, reason)
    : await service.cancelJob({ projectId }, jobId, reason);
  const fresh = await service.getJob({ projectId }, jobId);
  return { applied, status: fresh?.status ?? job.status };
}

/**
 * Studio V2 Job 02 — canonical image job projection.
 * Composed only from durable sources (durable job row, credit reservation,
 * owned studio assets, durable event trail). Old local maps are never read.
 */
export async function readImageJob(projectId: string, actorId: string, jobId: string): Promise<ImageJobProjection | null> {
  const service = new DurableJobService({ repository: createPlatformJobRepository() });
  const job = await service.getJob({ projectId }, jobId);
  if (!job || job.projectId !== projectId) return null;

  const payload = job.payload as Record<string, unknown>;
  const reservationKey = typeof payload.reservationKey === "string" ? payload.reservationKey : null;
  const ledger = new SupabaseImageCreditLedger();
  const reservation = reservationKey ? await ledger.get(projectId, reservationKey).catch(() => null) : null;

  const scope = await resolveGraphScope(actorId, projectId);
  const repo = getStudioRepository();
  const assetRows = await repo.list(scope, "studio_assets").catch(() => []);
  const outputs: ImageJobProjection["outputs"] = [];
  for (const row of assetRows) {
    const data = row.payload as Record<string, unknown>;
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    if (metadata.jobId !== job.id) continue;
    const objectKey = typeof metadata.objectKey === "string" ? metadata.objectKey : "";
    let signedUrl: string | null = null;
    if (objectKey) {
      try {
        signedUrl = await generateSignedUrl(objectKey, 3600);
      } catch {
        signedUrl = null;
      }
    }
    outputs.push({
      assetId: row.id,
      kind: typeof data.asset_kind === "string" ? data.asset_kind : "generation",
      title: typeof metadata.name === "string" ? metadata.name : row.id,
      contentHash: typeof data.content_hash === "string" ? data.content_hash : null,
      objectKey, signedUrl,
      width: typeof metadata.width === "number" ? metadata.width : null,
      height: typeof metadata.height === "number" ? metadata.height : null,
      durationSeconds: typeof metadata.durationSeconds === "number" ? metadata.durationSeconds : null,
      previewUrl: typeof metadata.previewUrl === "string" ? metadata.previewUrl : null,
    });
  }

  const trail = await service.listJobEvents(job.id).catch(() => []);
  const evidenceRows = await repo.list(scope, "studio_evaluation_evidence").catch(() => []);
  const latestEvidenceRow = evidenceRows
    .filter((row) => ((row.payload as Record<string, unknown>).job_id as string) === job.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  let evaluation: ImageJobProjection["evaluation"] = null;
  if (latestEvidenceRow) {
    const data = latestEvidenceRow.payload as Record<string, unknown>;
    const defects = (Array.isArray(data.defects) ? data.defects : []) as Array<{
      signature: string; kind: string; detail: string; autoRepairable: boolean;
    }>;
    const rubrics = (Array.isArray(data.rubrics) ? data.rubrics : []) as Array<{ name: string; version: string }>;
    evaluation = {
      id: latestEvidenceRow.id,
      verdict: String(data.verdict ?? "needs-review"),
      confidence: String(data.confidence ?? "unknown"),
      defects: defects.map((defect) => ({
        signature: String(defect.signature ?? ""), kind: String(defect.kind ?? ""),
        detail: String(defect.detail ?? ""), autoRepairable: defect.autoRepairable === true,
      })),
      rubrics: rubrics.map((rubric) => ({ name: String(rubric.name ?? ""), version: String(rubric.version ?? "") })),
      evaluatedAt: latestEvidenceRow.createdAt,
    };
  }
  return {
    job: {
      id: job.id, status: job.status, terminal: IMAGE_JOB_TERMINAL.has(job.status),
      attemptCount: job.attemptCount, maxAttempts: job.maxAttempts,
      providerDispatched: job.providerOperationKey !== null,
      lastError: job.lastError ? { code: job.lastError.code, message: job.lastError.message, retryable: job.lastError.retryable } : null,
      createdAt: job.createdAt, updatedAt: job.updatedAt,
      quote: {
        credits: typeof payload.quotedCredits === "number" ? payload.quotedCredits : null,
        pricingVersionId: typeof payload.pricingVersionId === "string" ? payload.pricingVersionId : null,
      },
    },
    reservation: reservation ? {
      id: reservation.id, state: reservation.state,
      reservedCredits: reservation.reservedCredits, settledCredits: reservation.settledCredits,
      providerEvidenceHash: reservation.providerEvidenceHash,
    } : null,
    outputs,
    events: trail.map((entry) => ({ id: entry.id, type: entry.event, at: entry.createdAt, detail: entry.detail ?? null })).slice(-50),
    request: {
      prompt: typeof payload.prompt === "string" ? (payload.prompt as string) : null,
      references: Array.isArray(payload.references)
        ? (payload.references as unknown[]).filter((entry): entry is string => typeof entry === "string")
        : [payload.referenceUrl, payload.imageUrl].filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
      receipt: isRecord(payload.receipt)
        ? {
          providerId: String((payload.receipt as Record<string, unknown>).providerId ?? ""),
          modelId: String((payload.receipt as Record<string, unknown>).modelId ?? ""),
          capability: String((payload.receipt as Record<string, unknown>).capability ?? ""),
        }
        : null,
      routing: isRecord(payload.routingReceipt) ? (payload.routingReceipt as Readonly<Record<string, unknown>>) : null,
      settings: Object.fromEntries(
        ["model", "size", "quality", "resolution", "durationSeconds", "aspectRatio", "seed", "negativePrompt", "capability", "capabilityVersion", "endpointId", "workflow"]
          .filter((key) => payload[key] !== undefined && payload[key] !== null)
          .map((key) => [key, payload[key] as unknown]),
      ),
    },
    evaluation,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Studio V2 Job 04 — timeline-ready Take records.
 * One accepted execution output per Take; take numbers increment per job.
 * scene_ref/shot_ref are opaque timeline references — the full Cinema UI
 * that consumes them lands later, but the records it needs exist now.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { getStudioRepository } from "./persistence/studio-repository";
import type { StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";

export interface TakeInput {
  jobId: string;
  assetId: string;
  variantId: string | null;
  sceneRef?: string | null;
  shotRef?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface TakeRecord {
  id: string;
  takeNumber: number;
  jobId: string;
  assetId: string;
  sceneRef: string | null;
  shotRef: string | null;
  status: string;
}

/** Record the next accepted Take for a job. Idempotent per (job, asset): replay returns the original. */
export async function recordVideoTake(scope: StudioPersistenceScope, input: TakeInput, repository?: StudioRepository): Promise<TakeRecord> {
  const repo = repository ?? getStudioRepository();
  const rows = await repo.list(scope, "studio_takes");
  const existing = rows.find((row) => {
    const payload = row.payload as Record<string, unknown>;
    return payload.job_id === input.jobId && payload.asset_id === input.assetId;
  });
  if (existing) {
    const payload = existing.payload as Record<string, unknown>;
    return {
      id: existing.id, takeNumber: Number(payload.take_number ?? 1),
      jobId: String(payload.job_id ?? ""), assetId: String(payload.asset_id ?? ""),
      sceneRef: typeof payload.scene_ref === "string" ? payload.scene_ref : null,
      shotRef: typeof payload.shot_ref === "string" ? payload.shot_ref : null,
      status: String(payload.status ?? "accepted"),
    };
  }
  const siblings = rows.filter((row) => ((row.payload as Record<string, unknown>).job_id as string) === input.jobId);
  const takeNumber = siblings.length + 1;
  const id = randomUUID();
  const at = new Date().toISOString();
  await repo.insert(scope, "studio_takes", {
    id,
    payload: {
      job_id: input.jobId, asset_id: input.assetId, variant_id: input.variantId,
      take_number: takeNumber,
      scene_ref: input.sceneRef ?? null, shot_ref: input.shotRef ?? null,
      status: "accepted", metadata: { ...(input.metadata ?? {}) },
    },
    createdAt: at,
    updatedAt: null,
    deletedAt: null,
  });
  return { id, takeNumber, jobId: input.jobId, assetId: input.assetId, sceneRef: input.sceneRef ?? null, shotRef: input.shotRef ?? null, status: "accepted" };
}

/** List Takes for a job, oldest first. */
export async function listVideoTakes(scope: StudioPersistenceScope, jobId: string, repository?: StudioRepository): Promise<TakeRecord[]> {
  const rows = await (repository ?? getStudioRepository()).list(scope, "studio_takes");
  return rows
    .filter((row) => ((row.payload as Record<string, unknown>).job_id as string) === jobId)
    .map((row) => {
      const payload = row.payload as Record<string, unknown>;
      return {
        id: row.id, takeNumber: Number(payload.take_number ?? 1),
        jobId: String(payload.job_id ?? ""), assetId: String(payload.asset_id ?? ""),
        sceneRef: typeof payload.scene_ref === "string" ? payload.scene_ref : null,
        shotRef: typeof payload.shot_ref === "string" ? payload.shot_ref : null,
        status: String(payload.status ?? "accepted"),
      };
    })
    .sort((a, b) => a.takeNumber - b.takeNumber);
}

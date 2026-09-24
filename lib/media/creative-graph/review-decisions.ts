/**
 * Studio V3 Job 4 — durable review decisions on studio_approvals.
 *
 * Append-only verdicts (accepted/rejected/restored) with comments per asset;
 * the latest decision per asset is current. Restore re-decides a rejected
 * asset (never rewrites history). Scoped, idempotent, tenant-bound; the
 * public token viewer never gains decision privileges (server enforces
 * project membership on the decisions API).
 */

import { randomUUID } from "node:crypto";

import { assertIdempotencyKey } from "./envelopes";
import {
  assertStudioScope,
  type StudioPersistenceScope,
  type StudioRepository,
} from "../persistence/studio-repository";

export type ReviewVerdict = "accepted" | "rejected" | "restored";

export const REVIEW_VERDICTS: readonly ReviewVerdict[] = ["accepted", "rejected", "restored"];

export function assertReviewVerdict(value: string): ReviewVerdict {
  if (value === "accepted" || value === "rejected" || value === "restored") return value;
  throw new Error(`STUDIO_REVIEW_VERDICT_UNKNOWN: ${value} is not a review verdict.`);
}

export interface ReviewDecision {
  id: string;
  assetId: string;
  jobId: string | null;
  verdict: ReviewVerdict;
  comment: string | null;
  actorId: string;
  createdAt: string;
}

export interface DecideInput {
  assetId: string;
  jobId?: string | null;
  verdict: string;
  comment?: string | null;
}

function toDecision(record: { id: string; payload: Readonly<Record<string, unknown>>; createdAt: string }): ReviewDecision | null {
  const payload = record.payload;
  const assetId = typeof payload.asset_id === "string" ? payload.asset_id : "";
  const verdict = typeof payload.verdict === "string" ? payload.verdict : "";
  if (!assetId || (verdict !== "accepted" && verdict !== "rejected" && verdict !== "restored")) return null;
  return {
    id: record.id,
    assetId,
    jobId: typeof payload.job_id === "string" ? payload.job_id : null,
    verdict,
    comment: typeof payload.comment === "string" ? payload.comment : null,
    actorId: typeof payload.actor_id === "string" ? payload.actor_id : "",
    createdAt: record.createdAt,
  };
}

/** Record one verdict. Idempotent per key: replays return the original decision. */
export async function decideReview(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: DecideInput,
  idempotencyKey: string,
): Promise<{ decision: ReviewDecision; replayed: boolean }> {
  assertStudioScope(scope);
  const key = assertIdempotencyKey(idempotencyKey);
  const verdict = assertReviewVerdict(input.verdict);
  const assetId = input.assetId?.trim() ?? "";
  if (!assetId) throw new Error("STUDIO_REVIEW_ASSET_REQUIRED: assetId is required.");
  const comment = typeof input.comment === "string" ? input.comment.trim().slice(0, 2000) : null;

  const existing = await repo.list(scope, "studio_approvals");
  const replay = existing.find((row) => !row.deletedAt && (row.payload as Record<string, unknown>).idempotency_key === key);
  if (replay) {
    const decision = toDecision(replay);
    if (!decision) throw new Error("STUDIO_NOT_FOUND: replayed review decision is unreadable.");
    return { decision, replayed: true };
  }

  const id = randomUUID();
  const at = new Date().toISOString();
  await repo.insert(scope, "studio_approvals", {
    id,
    payload: {
      asset_id: assetId,
      job_id: input.jobId?.trim() || null,
      verdict,
      comment,
      actor_id: scope.actorId,
      idempotency_key: key,
    },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  await repo.appendEvent(scope, {
    entityKind: "review",
    entityId: assetId,
    revision: 1,
    type: `review.${verdict}`,
    payload: { decisionId: id, comment },
    target: "studio-graph",
    actorId: scope.actorId,
  });
  return { decision: { id, assetId, jobId: input.jobId?.trim() || null, verdict, comment, actorId: scope.actorId, createdAt: at }, replayed: false };
}

/** Latest decision per asset (newest wins); optional single-asset filter. */
export async function listReviewDecisions(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  assetId?: string,
): Promise<ReviewDecision[]> {
  assertStudioScope(scope);
  const rows = await repo.list(scope, "studio_approvals");
  const byAsset = new Map<string, ReviewDecision>();
  for (const row of rows) {
    if (row.deletedAt) continue;
    const decision = toDecision(row);
    if (!decision) continue;
    if (assetId && decision.assetId !== assetId) continue;
    const current = byAsset.get(decision.assetId);
    if (!current || current.createdAt <= decision.createdAt) byAsset.set(decision.assetId, decision);
  }
  return [...byAsset.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

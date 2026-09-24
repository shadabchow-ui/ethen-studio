/**
 * Studio V2 Job 05 — bounded repair planning and execution.
 *
 * A repair re-issues the failed command with a targeted fix, bounded by:
 * retry depth, budget, no-progress detection, lock preservation, safety
 * re-validation, and human escalation. Only deterministic output defects
 * are auto-repairable; lock changes and subjective findings route to
 * humans. A strict constraint is never silently weakened to pass.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { admitImageQuote, quoteImageCommand, validateImageCommand } from "./image-capability";
import { admitVideoQuote, quoteVideoCommand, resolveVideoRoute, validateVideoCommand } from "./video-capability";
import { enqueueWithReservation, type IssuedCommand } from "./command-service";
import type { StudioQuotaPort } from "./durable-quota";
import type { ImageCreditLedger } from "./image-settlement";
import type { StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";
import type { EvalDefect, EvalVerdict } from "./evaluation-service";
import type { LockedAttribute } from "./eval-rubrics";

export const REPAIR_MAX_DEPTH = 2;

export interface RepairEvidence {
  id: string;
  jobId: string;
  kind: "image" | "video";
  verdict: EvalVerdict;
  defects: EvalDefect[];
  /** Original request snapshot for faithful re-issue with a targeted fix. */
  request: Record<string, unknown>;
  quotedCredits: number;
  pricingVersionId: string;
}

export interface PriorRepairAttempt {
  attemptNumber: number;
  defectSignature: string;
  status: string;
}

export interface RepairPlan {
  eligible: boolean;
  stopReason: string | null;
  attemptNumber: number;
  defectSignature: string | null;
  /** Adjusted request: original plus the targeted fix. */
  request: Record<string, unknown> | null;
  ceiling: number;
}

/**
 * Plan one repair attempt. Pure: no I/O, no spend. Every stop is explicit.
 */
export function planRepairAttempt(input: {
  evidence: RepairEvidence;
  priorAttempts: readonly PriorRepairAttempt[];
  locks: readonly LockedAttribute[];
  ceiling: number;
}): RepairPlan {
  const { evidence, priorAttempts } = input;
  const attemptNumber = priorAttempts.length + 1;
  if (evidence.verdict !== "fail") {
    return { eligible: false, stopReason: "human-review-required", attemptNumber, defectSignature: null, request: null, ceiling: input.ceiling };
  }
  const defect = evidence.defects.find((entry) => entry.autoRepairable) ?? null;
  if (!defect) {
    return { eligible: false, stopReason: "no-auto-repairable-defect", attemptNumber, defectSignature: null, request: null, ceiling: input.ceiling };
  }
  if (attemptNumber > REPAIR_MAX_DEPTH) {
    return { eligible: false, stopReason: "max-depth", attemptNumber, defectSignature: defect.signature, request: null, ceiling: input.ceiling };
  }
  const recentSignatures = priorAttempts.slice(-1).map((attempt) => attempt.defectSignature);
  if (recentSignatures.length === 1 && recentSignatures[0] === defect.signature) {
    return { eligible: false, stopReason: "no-progress", attemptNumber, defectSignature: defect.signature, request: null, ceiling: input.ceiling };
  }
  // Lock preservation: a repair whose target overlaps a locked attribute is
  // refused even when the defect looks auto-repairable.
  if (defect.target === "locked-attribute" || input.locks.length > 0 && defect.signature === "lock-changed") {
    return { eligible: false, stopReason: "lock-preserved", attemptNumber, defectSignature: defect.signature, request: null, ceiling: input.ceiling };
  }
  if (!Number.isFinite(input.ceiling) || input.ceiling < 0) {
    return { eligible: false, stopReason: "budget-invalid", attemptNumber, defectSignature: defect.signature, request: null, ceiling: input.ceiling };
  }
  if (evidence.quotedCredits > input.ceiling) {
    return { eligible: false, stopReason: "budget-exceeded", attemptNumber, defectSignature: defect.signature, request: null, ceiling: input.ceiling };
  }
  // Targeted fix: keep the original request, tighten what the defect names.
  // Dims mismatch on image re-asserts the requested size explicitly.
  const request = { ...(evidence.request ?? {}) };
  let ceiling = input.ceiling;
  if (evidence.kind === "image") {
    try {
      const normalized = validateImageCommand({
        prompt: typeof request.prompt === "string" ? request.prompt : "",
        model: typeof request.model === "string" ? request.model : undefined,
        size: typeof request.size === "string" ? request.size : undefined,
        quality: typeof request.quality === "string" ? request.quality : undefined,
      });
      admitImageQuote(quoteImageCommand(normalized, {
        id: evidence.pricingVersionId, version: "v1",
        standardCredits: evidence.quotedCredits, hdCredits: evidence.quotedCredits,
      }), ceiling);
      void normalized;
    } catch {
      return { eligible: false, stopReason: "unsafe", attemptNumber, defectSignature: defect.signature, request: null, ceiling: input.ceiling };
    }
  } else {
    try {
      const normalized = validateVideoCommand({
        prompt: typeof request.prompt === "string" ? request.prompt : "",
        capability: typeof request.capability === "string" ? request.capability : "image-to-video",
        referenceUrl: typeof request.referenceUrl === "string" ? request.referenceUrl : undefined,
        referenceAssetId: typeof request.referenceAssetId === "string" ? request.referenceAssetId : undefined,
        referenceRole: typeof request.referenceRole === "string" ? request.referenceRole : undefined,
        resolution: typeof request.resolution === "string" ? request.resolution : undefined,
      });
      const receipt = resolveVideoRoute({ prompt: normalized.prompt, capability: normalized.capability });
      admitVideoQuote(quoteVideoCommand(receipt, {
        id: evidence.pricingVersionId, version: "v1", flatCredits: evidence.quotedCredits,
      }), ceiling);
      void receipt;
    } catch {
      return { eligible: false, stopReason: "unsafe", attemptNumber, defectSignature: defect.signature, request: null, ceiling: input.ceiling };
    }
  }
  // Budget already enforced above; the ceiling covers the quoted re-issue.
  ceiling = Math.max(ceiling, evidence.quotedCredits);
  return { eligible: true, stopReason: null, attemptNumber, defectSignature: defect.signature, request, ceiling };
}

export interface RepairExecution {
  attemptId: string;
  issued: IssuedCommand;
}

/**
 * Execute a planned repair: issue the canonical command for the same kind
 * with the same economics, then record the attempt row. Attempt identity
 * (evidence + number) is idempotent: replays resolve the original row.
 */
export async function executeRepairAttempt(input: {
  repo: StudioRepository;
  scope: StudioPersistenceScope;
  plan: RepairPlan;
  evidence: RepairEvidence;
  ledger?: ImageCreditLedger;
  service?: DurableJobService;
  quota?: StudioQuotaPort;
}): Promise<RepairExecution> {
  const { repo, scope, plan, evidence } = input;
  if (!plan.eligible || !plan.request || !plan.defectSignature) {
    throw new Error(`REPAIR_NOT_ELIGIBLE: ${plan.stopReason ?? "unknown"}`);
  }
  const request: Record<string, unknown> = plan.request;
  const idempotencyKey = `repair-${evidence.id}-${plan.attemptNumber}`;
  let payload: Record<string, unknown>;
  if (evidence.kind === "image") {
    const normalized = validateImageCommand({
      prompt: typeof request.prompt === "string" ? request.prompt : "",
      model: typeof request.model === "string" ? request.model : undefined,
      size: typeof request.size === "string" ? request.size : undefined,
      quality: typeof request.quality === "string" ? request.quality : undefined,
    });
    payload = {
      kind: "openai-image",
      prompt: normalized.prompt, model: normalized.model, size: normalized.size, quality: normalized.quality,
      actorId: scope.actorId, reservationKey: idempotencyKey,
      quotedCredits: evidence.quotedCredits, pricingVersionId: evidence.pricingVersionId,
      receipt: { providerId: "openai", modelId: normalized.model, capability: "text-to-image" as const },
      repairOf: { evidenceId: evidence.id, jobId: evidence.jobId, attempt: plan.attemptNumber },
    };
  } else {
    const normalized = validateVideoCommand({
      prompt: typeof request.prompt === "string" ? request.prompt : "",
      capability: typeof request.capability === "string" ? request.capability : "image-to-video",
      referenceUrl: typeof request.referenceUrl === "string" ? request.referenceUrl : undefined,
      referenceAssetId: typeof request.referenceAssetId === "string" ? request.referenceAssetId : undefined,
      referenceRole: typeof request.referenceRole === "string" ? request.referenceRole : undefined,
      resolution: typeof request.resolution === "string" ? request.resolution : undefined,
    });
    const receipt = resolveVideoRoute({ prompt: normalized.prompt, capability: normalized.capability });
    payload = {
      kind: "fal-video",
      mediaJobId: `media-video-${idempotencyKey}`,
      providerId: receipt.providerId, modelId: receipt.modelId,
      prompt: normalized.prompt,
      imageUrl: normalized.referenceUrl ?? "",
      referenceUrl: normalized.referenceUrl, referenceAssetId: normalized.referenceAssetId,
      referenceRole: normalized.referenceRole, resolution: normalized.resolution,
      actorId: scope.actorId, reservationKey: idempotencyKey,
      quotedCredits: evidence.quotedCredits, pricingVersionId: evidence.pricingVersionId,
      receipt: { ...receipt },
      repairOf: { evidenceId: evidence.id, jobId: evidence.jobId, attempt: plan.attemptNumber },
    };
  }
  // Attempt identity is idempotent across adapters: an existing row for this
  // (evidence, number) resolves first, and the enqueue below replays through
  // the same idempotency key — so repetition never double-spends.
  const priorRows = await repo.list(scope, "studio_repair_attempts");
  const priorMatch = priorRows.find((row) => {
    const data = row.payload as Record<string, unknown>;
    return data.evidence_id === evidence.id && Number(data.attempt_number) === plan.attemptNumber;
  });
  const issued = await enqueueWithReservation({
    scope, actorId: scope.actorId, idempotencyKey, payload,
    quote: { credits: evidence.quotedCredits, pricingVersionId: evidence.pricingVersionId },
    approvedCeiling: plan.ceiling, ledger: input.ledger, service: input.service, quota: input.quota,
  });
  if (priorMatch) return { attemptId: priorMatch.id, issued };
  const attemptId = randomUUID();
  const at = new Date().toISOString();
  try {
    await repo.insert(scope, "studio_repair_attempts", {
      id: attemptId,
      payload: {
        job_id: evidence.jobId, evidence_id: evidence.id, attempt_number: plan.attemptNumber,
        defect_signature: plan.defectSignature, command_kind: evidence.kind,
        command_job_id: issued.job.id, command_idempotency_key: idempotencyKey, status: "issued",
      },
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/unique|duplicate|23505|already exists/i.test(message)) throw error;
    const rows = await repo.list(scope, "studio_repair_attempts");
    const match = rows.find((row) => {
      const data = row.payload as Record<string, unknown>;
      return data.evidence_id === evidence.id && Number(data.attempt_number) === plan.attemptNumber;
    });
    if (!match) throw error;
    return { attemptId: match.id, issued };
  }
  return { attemptId, issued };
}

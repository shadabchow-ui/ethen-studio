import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { JobHandler, WorkerContext } from "@ethen/ai/platform/worker/types";
import { CancellationRequestedError, PostDispatchUncertainError, WorkerAbortedError } from "@ethen/ai/platform/worker/types";
import type { JobRecord } from "@ethen/ai/platform/jobs/index";
import { uploadTenantObject, getTenantObjectForProject, generateSignedUrl as signTenantObject } from "@ethen/database/storage/tenant-object-storage";
import { classifyError } from "../errors";
import { MemoryImageCreditLedger, SupabaseImageCreditLedger, type ImageCreditLedger } from "../image-settlement";
import { SupabaseStudioQuotaService, tryReleaseQuota, type StudioQuotaPort } from "../durable-quota";
import { evaluateAndRecord } from "../evaluation-service";
import { getStudioRepository, type StudioRepository } from "../persistence/studio-repository";
import { recordVideoTake } from "../takes";
import { validateVideoBytes } from "../video-validation";
import type { VideoRoutingReceipt } from "../video-capability";
import { recordAssetLineageDurable, recordAssetVariantDurable } from "../lineage";
import {
  cancelFalVideo,
  downloadFalVideoBytes,
  fetchFalVideoResult,
  isFalDispatchUncertain,
  pollFalVideoStatus,
  submitFalVideoGeneration,
  type FalSubmitReceipt,
} from "../providers/fal";

/**
 * JOB 04 — canonical durable fal-video handler (kind: "fal-video").
 *
 * Owns the fal image-to-video lifecycle on the durable worker:
 *  1. Admission: a reserved credit reservation must exist — no send without
 *     one. Receipt agreement: payload receipt must match provider/model.
 *  2. First dispatch: submit, then record the provider request id as the
 *     durable dispatch marker BEFORE polling. Ambiguous submit outcomes
 *     (transport loss, timeout, 429/5xx, unparseable reply) become
 *     INDETERMINATE with liability retained — never a blind retry.
 *  3. Recovery (reclaim after crash): NEVER re-submit — poll the SAME
 *     request id. Output present -> settle + success; absent -> indeterminate.
 *  4. Bounded poll with a deadline; transient blips heartbeat, terminal
 *     provider failures fail, unknown-with-error goes indeterminate.
 *  5. True cancellation: best-effort upstream cancel, confirmed by re-poll
 *     when possible; late COMPLETED after cancel never ingests.
 *  6. On COMPLETED: download, validate container (duration/dims), persist
 *     via canonical tenant object storage (idempotent per request id),
 *     materialize asset + variant + lineage + Take, settle, then complete —
 *     never before the durable asset exists.
 */

export interface FalVideoHandlerDeps {
  submit?(request: { prompt: string; imageUrl: string; resolution: "480p" | "720p"; modelId?: string }): Promise<FalSubmitReceipt>;
  pollStatus?(requestId: string): Promise<{ status: string; error?: string }>;
  fetchResult?(requestId: string): Promise<{ videoUrl: string; mimeType: string; previewUrl?: string }>;
  download?(videoUrl: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  cancel?(requestId: string): Promise<boolean>;
  storeBytes?(input: {
    projectId: string;
    bytes: Uint8Array;
    contentType: string;
    filename: string;
    idempotencyKey: string;
  }): Promise<{ objectKey: string; signedUrl: string }>;
  /**
   * Resolve a tenant asset id to a fresh provider-fetchable URL at worker
   * time (preferred over command-time URLs, which may expire before dispatch).
   */
  resolveReference?(input: { assetId: string; projectId: string }): Promise<string>;
  ledger?: ImageCreditLedger;
  /** Job 12B: admission claim owner; terminal settle/release frees the slot. */
  quota?: StudioQuotaPort;
  /** Shared persistence for asset/take rows (restart tests inject one). */
  repository?: StudioRepository;
  /** Poll cadence (ms) between status checks (test seam). */
  pollIntervalMs?: number;
  /** Absolute poll budget per execution (ms). Expiry yields bounded retryable. */
  deadlineMs?: number;
  /** Provider statuses to treat as still-running. */
  runningStatuses?: ReadonlySet<string>;
  now?: () => number;
}

const DEFAULT_RUNNING = new Set(["IN_QUEUE", "IN_PROGRESS", "STARTED", "UNKNOWN"]);

const DEFAULT_DEPS: Required<Pick<FalVideoHandlerDeps, "submit" | "pollStatus" | "fetchResult" | "download" | "cancel" | "storeBytes">> = {
  submit: async (request) =>
    submitFalVideoGeneration({
      mode: "video",
      capability: "image-to-video",
      prompt: request.prompt,
      imageUrl: request.imageUrl,
      modelId: request.modelId,
      qualityPreference: request.resolution === "720p" ? "premium" : "draft",
    } as Parameters<typeof submitFalVideoGeneration>[0]),
  pollStatus: pollFalVideoStatus,
  fetchResult: fetchFalVideoResult,
  download: downloadFalVideoBytes,
  cancel: cancelFalVideo,
  storeBytes: async (input) => {
    const result = await uploadTenantObject({
      projectId: input.projectId,
      actorId: "platform-worker",
      bytes: input.bytes,
      contentType: input.contentType,
      filename: input.filename,
      source: "studio",
      retentionDays: 90,
      idempotencyKey: input.idempotencyKey,
    });
    return { objectKey: result.objectKey, signedUrl: result.signedUrl };
  },
};

export interface FalVideoPayload {
  mediaJobId: string;
  providerId: string;
  modelId: string;
  prompt: string;
  /** Legacy/generate-lane reference URL. Prefer referenceUrl/referenceAssetId. */
  imageUrl: string;
  referenceUrl?: string;
  referenceAssetId?: string;
  resolution: "480p" | "720p";
  actorId: string;
  reservationKey: string;
  quotedCredits: number;
  pricingVersionId: string;
  receipt: VideoRoutingReceipt;
  referenceRole: "i2v-reference" | "first-frame";
}

function stripMarker(marker: string | null | undefined): string | null {
  if (!marker) return null;
  return marker.startsWith("fal:") ? marker.slice(4) : marker;
}

function isDownloadGone(error: unknown): boolean {
  const status = (error as { httpStatus?: number })?.httpStatus;
  return status === 404 || status === 410;
}

async function safeSignal(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch {
    // Lifecycle events are observational; terminal state carries the truth.
  }
}

export function createFalVideoHandler(deps: FalVideoHandlerDeps = {}): JobHandler {
  const submit = deps.submit ?? DEFAULT_DEPS.submit;
  const pollStatus = deps.pollStatus ?? DEFAULT_DEPS.pollStatus;
  const fetchResult = deps.fetchResult ?? DEFAULT_DEPS.fetchResult;
  const download = deps.download ?? DEFAULT_DEPS.download;
  const cancel = deps.cancel ?? DEFAULT_DEPS.cancel;
  const storeBytes = deps.storeBytes ?? DEFAULT_DEPS.storeBytes;
  const resolveReference = deps.resolveReference ?? (async (input: { assetId: string; projectId: string }): Promise<string> => {
    const record = await getTenantObjectForProject(input.projectId, input.assetId);
    if (!record || record.source !== "studio") throw new Error("FAL_PAYLOAD_INVALID: reference asset is not an owned studio object.");
    return signTenantObject(record.objectKey, 3600);
  });
  const ledger: ImageCreditLedger = deps.ledger ?? new SupabaseImageCreditLedger();
  const quota: StudioQuotaPort = deps.quota ?? new SupabaseStudioQuotaService();
  const repository: StudioRepository = deps.repository ?? getStudioRepository();
  const pollIntervalMs = deps.pollIntervalMs ?? 2_000;
  const deadlineMs = deps.deadlineMs ?? 1_200_000;
  const runningStatuses = deps.runningStatuses ?? DEFAULT_RUNNING;
  const now = deps.now ?? (() => Date.now());

  return {
    kind: "fal-video",
    async execute({ job, ctx }: { job: JobRecord; ctx: WorkerContext }): Promise<
      | { ok: true; result: Record<string, unknown> }
      | { ok: false; retryable: boolean; code: string; message: string }
    > {
      // Job 12B: a terminal ledger transition frees the admission
      // concurrency slot exactly once (replayed outcomes already released;
      // unknown outcomes keep the slot — fail-closed, window-bounded).
      async function releaseQuotaForTerminalLedgerOutcome(outcome: { replayed: boolean } | null): Promise<void> {
        if (outcome && !outcome.replayed) await tryReleaseQuota(quota, job.projectId);
      }
      const payload = job.payload as Partial<FalVideoPayload>;
      if (!payload.prompt) {
        return { ok: false, retryable: false, code: "FAL_PAYLOAD_INVALID", message: "fal-video job payload is missing prompt." };
      }
      const actorId = payload.actorId?.trim() ?? "";
      if (!actorId) {
        return { ok: false, retryable: false, code: "FAL_PAYLOAD_INVALID", message: "fal-video job payload is missing actorId." };
      }
      // Receipt agreement: the executed route must match its receipt.
      const receipt = payload.receipt;
      if (!receipt || receipt.providerId !== "fal" || receipt.modelId !== "fal-ai/wan-i2v" || receipt.capability === undefined) {
        return { ok: false, retryable: false, code: "VIDEO_ROUTE_MISMATCH", message: "fal-video job carries no agreeing routing receipt." };
      }
      if (payload.providerId !== undefined && payload.providerId !== receipt.providerId) {
        return { ok: false, retryable: false, code: "VIDEO_ROUTE_MISMATCH", message: `payload provider ${payload.providerId} disagrees with receipt ${receipt.providerId}.` };
      }
      if (payload.modelId !== undefined && payload.modelId !== receipt.modelId) {
        return { ok: false, retryable: false, code: "VIDEO_ROUTE_MISMATCH", message: `payload model ${payload.modelId} disagrees with receipt ${receipt.modelId}.` };
      }
      const scope = { organizationId: job.organizationId, projectId: job.projectId, actorId };

      // Admission: no reservation, no provider send. Settled reservations
      // admit recovery only (settle is idempotent; no money moves twice).
      const reservationKey = payload.reservationKey?.trim() ?? "";
      if (!reservationKey) {
        return { ok: false, retryable: false, code: "NO_RESERVATION", message: "fal-video job carries no reservation key." };
      }
      const reservation = await ledger.get(job.projectId, reservationKey).catch(() => null);
      if (!reservation) {
        return { ok: false, retryable: false, code: "NO_RESERVATION", message: "No credit reservation backs this execution." };
      }
      if (reservation.state !== "reserved" && reservation.state !== "settled") {
        return { ok: false, retryable: false, code: "NO_RESERVATION", message: `Reservation is not active (state=${reservation.state}).` };
      }
      if (typeof payload.quotedCredits === "number" && reservation.reservedCredits !== payload.quotedCredits) {
        return { ok: false, retryable: false, code: "RESERVATION_MISMATCH", message: "Reservation terms do not match the job quote." };
      }
      const settledRecovery = reservation.state === "settled";
      const requestId = stripMarker(job.providerOperationKey);
      let receiptOut: FalSubmitReceipt | null = null;

      // Reference resolution is pre-send: tenant asset ids become fresh
      // signed URLs here so expiry between enqueue and dispatch cannot
      // break the submit. Semantic role (i2v-reference vs first-frame) is
      // preserved in the payload and recorded on the Take.
      let referenceUrl = payload.referenceUrl?.trim() || payload.imageUrl?.trim() || "";
      if (!referenceUrl && payload.referenceAssetId?.trim()) {
        try {
          referenceUrl = await resolveReference({ assetId: payload.referenceAssetId.trim(), projectId: job.projectId });
        } catch (error) {
          await releaseQuotaForTerminalLedgerOutcome(await ledger.release(job.projectId, reservationKey, "missing-reference").catch(() => null));
          return { ok: false, retryable: false, code: "FAL_PAYLOAD_INVALID", message: error instanceof Error ? error.message : "Reference asset could not be resolved." };
        }
      }
      if (!referenceUrl) {
        await releaseQuotaForTerminalLedgerOutcome(await ledger.release(job.projectId, reservationKey, "missing-reference").catch(() => null));
        return { ok: false, retryable: false, code: "FAL_PAYLOAD_INVALID", message: "fal-video job payload is missing a reference image." };
      }

      if (requestId || settledRecovery) {
        // RECOVERY: a prior worker already dispatched (or settled). NEVER
        // re-submit (no second spend). Reconcile by polling the same request.
        if (!requestId) {
          throw new PostDispatchUncertainError("reservation settled but no dispatch marker found; operator review required.");
        }
        await safeSignal(() => ctx.appendEvent("heartbeat", { recovery: true, requestId, attempt: job.attemptCount }));
      } else {
        // FIRST dispatch: submit to the fal queue. Pre-dispatch failures
        // (setup-required, invalid request, insufficient credits) release
        // the reservation and fail terminally. Ambiguous submit outcomes
        // become indeterminate with liability retained.
        try {
          receiptOut = await submit({
            prompt: payload.prompt,
            imageUrl: referenceUrl,
            resolution: payload.resolution ?? "480p",
            modelId: payload.modelId,
          });
        } catch (error) {
          if (isFalDispatchUncertain(error)) {
            throw new PostDispatchUncertainError(`fal submit outcome unknown: ${error instanceof Error ? error.message : String(error)}`);
          }
          await releaseQuotaForTerminalLedgerOutcome(await ledger.release(job.projectId, reservationKey, "pre-send-failure").catch(() => null));
          const classified = classifyError(error);
          return { ok: false, retryable: classified.retryable, code: classified.code, message: classified.message };
        }
        // Record the stable provider dispatch boundary BEFORE any polling.
        await ctx.markProviderDispatched(`fal:${receiptOut.requestId}`);
      }

      const activeRequestId = requestId ?? (receiptOut as FalSubmitReceipt).requestId;
      const startedAt = now();

      // Poll loop through the hardened fal status API, bounded by deadline.
      for (;;) {
        if (ctx.isAborted()) {
          throw new WorkerAbortedError(job.id);
        }
        if (await ctx.isCancellationRequested()) {
          const upstream = await cancel(activeRequestId).catch(() => false);
          let confirmed = false;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const probe = await pollStatus(activeRequestId).catch(() => ({ status: "UNKNOWN" as const }));
            if (probe.status === "CANCELLED") {
              confirmed = true;
              break;
            }
            await ctx.wait(pollIntervalMs);
          }
          await safeSignal(() => ctx.appendEvent("heartbeat", { cancelled: true, requestId: activeRequestId, upstreamCancel: upstream, cancelConfirmed: confirmed }));
          throw new CancellationRequestedError(job.id);
        }
        if (now() - startedAt > deadlineMs) {
          // Bounded attempt: reclaim re-enters recovery on the same request
          // id; maxAttempts bounds the loop. Never a silent drop.
          await safeSignal(() => ctx.appendEvent("heartbeat", { deadlineExpired: true, requestId: activeRequestId }));
          return { ok: false, retryable: true, code: "PROVIDER_DEADLINE", message: "Provider poll budget expired; reclaim continues on the same request id." };
        }

        const observed = await pollStatus(activeRequestId);
        const status = observed.status;

        if (status === "COMPLETED") {
          // Late-success guard: cancellation wins over completion — observe,
          // record, but never ingest new output for a cancelled job.
          if (await ctx.isCancellationRequested()) {
            await safeSignal(() => ctx.appendEvent("heartbeat", { lateSuccessAfterCancel: true, requestId: activeRequestId }));
            throw new CancellationRequestedError(job.id);
          }
          const result = await fetchResult(activeRequestId);
          let bytes: Uint8Array;
          let contentType: string;
          try {
            const downloaded = await download(result.videoUrl);
            bytes = downloaded.bytes;
            contentType = downloaded.contentType;
          } catch (error) {
            if (isDownloadGone(error)) {
              // Provider charged, result URL expired: unrecoverable fetch.
              throw new PostDispatchUncertainError(`fal result expired for ${activeRequestId}; charge state retained.`);
            }
            return { ok: false, retryable: true, code: "OUTPUT_DOWNLOAD_FAILED", message: error instanceof Error ? error.message : "Result download failed." };
          }
          let technical;
          try {
            technical = validateVideoBytes(bytes, contentType);
          } catch (error) {
            return { ok: false, retryable: true, code: "OUTPUT_VALIDATION_FAILED", message: error instanceof Error ? error.message : "Video validation failed." };
          }
          const contentHash = createHash("sha256").update(bytes).digest("hex");
          await ctx.heartbeat({ ingesting: true, requestId: activeRequestId });
          const stored = await storeBytes({
            projectId: job.projectId,
            bytes,
            contentType,
            filename: `${job.id}-${activeRequestId}.mp4`,
            idempotencyKey: `fal-video-${activeRequestId}`,
          });
          await ctx.heartbeat({ ingested: true, requestId: activeRequestId });

          const repo = repository;
          const assetId = await ingestVideoAsset(repo, scope, job.id, stored.objectKey, contentHash, bytes.byteLength, contentType, technical, result.previewUrl);
          const variant = await recordAssetVariantDurable(scope, {
            assetId, projectId: job.projectId, ownerId: actorId,
            kind: "provider_source", storageKey: stored.objectKey,
            contentHash, mimeType: contentType, byteSize: bytes.byteLength,
          });
          await recordAssetLineageDurable(scope, {
            projectId: job.projectId, ownerId: actorId,
            outputAssetId: assetId, jobId: job.id,
            transform: `generate:fal:${receipt.modelId}`, inputSnapshotHash: createHash("sha256").update(payload.prompt).digest("hex"),
          });
          const take = await recordVideoTake(scope, {
            jobId: job.id, assetId, variantId: variant.id,
            metadata: { requestId: activeRequestId, durationSeconds: technical.durationSeconds, width: technical.width, height: technical.height, referenceRole: payload.referenceRole ?? "i2v-reference" },
          }, repository);
          const evidence = createHash("sha256").update(JSON.stringify({ jobId: job.id, assetId, requestId: activeRequestId })).digest("hex");
          await releaseQuotaForTerminalLedgerOutcome(await ledger.settle(job.projectId, reservationKey, reservation.reservedCredits, evidence));

          // Job-05 evaluation: record inspectable evidence for the accepted
          // Take. Non-blocking — evaluation failure is observed, never thrown.
          await evaluateAndRecord(getStudioRepository(), scope, {
            jobId: job.id, kind: "video",
            requested: {},
            request: {
              prompt: payload.prompt, capability: receipt.capability,
              referenceRole: payload.referenceRole ?? "i2v-reference", resolution: payload.resolution ?? "480p",
              quotedCredits: reservation.reservedCredits, pricingVersionId: reservation.pricingVersionId,
            },
            actual: {
              assetId, takeId: take.id, contentHash,
              width: technical.width, height: technical.height, durationSeconds: technical.durationSeconds,
            },
            lockEntityId: assetId,
          }).then(
            (recorded) => safeSignal(() => ctx.appendEvent("heartbeat", { evaluated: recorded.verdict, evidenceId: recorded.id })),
            () => safeSignal(() => ctx.appendEvent("heartbeat", { evaluationSkipped: true })),
          ).catch(() => safeSignal(() => ctx.appendEvent("heartbeat", { evaluationSkipped: true })));
          // Complete ONLY after the durable asset exists.
          return {
            ok: true,
            result: {
              providerId: "fal",
              modelId: receipt.modelId,
              requestId: activeRequestId,
              objectKey: stored.objectKey,
              assetUrl: stored.signedUrl,
              assetId, variantId: variant.id, takeId: take.id, takeNumber: take.takeNumber,
              durationSeconds: technical.durationSeconds, width: technical.width, height: technical.height,
              previewUrl: result.previewUrl ?? null,
              reservationKey, quotedCredits: reservation.reservedCredits, evidenceHash: evidence,
            },
          };
        }

        if (status === "ERROR" || status === "FAILED" || status === "CANCELLED") {
          return {
            ok: false,
            retryable: false,
            code: "FAL_GENERATION_FAILED",
            message: observed.error ?? `fal reported a failed video generation (${status}).`,
          };
        }

        if (status === "UNKNOWN" && observed.error) {
          throw new PostDispatchUncertainError(`fal status unknown after dispatch: ${observed.error}`);
        }
        if (!runningStatuses.has(status) && status !== "UNKNOWN") {
          // Unrecognized non-terminal state: do not poll forever. Reclaim
          // re-enters recovery on the same request id; attempts bound it.
          throw new PostDispatchUncertainError(`fal reported unrecognized status ${status} after dispatch.`);
        }

        await safeSignal(() => ctx.heartbeat({ providerStatus: status, requestId: activeRequestId }));
        await ctx.wait(pollIntervalMs);
      }
    },
  };
}

async function ingestVideoAsset(
  repo: StudioRepository,
  scope: { organizationId: string; projectId: string; actorId: string },
  jobId: string,
  objectKey: string,
  contentHash: string,
  byteSize: number,
  mimeType: string,
  technical: { durationSeconds: number | null; width: number | null; height: number | null },
  previewUrl: string | undefined,
): Promise<string> {
  const at = new Date().toISOString();
  // Content-addressed identity first: a restart replay resolves the original
  // row before inserting, so recovery never duplicates the asset even where
  // the unique index has not yet applied (plus it backs the index lookup).
  const prior = await repo.list(scope, "studio_assets");
  const priorMatch = prior.find((row) => ((row.payload as Record<string, unknown>).content_hash as string) === contentHash);
  if (priorMatch) return priorMatch.id;
  const assetId = randomUUID();
  try {
    await repo.insert(scope, "studio_assets", {
      id: assetId,
      payload: {
        asset_kind: "video",
        content_hash: contentHash,
        metadata: {
          jobId, objectKey, mimeType, byteSize,
          durationSeconds: technical.durationSeconds, width: technical.width, height: technical.height,
          previewUrl: previewUrl ?? null, kind: "video",
        },
        lineage: { provider: "fal", jobId },
      },
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
    return assetId;
  } catch (error) {
    // Idempotent replay: resolve the existing row by content hash.
    const message = error instanceof Error ? error.message : String(error);
    if (!/unique|duplicate|23505|already exists/i.test(message)) throw error;
    const existing = await repo.list(scope, "studio_assets");
    const match = existing.find((row) => ((row.payload as Record<string, unknown>).content_hash as string) === contentHash);
    if (!match) throw error;
    return match.id;
  }
}

export const falVideoHandler: JobHandler = createFalVideoHandler();

/** Test seam: handler with an in-memory ledger. */
export function createTestFalVideoHandler(deps: Parameters<typeof createFalVideoHandler>[0] & { testLedger?: MemoryImageCreditLedger }): JobHandler {
  const ledger = deps.testLedger ?? new MemoryImageCreditLedger();
  return createFalVideoHandler({ ...deps, ledger });
}

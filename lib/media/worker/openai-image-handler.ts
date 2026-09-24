import "server-only";

import { createHash } from "node:crypto";
import type { JobHandler, WorkerContext } from "@ethen/ai/platform/worker/types";
import { CancellationRequestedError, PostDispatchUncertainError, WorkerAbortedError } from "@ethen/ai/platform/worker/types";
import type { JobRecord } from "@ethen/ai/platform/jobs/index";
import { IMAGE_CAPABILITY, IMAGE_MODEL_ID, IMAGE_PROVIDER_ID, validateImageCommand } from "../image-capability";
import { evaluateAndRecord } from "../evaluation-service";
import { getStudioRepository } from "../persistence/studio-repository";
import { ingestGeneratedImage, findIngestedAsset } from "../image-ingest";
import { MemoryImageCreditLedger, SupabaseImageCreditLedger, type ImageCreditLedger } from "../image-settlement";
import { SupabaseStudioQuotaService, tryReleaseQuota, type StudioQuotaPort } from "../durable-quota";

/**
 * JOB 02 — canonical durable openai-image handler (kind: "openai-image").
 *
 * Owns one Create Image execution on the durable worker:
 *  1. Admission first: a reserved credit reservation must exist — the worker
 *     NEVER sends provider I/O without one.
 *  2. Recovery: a durable dispatch marker means a prior attempt already
 *     sent. NEVER re-send; reconcile (ingest present -> settle + success,
 *     absent -> indeterminate, liability retained).
 *  3. First dispatch: record the marker BEFORE the external send, then send.
 *     Post-send uncertainty (timeout, network loss, unparseable outcome)
 *     becomes INDETERMINATE, never a blind retry and never a false failure.
 *  4. Ingest every billed output (n is constrained to 1 at the contract;
 *     provider over-delivery is still ingested and logged, never dropped).
 *  5. Settle actuals, then complete only after the durable asset exists.
 *
 * No universal exactly-once is claimed: OpenAI offers no idempotent
 * image key, so the marker bounds recovery to at-most-one send per job
 * plus explicit indeterminate liability. requiresAdmission is intentionally
 * unset (no admissionGate is configured on this worker); economic admission
 * happens at the command route and is re-checked here via the reservation.
 */

export interface OpenAIImagePayload {
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  actorId: string;
  reservationKey: string;
  quotedCredits: number;
  pricingVersionId: string;
  receipt?: { providerId?: string; modelId?: string };
}

export interface OpenAIImageOutput {
  url?: string;
  b64?: string;
}

export interface OpenAIImageHandlerDeps {
  generateImage?(input: { prompt: string; model: string; size: string; quality: string }): Promise<{ outputs: OpenAIImageOutput[] }>;
  download?(url: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  ledger?: ImageCreditLedger;
  /** Job 12B: admission claim owner; terminal settle/release frees the slot. */
  quota?: StudioQuotaPort;
  ingest?: typeof ingestGeneratedImage;
  findIngest?: typeof findIngestedAsset;
}

const MARKER_PREFIX = "openai-img:";

function stripMarker(marker: string | null | undefined): string | null {
  if (!marker) return null;
  return marker.startsWith(MARKER_PREFIX) ? marker.slice(MARKER_PREFIX.length) : marker;
}

async function defaultGenerateImage(input: { prompt: string; model: string; size: string; quality: string }): Promise<{ outputs: OpenAIImageOutput[] }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_SETUP_REQUIRED: OPENAI_API_KEY is not configured.");
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: input.model, prompt: input.prompt, n: 1, size: input.size, quality: input.quality }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new Error(`OPENAI_SEND_UNCERTAIN: provider send outcome unknown: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) throw new Error("OPENAI_SETUP_REQUIRED: provider rejected credentials.");
    if (status === 400) throw new Error(`OPENAI_REQUEST_INVALID: ${(await response.text().catch(() => "")).slice(0, 300)}`);
    throw new Error(`OPENAI_SEND_UNCERTAIN: provider status ${status} after send.`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("OPENAI_SEND_UNCERTAIN: provider response was not parseable.");
  }
  const data = (body as { data?: Array<{ url?: string; b64_json?: string }> }).data ?? [];
  return { outputs: data.map((entry) => ({ url: entry.url, b64: entry.b64_json })) };
}

async function defaultDownload(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  } catch (error) {
    throw new Error(`OPENAI_DOWNLOAD_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`OPENAI_DOWNLOAD_FAILED: provider asset status ${response.status}.`);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buffer = new Uint8Array(await response.arrayBuffer());
  return { bytes: buffer, contentType };
}

function isPreSendFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SETUP_REQUIRED|REQUEST_INVALID|COMMAND_INVALID|NO_RESERVATION|APPROVAL_REQUIRED/i.test(message);
}

/** Best-effort lifecycle signal: event interruption must never block terminalization. */
async function safeSignal(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch {
    // Lifecycle events are observational; terminal state carries the truth.
  }
}

export function createOpenAIImageHandler(deps: OpenAIImageHandlerDeps = {}): JobHandler {
  const generateImage = deps.generateImage ?? defaultGenerateImage;
  const download = deps.download ?? defaultDownload;
  const ingest = deps.ingest ?? ingestGeneratedImage;
  const findIngest = deps.findIngest ?? findIngestedAsset;
  const ledger: ImageCreditLedger = deps.ledger ?? new SupabaseImageCreditLedger();
  const quota: StudioQuotaPort = deps.quota ?? new SupabaseStudioQuotaService();

  return {
    kind: "openai-image",
    async execute({ job, ctx }: { job: JobRecord; ctx: WorkerContext }) {
      // Job 12B: a terminal ledger transition frees the admission
      // concurrency slot exactly once (replayed outcomes already released;
      // unknown outcomes keep the slot — fail-closed, window-bounded).
      async function releaseQuotaForTerminalLedgerOutcome(outcome: { replayed: boolean } | null): Promise<void> {
        if (outcome && !outcome.replayed) await tryReleaseQuota(quota, job.projectId);
      }

      const payload = job.payload as Partial<OpenAIImagePayload>;
      const actorId = payload.actorId?.trim() ?? "";
      if (!actorId) {
        return { ok: false, retryable: false, code: "COMMAND_INVALID", message: "openai-image job carries no actorId." };
      }
      const scope = { organizationId: job.organizationId, projectId: job.projectId, actorId };

      // Admission: no reservation, no provider send. Ever.
      const reservationKey = payload.reservationKey?.trim() ?? "";
      if (!reservationKey) {
        return { ok: false, retryable: false, code: "NO_RESERVATION", message: "openai-image job carries no reservation key." };
      }
      const reservation = await ledger.get(job.projectId, reservationKey).catch(() => null);
      if (!reservation) {
        return { ok: false, retryable: false, code: "NO_RESERVATION", message: "No credit reservation backs this execution." };
      }
      if (reservation.state !== "reserved" && reservation.state !== "settled") {
        return { ok: false, retryable: false, code: "NO_RESERVATION", message: `Reservation is not active (state=${reservation.state}).` };
      }
      const settledRecovery = reservation.state === "settled";
      if (settledRecovery) {
        // A settled reservation with an unfinished job is a crash between
        // settle and completion: reconcile only, never send or mutate money.
        const recovered = await findIngest(scope, job.id);
        if (recovered) {
          return {
            ok: true,
            result: { providerId: IMAGE_PROVIDER_ID, modelId: payload.model ?? IMAGE_MODEL_ID, assetId: recovered.assetId, objectKey: recovered.objectKey, contentHash: recovered.contentHash, recovered: true, reservationKey },
          };
        }
        throw new PostDispatchUncertainError("reservation settled but no ingested output found; operator review required.");
      }
      if (typeof payload.quotedCredits === "number" && reservation.reservedCredits !== payload.quotedCredits) {
        return { ok: false, retryable: false, code: "RESERVATION_MISMATCH", message: "Reservation terms do not match the job quote." };
      }
      // Executed-as-quoted: the executed route must match its receipt.
      const receipt = payload.receipt as { providerId?: string; modelId?: string } | undefined;
      if (receipt !== undefined && (receipt.providerId !== IMAGE_PROVIDER_ID || receipt.modelId !== IMAGE_MODEL_ID)) {
        return { ok: false, retryable: false, code: "IMAGE_ROUTE_MISMATCH", message: "Payload route disagrees with its routing receipt." };
      }

      let command;
      try {
        command = validateImageCommand({ prompt: payload.prompt ?? "", model: payload.model, size: payload.size, quality: payload.quality });
      } catch (error) {
        await releaseQuotaForTerminalLedgerOutcome(await ledger.release(job.projectId, reservationKey, "invalid-command").catch(() => null));
        return { ok: false, retryable: false, code: "COMMAND_INVALID", message: error instanceof Error ? error.message : "Invalid image command." };
      }

      // Recovery: a marker means a prior attempt already sent. Never re-send.
      const marker = stripMarker(job.providerOperationKey);
      if (marker) {
        await safeSignal(() => ctx.appendEvent("heartbeat", { recovery: true, marker, attempt: job.attemptCount }));
        const recovered = await findIngest(scope, job.id);
        if (recovered) {
          const evidence = createHash("sha256").update(JSON.stringify({ jobId: job.id, assetId: recovered.assetId, recovered: true })).digest("hex");
          await releaseQuotaForTerminalLedgerOutcome(await ledger.settle(job.projectId, reservationKey, reservation.reservedCredits, evidence).catch(() => null));
          return {
            ok: true,
            result: { providerId: IMAGE_PROVIDER_ID, modelId: command.model, assetId: recovered.assetId, objectKey: recovered.objectKey, contentHash: recovered.contentHash, recovered: true, reservationKey },
          };
        }
        throw new PostDispatchUncertainError(`openai-image sent before (marker ${marker}) with no ingested output; liability retained.`);
      }

      if (ctx.isAborted()) throw new WorkerAbortedError(job.id);
      if (await ctx.isCancellationRequested()) throw new CancellationRequestedError(job.id);

      // Record the dispatch boundary BEFORE the external send.
      const attemptKey = `${job.id}`;
      await ctx.markProviderDispatched(`${MARKER_PREFIX}${attemptKey}`);

      let outputs: OpenAIImageOutput[];
      try {
        outputs = (await generateImage({ prompt: command.prompt, model: command.model, size: command.size, quality: command.quality })).outputs;
      } catch (error) {
        if (isPreSendFailure(error)) {
          await releaseQuotaForTerminalLedgerOutcome(await ledger.release(job.projectId, reservationKey, "pre-send-failure").catch(() => null));
          const message = error instanceof Error ? error.message : String(error);
          const code = /SETUP_REQUIRED/i.test(message) ? "PROVIDER_SETUP_REQUIRED" : "PROVIDER_REQUEST_INVALID";
          return { ok: false, retryable: false, code, message };
        }
        throw new PostDispatchUncertainError(`openai-image send outcome unknown: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!outputs || outputs.length === 0) {
        throw new PostDispatchUncertainError("openai-image provider returned no outputs; charge state unknown.");
      }

      // Ingest EVERY billed output; over-delivery is absorbed and logged, never dropped.
      const ingested: Array<{ assetId: string; objectKey: string; contentHash: string; byteSize: number; width: number | null; height: number | null }> = [];
      for (let index = 0; index < outputs.length; index += 1) {
        if (ctx.isAborted()) throw new WorkerAbortedError(job.id);
        const output = outputs[index] as OpenAIImageOutput;
        let bytes: Uint8Array;
        let contentType = "image/png";
        try {
          if (output.b64) {
            bytes = new Uint8Array(Buffer.from(output.b64, "base64"));
          } else if (output.url) {
            const downloaded = await download(output.url);
            bytes = downloaded.bytes;
            contentType = downloaded.contentType;
          } else {
            throw new Error("OPENAI_DOWNLOAD_FAILED: provider output has neither url nor bytes.");
          }
        } catch (error) {
          // Bounded retry: the reclaim path sees the marker with no output
          // and converts to indeterminate, so spend can never repeat.
          return { ok: false, retryable: true, code: "OUTPUT_DOWNLOAD_FAILED", message: error instanceof Error ? error.message : "Output download failed." };
        }
        const promptHash = createHash("sha256").update(command.prompt).digest("hex");
        let stored;
        try {
          stored = await ingest(
            scope,
            {
              bytes, contentType, filename: `openai-${job.id}-${index}.png`,
              idempotencyKey: `openai-img-ingest-${job.id}-${index}`,
              jobId: job.id, providerId: IMAGE_PROVIDER_ID, modelId: command.model, promptHash,
            },
          );
        } catch (error) {
          return { ok: false, retryable: true, code: "OUTPUT_INGEST_FAILED", message: error instanceof Error ? error.message : "Output ingest failed." };
        }
        ingested.push({ assetId: stored.assetId, objectKey: stored.objectKey, contentHash: stored.contentHash, byteSize: stored.byteSize, width: stored.width, height: stored.height });
        await safeSignal(() => ctx.appendEvent("heartbeat", { ingested: ingested.length, of: outputs.length }));
      }

      const evidence = createHash("sha256").update(JSON.stringify({
        jobId: job.id, capability: IMAGE_CAPABILITY, model: command.model,
        assets: ingested.map((entry) => ({ assetId: entry.assetId, contentHash: entry.contentHash })),
        outputs: outputs.length,
      })).digest("hex");
      // Settle actuals (quoted; over-delivery absorbed). A settle failure
      // retries via reclaim: recovery finds the ingest and settles again.
      await releaseQuotaForTerminalLedgerOutcome(await ledger.settle(job.projectId, reservationKey, reservation.reservedCredits, evidence));

      // Job-05 evaluation: record inspectable evidence for the accepted
      // output. Non-blocking by design — evaluation failure is observed,
      // never thrown into the execution path.
      const firstIngested = ingested[0];
      if (firstIngested) {
        await evaluateAndRecord(getStudioRepository(), scope, {
          jobId: job.id, kind: "image",
          requested: { size: command.size },
          request: {
            prompt: command.prompt, model: command.model, size: command.size, quality: command.quality,
            quotedCredits: reservation.reservedCredits, pricingVersionId: reservation.pricingVersionId,
          },
          actual: {
            assetId: firstIngested.assetId, contentHash: firstIngested.contentHash,
            width: firstIngested.width, height: firstIngested.height,
          },
          lockEntityId: firstIngested.assetId,
        }).then(
          (recorded) => safeSignal(() => ctx.appendEvent("heartbeat", { evaluated: recorded.verdict, evidenceId: recorded.id })),
          () => safeSignal(() => ctx.appendEvent("heartbeat", { evaluationSkipped: true })),
        ).catch(() => safeSignal(() => ctx.appendEvent("heartbeat", { evaluationSkipped: true })));
      }

      return {
        ok: true,
        result: {
          providerId: IMAGE_PROVIDER_ID, modelId: command.model,
          assets: ingested, outputs: outputs.length,
          overDelivered: outputs.length > 1,
          reservationKey, quotedCredits: reservation.reservedCredits,
          evidenceHash: evidence, recovered: false,
        },
      };
    },
  };
}

export const openAIImageHandler: JobHandler = createOpenAIImageHandler();

/** Test seam: handler with an in-memory ledger. */
export function createTestOpenAIImageHandler(deps: OpenAIImageHandlerDeps & { testLedger?: MemoryImageCreditLedger }): JobHandler {
  const ledger = deps.testLedger ?? new MemoryImageCreditLedger();
  return createOpenAIImageHandler({ ...deps, ledger });
}

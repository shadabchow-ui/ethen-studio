/**
 * Studio V3 Job 3 — fal media command: validate -> health -> quote -> admit.
 *
 * One pipeline for the fal-media handler routes (text-to-image,
 * image-editing, text-to-video). Image-to-video stays on the pinned fal-video
 * handler and is refused here with a reason. Provider parameter builders
 * follow the verified schema snapshots exactly (enums, required fields);
 * anything the snapshot does not support is rejected, never dropped.
 */

import "server-only";

import { createServiceClient } from "@ethen/database/service";
import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { createPlatformJobRepository } from "@ethen/ai/platform/jobs/factory";

import { enqueueWithReservation } from "./command-service";
import {
  FAL_MEDIA_ADAPTER_VERSION,
  getFalVerifiedRoute,
  type FalVerifiedRoute,
} from "./fal-routes";
import { computeHealth, type OutcomeSample } from "./provider-health";
import { validateReferenceLocator } from "./reference-ingest";
import { rankRoutes } from "./routing";

export const FAL_MEDIA_PROMPT_MAX_CHARS = 4000;
export const FAL_MEDIA_NEGATIVE_PROMPT_MAX_CHARS = 1000;
export const FAL_MEDIA_MAX_REFERENCES = 5;
export const FAL_MEDIA_SEED_MAX = 2147483647;
/** Routes whose snapshots support negative_prompt. */
const NEGATIVE_PROMPT_ROUTES = new Set(["alibaba/qwen-image-3/edit", "wan/v2.6/text-to-video"]);
/** Wan text-to-video duration enum, verbatim from the snapshot. */
const WAN_T2V_DURATIONS = new Set([5, 10, 15]);
const WAN_T2V_RESOLUTIONS = new Set(["720p", "1080p"]);
const WAN_T2V_ASPECTS = new Set(["16:9", "9:16", "1:1", "4:3", "3:4"]);
const IMAGE_ASPECTS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5"]);
/** Health denial: measured routes below a coin flip are not offered. */
const HEALTH_MIN_SUCCESS_RATE = 0.5;

export interface FalMediaCommandInput {
  workflow: string;
  prompt: string;
  negativePrompt?: string | null;
  references?: ReadonlyArray<{ assetId?: string; url?: string }>;
  seed?: number | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  resolution?: string | null;
}

export interface FalMediaCommand {
  workflow: "text-to-image" | "image-editing" | "text-to-video";
  prompt: string;
  negativePrompt: string | null;
  references: ReadonlyArray<{ canonical: string; refId: string }>;
  seed: number | null;
  durationSeconds: number | null;
  aspectRatio: string | null;
  resolution: string | null;
}

export interface FalMediaReceipt {
  providerId: "fal";
  modelId: string;
  capability: string;
  adapterVersion: typeof FAL_MEDIA_ADAPTER_VERSION;
  schemaSnapshot: string;
}

function fail(message: string): never {
  throw new Error(message);
}

export function validateFalMediaCommand(input: FalMediaCommandInput): FalMediaCommand {
  const route = getFalVerifiedRoute(input.workflow);
  if (!route) fail(`UNKNOWN_WORKFLOW: ${input.workflow} has no verified fal route.`);
  const verified = route as FalVerifiedRoute;
  if (verified.handlerKind !== "fal-media") {
    fail(`WRONG_HANDLER: ${input.workflow} executes on the pinned ${verified.handlerKind} handler, not fal-media.`);
  }
  const prompt = input.prompt?.trim() ?? "";
  if (!prompt) fail("VALIDATION_ERROR: prompt is required.");
  if (prompt.length > FAL_MEDIA_PROMPT_MAX_CHARS) {
    fail(`VALIDATION_ERROR: prompt exceeds ${FAL_MEDIA_PROMPT_MAX_CHARS} characters.`);
  }
  const negativePrompt = input.negativePrompt?.trim() ? String(input.negativePrompt).trim() : null;
  if (negativePrompt && negativePrompt.length > FAL_MEDIA_NEGATIVE_PROMPT_MAX_CHARS) {
    fail(`VALIDATION_ERROR: negative prompt exceeds ${FAL_MEDIA_NEGATIVE_PROMPT_MAX_CHARS} characters.`);
  }
  if (negativePrompt && !NEGATIVE_PROMPT_ROUTES.has(verified.endpointId)) {
    fail(`VALIDATION_ERROR: ${verified.endpointId} supports no negative prompt; omit negativePrompt.`);
  }
  const seed = input.seed ?? null;
  if (seed !== null && (!Number.isInteger(seed) || seed < 0 || seed > FAL_MEDIA_SEED_MAX)) {
    fail(`VALIDATION_ERROR: seed must be an integer 0..${FAL_MEDIA_SEED_MAX}.`);
  }
  const references = input.references ?? [];
  if (references.length > FAL_MEDIA_MAX_REFERENCES) {
    fail(`VALIDATION_ERROR: at most ${FAL_MEDIA_MAX_REFERENCES} references are accepted.`);
  }
  const validatedRefs = references.map((ref, index) => {
    const result = validateReferenceLocator(ref);
    if (!result.ok || !result.canonical || !result.refId) {
      fail(`VALIDATION_ERROR: reference ${index + 1}: ${result.error ?? "invalid"}.`);
    }
    return { canonical: result.canonical, refId: result.refId };
  });
  if (verified.workflow === "image-editing" && validatedRefs.length === 0) {
    fail("VALIDATION_ERROR: image-editing requires at least one reference image.");
  }
  if (verified.workflow !== "image-editing" && validatedRefs.length > 0) {
    fail(`VALIDATION_ERROR: ${verified.workflow} accepts no reference images.`);
  }
  const durationSeconds = input.durationSeconds ?? null;
  const aspectRatio = input.aspectRatio?.trim() ? String(input.aspectRatio).trim() : null;
  const resolution = input.resolution?.trim() ? String(input.resolution).trim() : null;
  if (verified.workflow === "text-to-video") {
    if (durationSeconds === null || !WAN_T2V_DURATIONS.has(durationSeconds)) {
      fail("VALIDATION_ERROR: text-to-video durationSeconds must be one of 5, 10, 15.");
    }
    if (!aspectRatio || !WAN_T2V_ASPECTS.has(aspectRatio)) {
      fail("VALIDATION_ERROR: text-to-video aspectRatio must be one of 16:9, 9:16, 1:1, 4:3, 3:4.");
    }
    if (!resolution || !WAN_T2V_RESOLUTIONS.has(resolution)) {
      fail("VALIDATION_ERROR: text-to-video resolution must be 720p or 1080p.");
    }
  } else {
    if (durationSeconds !== null) fail(`VALIDATION_ERROR: ${verified.workflow} accepts no durationSeconds.`);
    if (resolution !== null) fail(`VALIDATION_ERROR: ${verified.workflow} accepts no resolution.`);
    if (aspectRatio !== null && !IMAGE_ASPECTS.has(aspectRatio)) {
      fail("VALIDATION_ERROR: aspectRatio must be one of 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 4:5.");
    }
  }
  return {
    workflow: verified.workflow as FalMediaCommand["workflow"],
    prompt,
    negativePrompt,
    references: validatedRefs,
    seed,
    durationSeconds,
    aspectRatio,
    resolution,
  };
}

/** Flux image_size grid: landscape/portrait/square pixel pairs. */
function fluxImageSize(aspectRatio: string | null): { width: number; height: number } {
  switch (aspectRatio) {
    case "16:9":
    case "3:2":
      return { width: 1344, height: 768 };
    case "9:16":
    case "2:3":
    case "4:5":
      return { width: 768, height: 1344 };
    case "4:3":
      return { width: 1184, height: 880 };
    case "3:4":
      return { width: 880, height: 1184 };
    default:
      return { width: 1024, height: 1024 };
  }
}

function qwenImageSize(aspectRatio: string | null): string {
  switch (aspectRatio) {
    case "16:9":
      return "landscape_16_9";
    case "9:16":
      return "portrait_16_9";
    case "1:1":
      return "square";
    case "4:3":
      return "landscape_4_3";
    case "3:4":
      return "portrait_4_3";
    default:
      return "auto";
  }
}

/**
 * Build the exact fal queue input body for a verified route. Reference URLs
 * are the worker-resolved provider-fetchable URLs, in command order.
 */
export function buildFalMediaProviderInput(
  route: FalVerifiedRoute,
  command: FalMediaCommand,
  referenceUrls: readonly string[],
): Record<string, unknown> {
  if (route.endpointId === "fal-ai/flux/dev") {
    const body: Record<string, unknown> = {
      prompt: command.prompt,
      image_size: fluxImageSize(command.aspectRatio),
      num_images: 1,
      enable_safety_checker: true,
    };
    if (command.seed !== null) body["seed"] = command.seed;
    return body;
  }
  if (route.endpointId === "alibaba/qwen-image-3/edit") {
    if (referenceUrls.length === 0) fail("VALIDATION_ERROR: image-editing needs resolved reference URLs.");
    const body: Record<string, unknown> = {
      prompt: command.prompt,
      image_urls: [...referenceUrls],
      image_size: qwenImageSize(command.aspectRatio),
      num_images: 1,
      output_format: "png",
      enable_safety_checker: true,
    };
    if (command.negativePrompt) body["negative_prompt"] = command.negativePrompt;
    if (command.seed !== null) body["seed"] = command.seed;
    return body;
  }
  if (route.endpointId === "wan/v2.6/text-to-video") {
    const body: Record<string, unknown> = {
      prompt: command.prompt,
      duration: String(command.durationSeconds),
      resolution: command.resolution,
      aspect_ratio: command.aspectRatio,
      enable_safety_checker: true,
    };
    if (command.negativePrompt) body["negative_prompt"] = command.negativePrompt;
    if (command.seed !== null) body["seed"] = command.seed;
    return body;
  }
  fail(`UNKNOWN_WORKFLOW: no provider builder for ${route.endpointId}.`);
}

export interface FalRouteHealthVerdict {
  allowed: boolean;
  reason: string | null;
  /** Present when allowed on thin or stale evidence (sole verified route). */
  note: string | null;
  sampleSize: number;
}

/**
 * Health gate over measured durable outcomes. A measured route below a coin
 * flip is refused; thin or stale evidence still routes (sole verified route)
 * but is disclosed on the verdict and receipt.
 */
export function assessFalRouteHealth(input: {
  route: FalVerifiedRoute;
  samples: readonly OutcomeSample[];
  nowMs?: number;
}): FalRouteHealthVerdict {
  const health = computeHealth(input.route.providerId, input.route.endpointId, input.route.workflow, input.samples, {
    ...(input.nowMs === undefined ? {} : { nowMs: input.nowMs }),
  });
  if (
    (health.confidence === "high" || health.confidence === "medium") &&
    health.successRate !== null &&
    health.successRate < HEALTH_MIN_SUCCESS_RATE
  ) {
    return {
      allowed: false,
      reason: `UNHEALTHY_ROUTE: ${input.route.endpointId} succeeded ${health.successRate} of ${health.sampleSize} measured runs.`,
      note: null,
      sampleSize: health.sampleSize,
    };
  }
  const thin = health.confidence === "unknown" || health.confidence === "low" || !health.fresh;
  return {
    allowed: true,
    reason: null,
    note: thin
      ? `low-confidence routing: sole verified route ${input.route.endpointId} with ${health.sampleSize} samples (confidence ${health.confidence}${health.fresh ? "" : ", stale"}).`
      : null,
    sampleSize: health.sampleSize,
  };
}

export interface FalPricingRow {
  id: string;
  version: string;
  credits: number;
  creditsPerSecond: number | null;
}

/** Active global fal pricing for a verified route; null when unconfigured. */
export async function lookupFalPricing(input: {
  providerId: string;
  modelId: string;
  capability: string;
}): Promise<FalPricingRow | null> {
  const client = createServiceClient();
  if (!client) return null;
  const { data, error } = await client
    .from("studio_pricing_versions")
    .select("id,version,pricing_input")
    .eq("organization_id", "global")
    .eq("provider_id", input.providerId)
    .eq("model_id", input.modelId)
    .eq("capability", input.capability)
    .eq("version", "v1")
    .is("retired_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; version: string; pricing_input: { credits?: number; creditsPerSecond?: number } };
  const credits = Number(row.pricing_input?.credits ?? NaN);
  if (!Number.isFinite(credits) || credits < 0) return null;
  const perSecond = row.pricing_input?.creditsPerSecond;
  return {
    id: String(row.id),
    version: String(row.version),
    credits,
    creditsPerSecond: typeof perSecond === "number" && Number.isFinite(perSecond) && perSecond >= 0 ? perSecond : null,
  };
}

export interface FalMediaQuote {
  credits: number;
  pricingVersionId: string;
}

export function quoteFalMediaCommand(command: FalMediaCommand, pricing: FalPricingRow): FalMediaQuote {
  if (command.workflow === "text-to-video" && pricing.creditsPerSecond !== null && command.durationSeconds !== null) {
    return { credits: pricing.credits + pricing.creditsPerSecond * command.durationSeconds, pricingVersionId: pricing.id };
  }
  return { credits: pricing.credits, pricingVersionId: pricing.id };
}

export function admitFalQuote(quote: FalMediaQuote, approvedCeiling: number): void {
  if (!Number.isFinite(approvedCeiling)) fail("VALIDATION_ERROR: approved ceiling must be a number.");
  if (approvedCeiling < quote.credits) {
    fail(`APPROVAL_REQUIRED: quote of ${quote.credits} credits exceeds the approved ceiling of ${approvedCeiling}.`);
  }
}

export function falMediaReceipt(route: FalVerifiedRoute): FalMediaReceipt {
  return {
    providerId: route.providerId,
    modelId: route.endpointId,
    capability: route.workflow,
    adapterVersion: FAL_MEDIA_ADAPTER_VERSION,
    schemaSnapshot: route.schemaSnapshot,
  };
}

export interface FalMediaSamples {
  samples: readonly OutcomeSample[];
  nowMs?: number;
}

const HEALTH_SAMPLE_LIMIT = 30;
const HEALTH_TERMINAL = new Set(["completed", "failed", "cancelled", "dead_letter", "timed_out", "indeterminate", "escalated", "halt_unsafe"]);

/**
 * Collect bounded health samples from durable executions of a verified
 * route. Terminal rows only; a completed run counts as accepted output with
 * its quoted credits settled. Empty when nothing durable was measured —
 * callers must treat that as unknown confidence, never as healthy.
 */
export async function collectFalRouteSamples(input: {
  projectId: string;
  route: FalVerifiedRoute;
  limit?: number;
}): Promise<readonly OutcomeSample[]> {
  const service = new DurableJobService({ repository: createPlatformJobRepository() });
  const rows = await service.listJobs({ projectId: input.projectId }, undefined, 100).catch(() => []);
  const samples: OutcomeSample[] = [];
  for (const row of rows) {
    if (samples.length >= (input.limit ?? HEALTH_SAMPLE_LIMIT)) break;
    if (!HEALTH_TERMINAL.has(row.status)) continue;
    const payload = row.payload as Record<string, unknown>;
    if (payload["endpointId"] !== input.route.endpointId) continue;
    const quoted = typeof payload["quotedCredits"] === "number" ? (payload["quotedCredits"] as number) : 0;
    samples.push({
      jobId: row.id,
      status: row.status,
      accepted: row.status === "completed",
      settledCredits: row.status === "completed" ? quoted : 0,
      repairAttempts: 0,
      updatedAt: row.updatedAt,
    });
  }
  return samples;
}

/**
 * Full command path: rank the sole verified route, admit, enqueue with a
 * durable reservation. Returns the job, reservation, quote and receipts.
 */
export async function enqueueFalMediaCommand(input: {
  scope: Parameters<typeof enqueueWithReservation>[0]["scope"];
  actorId: string;
  idempotencyKey: string;
  route: FalVerifiedRoute;
  command: FalMediaCommand;
  quote: FalMediaQuote;
  approvedCeiling: number;
  healthNote: string | null;
}): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  job: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reservation: any;
  receipt: FalMediaReceipt;
  routingReceipt: ReturnType<typeof rankRoutes>["receipt"];
  replayed: boolean;
}> {
  const catalogId = `${input.route.providerId}/${input.route.endpointId}`;
  const { winner, receipt: routingReceipt } = rankRoutes({
    capability: input.route.workflow,
    quotes: { [catalogId]: { credits: input.quote.credits, pricingVersionId: input.quote.pricingVersionId } },
    health: {},
  });
  if (winner !== catalogId) {
    fail("INTERNAL_ERROR: routing selected no verified fal route.");
  }
  const receipt = falMediaReceipt(input.route);
  const commandKey = `fal-${input.idempotencyKey}`;
  const issued = await enqueueWithReservation({
    scope: input.scope,
    actorId: input.actorId,
    idempotencyKey: commandKey,
    payload: {
      kind: "fal-media",
      providerId: input.route.providerId,
      modelId: input.route.endpointId,
      workflow: input.command.workflow,
      endpointId: input.route.endpointId,
      prompt: input.command.prompt,
      negativePrompt: input.command.negativePrompt,
      references: input.command.references.map((ref) => ref.canonical),
      refIds: input.command.references.map((ref) => ref.refId),
      seed: input.command.seed,
      durationSeconds: input.command.durationSeconds,
      aspectRatio: input.command.aspectRatio,
      resolution: input.command.resolution,
      actorId: input.actorId,
      reservationKey: commandKey,
      quotedCredits: input.quote.credits,
      pricingVersionId: input.quote.pricingVersionId,
      capabilityVersion: FAL_MEDIA_ADAPTER_VERSION,
      capability: input.command.workflow,
      healthNote: input.healthNote,
      receipt,
      routingReceipt,
    },
    quote: { credits: input.quote.credits, pricingVersionId: input.quote.pricingVersionId },
    approvedCeiling: input.approvedCeiling,
  });
  return { job: issued.job, reservation: issued.reservation, receipt, routingReceipt, replayed: issued.reservation.replayed };
}

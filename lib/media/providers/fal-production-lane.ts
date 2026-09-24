import "server-only";

import { createHash } from "node:crypto";
import type { DurableStudioJobOrchestrator, StudioJob, StudioJobSubmission } from "../job-orchestrator";

export const FAL_IMAGE_TO_VIDEO_MODEL = "fal-ai/wan-i2v" as const;
export const FAL_IMAGE_TO_VIDEO_ADAPTER_VERSION = "2026-08-02" as const;
export const FAL_IMAGE_TO_VIDEO_CAPABILITY = "image-to-video" as const;

export interface ApprovedFalSourceAsset { id: string; organizationId: string; projectId: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; sha256: string; approvedAt: string; handoffUrl: string; }
export interface FalImageToVideoRequest { organizationId: string; projectId: string; actorId: string; idempotencyKey: string; prompt: string; source: ApprovedFalSourceAsset; timeoutAt: string; policyVersion: string; estimatedCredits: number; }
export type FalFailureCode = "invalid_credentials" | "balance_locked" | "model_access" | "rate_limited" | "provider_5xx" | "queue_timeout" | "missing_result" | "expired_result" | "oversized_result" | "malformed_media" | "storage_failure" | "moderation_failure" | "unknown";
export interface FalProviderMetadata { requestReferenceHash: string; statusReferenceHash: string | null; responseReferenceHash: string | null; }

export function hashFalProviderReference(value: string | null | undefined): string | null { return value?.trim() ? createHash("sha256").update(value).digest("hex") : null; }
export function classifyFalFailure(status: number | null, message = ""): FalFailureCode {
  const text = message.toLowerCase();
  if (status === 401) return "invalid_credentials";
  if (status === 403 && /balance|billing|credit/.test(text)) return "balance_locked";
  if (status === 403) return "model_access";
  if (status === 429) return "rate_limited";
  if (status !== null && status >= 500) return "provider_5xx";
  if (/timeout/.test(text)) return "queue_timeout";
  if (/expired/.test(text)) return "expired_result";
  if (/missing|no video|no result/.test(text)) return "missing_result";
  if (/size|oversized/.test(text)) return "oversized_result";
  if (/malformed|codec|container/.test(text)) return "malformed_media";
  if (/storage/.test(text)) return "storage_failure";
  if (/moderation/.test(text)) return "moderation_failure";
  return "unknown";
}
export function assertFalImageToVideoRequest(input: FalImageToVideoRequest): void {
  if (!input.organizationId || !input.projectId || !input.actorId || !input.idempotencyKey || !input.policyVersion) throw new Error("Fal production submission requires complete tenant and policy scope.");
  if (!input.prompt.trim() || input.prompt.length > 1500) throw new Error("Fal image-to-video prompt is required and limited to 1500 characters.");
  if (input.source.organizationId !== input.organizationId || input.source.projectId !== input.projectId) throw new Error("Fal source asset is not owned by the submitted organization and project.");
  if (!input.source.approvedAt || !/^[a-f0-9]{64}$/i.test(input.source.sha256)) throw new Error("Fal source asset must be approved and content-addressed.");
  if (!input.source.handoffUrl.startsWith("https://")) throw new Error("Fal source handoff must be a controlled HTTPS URL.");
  if (!Number.isFinite(input.estimatedCredits) || input.estimatedCredits < 0) throw new Error("Fal estimated credits are invalid.");
}
/** Creates only a durable pinned job; provider URLs and credentials never enter the job payload. */
export async function submitFalImageToVideo(orchestrator: DurableStudioJobOrchestrator, input: FalImageToVideoRequest): Promise<StudioJob> {
  assertFalImageToVideoRequest(input);
  const submission: StudioJobSubmission = { organizationId: input.organizationId, projectId: input.projectId, actorId: input.actorId, idempotencyKey: input.idempotencyKey, immutableInput: { prompt: input.prompt, sourceAssetId: input.source.id, sourceAssetSha256: input.source.sha256 }, sourceAssetIds: [input.source.id], policyVersion: input.policyVersion, providerId: "fal", adapterVersion: FAL_IMAGE_TO_VIDEO_ADAPTER_VERSION, modelId: FAL_IMAGE_TO_VIDEO_MODEL, capability: FAL_IMAGE_TO_VIDEO_CAPABILITY, costEstimate: { credits: input.estimatedCredits }, timeoutAt: input.timeoutAt };
  return orchestrator.submit(submission);
}
/** Only hashes may enter normal job/provider records. Encrypted endpoint storage is infrastructure-owned. */
export function sanitizeFalProviderMetadata(requestId: string, statusUrl?: string, responseUrl?: string): FalProviderMetadata {
  const requestReferenceHash = hashFalProviderReference(requestId); if (!requestReferenceHash) throw new Error("fal request ID is required.");
  return { requestReferenceHash, statusReferenceHash: hashFalProviderReference(statusUrl), responseReferenceHash: hashFalProviderReference(responseUrl) };
}

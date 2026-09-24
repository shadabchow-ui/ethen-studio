/**
 * Studio V2 Job 04 — provider callback inbox (observational only).
 *
 * fal exposes no signed webhooks, so every inbound claim is recorded and
 * then reconciled by authoritative worker poll. Callbacks can never
 * terminalize, ingest, settle, or release: duplicate and out-of-order
 * deliveries collapse to one durable event each, and late success after
 * cancellation is attributed without touching output or money.
 */

import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { createPlatformJobRepository } from "@ethen/ai/platform/jobs/factory";
import { createServiceClient } from "@ethen/database/service";

export interface ProviderCallbackInput {
  providerId: string;
  requestId: string;
  status: string;
  payload?: Readonly<Record<string, unknown>>;
  signature?: string | null;
  rawBody?: string;
}

export interface ProviderCallbackResult {
  matched: boolean;
  verified: boolean;
  jobId: string | null;
  jobStatus: string | null;
  /** Inbox never changes terminal state. Always true. */
  terminalUnchanged: true;
  lateSuccessAfterCancel: boolean;
  /** True when this exact delivery was already recorded. */
  duplicate: boolean;
}

/** Verify an HMAC-SHA256 shared-secret signature when one is configured. */
export function verifyCallbackSignature(rawBody: string, signature: string | null | undefined, secret: string | undefined): boolean {
  if (!secret) return false;
  if (!signature) return false;
  const expected = createHash("sha256").update(`${secret}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function redactPayload(payload: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> {
  if (!payload) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = /token|secret|signature|key|auth/i.test(key) ? "[redacted]" : value;
  }
  return out;
}

export async function applyProviderCallback(
  input: ProviderCallbackInput,
  deps: {
    findJobByOperationKey?(operationKey: string): Promise<{ id: string; project_id: string; status: string; organization_id: string } | null>;
    recordCallback?(row: { organization_id: string; project_id: string | null; provider_id: string; request_id: string; status: string; verified: boolean; payload: Record<string, unknown> }): Promise<{ duplicate: boolean }>;
    appendJobEvent?(jobId: string, detail: Record<string, unknown>): Promise<void>;
  } = {},
): Promise<ProviderCallbackResult> {
  const providerId = input.providerId?.trim() || "fal";
  const requestId = input.requestId?.trim() ?? "";
  if (!requestId) throw new Error("VIDEO_INBOX_INVALID: requestId is required.");
  const status = input.status?.trim()?.toUpperCase() || "UNKNOWN";
  const secret = process.env.FAL_WEBHOOK_SECRET?.trim() || undefined;
  const verified = verifyCallbackSignature(input.rawBody ?? "", input.signature, secret);

  const operationKey = `${providerId}:${requestId}`;
  const findJob = deps.findJobByOperationKey ?? (async (key: string) => {
    const client = createServiceClient();
    if (!client) throw new Error("Video inbox requires a configured service client.");
    const { data } = await client.from("durable_jobs")
      .select("id,project_id,status,organization_id")
      .eq("provider_operation_key", key)
      .maybeSingle();
    return (data as { id: string; project_id: string; status: string; organization_id: string } | null) ?? null;
  });
  const job = await findJob(operationKey);

  const recordCallback = deps.recordCallback ?? (async (row) => {
    const client = createServiceClient();
    if (!client) throw new Error("Video inbox requires a configured service client.");
    const { error } = await client.from("studio_provider_callbacks").insert(row);
    if (error) {
      if (/unique|duplicate|23505/i.test(error.message)) return { duplicate: true };
      throw new Error(`Callback log failed: ${error.message}`);
    }
    return { duplicate: false };
  });
  const { duplicate } = await recordCallback({
    organization_id: job?.organization_id ?? "",
    project_id: job?.project_id ?? null,
    provider_id: providerId, request_id: requestId,
    status, verified, payload: redactPayload(input.payload),
  });

  if (!job) {
    return { matched: false, verified, jobId: null, jobStatus: null, terminalUnchanged: true, lateSuccessAfterCancel: false, duplicate };
  }
  const service = new DurableJobService({ repository: createPlatformJobRepository() });
  const lateSuccessAfterCancel = (job.status === "cancelled" || job.status === "dead_letter") && status === "COMPLETED";
  const appendEvent = deps.appendJobEvent ?? ((jobId: string, detail: Record<string, unknown>) =>
    service.appendJobEvent(jobId, null, "heartbeat", detail).then(() => undefined));
  // Observational heartbeat only: the inbox never terminalizes. Worker poll
  // reconciliation remains the sole authority for state transitions.
  await appendEvent(job.id, {
    providerCallback: true, providerId, requestId, status, verified, lateSuccessAfterCancel,
  }).catch(() => null);
  return { matched: true, verified, jobId: job.id, jobStatus: job.status, terminalUnchanged: true, lateSuccessAfterCancel, duplicate };
}

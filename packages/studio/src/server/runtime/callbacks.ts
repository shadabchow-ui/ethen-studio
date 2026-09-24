/** Studio V5 runtime — signed provider callbacks (STUDIO_05). Server-only. */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ProjectScope } from "../../contracts/scope";
import { RuntimeError } from "./types";
import type { RuntimeRepository } from "./memory";

export interface CallbackEnvelope {
  jobId: string;
  attemptId: string;
  deliveryId: string;
  eventType: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
  signature: string;
  timestamp: string;
}

export interface CallbackResult {
  accepted: boolean;
  duplicate: boolean;
  jobId: string;
}

/**
 * Verify an HMAC-SHA256 signed provider callback, enforce the replay window,
 * and collapse duplicates by delivery id. Verification failure rejects
 * without touching job state; duplicates acknowledge without re-applying.
 */
export async function handleProviderCallback(
  store: RuntimeRepository,
  scope: ProjectScope,
  envelope: CallbackEnvelope,
  secret: string,
  nowIso?: string,
): Promise<CallbackResult> {
  if (!secret) {
    throw new RuntimeError("CALLBACK_REJECTED", "callback secret is not configured.");
  }
  const nowMs = Date.parse(nowIso ?? new Date().toISOString());
  const sentMs = Date.parse(envelope.timestamp);
  if (!Number.isFinite(sentMs) || Math.abs(nowMs - sentMs) > 5 * 60 * 1000) {
    throw new RuntimeError("CALLBACK_REJECTED", "callback timestamp outside replay window.");
  }
  const expected = signCallback(
    {
      jobId: envelope.jobId,
      attemptId: envelope.attemptId,
      deliveryId: envelope.deliveryId,
      eventType: envelope.eventType,
      occurredAt: envelope.occurredAt,
      payload: envelope.payload,
      timestamp: envelope.timestamp,
    },
    secret,
  );
  if (!safeEqualHex(expected, envelope.signature)) {
    throw new RuntimeError("CALLBACK_REJECTED", "callback signature invalid.");
  }
  const job = await store.get(envelope.jobId, scope);
  if (!job) {
    throw new RuntimeError("NOT_FOUND", "callback job not found in this scope.");
  }
  const first = await store.recordEvent({
    jobId: envelope.jobId,
    scope,
    eventKey: `callback:${envelope.deliveryId}`,
    type: envelope.eventType,
    payload: { attemptId: envelope.attemptId, ...envelope.payload },
  });
  return { accepted: true, duplicate: !first, jobId: envelope.jobId };
}

export function signCallback(
  body: Omit<CallbackEnvelope, "signature">,
  secret: string,
): string {
  const canonical = JSON.stringify({
    jobId: body.jobId,
    attemptId: body.attemptId,
    deliveryId: body.deliveryId,
    eventType: body.eventType,
    occurredAt: body.occurredAt,
    timestamp: body.timestamp,
    payload: body.payload,
  });
  return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** Studio V5 gateway — signed webhook subscriptions and delivery (STUDIO_19). Server-only. */
import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { assertSafeFetchUrl } from "../media/fetch-guard";
import { MediaError } from "../media/types";
import {
  DELIVERY_REPLAY_WINDOW_MS,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_LADDER_MS,
  gatewayError,
  isWebhookEvent,
  type DeliveryEnvelope,
  type DeliveryStatus,
  type WebhookDelivery,
  type WebhookEvent,
  type WebhookSubscription,
} from "./types";

export interface MintSubscriptionInput {
  tenantId: string;
  projectId?: string | null;
  url: string;
  events: readonly string[];
  nowIso?: string;
}

/**
 * Register an SSRF-safe HTTPS destination. Reuses the tested j07 fetch
 * guard: non-https, credentialed, localhost, private, link-local and
 * reserved targets are rejected before anything is stored.
 */
export function mintSubscription(input: MintSubscriptionInput): {
  subscription: WebhookSubscription;
  secret: string;
  secretHash: string;
} {
  if (!input.tenantId.trim()) throw gatewayError("BAD_REQUEST", "tenantId is required.");
  if (input.events.length === 0) {
    throw gatewayError("BAD_REQUEST", "At least one webhook event is required.");
  }
  for (const event of input.events) {
    if (!isWebhookEvent(event)) {
      throw gatewayError("BAD_REQUEST", `Unknown webhook event: ${event}.`);
    }
  }
  let normalized: string;
  try {
    normalized = assertSafeFetchUrl(input.url).toString();
  } catch (error) {
    if (error instanceof MediaError) {
      throw gatewayError("SSRF_BLOCKED", `Webhook destination is not permitted: ${error.message}`, {
        reason: "SSRF_BLOCKED",
      });
    }
    throw error;
  }
  const now = input.nowIso ?? new Date().toISOString();
  const secret = `ethwh_${randomBytes(32).toString("hex")}`;
  return {
    subscription: {
      subscriptionId: `whsub_${randomBytes(9).toString("hex")}`,
      tenantId: input.tenantId,
      projectId: input.projectId ?? null,
      url: normalized,
      events: [...input.events] as WebhookEvent[],
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    secret,
    secretHash: createHash("sha256").update(secret, "utf8").digest("hex"),
  };
}

export function hashPayload(payload: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

/**
 * Sign a delivery. The signature binds timestamp + delivery id + payload
 * hash so a captured signature cannot be transplanted onto another
 * delivery, payload, or time.
 */
export function signDelivery(
  input: { deliveryId: string; timestamp: string; payload: Readonly<Record<string, unknown>> },
  secret: string,
): { payloadHash: string; signature: string } {
  if (!secret) throw gatewayError("INTERNAL", "Webhook secret is not configured.");
  const payloadHash = hashPayload(input.payload);
  const message = `${input.timestamp}.${input.deliveryId}.${payloadHash}`;
  const signature = createHmac("sha256", secret).update(message, "utf8").digest("hex");
  return { payloadHash, signature };
}

export function buildDeliveryEnvelope(input: {
  deliveryId: string;
  subscriptionId: string;
  eventType: WebhookEvent;
  occurredAt: string;
  timestamp?: string;
  payload: Readonly<Record<string, unknown>>;
  secret: string;
}): DeliveryEnvelope {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const { payloadHash, signature } = signDelivery(
    { deliveryId: input.deliveryId, timestamp, payload: input.payload },
    input.secret,
  );
  return {
    deliveryId: input.deliveryId,
    subscriptionId: input.subscriptionId,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    timestamp,
    payload: input.payload,
    payloadHash,
    signature,
  };
}

function safeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Verify an inbound signed delivery (receiver-side helper and worker
 * self-check). Enforces the replay window, payload-hash binding, and
 * HMAC authenticity. Throws DELIVERY_FAILED; never partial-accepts.
 */
export function verifyDeliveryEnvelope(
  envelope: DeliveryEnvelope,
  secret: string,
  nowIso?: string,
): void {
  if (!secret) throw gatewayError("DELIVERY_FAILED", "Webhook secret is not configured.");
  const nowMs = Date.parse(nowIso ?? new Date().toISOString());
  const sentMs = Date.parse(envelope.timestamp);
  if (!Number.isFinite(sentMs) || Math.abs(nowMs - sentMs) > DELIVERY_REPLAY_WINDOW_MS) {
    throw gatewayError("DELIVERY_FAILED", "Delivery timestamp is outside the replay window.", {
      reason: "REPLAY_WINDOW",
    });
  }
  const expectedHash = hashPayload(envelope.payload);
  if (!safeEqualHex(expectedHash, envelope.payloadHash)) {
    throw gatewayError("DELIVERY_FAILED", "Delivery payload does not match its hash.", {
      reason: "PAYLOAD_MISMATCH",
    });
  }
  const { signature } = signDelivery(
    { deliveryId: envelope.deliveryId, timestamp: envelope.timestamp, payload: envelope.payload },
    secret,
  );
  if (!safeEqualHex(signature, envelope.signature)) {
    throw gatewayError("DELIVERY_FAILED", "Delivery signature is invalid.", {
      reason: "BAD_SIGNATURE",
    });
  }
}

/**
 * Next retry instant after a failed attempt, or null when the ladder is
 * exhausted (initial attempt + 7 retries) and the delivery dead-letters.
 * `failures` counts completed failed attempts so far (1-based).
 */
export function nextRetryAtMs(lastAttemptMs: number, failures: number): number | null {
  const ladderIndex = failures - 1;
  if (ladderIndex < 0 || ladderIndex >= WEBHOOK_RETRY_LADDER_MS.length) return null;
  return lastAttemptMs + WEBHOOK_RETRY_LADDER_MS[ladderIndex];
}

export function deliveryStatusAfterFailure(attemptCount: number): DeliveryStatus {
  return attemptCount >= WEBHOOK_MAX_ATTEMPTS ? "dead_letter" : "retrying";
}

export function newDeliveryId(): string {
  return `whd_${randomBytes(12).toString("hex")}`;
}

export function initialDelivery(input: {
  deliveryId: string;
  subscription: WebhookSubscription;
  eventType: WebhookEvent;
  payload: Readonly<Record<string, unknown>>;
  nowIso?: string;
}): WebhookDelivery {
  if (!input.subscription.events.includes(input.eventType)) {
    throw gatewayError("BAD_REQUEST", "Subscription is not registered for this event.");
  }
  const now = input.nowIso ?? new Date().toISOString();
  return {
    deliveryId: input.deliveryId,
    subscriptionId: input.subscription.subscriptionId,
    tenantId: input.subscription.tenantId,
    eventType: input.eventType,
    payloadHash: hashPayload(input.payload),
    status: "pending",
    attemptCount: 0,
    nextRetryAt: null,
    lastError: null,
    lastStatusCode: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Only dead-letter deliveries may be manually redelivered. */
export function assertRedeliverable(delivery: WebhookDelivery): void {
  if (delivery.status !== "dead_letter") {
    throw gatewayError("CONFLICT", "Only dead-letter deliveries can be redelivered.", {
      deliveryId: delivery.deliveryId,
      status: delivery.status,
    });
  }
}

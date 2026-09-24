/** Studio V5 gateway — in-memory store (STUDIO_19). Server-only. */
import "server-only";
import { createHash } from "node:crypto";
import { byokMetadata, registerByokReference, resolveByokForTenant, type ByokResolution } from "./byok";
import type { GatewayAuthStore } from "./facade";
import { keyMetadata, mintApiKey, type MintKeyInput } from "./keys";
import { initialDelivery, mintSubscription, type MintSubscriptionInput } from "./webhooks";
import {
  gatewayError,
  type ApiKeyMetadata,
  type ApiKeyRecord,
  type ByokMetadata,
  type ByokReference,
  type DeliveryStatus,
  type IdempotencyRecord,
  type WebhookDelivery,
  type WebhookEvent,
  type WebhookSubscription,
} from "./types";

export interface RotateKeyResult {
  record: ApiKeyRecord;
  metadata: ApiKeyMetadata;
  secret: string;
}

/**
 * Memory GatewayStore. Production binds the Supabase implementation
 * over the j19 schema; this store proves the kernel semantics and
 * backs tests. Secrets are never retained beyond mint/rotate return.
 */
export class MemoryGatewayStore implements GatewayAuthStore {
  private readonly keys = new Map<string, ApiKeyRecord>();
  private readonly keyHashIndex = new Map<string, string>();
  private readonly byok = new Map<string, ByokReference>();
  private readonly subscriptions = new Map<string, WebhookSubscription>();
  private readonly subscriptionSecrets = new Map<string, string>();
  private readonly deliveries = new Map<string, WebhookDelivery>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();

  // -- API keys -----------------------------------------------------

  createKey(input: MintKeyInput): { record: ApiKeyRecord; metadata: ApiKeyMetadata; secret: string } {
    const { record, secret } = mintApiKey(input);
    this.keys.set(record.keyId, record);
    this.keyHashIndex.set(record.keyHash, record.keyId);
    return { record, metadata: keyMetadata(record), secret };
  }

  async findKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const keyId = this.keyHashIndex.get(keyHash);
    return keyId ? (this.keys.get(keyId) ?? null) : null;
  }

  async touchKeyUsed(keyId: string, nowIso: string): Promise<void> {
    const record = this.keys.get(keyId);
    if (record) record.updatedAt = nowIso;
  }

  getKey(keyId: string, tenantId: string): ApiKeyRecord {
    const record = this.keys.get(keyId);
    if (!record || record.tenantId !== tenantId) {
      throw gatewayError("NOT_FOUND", "API key not found.");
    }
    return record;
  }

  listKeys(tenantId: string): ApiKeyMetadata[] {
    return [...this.keys.values()]
      .filter((record) => record.tenantId === tenantId)
      .map(keyMetadata);
  }

  revokeKey(keyId: string, tenantId: string, nowIso?: string): ApiKeyMetadata {
    const record = this.getKey(keyId, tenantId);
    if (!record.revokedAt) {
      record.revokedAt = nowIso ?? new Date().toISOString();
      record.updatedAt = record.revokedAt;
    }
    return keyMetadata(record);
  }

  /**
   * Rotate: mint a successor linked to the old key, then revoke the old
   * key. The old secret stops working; the new secret returns once.
   */
  rotateKey(keyId: string, tenantId: string, actorId: string, nowIso?: string): RotateKeyResult {
    const record = this.getKey(keyId, tenantId);
    if (record.revokedAt) {
      throw gatewayError("CONFLICT", "Revoked keys cannot be rotated.");
    }
    const now = nowIso ?? new Date().toISOString();
    const { record: next, secret } = mintApiKey({
      tenantId: record.tenantId,
      name: record.name,
      scope: record.scope,
      createdBy: actorId,
      expiresAt: record.expiresAt,
      rotatedFromKeyId: record.keyId,
      nowIso: now,
    });
    this.keys.set(next.keyId, next);
    this.keyHashIndex.set(next.keyHash, next.keyId);
    record.revokedAt = now;
    record.updatedAt = now;
    return { record: next, metadata: keyMetadata(next), secret };
  }

  // -- BYOK ---------------------------------------------------------

  registerByok(input: Parameters<typeof registerByokReference>[0]): ByokMetadata {
    const reference = registerByokReference(input);
    this.byok.set(reference.referenceId, reference);
    return byokMetadata(reference);
  }

  listByok(tenantId: string): ByokMetadata[] {
    return [...this.byok.values()]
      .filter((reference) => reference.tenantId === tenantId)
      .map(byokMetadata);
  }

  resolveByok(referenceId: string, tenantId: string): ByokResolution {
    const reference = this.byok.get(referenceId);
    if (!reference) throw gatewayError("NOT_FOUND", "BYOK reference not found.");
    return resolveByokForTenant(reference, tenantId);
  }

  // -- Webhooks -----------------------------------------------------

  createSubscription(input: MintSubscriptionInput): {
    subscription: WebhookSubscription;
    secret: string;
  } {
    const { subscription, secret, secretHash } = mintSubscription(input);
    this.subscriptions.set(subscription.subscriptionId, subscription);
    this.subscriptionSecrets.set(subscription.subscriptionId, secretHash);
    void secretHash;
    return { subscription, secret };
  }

  getSubscription(subscriptionId: string, tenantId: string): WebhookSubscription {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription || subscription.tenantId !== tenantId) {
      throw gatewayError("NOT_FOUND", "Webhook subscription not found.");
    }
    return subscription;
  }

  subscriptionSecret(subscriptionId: string, tenantId: string): string | null {
    this.getSubscription(subscriptionId, tenantId);
    // Memory-only: the hash is not reversible, so deliveries in tests
    // carry their own secret. Production resolves the sealed secret
    // worker-side. Returning null keeps the hash unexposed.
    return null;
  }

  listSubscriptions(tenantId: string): WebhookSubscription[] {
    return [...this.subscriptions.values()].filter((s) => s.tenantId === tenantId);
  }

  deleteSubscription(subscriptionId: string, tenantId: string): void {
    this.getSubscription(subscriptionId, tenantId);
    this.subscriptions.delete(subscriptionId);
    this.subscriptionSecrets.delete(subscriptionId);
  }

  recordDelivery(delivery: WebhookDelivery): WebhookDelivery {
    const existing = this.deliveries.get(delivery.deliveryId);
    if (existing) return existing;
    this.deliveries.set(delivery.deliveryId, delivery);
    return delivery;
  }

  getDelivery(deliveryId: string, tenantId: string): WebhookDelivery {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery || delivery.tenantId !== tenantId) {
      throw gatewayError("NOT_FOUND", "Webhook delivery not found.");
    }
    return delivery;
  }

  listDeliveries(tenantId: string, subscriptionId?: string): WebhookDelivery[] {
    return [...this.deliveries.values()].filter(
      (d) => d.tenantId === tenantId && (!subscriptionId || d.subscriptionId === subscriptionId),
    );
  }

  markDeliveryAttempt(
    deliveryId: string,
    tenantId: string,
    input: { status: DeliveryStatus; nextRetryAt: string | null; lastError: string | null; lastStatusCode: number | null; nowIso: string },
  ): WebhookDelivery {
    const delivery = this.getDelivery(deliveryId, tenantId);
    delivery.attemptCount += 1;
    delivery.status = input.status;
    delivery.nextRetryAt = input.nextRetryAt;
    delivery.lastError = input.lastError;
    delivery.lastStatusCode = input.lastStatusCode;
    delivery.updatedAt = input.nowIso;
    return delivery;
  }

  resetDeliveryForRedelivery(deliveryId: string, tenantId: string, nowIso: string): WebhookDelivery {
    const delivery = this.getDelivery(deliveryId, tenantId);
    delivery.status = "pending";
    delivery.attemptCount = 0;
    delivery.nextRetryAt = null;
    delivery.lastError = null;
    delivery.lastStatusCode = null;
    delivery.updatedAt = nowIso;
    return delivery;
  }

  // -- Idempotency --------------------------------------------------

  async readIdempotency(scopeKey: string, key: string): Promise<IdempotencyRecord | null> {
    return this.idempotency.get(`${scopeKey}:${key}`) ?? null;
  }

  async writeIdempotency(scopeKey: string, record: IdempotencyRecord): Promise<void> {
    this.idempotency.set(`${scopeKey}:${record.key}`, record);
  }

  /** Test helper: seed one delivery exactly like the worker would. */
  seedDelivery(input: {
    deliveryId: string;
    subscriptionId: string;
    tenantId: string;
    eventType: WebhookEvent;
    payload: Readonly<Record<string, unknown>>;
    nowIso?: string;
  }): WebhookDelivery {
    const subscription = this.getSubscription(input.subscriptionId, input.tenantId);
    return this.recordDelivery(initialDelivery({ ...input, subscription }));
  }
}

export function createMemoryGatewayStore(): MemoryGatewayStore {
  return new MemoryGatewayStore();
}

export function hashRecordedSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

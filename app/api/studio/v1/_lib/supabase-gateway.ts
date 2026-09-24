import "server-only";

/**
 * STUDIO_19 gateway route-adapter access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed gateway store over the j19 schema. Service-role
 * bypasses RLS, so every call binds explicit tenant scope. Secrets are
 * never selected back: keys keep hashes, webhook secrets are sealed.
 */
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import {
  GatewayError,
  keyMetadata,
  type ApiKeyMetadata,
  type ApiKeyRecord,
  type ByokMetadata,
  type ByokReference,
  type DeliveryStatus,
  type IdempotencyRecord,
  type KeyScope,
  type WebhookDelivery,
  type WebhookEvent,
  type WebhookSubscription,
} from "@ethen/studio-core/server/gateway";

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function int(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function obj(row: Row, key: string): Record<string, unknown> {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toKey(row: Row): ApiKeyRecord {
  return {
    keyId: str(row, "key_id"),
    tenantId: str(row, "tenant_id"),
    name: str(row, "name"),
    keyHash: str(row, "key_hash"),
    prefix: str(row, "prefix"),
    scope: {
      projects: strArray(row["scope_projects"]),
      tasks: strArray(row["scope_tasks"]),
    } satisfies KeyScope,
    createdBy: str(row, "created_by"),
    expiresAt: nullableStr(row, "expires_at"),
    revokedAt: nullableStr(row, "revoked_at"),
    rotatedFromKeyId: nullableStr(row, "rotated_from_key_id"),
    legacyOrigin: nullableStr(row, "legacy_origin"),
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
  };
}

function toSubscription(row: Row): WebhookSubscription {
  return {
    subscriptionId: str(row, "subscription_id"),
    tenantId: str(row, "tenant_id"),
    projectId: nullableStr(row, "project_id"),
    url: str(row, "url"),
    events: strArray(row["events"]) as WebhookEvent[],
    status: str(row, "status") === "suspended" ? "suspended" : "active",
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
  };
}

function toDelivery(row: Row): WebhookDelivery {
  return {
    deliveryId: str(row, "delivery_id"),
    subscriptionId: str(row, "subscription_id"),
    tenantId: str(row, "tenant_id"),
    eventType: str(row, "event_type") as WebhookEvent,
    payloadHash: str(row, "payload_hash"),
    status: str(row, "status") as DeliveryStatus,
    attemptCount: int(row, "attempt_count"),
    nextRetryAt: nullableStr(row, "next_retry_at"),
    lastError: nullableStr(row, "last_error"),
    lastStatusCode: typeof row["last_status_code"] === "number" ? row["last_status_code"] : null,
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
  };
}

/** Persistent Supabase gateway store — the production Studio binding. */
export class SupabaseGatewayStore {
  // -- API keys ---------------------------------------------------

  async findKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_api_keys")
      .select("*")
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (error) throw new GatewayError("INTERNAL", `Key lookup failed: ${error.message}`);
    return data ? toKey(data as Row) : null;
  }

  async touchKeyUsed(keyId: string, nowIso: string): Promise<void> {
    const client = requireServiceClient();
    const { error } = await client.rpc("studio_v5_touch_gateway_key", {
      p_key_id: keyId,
      p_now: nowIso,
    });
    if (error) throw new GatewayError("INTERNAL", `Key touch failed: ${error.message}`);
  }

  async insertKey(record: ApiKeyRecord): Promise<void> {
    const client = requireServiceClient();
    const { error } = await client.from("studio_v5_api_keys").insert({
      key_id: record.keyId,
      tenant_id: record.tenantId,
      name: record.name,
      key_hash: record.keyHash,
      prefix: record.prefix,
      scope_projects: record.scope.projects,
      scope_tasks: record.scope.tasks,
      created_by: record.createdBy,
      expires_at: record.expiresAt,
      revoked_at: record.revokedAt,
      rotated_from_key_id: record.rotatedFromKeyId,
      legacy_origin: record.legacyOrigin,
    });
    if (error) throw new GatewayError("INTERNAL", `Key insert failed: ${error.message}`);
  }

  async listKeys(tenantId: string): Promise<ApiKeyMetadata[]> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_api_keys")
      .select("key_id,name,prefix,scope_projects,scope_tasks,expires_at,revoked_at,rotated_from_key_id,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new GatewayError("INTERNAL", `Key list failed: ${error.message}`);
    return ((data ?? []) as Row[]).map((row) =>
      keyMetadata({ ...toKey({ ...row, tenant_id: tenantId, key_hash: "", created_by: "" }) }),
    );
  }

  async getKey(keyId: string, tenantId: string): Promise<ApiKeyRecord | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_api_keys")
      .select("*")
      .eq("key_id", keyId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new GatewayError("INTERNAL", `Key read failed: ${error.message}`);
    return data ? toKey(data as Row) : null;
  }

  async revokeKey(keyId: string, tenantId: string, nowIso: string): Promise<ApiKeyRecord | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_api_keys")
      .update({ revoked_at: nowIso, updated_at: nowIso })
      .eq("key_id", keyId)
      .eq("tenant_id", tenantId)
      .is("revoked_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw new GatewayError("INTERNAL", `Key revoke failed: ${error.message}`);
    if (data) return toKey(data as Row);
    return this.getKey(keyId, tenantId);
  }

  // -- BYOK ---------------------------------------------------------

  async insertByok(reference: ByokReference): Promise<void> {
    const client = requireServiceClient();
    const { error } = await client.from("studio_v5_byok_references").insert({
      reference_id: reference.referenceId,
      tenant_id: reference.tenantId,
      provider: reference.provider,
      vault_key_id: reference.vaultKeyId,
      label: reference.label,
      created_by: reference.createdBy,
    });
    if (error) throw new GatewayError("INTERNAL", `BYOK insert failed: ${error.message}`);
  }

  async listByok(tenantId: string): Promise<ByokMetadata[]> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_byok_references")
      .select("reference_id,provider,label,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new GatewayError("INTERNAL", `BYOK list failed: ${error.message}`);
    return ((data ?? []) as Row[]).map((row) => ({
      referenceId: str(row, "reference_id"),
      provider: str(row, "provider"),
      label: str(row, "label"),
      createdAt: str(row, "created_at"),
    }));
  }

  // -- Webhooks -----------------------------------------------------

  async insertSubscription(input: {
    subscription: WebhookSubscription;
    secretHash: string;
  }): Promise<void> {
    const client = requireServiceClient();
    const { error } = await client.from("studio_v5_webhook_subscriptions").insert({
      subscription_id: input.subscription.subscriptionId,
      tenant_id: input.subscription.tenantId,
      project_id: input.subscription.projectId,
      url: input.subscription.url,
      events: input.subscription.events,
      secret_hash: input.secretHash,
      status: input.subscription.status,
    });
    if (error) throw new GatewayError("INTERNAL", `Subscription insert failed: ${error.message}`);
  }

  async listSubscriptions(tenantId: string): Promise<WebhookSubscription[]> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_webhook_subscriptions")
      .select("subscription_id,tenant_id,project_id,url,events,status,created_at,updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new GatewayError("INTERNAL", `Subscription list failed: ${error.message}`);
    return ((data ?? []) as Row[]).map(toSubscription);
  }

  async getSubscription(subscriptionId: string, tenantId: string): Promise<WebhookSubscription | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_webhook_subscriptions")
      .select("subscription_id,tenant_id,project_id,url,events,status,created_at,updated_at")
      .eq("subscription_id", subscriptionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new GatewayError("INTERNAL", `Subscription read failed: ${error.message}`);
    return data ? toSubscription(data as Row) : null;
  }

  async deleteSubscription(subscriptionId: string, tenantId: string): Promise<boolean> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_webhook_subscriptions")
      .delete()
      .eq("subscription_id", subscriptionId)
      .eq("tenant_id", tenantId)
      .select("subscription_id");
    if (error) throw new GatewayError("INTERNAL", `Subscription delete failed: ${error.message}`);
    return ((data ?? []) as Row[]).length > 0;
  }

  async insertDelivery(input: {
    delivery: WebhookDelivery;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    const client = requireServiceClient();
    const { error } = await client.from("studio_v5_webhook_deliveries").insert({
      delivery_id: input.delivery.deliveryId,
      subscription_id: input.delivery.subscriptionId,
      tenant_id: input.delivery.tenantId,
      event_type: input.delivery.eventType,
      payload: input.payload,
      payload_hash: input.delivery.payloadHash,
      status: input.delivery.status,
    });
    if (error) {
      if (error.message.includes("duplicate") || error.code === "23505") return;
      throw new GatewayError("INTERNAL", `Delivery insert failed: ${error.message}`);
    }
  }

  async listDeliveries(tenantId: string, subscriptionId?: string, limit = 25): Promise<WebhookDelivery[]> {
    const client = requireServiceClient();
    let query = client
      .from("studio_v5_webhook_deliveries")
      .select("delivery_id,subscription_id,tenant_id,event_type,payload_hash,status,attempt_count,next_retry_at,last_error,last_status_code,created_at,updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (subscriptionId) query = query.eq("subscription_id", subscriptionId);
    const { data, error } = await query;
    if (error) throw new GatewayError("INTERNAL", `Delivery list failed: ${error.message}`);
    return ((data ?? []) as Row[]).map(toDelivery);
  }

  async getDelivery(deliveryId: string, tenantId: string): Promise<WebhookDelivery | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_webhook_deliveries")
      .select("delivery_id,subscription_id,tenant_id,event_type,payload_hash,status,attempt_count,next_retry_at,last_error,last_status_code,created_at,updated_at")
      .eq("delivery_id", deliveryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new GatewayError("INTERNAL", `Delivery read failed: ${error.message}`);
    return data ? toDelivery(data as Row) : null;
  }

  async resetDelivery(deliveryId: string, tenantId: string, nowIso: string): Promise<WebhookDelivery | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_webhook_deliveries")
      .update({
        status: "pending",
        attempt_count: 0,
        next_retry_at: null,
        last_error: null,
        last_status_code: null,
        updated_at: nowIso,
      })
      .eq("delivery_id", deliveryId)
      .eq("tenant_id", tenantId)
      .eq("status", "dead_letter")
      .select("delivery_id,subscription_id,tenant_id,event_type,payload_hash,status,attempt_count,next_retry_at,last_error,last_status_code,created_at,updated_at")
      .maybeSingle();
    if (error) throw new GatewayError("INTERNAL", `Delivery reset failed: ${error.message}`);
    return data ? toDelivery(data as Row) : null;
  }

  // -- Idempotency --------------------------------------------------

  async readIdempotency(scopeKey: string, key: string): Promise<IdempotencyRecord | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_gateway_idempotency")
      .select("*")
      .eq("scope_key", scopeKey)
      .eq("key", key)
      .maybeSingle();
    if (error) throw new GatewayError("INTERNAL", `Idempotency read failed: ${error.message}`);
    if (!data) return null;
    const row = data as Row;
    return {
      key: str(row, "key"),
      requestHash: str(row, "request_hash"),
      statusCode: int(row, "status_code"),
      response: obj(row, "response"),
      createdAt: str(row, "created_at"),
      expiresAt: str(row, "expires_at"),
    };
  }

  async writeIdempotency(scopeKey: string, record: IdempotencyRecord): Promise<void> {
    const client = requireServiceClient();
    const { error } = await client.from("studio_v5_gateway_idempotency").upsert(
      {
        scope_key: scopeKey,
        key: record.key,
        request_hash: record.requestHash,
        status_code: record.statusCode,
        response: record.response,
        expires_at: record.expiresAt,
      },
      { onConflict: "scope_key,key" },
    );
    if (error) throw new GatewayError("INTERNAL", `Idempotency write failed: ${error.message}`);
  }
}

export type { ResolvedScope };

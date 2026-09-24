import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { mintApiKey, keyMetadata } from "@ethen/studio-core/server/gateway";
import { requireSessionTenant, gatewayFailure } from "../../../../_lib/gateway-auth";
import { SupabaseGatewayStore } from "../../../../_lib/supabase-gateway";

export const dynamic = "force-dynamic";

/**
 * STUDIO_19 — V1 gateway key rotation. Mints a successor linked to the
 * old key, revokes the old key, and reveals the new secret once. The
 * old secret stops working immediately.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ keyId: string }> },
): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const { keyId } = await context.params;
    const store = new SupabaseGatewayStore();
    const record = await store.getKey(keyId, tenant.session.tenantId);
    if (!record) return studioError("NOT_FOUND", "API key not found.");
    if (record.revokedAt) return studioError("CONFLICT", "Revoked keys cannot be rotated.");
    const now = new Date().toISOString();
    const { record: next, secret } = mintApiKey({
      tenantId: record.tenantId,
      name: record.name,
      scope: record.scope,
      createdBy: tenant.session.actorId,
      expiresAt: record.expiresAt,
      rotatedFromKeyId: record.keyId,
      nowIso: now,
    });
    await store.insertKey(next);
    await store.revokeKey(keyId, tenant.session.tenantId, now);
    return studioSuccess({ key: keyMetadata(next), secret }, undefined, 201);
  } catch (error) {
    return gatewayFailure(error);
  }
}

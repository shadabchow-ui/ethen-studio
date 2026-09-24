import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { keyMetadata } from "@ethen/studio-core/server/gateway";
import { requireSessionTenant, gatewayFailure } from "../../../_lib/gateway-auth";
import { SupabaseGatewayStore } from "../../../_lib/supabase-gateway";

export const dynamic = "force-dynamic";

/**
 * STUDIO_19 — V1 gateway single-key adapter. GET reads metadata;
 * DELETE revokes (one-way; revoked keys stay revoked).
 */
export async function GET(
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
    return studioSuccess({ key: keyMetadata(record) });
  } catch (error) {
    return gatewayFailure(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ keyId: string }> },
): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const { keyId } = await context.params;
    const store = new SupabaseGatewayStore();
    const record = await store.revokeKey(keyId, tenant.session.tenantId, new Date().toISOString());
    if (!record) return studioError("NOT_FOUND", "API key not found.");
    return studioSuccess({ key: keyMetadata(record) });
  } catch (error) {
    return gatewayFailure(error);
  }
}

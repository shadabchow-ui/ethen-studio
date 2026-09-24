import { readStudioJson, studioSuccess } from "@/lib/media/api-v1";
import { byokMetadata, registerByokReference } from "@ethen/studio-core/server/gateway";
import { requireSessionTenant, gatewayFailure } from "../../_lib/gateway-auth";
import { SupabaseGatewayStore } from "../../_lib/supabase-gateway";

export const dynamic = "force-dynamic";

/**
 * STUDIO_19 — V1 gateway BYOK adapter. GET lists vault-reference
 * metadata; POST registers an opaque vault pointer (provider +
 * vaultKeyId + label). Plaintext credentials are never accepted,
 * stored, logged, or returned.
 */
export async function GET(): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const store = new SupabaseGatewayStore();
    const references = await store.listByok(tenant.session.tenantId);
    return studioSuccess({
      state: references.length === 0 ? "empty" : "ready",
      references,
      total: references.length,
    });
  } catch (error) {
    return gatewayFailure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const body = await readStudioJson(request);
    const provider = typeof body.provider === "string" ? body.provider : "";
    const vaultKeyId = typeof body.vaultKeyId === "string" ? body.vaultKeyId : "";
    const label = typeof body.label === "string" ? body.label : "";
    const reference = registerByokReference({
      tenantId: tenant.session.tenantId,
      provider,
      vaultKeyId,
      label,
      createdBy: tenant.session.actorId,
    });
    const store = new SupabaseGatewayStore();
    await store.insertByok(reference);
    return studioSuccess({ reference: byokMetadata(reference) }, undefined, 201);
  } catch (error) {
    return gatewayFailure(error);
  }
}

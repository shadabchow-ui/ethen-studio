import { readStudioJson, studioSuccess } from "@/lib/media/api-v1";
import { mintSubscription } from "@ethen/studio-core/server/gateway";
import { requireSessionTenant, gatewayFailure } from "../../_lib/gateway-auth";
import { SupabaseGatewayStore } from "../../_lib/supabase-gateway";

export const dynamic = "force-dynamic";

/**
 * STUDIO_19 — V1 gateway webhook subscriptions. GET lists the tenant's
 * subscriptions; POST registers an SSRF-safe HTTPS destination for
 * job/event deliveries and reveals the signing secret once.
 */
export async function GET(): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const store = new SupabaseGatewayStore();
    const subscriptions = await store.listSubscriptions(tenant.session.tenantId);
    return studioSuccess({
      state: subscriptions.length === 0 ? "empty" : "ready",
      subscriptions,
      total: subscriptions.length,
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
    const url = typeof body.url === "string" ? body.url : "";
    const events = Array.isArray(body.events) ? body.events.filter((e): e is string => typeof e === "string") : [];
    const projectId = typeof body.projectId === "string" && body.projectId.trim().length > 0 ? body.projectId : null;
    const { subscription, secret, secretHash } = mintSubscription({
      tenantId: tenant.session.tenantId,
      projectId,
      url,
      events,
    });
    const store = new SupabaseGatewayStore();
    await store.insertSubscription({ subscription, secretHash });
    return studioSuccess({ subscription, secret }, undefined, 201);
  } catch (error) {
    return gatewayFailure(error);
  }
}

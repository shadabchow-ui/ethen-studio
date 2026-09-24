import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { requireSessionTenant, gatewayFailure } from "../../../_lib/gateway-auth";
import { SupabaseGatewayStore } from "../../../_lib/supabase-gateway";

export const dynamic = "force-dynamic";

/**
 * STUDIO_19 — V1 gateway single-subscription adapter. GET reads one
 * subscription; DELETE removes it (deliveries cascade).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ subscriptionId: string }> },
): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const { subscriptionId } = await context.params;
    const store = new SupabaseGatewayStore();
    const subscription = await store.getSubscription(subscriptionId, tenant.session.tenantId);
    if (!subscription) return studioError("NOT_FOUND", "Webhook subscription not found.");
    return studioSuccess({ subscription });
  } catch (error) {
    return gatewayFailure(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ subscriptionId: string }> },
): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const { subscriptionId } = await context.params;
    const store = new SupabaseGatewayStore();
    const removed = await store.deleteSubscription(subscriptionId, tenant.session.tenantId);
    if (!removed) return studioError("NOT_FOUND", "Webhook subscription not found.");
    return studioSuccess({ subscriptionId, deleted: true });
  } catch (error) {
    return gatewayFailure(error);
  }
}

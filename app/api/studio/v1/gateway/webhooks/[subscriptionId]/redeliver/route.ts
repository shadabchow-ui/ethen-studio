import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { assertRedeliverable } from "@ethen/studio-core/server/gateway";
import { requireSessionTenant, gatewayFailure } from "../../../../_lib/gateway-auth";
import { SupabaseGatewayStore } from "../../../../_lib/supabase-gateway";

export const dynamic = "force-dynamic";

/**
 * STUDIO_19 — V1 gateway manual redelivery. Only dead-letter
 * deliveries can be reset to pending; redelivery re-sends the signed
 * envelope and never re-runs the originating job.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ subscriptionId: string }> },
): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const { subscriptionId } = await context.params;
    const body = await readStudioJson(request);
    const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : "";
    if (!deliveryId) return studioError("VALIDATION_ERROR", "deliveryId is required.");
    const store = new SupabaseGatewayStore();
    const subscription = await store.getSubscription(subscriptionId, tenant.session.tenantId);
    if (!subscription) return studioError("NOT_FOUND", "Webhook subscription not found.");
    const delivery = await store.getDelivery(deliveryId, tenant.session.tenantId);
    if (!delivery || delivery.subscriptionId !== subscriptionId) {
      return studioError("NOT_FOUND", "Webhook delivery not found.");
    }
    assertRedeliverable(delivery);
    const reset = await store.resetDelivery(deliveryId, tenant.session.tenantId, new Date().toISOString());
    if (!reset) return studioError("CONFLICT", "Delivery is no longer dead-lettered.");
    return studioSuccess({ delivery: reset });
  } catch (error) {
    return gatewayFailure(error);
  }
}

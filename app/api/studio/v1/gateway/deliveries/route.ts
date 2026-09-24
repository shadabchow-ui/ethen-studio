import { NextRequest } from "next/server";
import { parseStudioPagination, studioSuccess } from "@/lib/media/api-v1";
import { requireSessionTenant, gatewayFailure } from "../../_lib/gateway-auth";
import { SupabaseGatewayStore } from "../../_lib/supabase-gateway";

export const dynamic = "force-dynamic";

/**
 * STUDIO_19 — V1 gateway delivery status. Lists webhook delivery
 * attempts (pending/delivered/retrying/dead_letter) with attempt
 * counts and next-retry instants. Errors are redacted reason strings.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const url = new URL(request.url);
    const page = parseStudioPagination(url);
    const subscriptionId = url.searchParams.get("subscriptionId");
    const store = new SupabaseGatewayStore();
    const deliveries = await store.listDeliveries(
      tenant.session.tenantId,
      subscriptionId && subscriptionId.length > 0 ? subscriptionId : undefined,
      page.limit,
    );
    return studioSuccess({
      state: deliveries.length === 0 ? "empty" : "ready",
      deliveries,
      total: deliveries.length,
    });
  } catch (error) {
    return gatewayFailure(error);
  }
}

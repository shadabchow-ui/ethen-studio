import { studioSuccess } from "@/lib/media/api-v1";
import { buildOpenApiDocument } from "@ethen/studio-core/server/gateway";
import { requireSessionTenant, gatewayFailure } from "../../_lib/gateway-auth";

export const dynamic = "force-dynamic";

/**
 * STUDIO_19 — V1 gateway published OpenAPI. The document is generated
 * from the bound facade table: a path appears only when a handler is
 * bound, and no catalog endpoint is promised executable.
 */
export async function GET(): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    return studioSuccess({ openapi: buildOpenApiDocument() });
  } catch (error) {
    return gatewayFailure(error);
  }
}

import { studioSuccess } from "@/lib/media/api-v1";
import { buildOpenApiDocument } from "@ethen/studio-core/server/gateway";
import { requireSessionTenant, gatewayFailure } from "../../_lib/gateway-auth";

export const dynamic = "force-dynamic";

/**
 * STUDIO_19 — Studio Media API published OpenAPI (OD-11 A: the Studio-
 * scoped media API keeps its /api/studio/v1/gateway/* route paths; only
 * the user-facing label changed). The document is generated from the
 * bound facade table: a path appears only when a handler is bound, and
 * no catalog endpoint is promised executable.
 */
export async function GET(): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const document = buildOpenApiDocument();
    return studioSuccess({
      openapi: { ...document, info: { ...document.info, title: "Studio Media API" } },
    });
  } catch (error) {
    return gatewayFailure(error);
  }
}

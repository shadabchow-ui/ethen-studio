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
export const STUDIO_MEDIA_API_TITLE = "Studio Media API";

/** Relabel the vendored gateway document without touching its paths. */
export function withStudioMediaApiTitle<T extends { info: Record<string, unknown> }>(document: T): T {
  return { ...document, info: { ...document.info, title: STUDIO_MEDIA_API_TITLE } };
}

export async function GET(): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    return studioSuccess({ openapi: withStudioMediaApiTitle(buildOpenApiDocument()) });
  } catch (error) {
    return gatewayFailure(error);
  }
}

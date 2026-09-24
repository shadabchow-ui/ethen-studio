/** Studio V5 gateway — published OpenAPI derived from the facade table (STUDIO_19). Server-only. */
import "server-only";

export interface FacadeRoute {
  method: "GET" | "POST" | "DELETE";
  path: string;
  summary: string;
  auth: "session" | "api-key" | "either";
  idempotent: boolean;
}

/**
 * The bound facade surface. The published document is generated from
 * this table — a path appears here only when a handler is bound, and
 * no catalog endpoint is ever promised executable by this document.
 */
export const FACADE_ROUTES: readonly FacadeRoute[] = [
  { method: "POST", path: "/api/studio/v1/gateway/jobs", summary: "Admit a Studio job through the shared kernel (API key).", auth: "api-key", idempotent: true },
  { method: "POST", path: "/api/studio/v1/gateway/compat/generate", summary: "Legacy media-generate compatibility adapter over kernel admission.", auth: "either", idempotent: true },
  { method: "GET", path: "/api/studio/v1/gateway/keys", summary: "List API key metadata (never secrets).", auth: "session", idempotent: false },
  { method: "POST", path: "/api/studio/v1/gateway/keys", summary: "Mint a scoped API key; the secret is revealed once.", auth: "session", idempotent: true },
  { method: "GET", path: "/api/studio/v1/gateway/keys/{keyId}", summary: "Read one API key's metadata.", auth: "session", idempotent: false },
  { method: "DELETE", path: "/api/studio/v1/gateway/keys/{keyId}", summary: "Revoke an API key.", auth: "session", idempotent: false },
  { method: "POST", path: "/api/studio/v1/gateway/keys/{keyId}/rotate", summary: "Rotate an API key; the old secret stops working.", auth: "session", idempotent: true },
  { method: "GET", path: "/api/studio/v1/gateway/byok", summary: "List BYOK vault references (metadata only).", auth: "session", idempotent: false },
  { method: "POST", path: "/api/studio/v1/gateway/byok", summary: "Register a BYOK vault reference (pointer only, never a secret).", auth: "session", idempotent: true },
  { method: "GET", path: "/api/studio/v1/gateway/webhooks", summary: "List webhook subscriptions.", auth: "session", idempotent: false },
  { method: "POST", path: "/api/studio/v1/gateway/webhooks", summary: "Subscribe an HTTPS webhook destination.", auth: "session", idempotent: true },
  { method: "GET", path: "/api/studio/v1/gateway/webhooks/{subscriptionId}", summary: "Read one webhook subscription.", auth: "session", idempotent: false },
  { method: "DELETE", path: "/api/studio/v1/gateway/webhooks/{subscriptionId}", summary: "Delete a webhook subscription.", auth: "session", idempotent: false },
  { method: "POST", path: "/api/studio/v1/gateway/webhooks/{subscriptionId}/redeliver", summary: "Manually redeliver a dead-letter delivery.", auth: "session", idempotent: true },
  { method: "GET", path: "/api/studio/v1/gateway/deliveries", summary: "List webhook delivery attempts with status.", auth: "session", idempotent: false },
  { method: "GET", path: "/api/studio/v1/gateway/openapi", summary: "This published OpenAPI document.", auth: "either", idempotent: false },
];

export const GATEWAY_OPENAPI_VERSION = "1.0.0";

export interface GatewayOpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  paths: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export function buildOpenApiDocument(routes: readonly FacadeRoute[] = FACADE_ROUTES): GatewayOpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const entry = (paths[route.path] ??= {});
    entry[route.method.toLowerCase()] = {
      summary: route.summary,
      security: route.auth === "session" ? [{ session: [] }] : route.auth === "api-key" ? [{ apiKey: [] }] : [{ session: [] }, { apiKey: [] }],
      ...(route.idempotent ? { parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } }] } : {}),
      responses: {
        "2XX": { description: "Envelope `{ ok: true, data }`." },
        "4XX": { description: "Envelope `{ ok: false, error: { code, message, requestId } }`." },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Ethen Studio V1 Gateway",
      version: GATEWAY_OPENAPI_VERSION,
      description:
        "Versioned facade over the Studio kernel. Every path calls the same admission/policy/settlement " +
        "functions as the Studio UI. Catalog discovery is separate; this document promises no catalog endpoint executable.",
    },
    paths,
  };
}

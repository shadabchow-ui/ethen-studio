# Studio Media API

The Studio-scoped developer API for media jobs: scoped API keys, BYOK
vault references, signed webhook deliveries, and a bound-facade OpenAPI
document. Per OD-11 decision A it stays in Studio; general model access
belongs to the AI Gateway.

```text
LABEL=Studio Media API
ROUTES=/api/studio/v1/gateway/{keys,byok,webhooks,openapi,jobs,deliveries,compat}
OPENAPI_TITLE=Studio Media API
```

Route paths are unchanged — only the user-facing label changed from
"V1 gateway" to "Studio Media API" (OpenAPI `info.title`, settings UI,
this doc). Test IDs and element IDs keep the `gateway-*` prefix.

- Keys and webhooks UI: `/studio/settings` → API access section.
- Published document: `GET /api/studio/v1/gateway/openapi` (session or
  API key). A path appears only when a handler is bound; the document
  never promises a catalog endpoint executable.
- Job admission calls the same kernel functions as the Studio UI.

# Environment variables (names only)

Never commit values. This inventory was taken from the standalone closure
(`grep` over `app/`, `lib/`, `components/`, `packages/*/src`, `proxy.ts`).

## REQUIRED_PRODUCTION

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   auth (Clerk)
CLERK_SECRET_KEY                    auth (Clerk, server)
NEXT_PUBLIC_SUPABASE_URL            data (Supabase)
NEXT_PUBLIC_SUPABASE_ANON_KEY       data (Supabase browser client)
SUPABASE_SERVICE_ROLE_KEY           data (Supabase service client)
FAL_KEY                             execution (FAL provider lane)
ETHEN_STUDIO_PRIVATE_ALPHA          private-alpha gate master switch
ETHEN_STUDIO_ENROLLED_ORG_IDS       private-alpha org allowlist (fail-closed)
ETHEN_STUDIO_ENROLLED_USER_IDS      private-alpha user allowlist (fail-closed)
ETHEN_STUDIO_STORAGE_READY          readiness: storage
ETHEN_STUDIO_WORKER_READY           readiness: worker
ETHEN_STUDIO_POLICY_READY           readiness: policy
ETHEN_STUDIO_OPENAI_READY           readiness: openai lane
ETHEN_STUDIO_FAL_READY              readiness: fal lane
ETHEN_STUDIO_KILL_SWITCH            kill switch
```

## OPTIONAL

```text
FAL_WEBHOOK_SECRET                  FAL webhook verification
OPENAI_API_KEY                      OpenAI provider lane
NEXT_PUBLIC_ETHEN_STUDIO_MEDIA_BASE_URL / ETHEN_STUDIO_MEDIA_BASE_URL
                                    showcase media base override
NEXT_PUBLIC_STUDIO_PLACEHOLDER_BASE placeholder asset base override
NEXT_PUBLIC_STUDIO_V4_LAB_MEDIA_BASE
                                    V4 lab media base override
NEXT_PUBLIC_RELEASE_SHA             build metadata
NEXT_PUBLIC_RUM_ENABLED / NEXT_PUBLIC_RUM_ENDPOINT
                                    real-user measurement
NEXT_PUBLIC_PLATFORM_ORIGIN         cross-product links
NEXT_PUBLIC_CLERK_SIGN_IN_URL / NEXT_PUBLIC_CLERK_SIGN_UP_URL
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL / NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL
                                    auth routing
CLERK_WEBHOOK_SECRET                Clerk webhook verification
SUPABASE_JWT_SECRET                 DB bridge verification
BILLING_MODE                        billing lane mode
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_CATALOG_JSON
                                    billing provider
STUDIO_UPLOAD_SCANNER_URL / ATTACHMENT_SCANNER_URL
                                    upload scanning
REDIS_URL / UPSTASH_REDIS_URL       distributed limiter / cache
LIVEKIT_WS_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
                                    realtime voice transport
AI_GATEWAY_API_KEY / VERCEL_AI_GATEWAY_BASE_URL / ETHEN_VERCEL_AI_GATEWAY_ENABLED
                                    AI gateway routing
ETHEN_DEFAULT_PROVIDER / ETHEN_OPENAI_COMPATIBLE_BASE_URL / ETHEN_OPENAI_COMPATIBLE_MODEL
DEEPSEEK_API_KEY / DEEPSEEK_API_BASE_URL / DEEPSEEK_MODEL
OLLAMA_BASE_URL
OPENAI_EMBEDDING_API_KEY / OPENAI_EMBEDDING_BASE_URL / OPENAI_EMBEDDING_MODEL / OPENAI_EMBEDDING_DIMENSIONS
EMBEDDING_PROVIDER
                                    provider/model routing + embeddings
ETHEN_AUDIT_SIGNING_KEY             audit signing
ETHEN_GOVERNANCE_REPOSITORY_MODE / ETHEN_MOCK_MODE / ETHEN_MODEL_INTELLIGENCE_LEGACY_LOADER
JOB_SEARCH_MOCK_MODE / PRODUCT_SCRAPER_MOCK_MODE / SHIPPING_MOCK_MODE / TRAVEL_SEARCH_MOCK_MODE
                                    lane/mode switches
GATEWAY_BYPASS_ALLOWLIST_CHECK / GATEWAY_BYPASS_BUDGET_CHECK
GATEWAY_DISTRIBUTED_LIMITER
STREAM_RETENTION_MINUTES
DEPLOYMENT_TARGET / ETHEN_DEPLOYMENT_TARGET
                                    gateway/runtime tuning
ETHEN_ENABLE_FOUNDER                portfolio registry flag (founder-gated listing)
```

## DEVELOPMENT_ONLY

```text
ETHEN_STUDIO_LOCAL_AUTH_BYPASS     Tier 1/2 loopback lane (with NODE_ENV=development)
ETHEN_DEV_AUTH_BYPASS              dev-only synthetic actor (never on Vercel)
STUDIO_LOCAL_RUNTIME               fixture lane selector (value: fixture)
ETHEN_STUDIO_ALLOW_PARTIAL         PARTIAL-qualification execution (value: 1)
STUDIO_BASE_URL                    browser-test target (default http://localhost:3015)
STUDIO_REALTIME_SYNTHETIC          synthetic realtime in tests
STUDIO_V5_MOCK_MODE                mock lane switch
VITEST                             test runtime flag
NODE_ENV / VERCEL_ENV              platform lanes (never set manually in prod)
```

## LEGACY_UNUSED / NOT_IN_REPO

```text
TEMPORAL_ADDRESS / TEMPORAL_NAMESPACE / STUDIO_WORKFLOW_QUEUE / STUDIO_ACTIVITY_QUEUE
  Referenced only by LOCAL_STUDIO_TIERS.md for the full-stack tier; the
  durable worker (@ethen/studio-worker) is a separate deployable and no
  TEMPORAL_* name is read by code in this repo.
```

## Vercel comparison

S3-owned: compare REQUIRED_PRODUCTION against the Vercel project env and
preserve existing secrets. Do not copy secret values into git. No
production env changes were made during separation (LOCAL WORK ONLY).

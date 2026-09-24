/**
 * Authoritative environment-variable contract for Ethen.
 *
 * This module is isomorphic (no `server-only`) so middleware, instrumentation,
 * and tests can share one classification + validation path.
 *
 * Reports never include secret values — only names, classifications, and
 * configured/missing state.
 */

export type EnvClassification =
  | "PUBLIC_CLIENT"
  | "SERVER_SECRET"
  | "INTERNAL_RUNTIME"
  | "OPTIONAL_PROVIDER"
  | "QUARANTINED";

export type RuntimeLane = "production" | "preview" | "development" | "test";

/**
 * Production deployment target (Job 8). Each Vercel project serves exactly one
 * target from its own exact HTTPS origin — the two values must never be shared
 * or copied across projects.
 */
export type DeploymentTarget = "chat" | "platform";

export const CHAT_PRODUCTION_ORIGIN = "https://chat.upcube.ai";
export const PLATFORM_PRODUCTION_ORIGIN = "https://platform.upcube.ai";

export function expectedProductionOriginForTarget(target: DeploymentTarget): string {
  return target === "chat" ? CHAT_PRODUCTION_ORIGIN : PLATFORM_PRODUCTION_ORIGIN;
}

/** Reads ETHEN_DEPLOYMENT_TARGET (preferred) or DEPLOYMENT_TARGET. Unknown values yield null. */
export function resolveDeploymentTargetFromEnv(
  env: Record<string, string | undefined> = process.env,
): DeploymentTarget | null {
  const raw = (env.ETHEN_DEPLOYMENT_TARGET ?? env.DEPLOYMENT_TARGET)?.trim().toLowerCase();
  if (raw === "chat" || raw === "platform") return raw;
  return null;
}

export interface EnvVarSpec {
  name: string;
  classification: EnvClassification;
  /**
   * Unconditionally required before a production deploy can serve durable
   * traffic. Use this only for platform-wide dependencies (database, auth,
   * Redis) — never for a product-specific provider credential.
   */
  requiredProduction: boolean;
  description: string;
  /** Alternative names that satisfy the same requirement. */
  anyOf?: readonly string[];
  /**
   * M0-J03: a product-scoped runtime credential. Required in production only
   * when the named canonical product is actually available to users.
   *
   * This is what keeps the contract honest in both directions: a frozen or
   * unavailable product (Voice, Flow, Operator, Studio, Design) must not force
   * an operator to hold a credential it will never use, and a product that IS
   * live must fail closed rather than degrade silently when its provider
   * credential is missing.
   *
   * The available-product set is supplied by the caller (see
   * `StartupEnvOptions.availableProducts`) rather than imported, so this module
   * stays isomorphic and free of a dependency on the portfolio registry.
   */
  requiredForProduct?: string;
  /** Required in production only when BILLING_MODE=ENABLED. */
  requiredWhenBillingEnabled?: boolean;
}

/** Explicit, recorded billing posture. Never leave billing half-enabled. */
export type BillingMode = "ENABLED" | "DISABLED_FOR_GA";

export interface StartupEnvOptions {
  /**
   * Canonical product ids that are actually available to users in this
   * deployment. Drives `requiredForProduct`. Defaults to none, which is the
   * conservative reading: no product-scoped credential is forced.
   */
  availableProducts?: readonly string[];
  /**
   * Deployment target for per-target origin enforcement. Defaults to
   * `resolveDeploymentTargetFromEnv(env)`, so callers passing `process.env`
   * get target awareness without threading the value explicitly.
   */
  deploymentTarget?: DeploymentTarget | null;
}

export interface EnvVarStatus {
  name: string;
  classification: EnvClassification;
  requiredProduction: boolean;
  /** requiredProduction after lifecycle and billing-mode resolution. */
  effectivelyRequired: boolean;
  configured: boolean;
  placeholder: boolean;
  description: string;
}

export interface StartupEnvIssue {
  name: string;
  code:
    | "MISSING_REQUIRED"
    | "PLACEHOLDER"
    | "MOCK_MODE_IN_PRODUCTION"
    | "MOCK_MODE_IN_PREVIEW"
    | "ORIGIN_NOT_EXPLICIT"
    | "ORIGIN_NOT_HTTPS"
    | "LOCALHOST_ORIGIN"
    | "QUARANTINED_IN_PRODUCTION"
    | "PUBLIC_SECRET_LEAK"
    | "REDIS_REQUIRED"
    | "CLERK_KEY_PAIR_INVALID"
    | "CLERK_ROUTE_INVALID"
    | "BILLING_MODE_INVALID"
    | "PRODUCT_CREDENTIAL_MISSING"
    | "DEPLOYMENT_TARGET_INVALID"
    | "TARGET_ORIGIN_MISMATCH";
  message: string;
}

export interface StartupEnvReport {
  lane: RuntimeLane;
  failClosed: boolean;
  ok: boolean;
  mockModeRequested: boolean;
  mockModeEnabled: boolean;
  productionOrigin: string | null;
  redisConfigured: boolean;
  billingMode: BillingMode;
  availableProducts: readonly string[];
  deploymentTarget: DeploymentTarget | null;
  issues: StartupEnvIssue[];
  vars: EnvVarStatus[];
}

const PLACEHOLDER_FRAGMENTS = [
  "your-project",
  "your-anon-key",
  "your-service-role-key",
  "your-anthropic-key",
  "your-openai-key",
  "your-deepseek-key",
  "your-exa-key",
  "your-twelve-data-key",
  "your-languagetool",
  "your-copyleaks",
  "your-stripe",
  "your-upstash-url",
  "dev-placeholder",
] as const;

export const ENV_CONTRACT: readonly EnvVarSpec[] = [
  { name: "ETHEN_VERCEL_AI_GATEWAY_ENABLED", classification: "INTERNAL_RUNTIME", requiredProduction: false, description: "Explicit Vercel AI Gateway enablement/kill switch" },
  { name: "CLERK_WEBHOOK_SECRET", classification: "SERVER_SECRET", requiredProduction: false,
    description: "Clerk webhook signature verification; webhook fails closed when absent" },
  { name: "SUPABASE_JWT_SECRET", classification: "SERVER_SECRET", requiredProduction: true,
    description: "Server-only accepted Supabase HS256 signing key for bridged Clerk-to-Supabase RLS; Chat and Platform persistence fail closed when absent" },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    classification: "PUBLIC_CLIENT",
    requiredProduction: true,
    description: "Supabase project URL",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    classification: "PUBLIC_CLIENT",
    requiredProduction: true,
    description: "Supabase anon key (RLS-constrained)",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    classification: "SERVER_SECRET",
    requiredProduction: true,
    description: "Supabase service-role key — server-only, bypasses RLS",
  },
  {
    name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    classification: "PUBLIC_CLIENT",
    requiredProduction: true,
    description: "Clerk publishable key",
  },
  {
    name: "CLERK_SECRET_KEY",
    classification: "SERVER_SECRET",
    requiredProduction: true,
    description: "Clerk secret key — server-only",
  },
  {
    name: "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
    classification: "PUBLIC_CLIENT",
    requiredProduction: true,
    description: "Clerk sign-in path (defaults to /sign-in)",
  },
  {
    name: "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
    classification: "PUBLIC_CLIENT",
    requiredProduction: true,
    description: "Clerk sign-up path (defaults to /sign-up)",
  },
  {
    name: "NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL",
    classification: "PUBLIC_CLIENT",
    requiredProduction: true,
    description: "Post sign-in fallback path",
  },
  {
    name: "NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL",
    classification: "PUBLIC_CLIENT",
    requiredProduction: true,
    description: "Post sign-up fallback path",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    classification: "PUBLIC_CLIENT",
    requiredProduction: true,
    description: "Canonical per-target public origin (chat: https://chat.upcube.ai, platform: https://platform.upcube.ai); must match ETHEN_PRODUCTION_ORIGIN",
  },
  {
    name: "ETHEN_DEPLOYMENT_TARGET",
    classification: "INTERNAL_RUNTIME",
    requiredProduction: false,
    description: "Deployment target: exactly chat or platform. Required in production so the per-target origin can be certified (DEPLOYMENT_TARGET is accepted as a legacy alias)",
  },
  {
    name: "ETHEN_PRODUCTION_ORIGIN",
    classification: "INTERNAL_RUNTIME",
    requiredProduction: true,
    description: "Explicit per-target production origin; must be https, must match NEXT_PUBLIC_APP_URL, and must equal the deployment target's canonical origin (chat: https://chat.upcube.ai, platform: https://platform.upcube.ai)",
  },
  {
    name: "ETHEN_ADMIN_ALLOWLIST",
    classification: "SERVER_SECRET",
    requiredProduction: true,
    description: "Comma-separated canonical Supabase profile IDs required for admin access",
  },
  {
    name: "REDIS_URL",
    classification: "SERVER_SECRET",
    requiredProduction: true,
    anyOf: ["REDIS_URL", "UPSTASH_REDIS_URL", "UPSTASH_REDIS_REST_URL"],
    description: "Redis / Upstash connection URL",
  },
  {
    name: "UPSTASH_REDIS_URL",
    classification: "SERVER_SECRET",
    requiredProduction: false,
    description: "Upstash Redis URL (ioredis)",
  },
  {
    name: "UPSTASH_REDIS_REST_URL",
    classification: "SERVER_SECRET",
    requiredProduction: false,
    description: "Upstash Redis REST URL",
  },
  {
    name: "UPSTASH_REDIS_REST_TOKEN",
    classification: "SERVER_SECRET",
    requiredProduction: false,
    description: "Upstash Redis REST token",
  },
  {
    name: "NEXT_PUBLIC_ETHEN_MOCK_MODE",
    classification: "PUBLIC_CLIENT",
    requiredProduction: false,
    description: "Local UI mock toggle — never honored in preview or production",
  },
  {
    name: "ANTHROPIC_API_KEY",
    classification: "OPTIONAL_PROVIDER",
    requiredProduction: false,
    description: "Anthropic live provider",
  },
  {
    name: "OPENAI_API_KEY",
    classification: "OPTIONAL_PROVIDER",
    requiredProduction: false,
    description: "OpenAI live provider",
  },
  {
    name: "DEEPSEEK_API_KEY",
    classification: "OPTIONAL_PROVIDER",
    requiredProduction: false,
    description: "DeepSeek live provider",
  },
  {
    name: "ETHEN_OPENAI_COMPATIBLE_BASE_URL",
    classification: "OPTIONAL_PROVIDER",
    requiredProduction: false,
    description: "OpenAI-compatible provider base URL",
  },
  {
    name: "ETHEN_OPENAI_COMPATIBLE_MODEL",
    classification: "OPTIONAL_PROVIDER",
    requiredProduction: false,
    description: "OpenAI-compatible default model id",
  },
  {
    name: "ETHEN_OPENAI_COMPATIBLE_API_KEY",
    classification: "OPTIONAL_PROVIDER",
    requiredProduction: false,
    description: "OpenAI-compatible provider API key (required for non-localhost endpoints)",
  },
  {
    name: "ETHEN_DEFAULT_PROVIDER",
    classification: "INTERNAL_RUNTIME",
    requiredProduction: false,
    description: "Preferred gateway provider id: openai | anthropic | deepseek | openai-compatible",
  },
  {
    name: "STRIPE_PRICE_CATALOG_JSON",
    classification: "SERVER_SECRET",
    requiredProduction: false,
    requiredWhenBillingEnabled: true,
    description: "Opaque Stripe price catalog — offer keys, plan keys, capabilities, and limits. Never expose to the client. Required when BILLING_MODE=ENABLED.",
  },
  {
    name: "EXA_API_KEY",
    classification: "OPTIONAL_PROVIDER",
    requiredProduction: false,
    description: "Exa live research",
  },
  {
    name: "STRIPE_SECRET_KEY",
    classification: "SERVER_SECRET",
    requiredProduction: false,
    requiredWhenBillingEnabled: true,
    description: "Stripe secret key — server-only; required when BILLING_MODE=ENABLED",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    classification: "SERVER_SECRET",
    requiredProduction: false,
    requiredWhenBillingEnabled: true,
    description: "Stripe webhook signing secret — server-only; required when BILLING_MODE=ENABLED",
  },
  {
    name: "GATEWAY_BYPASS_ALLOWLIST_CHECK",
    classification: "QUARANTINED",
    requiredProduction: false,
    description: "Debug-only gateway allowlist bypass — forbidden in production",
  },
  {
    name: "GATEWAY_BYPASS_BUDGET_CHECK",
    classification: "QUARANTINED",
    requiredProduction: false,
    description: "Debug-only gateway budget bypass — forbidden in production",
  },
  {
    name: "ETHEN_LIVE_BROWSER_CANARY",
    classification: "QUARANTINED",
    requiredProduction: false,
    description:
      "Explicit opt-in for the billable live browser canary — forbidden in production; credentials alone must never trigger a provider call",
  },
  {
    name: "NEXT_PUBLIC_ETHEN_SENTINEL_DEMO",
    classification: "QUARANTINED",
    requiredProduction: false,
    description: "Sentinel fixture/demo toggle — forbidden in production",
  },
  {
    name: "ETHEN_DEV_AUTH_BYPASS",
    classification: "QUARANTINED",
    requiredProduction: false,
    description:
      "Dev-only auth bypass (lib/platform/auth/dev-bypass.ts) — never honored in production or preview; forbidden as a startup env in production",
  },
  // ── Product-scoped provider credentials (M0-J03 / audit F-12) ─────────────
  // requiredForProduct means: required in production ONLY when that product is
  // available. Today Voice, Flow, Operator, Studio and Design are frozen,
  // enrollment-gated or registry-unavailable, so none of these are forced.
  {
    name: "ELEVENLABS_API_KEY",
    classification: "OPTIONAL_PROVIDER",
    requiredProduction: false,
    requiredForProduct: "voice",
    description: "ElevenLabs voice provider — required when Voice is available",
  },
  {
    name: "FAL_KEY",
    classification: "OPTIONAL_PROVIDER",
    requiredProduction: false,
    requiredForProduct: "studio",
    description: "fal.ai media provider — required when Studio is available",
  },
  {
    name: "THUNDER_API_KEY",
    classification: "OPTIONAL_PROVIDER",
    requiredProduction: false,
    requiredForProduct: "compute",
    description: "Thunder Compute API token — required when Compute is available",
  },
  {
    name: "AI_GATEWAY_API_KEY",
    classification: "OPTIONAL_PROVIDER",
    requiredProduction: false,
    description: "Ethen's outbound credential for the Vercel AI Gateway upstream lane",
  },
  {
    name: "VERCEL_AI_GATEWAY_BASE_URL",
    classification: "INTERNAL_RUNTIME",
    requiredProduction: false,
    description: "Vercel AI Gateway base URL override",
  },
  {
    name: "CLOUDFLARE_ACCOUNT_ID",
    classification: "SERVER_SECRET",
    requiredProduction: false,
    requiredForProduct: "computer-use",
    description: "Cloudflare account for Browser Rendering — required when Operator is available",
  },
  {
    name: "CLOUDFLARE_API_TOKEN",
    classification: "SERVER_SECRET",
    requiredProduction: false,
    requiredForProduct: "computer-use",
    description: "Cloudflare Browser Rendering API token — required when Operator is available",
  },
  {
    name: "ETHEN_BROWSER_SANDBOX_PROVIDER",
    classification: "INTERNAL_RUNTIME",
    requiredProduction: false,
    requiredForProduct: "computer-use",
    description:
      "Browser isolation provider; must be 'external' for production Operator execution",
  },
  {
    name: "ETHEN_BROWSER_SANDBOX_ATTESTED",
    classification: "INTERNAL_RUNTIME",
    requiredProduction: false,
    requiredForProduct: "computer-use",
    description:
      "Deployment attestation that the external browser isolation provider is real",
  },
  {
    name: "GOOGLE_CLIENT_ID",
    classification: "SERVER_SECRET",
    requiredProduction: false,
    requiredForProduct: "automation",
    description: "Google OAuth client id — required when Flow connectors are available",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    classification: "SERVER_SECRET",
    requiredProduction: false,
    requiredForProduct: "automation",
    description: "Google OAuth client secret — required when Flow connectors are available",
  },
  {
    name: "ETHEN_FLOWS_OAUTH_SIGNING_KEY",
    classification: "SERVER_SECRET",
    requiredProduction: false,
    requiredForProduct: "automation",
    description:
      "HMAC signing key (>=32 bytes) for connector OAuth state — required when Flow is available",
  },
  // ── Durable worker runtime (M4) ───────────────────────────────────────────
  // Consumed by the out-of-band worker processes, not by the web tier, so these
  // are never required of a Vercel deployment.
  {
    name: "SUPABASE_URL",
    classification: "INTERNAL_RUNTIME",
    requiredProduction: false,
    description: "Supabase URL as consumed by the durable worker processes",
  },
  {
    name: "WORKER_ID",
    classification: "INTERNAL_RUNTIME",
    requiredProduction: false,
    description: "Durable worker instance identifier",
  },
  {
    name: "WORKER_ORGANIZATION_ID",
    classification: "INTERNAL_RUNTIME",
    requiredProduction: false,
    description: "Optional organization scope for a durable worker",
  },
  // ── Desktop distribution (M7) ─────────────────────────────────────────────
  {
    name: "ETHEN_DESKTOP_UPDATE_URL",
    classification: "INTERNAL_RUNTIME",
    requiredProduction: false,
    description: "Desktop update feed origin consumed by electron-builder publish",
  },
  // ── Billing posture (M0-X02 / M2-J05) ─────────────────────────────────────
  {
    name: "BILLING_MODE",
    classification: "INTERNAL_RUNTIME",
    requiredProduction: true,
    description:
      "Explicit billing posture: ENABLED or DISABLED_FOR_GA. Billing is never left half-enabled.",
  },
  {
    name: "PRODUCT_SCRAPER_MOCK_MODE",
    classification: "QUARANTINED",
    requiredProduction: false,
    description: "Per-product mock toggle — forbidden in production",
  },
  {
    name: "JOB_SEARCH_MOCK_MODE",
    classification: "QUARANTINED",
    requiredProduction: false,
    description: "Per-product mock toggle — forbidden in production",
  },
  {
    name: "TRAVEL_SEARCH_MOCK_MODE",
    classification: "QUARANTINED",
    requiredProduction: false,
    description: "Per-product mock toggle — forbidden in production",
  },
  {
    name: "SHIPPING_MOCK_MODE",
    classification: "QUARANTINED",
    requiredProduction: false,
    description: "Per-product mock toggle — forbidden in production",
  },
  {
    name: "ETHEN_DEMO_FIXTURES",
    classification: "QUARANTINED",
    requiredProduction: false,
    description: "Retrieval fixture demo toggle — forbidden in production; gates app/api/retrieval fixture routes",
  },
] as const;

export function readTrimmedEnv(
  name: string,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return PLACEHOLDER_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function isEnvConfigured(
  name: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !isPlaceholderValue(readTrimmedEnv(name, env));
}

export function resolveRuntimeLane(
  env: Record<string, string | undefined> = process.env,
): RuntimeLane {
  if (env.VITEST === "true" || env.NODE_ENV === "test") return "test";
  if (env.VERCEL_ENV === "production" || env.NODE_ENV === "production") {
    return "production";
  }
  if (env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

export function isProductionRuntime(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveRuntimeLane(env) === "production";
}

export function isPreviewRuntime(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveRuntimeLane(env) === "preview";
}

export function mockModeRequested(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.NEXT_PUBLIC_ETHEN_MOCK_MODE === "true";
}

/**
 * Mock mode is only allowed on local/dev and test lanes.
 * Preview and production ignore the toggle and report it as an issue.
 */
export function isMockModeAllowed(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const lane = resolveRuntimeLane(env);
  return mockModeRequested(env) && (lane === "development" || lane === "test");
}

export function isRedisConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const restUrl = isEnvConfigured("UPSTASH_REDIS_REST_URL", env);
  const restToken = isEnvConfigured("UPSTASH_REDIS_REST_TOKEN", env);
  if (restUrl && restToken) return true;
  return (
    isEnvConfigured("REDIS_URL", env) || isEnvConfigured("UPSTASH_REDIS_URL", env)
  );
}

/**
 * Resolve the recorded billing posture. There is no implicit third state: an
 * unset or unrecognised value is reported as an issue in a fail-closed lane and
 * treated as DISABLED_FOR_GA everywhere else, so billing can never be
 * half-enabled by omission.
 */
export function resolveBillingMode(
  env: Record<string, string | undefined> = process.env,
): BillingMode {
  return readTrimmedEnv("BILLING_MODE", env) === "ENABLED" ? "ENABLED" : "DISABLED_FOR_GA";
}

export function isBillingEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveBillingMode(env) === "ENABLED";
}

/**
 * The effective production requirement for one spec, after resolving the two
 * conditional forms. See `EnvVarSpec.requiredForProduct`.
 */
export function isEffectivelyRequired(
  spec: EnvVarSpec,
  env: Record<string, string | undefined> = process.env,
  options: StartupEnvOptions = {},
): boolean {
  if (spec.classification === "QUARANTINED") return false;
  if (spec.requiredProduction) return true;
  if (spec.requiredWhenBillingEnabled && isBillingEnabled(env)) return true;
  if (spec.requiredForProduct) {
    return (options.availableProducts ?? []).includes(spec.requiredForProduct);
  }
  return false;
}

export function resolveProductionOrigin(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const explicit = readTrimmedEnv("ETHEN_PRODUCTION_ORIGIN", env);
  const appUrl = readTrimmedEnv("NEXT_PUBLIC_APP_URL", env);
  return explicit || appUrl || null;
}

export function clerkSignInUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return readTrimmedEnv("NEXT_PUBLIC_CLERK_SIGN_IN_URL", env) ?? "/sign-in";
}

export function clerkSignUpUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return readTrimmedEnv("NEXT_PUBLIC_CLERK_SIGN_UP_URL", env) ?? "/sign-up";
}

export function clerkAfterSignInUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return readTrimmedEnv("NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL", env) ?? "/";
}

export function clerkAfterSignUpUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return readTrimmedEnv("NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL", env) ?? "/";
}

function validateClerkConfiguration(
  env: Record<string, string | undefined>,
  issues: StartupEnvIssue[],
): void {
  const publishableKey = readTrimmedEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", env);
  const secretKey = readTrimmedEnv("CLERK_SECRET_KEY", env);
  const publishableMode = publishableKey?.match(/^pk_(test|live)_/)?.[1];
  const secretMode = secretKey?.match(/^sk_(test|live)_/)?.[1];

  // A static check cannot determine the Clerk instance ID from a secret key.
  // clerkMiddleware performs the authoritative instance handshake at runtime;
  // this preflight catches incomplete pairs and test/live cross-wiring without
  // reading or reporting any key values.
  if (Boolean(publishableKey) !== Boolean(secretKey) || !publishableMode || !secretMode || publishableMode !== secretMode) {
    issues.push({
      name: "CLERK_SECRET_KEY",
      code: "CLERK_KEY_PAIR_INVALID",
      message: "Clerk publishable and secret keys must be a complete matching test/live pair for one Clerk instance.",
    });
  }

  const requiredPaths: ReadonlyArray<[string, string]> = [
    ["NEXT_PUBLIC_CLERK_SIGN_IN_URL", "/sign-in"],
    ["NEXT_PUBLIC_CLERK_SIGN_UP_URL", "/sign-up"],
    ["NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL", "/"],
    ["NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL", "/"],
  ];
  for (const [name, expected] of requiredPaths) {
    const value = readTrimmedEnv(name, env);
    if (value !== expected) {
      issues.push({
        name,
        code: "CLERK_ROUTE_INVALID",
        message: name + " must be " + expected + ".",
      });
    }
  }
}

function statusForSpec(
  spec: EnvVarSpec,
  env: Record<string, string | undefined>,
  options: StartupEnvOptions,
): EnvVarStatus {
  const raw = readTrimmedEnv(spec.name, env);
  return {
    name: spec.name,
    classification: spec.classification,
    requiredProduction: spec.requiredProduction,
    effectivelyRequired: isEffectivelyRequired(spec, env, options),
    configured: !isPlaceholderValue(raw),
    placeholder: Boolean(raw) && isPlaceholderValue(raw),
    description: spec.description,
  };
}

function groupSatisfied(
  spec: EnvVarSpec,
  env: Record<string, string | undefined>,
): boolean {
  if (!spec.anyOf?.length) return isEnvConfigured(spec.name, env);
  return spec.anyOf.some((name) => {
    if (name === "UPSTASH_REDIS_REST_URL") {
      return (
        isEnvConfigured("UPSTASH_REDIS_REST_URL", env) &&
        isEnvConfigured("UPSTASH_REDIS_REST_TOKEN", env)
      );
    }
    return isEnvConfigured(name, env);
  });
}

export function validateStartupEnv(
  env: Record<string, string | undefined> = process.env,
  options: StartupEnvOptions = {},
): StartupEnvReport {
  const lane = resolveRuntimeLane(env);
  const failClosed = lane === "production" || lane === "preview";
  const issues: StartupEnvIssue[] = [];
  const vars = ENV_CONTRACT.map((spec) => statusForSpec(spec, env, options));
  const availableProducts = options.availableProducts ?? [];

  const requested = mockModeRequested(env);
  const enabled = isMockModeAllowed(env);
  if (
    failClosed ||
    readTrimmedEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", env) ||
    readTrimmedEnv("CLERK_SECRET_KEY", env)
  ) {
    validateClerkConfiguration(env, issues);
  }
  if (requested && lane === "production") {
    issues.push({
      name: "NEXT_PUBLIC_ETHEN_MOCK_MODE",
      code: "MOCK_MODE_IN_PRODUCTION",
      message: "Mock mode was requested but is ignored and forbidden in production.",
    });
  }
  if (requested && lane === "preview") {
    issues.push({
      name: "NEXT_PUBLIC_ETHEN_MOCK_MODE",
      code: "MOCK_MODE_IN_PREVIEW",
      message: "Mock mode was requested but is ignored and forbidden in preview.",
    });
  }

  if (failClosed) {
    for (const spec of ENV_CONTRACT) {
      if (!isEffectivelyRequired(spec, env, options)) continue;
      if (groupSatisfied(spec, env)) continue;
      // A product-scoped credential gets its own code so an operator can tell
      // "this product is live and its provider is unconfigured" apart from
      // "a platform dependency is missing".
      if (!spec.requiredProduction && spec.requiredForProduct) {
        issues.push({
          name: spec.name,
          code: "PRODUCT_CREDENTIAL_MISSING",
          message: `${spec.name} is required in ${lane} because product "${spec.requiredForProduct}" is available (${spec.description}).`,
        });
        continue;
      }
      issues.push({
        name: spec.name,
        code: "MISSING_REQUIRED",
        message: `${spec.name} is required in ${lane} (${spec.description}).`,
      });
    }

    // Billing must be an explicit, recorded decision — never absent.
    const rawBillingMode = readTrimmedEnv("BILLING_MODE", env);
    if (rawBillingMode && rawBillingMode !== "ENABLED" && rawBillingMode !== "DISABLED_FOR_GA") {
      issues.push({
        name: "BILLING_MODE",
        code: "BILLING_MODE_INVALID",
        message: "BILLING_MODE must be exactly ENABLED or DISABLED_FOR_GA.",
      });
    }

    const origin = resolveProductionOrigin(env);
    if (!origin) {
      issues.push({
        name: "ETHEN_PRODUCTION_ORIGIN",
        code: "ORIGIN_NOT_EXPLICIT",
        message:
          "Production origin is not explicit. Set ETHEN_PRODUCTION_ORIGIN or NEXT_PUBLIC_APP_URL.",
      });
    } else {
      let parsed: URL | null = null;
      try {
        parsed = new URL(origin);
      } catch {
        parsed = null;
      }
      if (!parsed) {
        issues.push({
          name: "ETHEN_PRODUCTION_ORIGIN",
          code: "ORIGIN_NOT_EXPLICIT",
          message: "Production origin is not a valid absolute URL.",
        });
      } else {
        if (lane === "production" && parsed.protocol !== "https:") {
          issues.push({
            name: "ETHEN_PRODUCTION_ORIGIN",
            code: "ORIGIN_NOT_HTTPS",
            message: "Production origin must be https.",
          });
        }
        if (
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "::1"
        ) {
          issues.push({
            name: "ETHEN_PRODUCTION_ORIGIN",
            code: "LOCALHOST_ORIGIN",
            message: "Production origin cannot be localhost.",
          });
        }
      }
      const appUrl = readTrimmedEnv("NEXT_PUBLIC_APP_URL", env);
      const explicit = readTrimmedEnv("ETHEN_PRODUCTION_ORIGIN", env);
      // Both halves of the per-target origin pair are individually required in
      // a fail-closed lane (see the catalog above); agreement between them is
      // checked here, and the deployment-target match below.
      if (!appUrl || !explicit) {
        issues.push({
          name: "ETHEN_PRODUCTION_ORIGIN",
          code: "ORIGIN_NOT_EXPLICIT",
          message:
            "Production requires both NEXT_PUBLIC_APP_URL and ETHEN_PRODUCTION_ORIGIN carrying the target's own canonical origin.",
        });
      } else if (stripTrailingSlash(appUrl) !== stripTrailingSlash(explicit)) {
        issues.push({
          name: "ETHEN_PRODUCTION_ORIGIN",
          code: "ORIGIN_NOT_EXPLICIT",
          message: "ETHEN_PRODUCTION_ORIGIN must match NEXT_PUBLIC_APP_URL.",
        });
      } else if (lane === "production" && parsed) {
        // In production the pair must additionally equal the deployment
        // target's exact canonical origin. A value copied from the sibling
        // target (or from any other domain) fails closed here.
        const effectiveTarget = options.deploymentTarget ?? resolveDeploymentTargetFromEnv(env);
        if (effectiveTarget) {
          const expected = expectedProductionOriginForTarget(effectiveTarget);
          if (stripTrailingSlash(origin) !== expected) {
            issues.push({
              name: "ETHEN_PRODUCTION_ORIGIN",
              code: "TARGET_ORIGIN_MISMATCH",
              message: `Production origin does not match the ${effectiveTarget} deployment target's canonical origin.`,
            });
          }
        }
      }
    }

    // Each production deployment serves exactly one target. Without an explicit
    // target the per-target origin above cannot be certified, so production
    // fails closed. Preview keeps the target optional (branch previews are
    // monolith or target-scoped at the operator's discretion).
    {
      const rawTarget = (env.ETHEN_DEPLOYMENT_TARGET ?? env.DEPLOYMENT_TARGET)?.trim();
      const effectiveTarget = options.deploymentTarget ?? resolveDeploymentTargetFromEnv(env);
      if (rawTarget && !effectiveTarget) {
        issues.push({
          name: "ETHEN_DEPLOYMENT_TARGET",
          code: "DEPLOYMENT_TARGET_INVALID",
          message: "ETHEN_DEPLOYMENT_TARGET must be exactly chat or platform.",
        });
      } else if (lane === "production" && !effectiveTarget) {
        issues.push({
          name: "ETHEN_DEPLOYMENT_TARGET",
          code: "DEPLOYMENT_TARGET_INVALID",
          message: "Production must set ETHEN_DEPLOYMENT_TARGET to chat or platform.",
        });
      }
    }

    if (lane === "production" && !isRedisConfigured(env)) {
      issues.push({
        name: "REDIS_URL",
        code: "REDIS_REQUIRED",
        message:
          "Production requires REDIS_URL, UPSTASH_REDIS_URL, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.",
      });
    }

    for (const spec of ENV_CONTRACT) {
      if (spec.classification !== "QUARANTINED") continue;
      const raw = env[spec.name];
      // Quarantined toggles may be enabled with either the conventional "true"
      // or a "1" sentinel (e.g. ETHEN_DEV_AUTH_BYPASS=1).
      if (isEnvConfigured(spec.name, env) && (raw === "true" || raw === "1")) {
        issues.push({
          name: spec.name,
          code: "QUARANTINED_IN_PRODUCTION",
          message: `${spec.name} is quarantined and must not be enabled in ${lane}.`,
        });
      }
    }
  }

  for (const spec of ENV_CONTRACT) {
    if (spec.classification !== "SERVER_SECRET") continue;
    if (spec.name.startsWith("NEXT_PUBLIC_")) {
      issues.push({
        name: spec.name,
        code: "PUBLIC_SECRET_LEAK",
        message: `${spec.name} is classified SERVER_SECRET but uses a NEXT_PUBLIC_ prefix.`,
      });
    }
  }

  return {
    lane,
    failClosed,
    ok: issues.length === 0,
    mockModeRequested: requested,
    mockModeEnabled: enabled,
    productionOrigin: resolveProductionOrigin(env),
    redisConfigured: isRedisConfigured(env),
    billingMode: resolveBillingMode(env),
    availableProducts,
    deploymentTarget: options.deploymentTarget ?? resolveDeploymentTargetFromEnv(env),
    issues,
    vars,
  };
}

export function assertStartupEnvOrThrow(
  env: Record<string, string | undefined> = process.env,
  options: StartupEnvOptions = {},
): StartupEnvReport {
  const report = validateStartupEnv(env, options);
  if (report.failClosed && !report.ok) {
    const names = report.issues.map((issue) => `${issue.code}:${issue.name}`).join(", ");
    throw new Error(`Startup environment contract failed (${report.lane}): ${names}`);
  }
  return report;
}

export function envContractByName(name: string): EnvVarSpec | undefined {
  return ENV_CONTRACT.find((spec) => spec.name === name);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

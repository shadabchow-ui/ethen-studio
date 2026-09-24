/**
 * SOL-48 — Product, provider, and feature kill switches.
 * A failing surface can be disabled without a deploy via environment config.
 * Production must never use kill switches as a silent mock fallback path.
 */

export type KillSwitchKind = "product" | "provider" | "feature";

export type ProductSwitchId =
  | "model"
  | "gateway"
  | "code"
  | "research"
  | "security"
  | "studio"
  | "voice"
  | "automation"
  | "designer"
  | "founder"
  | "computer-use";

export type ProviderSwitchId =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "vercel-ai-gateway"
  | "ollama"
  | "gemini"
  | "exa";

export type FeatureSwitchId =
  | "gateway_chat_completions"
  | "gateway_streaming"
  | "model_workspace_execution"
  | "research_execution"
  | "code_execution";

export interface KillSwitchState {
  kind: KillSwitchKind;
  id: string;
  disabled: boolean;
  reason: string | null;
  source: "default" | "env";
}

export interface KillSwitchSnapshot {
  products: Record<ProductSwitchId, KillSwitchState>;
  providers: Record<ProviderSwitchId, KillSwitchState>;
  features: Record<FeatureSwitchId, KillSwitchState>;
  /** True when any launch-critical switch is disabled. */
  degraded: boolean;
}

const PRODUCT_IDS: readonly ProductSwitchId[] = [
  "model",
  "gateway",
  "code",
  "research",
  "security",
  "studio",
  "voice",
  "automation",
  "designer",
  "founder",
  "computer-use",
];

const PROVIDER_IDS: readonly ProviderSwitchId[] = [
  "openai",
  "anthropic",
  "deepseek",
  "vercel-ai-gateway",
  "ollama",
  "gemini",
  "exa",
];

const FEATURE_IDS: readonly FeatureSwitchId[] = [
  "gateway_chat_completions",
  "gateway_streaming",
  "model_workspace_execution",
  "research_execution",
  "code_execution",
];

/** Defaults: all products enabled by default. Kill switches are emergency-only. */
const DEFAULT_DISABLED_PRODUCTS: ReadonlySet<ProductSwitchId> = new Set([]);

function parseList(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseReasons(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw?.trim()) return map;
  for (const part of raw.split(";")) {
    const [id, ...rest] = part.split("=");
    if (!id?.trim() || rest.length === 0) continue;
    map.set(id.trim().toLowerCase(), rest.join("=").trim());
  }
  return map;
}

/**
 * Resolve kill switches from environment.
 *
 * - ETHEN_DISABLE_PRODUCTS=research,code
 * - ETHEN_DISABLE_PROVIDERS=openai,gemini
 * - ETHEN_DISABLE_FEATURES=gateway_streaming
 * - ETHEN_KILL_SWITCH_REASONS=research=incident;openai=provider_outage
 * - ETHEN_ENABLE_PRODUCTS=security (opt-in override for deferred defaults)
 */
export function resolveKillSwitches(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): KillSwitchSnapshot {
  const disabledProducts = parseList(environment.ETHEN_DISABLE_PRODUCTS);
  const enabledProducts = parseList(environment.ETHEN_ENABLE_PRODUCTS);
  const disabledProviders = parseList(environment.ETHEN_DISABLE_PROVIDERS);
  const disabledFeatures = parseList(environment.ETHEN_DISABLE_FEATURES);
  const reasons = parseReasons(environment.ETHEN_KILL_SWITCH_REASONS);

  const products = {} as Record<ProductSwitchId, KillSwitchState>;
  for (const id of PRODUCT_IDS) {
    const envDisabled = disabledProducts.has(id);
    const envEnabled = enabledProducts.has(id);
    const defaultDisabled = DEFAULT_DISABLED_PRODUCTS.has(id);
    const disabled = envDisabled || (defaultDisabled && !envEnabled);
    products[id] = {
      kind: "product",
      id,
      disabled,
      reason: disabled
        ? reasons.get(id)
          ?? (envDisabled
            ? "Disabled via ETHEN_DISABLE_PRODUCTS"
            : "Deferred surface disabled by default")
        : null,
      source: envDisabled || envEnabled ? "env" : "default",
    };
  }

  const providers = {} as Record<ProviderSwitchId, KillSwitchState>;
  for (const id of PROVIDER_IDS) {
    const disabled = disabledProviders.has(id);
    providers[id] = {
      kind: "provider",
      id,
      disabled,
      reason: disabled
        ? reasons.get(id) ?? "Disabled via ETHEN_DISABLE_PROVIDERS"
        : null,
      source: disabled ? "env" : "default",
    };
  }

  const features = {} as Record<FeatureSwitchId, KillSwitchState>;
  for (const id of FEATURE_IDS) {
    const disabled = disabledFeatures.has(id);
    features[id] = {
      kind: "feature",
      id,
      disabled,
      reason: disabled
        ? reasons.get(id) ?? "Disabled via ETHEN_DISABLE_FEATURES"
        : null,
      source: disabled ? "env" : "default",
    };
  }

  const degraded =
    products.model.disabled
    || products.gateway.disabled
    || features.gateway_chat_completions.disabled
    || features.model_workspace_execution.disabled;

  return { products, providers, features, degraded };
}

export function isProductEnabled(
  productId: ProductSwitchId,
  environment?: Readonly<Record<string, string | undefined>>,
): boolean {
  return !resolveKillSwitches(environment).products[productId].disabled;
}

export function isProviderEnabled(
  providerId: string,
  environment?: Readonly<Record<string, string | undefined>>,
): boolean {
  const snapshot = resolveKillSwitches(environment);
  const key = providerId.toLowerCase() as ProviderSwitchId;
  if (!(key in snapshot.providers)) return true;
  return !snapshot.providers[key].disabled;
}

export function isFeatureEnabled(
  featureId: FeatureSwitchId,
  environment?: Readonly<Record<string, string | undefined>>,
): boolean {
  return !resolveKillSwitches(environment).features[featureId].disabled;
}

export function killSwitchDenial(input: {
  kind: KillSwitchKind;
  id: string;
  reason: string | null;
}): { ok: false; code: "KILL_SWITCH"; kind: KillSwitchKind; id: string; error: string } {
  return {
    ok: false,
    code: "KILL_SWITCH",
    kind: input.kind,
    id: input.id,
    error: input.reason ?? `${input.kind} '${input.id}' is disabled by kill switch.`,
  };
}

/** Map request path prefixes to product kill switches (launch surfaces). */
export function resolveProductSwitchForPath(pathname: string): ProductSwitchId | null {
  if (
    pathname === "/"
    || pathname.startsWith("/console")
    || pathname.startsWith("/workspace")
    || pathname.startsWith("/chat")
    || pathname.startsWith("/api/chat")
  ) {
    return "model";
  }
  if (pathname.startsWith("/ai-gateway") || pathname.startsWith("/gateway") || pathname.startsWith("/api/gateway")) {
    return "gateway";
  }
  if (pathname.startsWith("/code") || pathname.startsWith("/api/coding")) return "code";
  if (pathname.startsWith("/research") || pathname.startsWith("/api/research")) return "research";
  if (pathname.startsWith("/sentinel") || pathname.startsWith("/security") || pathname.startsWith("/api/sentinel")) {
    return "security";
  }
  if (pathname.startsWith("/studio") || pathname.startsWith("/api/media")) return "studio";
  if (pathname.startsWith("/voice") || pathname.startsWith("/api/voice")) return "voice";
  if (
    pathname.startsWith("/workflow")
    || pathname.startsWith("/api/connector")
  ) {
    return "automation";
  }
  // Designer's independent kill switch (Product 10). The launch alias and API
  // namespace are mapped here so an incident response can stop Designer
  // without touching Studio's boundary or the frozen-product switch.
  if (
    pathname.startsWith("/designer")
    || pathname.startsWith("/api/designer")
    || pathname.startsWith("/agents/designer-agent")
  ) {
    return "designer";
  }
  // Founder's independent kill switch (Product 11). The canonical route, API
  // namespace, and compatibility launch alias are mapped here so an incident
  // response can stop Founder without touching the Fleet template boundary or
  // the frozen-product switch.
  if (
    pathname.startsWith("/founder-agent")
    || pathname.startsWith("/api/founder-agent")
    || pathname.startsWith("/agents/founder-agent")
  ) {
    return "founder";
  }
  if (
    pathname.startsWith("/browser")
    || pathname.startsWith("/api/computer-use")
    || pathname.startsWith("/agents/computer-use-agent")
  ) {
    return "computer-use";
  }
  return null;
}

export function evaluatePathKillSwitch(
  pathname: string,
  environment?: Readonly<Record<string, string | undefined>>,
): null | ReturnType<typeof killSwitchDenial> {
  const productId = resolveProductSwitchForPath(pathname);
  if (!productId) return null;
  const state = resolveKillSwitches(environment).products[productId];
  if (!state.disabled) return null;
  return killSwitchDenial({ kind: "product", id: productId, reason: state.reason });
}

export const KILL_SWITCH_IDS = {
  products: PRODUCT_IDS,
  providers: PROVIDER_IDS,
  features: FEATURE_IDS,
} as const;

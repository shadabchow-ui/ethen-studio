/**
 * Provider logo asset mapping for the AI Gateway model catalog.
 *
 * Runtime UI surfaces (Model Library, composer model panels, future gateway
 * surfaces) MUST resolve provider logos through this module instead of the raw
 * `md/` reference assets. Logo files live under `public/model-logos/` and are
 * keyed by normalized catalog provider slug (see `normalizeProviderSlug` in
 * `loader.ts`): lowercase, non-alphanumerics collapsed to a single hyphen,
 * leading/trailing hyphens trimmed.
 *
 * Only providers whose logo identity is confirmed are mapped. Unknown providers
 * resolve to `null` so callers can fall back to a monogram or placeholder.
 */

/** Public asset path prefix for all gateway provider logos. */
const GATEWAY_PROVIDER_LOGO_PREFIX = "/model-logos/";

/**
 * Confirmed provider slug → logo asset filename mapping.
 *
 * Slugs match the runtime catalog slugs produced by `normalizeProviderSlug`.
 * Filenames are the normalized asset names copied into `public/model-logos/`.
 */
const GATEWAY_PROVIDER_LOGO_FILES: Readonly<Record<string, string>> = {
  anthropic: "anthropic.png",
  openai: "openai.svg",
  google: "google.png",
  meta: "meta.png",
  xai: "xai.png",
  deepseek: "deepseek.png",
  mistral: "mistral.webp",
  alibaba: "alibaba.png",
  amazon: "amazon.png",
  nvidia: "nvidia.png",
  // Catalog slug is `moonshotai` (CSV provider `moonshotai`), not `moonshot`.
  moonshotai: "moonshotai.png",
  minimax: "minimax.png",
  zai: "zai.png",
  bytedance: "bytedance.png",
  // Catalog slug is `bfl` (CSV provider `bfl`, Black Forest Labs), not
  // `black-forest-labs`.
  bfl: "bfl.png",
  perplexity: "perplexity.png",
  stepfun: "stepfun.png",
  // Catalog slug is `klingai` (CSV provider `klingai`), not `kling`.
  klingai: "klingai.png",
  kwaipilot: "kwaipilot.png",
  meituan: "meituan.webp",
  sakana: "sakana.png",
  recraft: "recraft.png",
  inception: "inception.png",
  interfaze: "interfaze.svg",
  xiaomi: "xiaomi.png",
};

/** Read-only view of the provider slug → public asset path mapping. */
export const GATEWAY_PROVIDER_LOGO_PATHS: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(GATEWAY_PROVIDER_LOGO_FILES).map(([slug, file]) => [
      slug,
      `${GATEWAY_PROVIDER_LOGO_PREFIX}${file}`,
    ]),
  );

/**
 * Resolve the public asset path for a gateway provider logo.
 *
 * @param providerSlug Normalized catalog provider slug. Accepts the raw provider
 *   label as well; it is normalized the same way as catalog providers.
 * @returns Public asset path (e.g. `/model-logos/anthropic.png`), or `null` if
 *   the provider has no confirmed logo so the caller can render a fallback.
 */
export function getGatewayProviderLogoPath(providerSlug: string): string | null {
  if (!providerSlug) {
    return null;
  }

  const normalized = normalizeProviderSlugLocal(providerSlug);
  return GATEWAY_PROVIDER_LOGO_PATHS[normalized] ?? null;
}

/**
 * Returns `true` when a confirmed logo exists for the provider slug.
 *
 * Useful for callers that want to switch between a logo and a monogram
 * without inspecting the path.
 */
export function hasGatewayProviderLogo(providerSlug: string): boolean {
  return getGatewayProviderLogoPath(providerSlug) !== null;
}

/**
 * Label-based alias map for provider display names that do not match
 * the catalog slug directly (e.g. "Google" → "google", "AWS" → "amazon").
 */
const LABEL_TO_SLUG: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  gemini: "google",
  deepseek: "deepseek",
  meta: "meta",
  mistral: "mistral",
  "xai": "xai",
  "x-ai": "xai",
  alibaba: "alibaba",
  qwen: "alibaba",
  amazon: "amazon",
  aws: "amazon",
  nvidia: "nvidia",
  bytedance: "bytedance",
  "black-forest-labs": "bfl",
  bfl: "bfl",
  perplexity: "perplexity",
  stepfun: "stepfun",
  "kling-ai": "klingai",
  kling: "klingai",
  klingai: "klingai",
  "kwai-pilot": "kwaipilot",
  kwai: "kwaipilot",
  kuaishou: "kwaipilot",
  kwaipilot: "kwaipilot",
  meituan: "meituan",
  "sakana-ai": "sakana",
  sakana: "sakana",
  recraft: "recraft",
  inception: "inception",
  interfaze: "interfaze",
  xiaomi: "xiaomi",
  "z-ai": "zai",
  zai: "zai",
  "moonshot-ai": "moonshotai",
  moonshot: "moonshotai",
  moonshotai: "moonshotai",
  minimax: "minimax",
};

/**
 * Resolve a provider label/name to its canonical logo slug.
 * Normalizes the label and checks against the alias map, then falls back
 * to direct slug normalization.
 */
export function resolveProviderLogoSlug(label: string): string | null {
  if (!label) return null;
  const normalized = label.trim().toLowerCase();
  if (LABEL_TO_SLUG[normalized]) return LABEL_TO_SLUG[normalized];
  const slug = normalizeProviderSlugLocal(normalized);
  if (GATEWAY_PROVIDER_LOGO_PATHS[slug]) return slug;
  return null;
}

/**
 * Return the full list of provider slugs that have confirmed logos.
 */
export function listProviderLogos(): string[] {
  return Object.keys(GATEWAY_PROVIDER_LOGO_FILES);
}

/**
 * Return the full slug-to-path mapping for all confirmed logos.
 */
export function getAllProviderLogoPaths(): Readonly<Record<string, string>> {
  return GATEWAY_PROVIDER_LOGO_PATHS;
}

/**
 * Local mirror of `normalizeProviderSlug` from `loader.ts`.
 *
 * Duplicated intentionally to keep this module dependency-free and safe to
 * import from runtime UI without pulling in the catalog CSV loader. If
 * `loader.ts` changes its normalization, this must be kept in sync.
 */
function normalizeProviderSlugLocal(provider: string): string {
  return provider
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

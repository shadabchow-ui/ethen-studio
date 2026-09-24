/**
 * Ethen flagship launcher — central configuration for the Chat Tools
 * popup's ETHEN PRODUCTS section.
 *
 * Product list: projected from the canonical registry
 * (`@ethen/contracts/portfolio/flagship-map`, FOUNDATION-01) — never
 * invented from memory. Every flagship selection currently resolves to the
 * Ethen Platform root; per-product overrides can be configured later through
 * this module alone, without touching the Tools component.
 */

import { CANONICAL_FLAGSHIP_RUNTIME_MAP } from "@ethen/contracts/portfolio/flagship-map";

/**
 * Chat-native tool ids with a real server execution path behind the Chat
 * send contract (Exa-backed evidence lookup). Anything else offered as a
 * Chat tool would be a placebo toggle — never list it here.
 */
export const CHAT_NATIVE_TOOL_IDS: readonly string[] = ["web", "deep-research"];

/** Canonical fallback chain for the Platform root (public URL; never a secret). */
export function resolvePlatformRoot(
  env: Record<string, string | undefined> = typeof process !== "undefined" && process.env
    ? (process.env as Record<string, string | undefined>)
    : {},
): string {
  const explicit = env.NEXT_PUBLIC_ETHEN_PLATFORM_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const legacy = env.NEXT_PUBLIC_PLATFORM_ORIGIN?.trim();
  if (legacy) return legacy.replace(/\/+$/, "");
  return "https://platform.upcube.ai";
}

export interface FlagshipLauncherProduct {
  id: string;
  name: string;
  /** Canonical in-product route, recorded for future per-product overrides. */
  canonicalRoute: string;
}

/**
 * All current canonical flagship products, in registry order.
 *
 * Exclusion rules (applied below): retired products, products explicitly
 * marked historical, Founder only if consolidated into Missions, and Chat
 * itself. Present registry state excludes nothing: nothing is marked
 * retired/historical, founder-agent routes still exist (no Missions
 * consolidation), and the map contains no Chat entry of its own. When that
 * changes, add the id to EXCLUDED_FLAGSHIP_IDS — never filter ad hoc in
 * the component.
 */
const EXCLUDED_FLAGSHIP_IDS: ReadonlySet<string> = new Set<string>([
  // Intentionally empty. See docblock above.
]);

export function listLauncherProducts(): readonly FlagshipLauncherProduct[] {
  return CANONICAL_FLAGSHIP_RUNTIME_MAP.filter((mapping) => !EXCLUDED_FLAGSHIP_IDS.has(mapping.id)).map(
    (mapping) => ({
      id: mapping.id,
      name: mapping.displayName,
      canonicalRoute: mapping.canonicalRoute,
    }),
  );
}

/**
 * Per-product URL overrides, configured centrally. Empty by default: every
 * product resolves to the Platform root until the owner configures final
 * destinations. A JSON override map may be supplied via
 * NEXT_PUBLIC_FLAGSHIP_URLS (parsed defensively; ignored when malformed).
 */
export function resolveFlagshipUrl(
  productId: string,
  options?: {
    platformRoot?: string;
    overrides?: Readonly<Record<string, string>>;
    env?: Record<string, string | undefined>;
  },
): string {
  const env = options?.env;
  const root = (options?.platformRoot ?? resolvePlatformRoot(env)).replace(/\/+$/, "");
  const direct = options?.overrides?.[productId]?.trim();
  if (direct) return direct;
  if (env) {
    try {
      const raw = env.NEXT_PUBLIC_FLAGSHIP_URLS;
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const candidate = (parsed as Record<string, unknown>)[productId];
          if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
        }
      }
    } catch {
      // Malformed override map: fall through to the Platform root.
    }
  }
  return root;
}

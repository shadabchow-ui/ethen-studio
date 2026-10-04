/**
 * MUSE-010 — Canonical Flagship Runtime Map, portfolio contract v1.
 *
 * Defines Ethen's fourteen flagship products, their owning repository,
 * their truthful runtime lifecycle, their canonical app route, their
 * public marketing route, and their app URL. Discovery surfaces must
 * project from this map rather than reconstructing a product list from
 * agent records.
 *
 * v1 changes (Opus audit C-02/C-03/C-04/C-09/C-12):
 * - owner is the owning REPO id (was: chat|platform deployment target).
 * - lifecycle uses the v1 vocabulary (live|private-alpha|beta|preview|
 *   coming|internal). Legacy literals (available, private-beta,
 *   setup-required, unavailable, retired) stay in the shared union for
 *   the portfolio registry; no map row uses them.
 * - Voice has no standalone row: conversational voice is a Chat
 *   capability and creation voice is a Studio capability (OD-02).
 * - Flow's canonical surface is /connected-apps (never /flow, /apps, or
 *   the retired /workflow-agent/* tree).
 * - iBot is a separate program row (staging only, no public runtime).
 *
 * Exported function signatures are backward compatible with the
 * pre-v1 map. Values changed; see
 * platform/docs/contracts/PORTFOLIO_CONTRACT_RELEASE.md (release v1).
 */

import type { ProductLifecycle } from "./types";

export type FlagshipRuntimeType =
  | "agent"
  | "gateway-adapter"
  | "local-model-server"
  | "platform-service"
  | "data-layer"
  | "robot";

/**
 * Owning repository id. `none` marks a row with no owning repo (reserved;
 * unused in v1 — every row has an owner).
 */
export type FlagshipOwner =
  | "chat"
  | "platform"
  | "ethen-studio"
  | "code"
  | "web"
  | "ethen-founder"
  | "ibot"
  | "none";

export interface FlagshipRuntimeMapping {
  id: string;
  displayName: string;
  registryId: string;
  runtimeType: FlagshipRuntimeType;
  owner: FlagshipOwner;
  agentSlug?: string;
  lifecycle: ProductLifecycle;
  /** Canonical app route (in-app path; see appUrl for the host). */
  canonicalRoute: string;
  /** Public marketing page for this flagship. */
  marketingRoute: string;
  /** Absolute URL of the running app, or null when undeployed. */
  appUrl: string | null;
  description: string;
}

export const CANONICAL_FLAGSHIP_RUNTIME_MAP: readonly FlagshipRuntimeMapping[] = [
  {
    id: "ethen-auto",
    displayName: "Ethen",
    registryId: "ethen-auto",
    runtimeType: "agent",
    owner: "chat",
    agentSlug: "universal-composer-agent",
    lifecycle: "live",
    canonicalRoute: "/chat",
    marketingRoute: "/products/ethen",
    appUrl: "https://chat.upcube.ai",
    description: "Simple, general-purpose conversational product: core chat, model selector, files, artifacts, tools, memory.",
  },
  {
    id: "research",
    displayName: "Research",
    registryId: "research",
    runtimeType: "agent",
    owner: "chat",
    agentSlug: "research-agent",
    lifecycle: "coming",
    canonicalRoute: "/research",
    marketingRoute: "/products/research",
    appUrl: null,
    description: "Full research workspace is planned; limited Deep Research is available in Chat today.",
  },
  {
    id: "code",
    displayName: "Code",
    registryId: "code",
    runtimeType: "agent",
    owner: "code",
    agentSlug: "coding-agent",
    lifecycle: "coming",
    canonicalRoute: "/code",
    marketingRoute: "/products/code",
    appUrl: null,
    description: "Plan-first coding workspace with repository context and patch proposals. V2 locally certified, not yet deployed.",
  },
  {
    id: "local-models",
    displayName: "Local Models",
    registryId: "local-models",
    runtimeType: "local-model-server",
    owner: "code",
    agentSlug: "compute-agent",
    lifecycle: "beta",
    canonicalRoute: "/local-models",
    marketingRoute: "/products/local-models",
    appUrl: null,
    description: "Desktop capability: install, run, and inspect models on your machine via the Code desktop Ollama path.",
  },
  {
    id: "computer-use",
    displayName: "Computer",
    registryId: "computer-use",
    runtimeType: "agent",
    owner: "platform",
    agentSlug: "computer-use-agent",
    lifecycle: "coming",
    canonicalRoute: "/browser",
    marketingRoute: "/products/computer",
    appUrl: null,
    description: "Supervised browser and computer-use runtime for delegated web tasks. Platform-managed; no vendor yet.",
  },
  {
    id: "sentinel",
    displayName: "Sentinel",
    registryId: "security",
    runtimeType: "agent",
    owner: "platform",
    agentSlug: "sentinel-agent",
    lifecycle: "private-alpha",
    canonicalRoute: "/sentinel",
    marketingRoute: "/products/sentinel",
    appUrl: "https://platform.upcube.ai/sentinel",
    description: "Defensive security engineering, scanning, triage, and patching. Enrolled private alpha on the closed platform console.",
  },
  {
    id: "studio",
    displayName: "Studio",
    registryId: "studio",
    runtimeType: "agent",
    owner: "ethen-studio",
    agentSlug: "media-agent",
    lifecycle: "private-alpha",
    canonicalRoute: "/studio",
    marketingRoute: "/products/studio",
    appUrl: "https://studio.upcube.ai",
    description: "Creative model platform: catalog, canvas, cinema, and voices. Live private alpha.",
  },
  {
    id: "automation",
    displayName: "Flow",
    registryId: "automation",
    runtimeType: "agent",
    owner: "platform",
    agentSlug: "flow-agent",
    lifecycle: "coming",
    canonicalRoute: "/connected-apps",
    marketingRoute: "/products/flow",
    appUrl: null,
    description: "Connected Apps and approval-gated automation. Source integrated and local-certified; providers not yet ready.",
  },
  {
    id: "designer",
    displayName: "Designer",
    registryId: "designer",
    runtimeType: "agent",
    owner: "chat",
    agentSlug: "designer-agent",
    lifecycle: "coming",
    canonicalRoute: "/designer",
    marketingRoute: "/products/designer",
    appUrl: null,
    description: "Lightweight design generation in Chat today; full prompt-to-app builder workspace is coming (OD-15).",
  },
  {
    id: "founder",
    displayName: "Founder",
    registryId: "founder",
    runtimeType: "agent",
    owner: "ethen-founder",
    agentSlug: "founder-agent",
    lifecycle: "coming",
    canonicalRoute: "/founder-agent",
    marketingRoute: "/products/founder",
    appUrl: null,
    description: "Autonomous-jobs product: give Ethen a job, get a verified outcome. Dedicated app, not yet built.",
  },
  {
    id: "gateway",
    displayName: "Gateway",
    registryId: "gateway",
    runtimeType: "gateway-adapter",
    owner: "platform",
    agentSlug: undefined,
    lifecycle: "preview",
    canonicalRoute: "/ai-gateway",
    marketingRoute: "/products/gateway",
    appUrl: null,
    description: "Governed multi-model gateway with keys, routing, policy, and usage. Implemented, not yet deployed.",
  },
  {
    id: "model-intelligence",
    displayName: "Model Intelligence",
    registryId: "model-intelligence",
    runtimeType: "data-layer",
    owner: "web",
    agentSlug: undefined,
    lifecycle: "live",
    canonicalRoute: "/model-intelligence",
    marketingRoute: "/products/model-intelligence",
    appUrl: "https://upcube.ai/model-intelligence",
    description: "Model directory, benchmarks, pricing, and evaluation intelligence. User-facing term is primarily Model Library.",
  },
  {
    id: "gpu-compute",
    displayName: "Compute",
    registryId: "compute",
    runtimeType: "platform-service",
    owner: "platform",
    agentSlug: "gpu-cloud-agent",
    lifecycle: "coming",
    canonicalRoute: "/compute",
    marketingRoute: "/products/compute",
    appUrl: null,
    description: "GPU provisioning, workload management, and cost control. Undeployed; resale terms unresolved (OD-06).",
  },
  {
    id: "ibot",
    displayName: "iBot",
    registryId: "ibot",
    runtimeType: "robot",
    owner: "ibot",
    agentSlug: undefined,
    lifecycle: "coming",
    canonicalRoute: "/products/ibot",
    marketingRoute: "/products/ibot",
    appUrl: null,
    description: "Separate program: robot OS and mission kernel, staging on Fly + Temporal. No public runtime.",
  },
] as const;

export function getFlagshipRuntimeMapping(id: string): FlagshipRuntimeMapping | undefined {
  return CANONICAL_FLAGSHIP_RUNTIME_MAP.find((m) => m.id === id || m.registryId === id);
}

export function getFlagshipRuntimeMappingByAgentSlug(slug: string): FlagshipRuntimeMapping | undefined {
  return CANONICAL_FLAGSHIP_RUNTIME_MAP.find((m) => m.agentSlug === slug);
}

export function getFlagshipOwner(id: string): FlagshipOwner | undefined {
  const mapping = getFlagshipRuntimeMapping(id);
  return mapping?.owner;
}

export function listFlagshipsByOwner(owner: FlagshipOwner): readonly FlagshipRuntimeMapping[] {
  return CANONICAL_FLAGSHIP_RUNTIME_MAP.filter((m) => m.owner === owner);
}

/**
 * Canonical ids of the products that are actually available to users.
 *
 * M0-J03: this drives `EnvVarSpec.requiredForProduct` in the environment
 * contract, so a product-scoped provider credential is demanded in production
 * exactly when the product is reachable — and never when it is frozen,
 * enrollment-gated, or registry-unavailable.
 *
 * Both the map id and the registry id are emitted, because env specs and the
 * portfolio registry do not always agree on which one they name (Compute is
 * `gpu-compute` here and `compute` in the registry).
 *
 * A product is available when its lifecycle is a usable one AND its routes are
 * not structurally frozen. `live`, `beta` and `preview` count as available:
 * users can reach them, so their provider credentials are real production
 * requirements. v1 truth change: Code and Compute left the usable set (both
 * undeployed); Ethen and Model Intelligence are `live`.
 */
export function getAvailableFlagshipProductIds(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] {
  const usableLifecycles: ReadonlySet<ProductLifecycle> = new Set([
    "live",
    "available",
    "beta",
    "preview",
  ]);
  const frozenEnabled = environment.ETHEN_ENABLE_FROZEN_PRODUCTS === "true";
  const frozen: ReadonlySet<string> = frozenEnabled
    ? new Set()
    : new Set(["voice", "automation"]);

  const ids = new Set<string>();
  for (const mapping of CANONICAL_FLAGSHIP_RUNTIME_MAP) {
    if (!usableLifecycles.has(mapping.lifecycle)) continue;
    if (frozen.has(mapping.id) || frozen.has(mapping.registryId)) continue;
    ids.add(mapping.id);
    ids.add(mapping.registryId);
  }
  return [...ids];
}

/**
 * FOUNDATION-01 — Canonical Flagship Runtime Map
 *
 * Defines Ethen's fourteen flagship products, their canonical routes, and
 * their truthful runtime lifecycle. Discovery surfaces must project from this
 * map rather than reconstructing a product list from agent records.
 */

import type { ProductLifecycle } from "./types";
import { getResearchPortfolioLifecycle } from "../research/capabilities";

export type FlagshipRuntimeType =
  | "agent"
  | "gateway-adapter"
  | "local-model-server"
  | "platform-service"
  | "data-layer";

export type FlagshipOwner = "chat" | "platform";

export interface FlagshipRuntimeMapping {
  id: string;
  displayName: string;
  registryId: string;
  runtimeType: FlagshipRuntimeType;
  owner: FlagshipOwner;
  agentSlug?: string;
  lifecycle: ProductLifecycle;
  canonicalRoute: string;
  description: string;
}

export const CANONICAL_FLAGSHIP_RUNTIME_MAP: readonly FlagshipRuntimeMapping[] = [
  {
    id: "ethen-auto",
    displayName: "Ethen",
    registryId: "ethen-auto",
    runtimeType: "agent",
    owner: "platform",
    agentSlug: "universal-composer-agent",
    lifecycle: "preview",
    canonicalRoute: "/console",
    description: "Unified AI workspace for reasoning, tools, planning, and verified execution.",
  },
  {
    id: "research",
    displayName: "Research",
    registryId: "research",
    runtimeType: "agent",
    owner: "chat",
    agentSlug: "research-agent",
    lifecycle: getResearchPortfolioLifecycle(),
    canonicalRoute: "/research",
    description: "Exa-backed deep search, source analysis, and synthesis workspace.",
  },
  {
    id: "code",
    displayName: "Code",
    registryId: "code",
    runtimeType: "agent",
    owner: "platform",
    agentSlug: "coding-agent",
    lifecycle: "beta",
    canonicalRoute: "/code",
    description: "Plan-first coding workspace with repository context and patch proposals.",
  },
  {
    id: "local-models",
    displayName: "Local Models",
    registryId: "local-models",
    runtimeType: "local-model-server",
    owner: "platform",
    agentSlug: "compute-agent",
    lifecycle: "beta",
    canonicalRoute: "/local-models",
    description: "Local model runtime management and Ollama integration.",
  },
  {
    id: "computer-use",
    displayName: "Computer",
    registryId: "computer-use",
    runtimeType: "agent",
    owner: "platform",
    agentSlug: "computer-use-agent",
    lifecycle: "unavailable",
    canonicalRoute: "/browser",
    description: "Conversational browser and computer-use agent for supervised web tasks.",
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
    description: "Defensive security engineering, scanning, triage, and patching.",
  },
  {
    id: "studio",
    displayName: "Studio",
    registryId: "studio",
    runtimeType: "agent",
    owner: "chat",
    agentSlug: "media-agent",
    lifecycle: "unavailable",
    canonicalRoute: "/studio",
    description: "Image, video, and media generation workspace (private-alpha access boundary).",
  },
  {
    id: "voice",
    displayName: "Voice",
    registryId: "voice",
    runtimeType: "platform-service",
    owner: "chat",
    agentSlug: undefined,
    lifecycle: "unavailable",
    canonicalRoute: "/voice",
    description: "Speech generation, transcription, dubbing, and realtime voice.",
  },
  {
    id: "automation",
    displayName: "Flow",
    registryId: "automation",
    runtimeType: "agent",
    owner: "platform",
    agentSlug: "flow-agent",
    lifecycle: "unavailable",
    canonicalRoute: "/workflow-agent",
    description: "Connected workflow automation and agent orchestration.",
  },
  {
    id: "designer",
    displayName: "Designer",
    registryId: "designer",
    runtimeType: "agent",
    owner: "chat",
    agentSlug: "designer-agent",
    lifecycle: "unavailable",
    canonicalRoute: "/designer",
    description: "Design generation, iteration, export, and Code handoff workspace.",
  },
  {
    id: "founder",
    displayName: "Founder",
    registryId: "founder",
    runtimeType: "agent",
    owner: "chat",
    agentSlug: "founder-agent",
    lifecycle: "unavailable",
    canonicalRoute: "/founder-agent",
    description: "Company OS entry point for founder operations and autonomous business workflows.",
  },
  {
    id: "gateway",
    displayName: "Gateway",
    registryId: "gateway",
    runtimeType: "gateway-adapter",
    owner: "platform",
    agentSlug: undefined,
    lifecycle: "beta",
    canonicalRoute: "/ai-gateway",
    description: "Governed multi-model gateway with keys, routing, policy, and usage.",
  },
  {
    id: "model-intelligence",
    displayName: "Model Intelligence",
    registryId: "model-intelligence",
    runtimeType: "data-layer",
    owner: "platform",
    agentSlug: undefined,
    lifecycle: "beta",
    canonicalRoute: "/model-intelligence",
    description: "Model directory, benchmarks, pricing, and evaluation intelligence.",
  },
  {
    id: "gpu-compute",
    displayName: "Compute",
    registryId: "compute",
    runtimeType: "platform-service",
    owner: "platform",
    agentSlug: "gpu-cloud-agent",
    lifecycle: "preview",
    canonicalRoute: "/compute",
    description: "GPU provisioning, workload management, and cost control via Thunder Compute.",
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
 * not structurally frozen. `preview` and `beta` count as available: users can
 * reach them, so their provider credentials are real production requirements.
 */
export function getAvailableFlagshipProductIds(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] {
  const usableLifecycles: ReadonlySet<ProductLifecycle> = new Set([
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

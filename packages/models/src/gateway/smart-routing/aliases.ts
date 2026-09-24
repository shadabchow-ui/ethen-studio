// ── Ethen Gateway — GW-R6 — Smart aliases & versioned routing policy ────
// Every alias ships with a fully specified, versioned weight profile and —
// where the alias name implies a non-negotiable capability — hard gates.

import type {
  CertificationLevel,
  LatencyTarget,
  SmartAliasId,
  SmartRoutingRequirements,
} from "./types";
import {
  CODING_CONTEXT_MIN_TOKENS,
  LONG_CONTEXT_MIN_TOKENS,
  SMART_ALIAS_IDS,
} from "./types";

export const ROUTING_POLICY_VERSION = "ethen.routing-policy.v1";

// ── Weight profiles ─────────────────────────────────────────────────────

export interface RoutingWeights {
  quality: number;
  latency: number;
  ttft: number;
  cost: number;
  reliability: number;
  health: number;
  context: number;
  tools: number;
}

/**
 * Versioned, testable weight profiles. The policy version is stamped into
 * every routing receipt; changing these weights is a policy change and must
 * bump ROUTING_POLICY_VERSION.
 */
export const ROUTING_WEIGHT_PROFILES: Record<SmartAliasId, RoutingWeights> = {
  // Balanced default: quality/cost/reliability weighted evenly, latency
  // slightly less so the result is a sensible everyday default.
  "ethen/auto": { quality: 3, latency: 2, ttft: 2, cost: 3, reliability: 4, health: 3, context: 2, tools: 2 },
  // Latency/TTFT dominant, still gated by a reliability floor.
  "ethen/fast": { quality: 1, latency: 5, ttft: 5, cost: 2, reliability: 3, health: 3, context: 1, tools: 1 },
  // Quality dominant, subject to policy and reliability.
  "ethen/best": { quality: 5, latency: 1, ttft: 1, cost: 1, reliability: 4, health: 2, context: 2, tools: 2 },
  // Cost dominant with a minimum quality/reliability expectation.
  "ethen/cheap": { quality: 2, latency: 2, ttft: 2, cost: 5, reliability: 3, health: 2, context: 1, tools: 1 },
  // Quality dominant with a context preference for hard analysis tasks.
  "ethen/reasoning": { quality: 5, latency: 1, ttft: 1, cost: 2, reliability: 3, health: 2, context: 3, tools: 2 },
  // Tools + context + quality — coding work must be tool-safe.
  "ethen/coding": { quality: 4, latency: 2, ttft: 2, cost: 2, reliability: 4, health: 2, context: 4, tools: 5 },
  // Vision-dominant: only vision-capable candidates can enter the pool.
  "ethen/vision": { quality: 4, latency: 2, ttft: 2, cost: 2, reliability: 3, health: 2, context: 2, tools: 2 },
  // Context dominant: only long-context candidates can enter the pool.
  "ethen/long-context": { quality: 3, latency: 1, ttft: 1, cost: 2, reliability: 3, health: 2, context: 5, tools: 2 },
};

export interface SmartAliasDefinition {
  id: SmartAliasId;
  label: string;
  description: string;
  weights: RoutingWeights;
  /**
   * Hard capability gates implied by the alias itself. These are ANDed with
   * the per-request requirements; a candidate failing any gate never enters
   * the scoring pool.
   */
  aliasGates: {
    requiresVision?: boolean;
    requiresTools?: boolean;
    minContextTokens?: number;
  };
  /**
   * Soft preference used only for scoring, never filtering: when the
   * candidate has reasoning metadata and this is true, it gets a small
   * quality bonus (quality weight already dominates for these aliases).
   */
  preferReasoning?: boolean;
  defaultLatencyTarget: LatencyTarget;
  defaultCertificationLevel: CertificationLevel;
}

export const SMART_ALIASES: Record<SmartAliasId, SmartAliasDefinition> = {
  "ethen/auto": {
    id: "ethen/auto",
    label: "Ethen Auto",
    description: "Balanced quality/cost/latency for everyday requests.",
    weights: ROUTING_WEIGHT_PROFILES["ethen/auto"],
    aliasGates: {},
    defaultLatencyTarget: "balanced",
    defaultCertificationLevel: "any",
  },
  "ethen/fast": {
    id: "ethen/fast",
    label: "Ethen Fast",
    description: "Latency and TTFT dominant routing for interactive workloads.",
    weights: ROUTING_WEIGHT_PROFILES["ethen/fast"],
    aliasGates: {},
    defaultLatencyTarget: "fast",
    defaultCertificationLevel: "any",
  },
  "ethen/best": {
    id: "ethen/best",
    label: "Ethen Best",
    description: "Maximum quality subject to policy and reliability.",
    weights: ROUTING_WEIGHT_PROFILES["ethen/best"],
    aliasGates: {},
    defaultLatencyTarget: "patient",
    defaultCertificationLevel: "any",
  },
  "ethen/cheap": {
    id: "ethen/cheap",
    label: "Ethen Cheap",
    description: "Lowest cost subject to minimum quality and reliability.",
    weights: ROUTING_WEIGHT_PROFILES["ethen/cheap"],
    aliasGates: {},
    defaultLatencyTarget: "balanced",
    defaultCertificationLevel: "any",
  },
  "ethen/reasoning": {
    id: "ethen/reasoning",
    label: "Ethen Reasoning",
    description: "Quality-dominant routing that prefers reasoning-capable models.",
    weights: ROUTING_WEIGHT_PROFILES["ethen/reasoning"],
    aliasGates: {},
    preferReasoning: true,
    defaultLatencyTarget: "patient",
    defaultCertificationLevel: "any",
  },
  "ethen/coding": {
    id: "ethen/coding",
    label: "Ethen Coding",
    description: "Tool-safe coding routing with strong context requirements.",
    weights: ROUTING_WEIGHT_PROFILES["ethen/coding"],
    aliasGates: {
      requiresTools: true,
      minContextTokens: CODING_CONTEXT_MIN_TOKENS,
    },
    preferReasoning: true,
    defaultLatencyTarget: "balanced",
    defaultCertificationLevel: "any",
  },
  "ethen/vision": {
    id: "ethen/vision",
    label: "Ethen Vision",
    description: "Vision-capable routing for image inputs.",
    weights: ROUTING_WEIGHT_PROFILES["ethen/vision"],
    aliasGates: {
      requiresVision: true,
    },
    defaultLatencyTarget: "balanced",
    defaultCertificationLevel: "any",
  },
  "ethen/long-context": {
    id: "ethen/long-context",
    label: "Ethen Long Context",
    description: "Routing for large contexts (>= 128K window).",
    weights: ROUTING_WEIGHT_PROFILES["ethen/long-context"],
    aliasGates: {
      minContextTokens: LONG_CONTEXT_MIN_TOKENS,
    },
    defaultLatencyTarget: "balanced",
    defaultCertificationLevel: "any",
  },
};

const ALIAS_BY_ID: Map<string, SmartAliasDefinition> = new Map(
  SMART_ALIAS_IDS.map((id) => [id, SMART_ALIASES[id]]),
);

export function getSmartAlias(id: string | null | undefined): SmartAliasDefinition | null {
  if (!id) return null;
  return ALIAS_BY_ID.get(id.trim()) ?? null;
}

/**
 * Combine the alias's own hard gates with the per-request requirements.
 * Returns a requirements object whose capability fields are the union of
 * both sources — the strictest interpretation wins.
 */
export function mergeAliasGates(
  alias: SmartAliasDefinition,
  requirements: SmartRoutingRequirements,
): SmartRoutingRequirements {
  return {
    ...requirements,
    requiresVision: requirements.requiresVision || Boolean(alias.aliasGates.requiresVision),
    requiresTools: requirements.requiresTools || Boolean(alias.aliasGates.requiresTools),
    estimatedInputTokens: Math.max(
      requirements.estimatedInputTokens,
      alias.aliasGates.minContextTokens ?? 0,
    ),
    maxOutputTokens: requirements.maxOutputTokens,
  };
}

export function getRoutingPolicyVersion(): string {
  return ROUTING_POLICY_VERSION;
}

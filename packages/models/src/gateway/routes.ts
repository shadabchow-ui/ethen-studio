import type { GatewayModelRegistry, GatewayRouteProfile } from "./types";

const DEFAULT_ROUTE_ID = "text-general";

const DEFAULT_MODELS: GatewayModelRegistry = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  deepseek: "deepseek-v4-flash",
};

const ROUTE_PROFILES: Record<string, Omit<GatewayRouteProfile, "routeId">> = {
  "text-quality": {
    capability: "quality",
    description: "Editing, rewriting, and precision-oriented text work.",
    models: { ...DEFAULT_MODELS, openai: "gpt-4o", anthropic: "claude-sonnet-4-6", deepseek: "deepseek-v4-pro" },
  },
  "text-creative": {
    capability: "creative",
    description: "Drafting, ideation, and open-ended creative text work.",
    models: DEFAULT_MODELS,
  },
  "text-reasoning": {
    capability: "reasoning",
    description: "Research, analysis, and problem-solving oriented text work.",
    models: { ...DEFAULT_MODELS, openai: "o3-mini", anthropic: "claude-sonnet-4-6", deepseek: "deepseek-v4-pro" },
  },
  [DEFAULT_ROUTE_ID]: {
    capability: "generic",
    description: "General-purpose text responses.",
    models: DEFAULT_MODELS,
  },
};

export function getGatewayRouteProfile(routeId?: string | null): GatewayRouteProfile {
  const normalizedRouteId = routeId?.trim() || DEFAULT_ROUTE_ID;
  const profile =
    ROUTE_PROFILES[normalizedRouteId] ?? ROUTE_PROFILES[DEFAULT_ROUTE_ID];

  return {
    routeId: normalizedRouteId,
    capability: profile.capability,
    description: profile.description,
    models: profile.models ?? DEFAULT_MODELS,
  };
}

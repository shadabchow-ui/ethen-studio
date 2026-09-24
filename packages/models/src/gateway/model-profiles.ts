export type GatewayModelProfileId =
  | "ethen-1.0-mini"
  | "ethen-1.0"
  | "ethen-1.0-pro"
  | "ethen-1.0-ultra";

export interface GatewayModelProfile {
  id: GatewayModelProfileId;
  label: string;
  description: string;
  routeId: string;
}

const MODEL_PROFILES: GatewayModelProfile[] = [
  {
    id: "ethen-1.0-mini",
    label: "Ethen 1.0 Mini",
    description: "Fast, lightweight responses for everyday chat.",
    routeId: "text-general",
  },
  {
    id: "ethen-1.0",
    label: "Ethen 1.0",
    description: "Balanced quality for polished general-purpose responses.",
    routeId: "text-quality",
  },
  {
    id: "ethen-1.0-pro",
    label: "Ethen 1.0 Pro",
    description: "Deeper analysis for harder questions and step-by-step thinking.",
    routeId: "text-reasoning",
  },
  {
    id: "ethen-1.0-ultra",
    label: "Ethen 1.0 Ultra",
    description: "Maximum capability for demanding multi-step reasoning and agentic workflows.",
    routeId: "text-reasoning",
  },
];

const MODEL_PROFILES_BY_ID: Record<GatewayModelProfileId, GatewayModelProfile> = {
  "ethen-1.0-mini": MODEL_PROFILES[0],
  "ethen-1.0": MODEL_PROFILES[1],
  "ethen-1.0-pro": MODEL_PROFILES[2],
  "ethen-1.0-ultra": MODEL_PROFILES[3],
};

const ROUTE_ID_BY_MODEL_PROFILE_ID: Record<GatewayModelProfileId, string> = {
  "ethen-1.0-mini": "text-general",
  "ethen-1.0": "text-quality",
  "ethen-1.0-pro": "text-reasoning",
  "ethen-1.0-ultra": "text-reasoning",
};

const KNOWN_ROUTE_IDS = new Set<GatewayModelProfile["routeId"]>([
  "text-general",
  "text-quality",
  "text-creative",
  "text-reasoning",
]);

export function getGatewayModelProfiles(): GatewayModelProfile[] {
  return MODEL_PROFILES;
}

export function getGatewayModelProfile(
  modelProfileId?: string | null,
): GatewayModelProfile | null {
  const normalized = modelProfileId?.trim() as GatewayModelProfileId | undefined;
  if (!normalized) return null;
  return MODEL_PROFILES_BY_ID[normalized] ?? null;
}

export function getGatewayDefaultModelProfile(): GatewayModelProfile {
  return MODEL_PROFILES_BY_ID["ethen-1.0-mini"];
}

export function getGatewayModelProfileByRouteId(routeId?: string | null): GatewayModelProfile | null {
  const normalized = routeId?.trim();
  if (!normalized) return null;
  return MODEL_PROFILES.find((profile) => profile.routeId === normalized) ?? null;
}

export function resolveGatewayRouteId(
  routeId?: string | null,
  modelProfileId?: string | null,
): string {
  const modelProfile = getGatewayModelProfile(modelProfileId) ?? getGatewayModelProfile(routeId);
  if (modelProfile) {
    return ROUTE_ID_BY_MODEL_PROFILE_ID[modelProfile.id];
  }

  const normalizedRouteId = routeId?.trim();
  return normalizedRouteId && KNOWN_ROUTE_IDS.has(normalizedRouteId) ? normalizedRouteId : "text-general";
}

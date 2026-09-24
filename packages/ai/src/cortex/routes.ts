import type { CortexRouteProfile, CortexRouteProfileStatus, EthenIntent, EthenMode, FallbackPolicy, QualityTier, CostTier, LatencyTarget, ToolPolicy, VerifierPolicy, TraceVisibility } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────

function p(props: {
  id: string;
  mode: EthenMode;
  label: string;
  shortLabel: string;
  description: string;
  defaultIntent: EthenIntent;
  qualityTier: QualityTier;
  costTier: CostTier;
  latencyTarget: LatencyTarget;
  toolPolicy: ToolPolicy;
  verifierPolicy: VerifierPolicy;
  traceVisibility: TraceVisibility;
  status: CortexRouteProfileStatus;
}): CortexRouteProfile {
  return {
    ...props,
    fallbackPolicy: {
      enabled: true,
      maxAttempts: 3,
      allowQualityDowngrade: props.status !== "not_implemented",
      allowCostUpgrade: false,
      allowToolDowngrade: props.status !== "not_implemented",
      degradedModeAllowed: true,
    },
  };
}

// ── Core route profiles ──────────────────────────────────────────────────

const CORTEX_LITE: CortexRouteProfile = {
  ...p({
    id: "cortex-lite",
    mode: "cortex-lite",
    label: "Ethen Cortex Lite",
    shortLabel: "Cortex Lite",
    description: "Fast everyday intelligence for quick answers, summaries, and simple work.",
    defaultIntent: "general.chat",
    qualityTier: "starter",
    costTier: "low",
    latencyTarget: "fast",
    toolPolicy: "none",
    verifierPolicy: "off",
    traceVisibility: "basic",
    status: "active",
  }),
  fallbackPolicy: {
    enabled: true,
    maxAttempts: 3,
    allowQualityDowngrade: true,
    allowCostUpgrade: false,
    allowToolDowngrade: true,
    degradedModeAllowed: true,
  },
};

const CORTEX: CortexRouteProfile = p({
  id: "cortex",
  mode: "cortex",
  label: "Ethen Cortex",
  shortLabel: "Cortex",
  description: "Balanced intelligence for everyday work, planning, and problem solving.",
  defaultIntent: "general.chat",
  qualityTier: "balanced",
  costTier: "medium",
  latencyTarget: "balanced",
  toolPolicy: "optional",
  verifierPolicy: "optional",
  traceVisibility: "basic",
  status: "active",
});

const CORTEX_PRO: CortexRouteProfile = p({
  id: "cortex-pro",
  mode: "cortex-pro",
  label: "Ethen Cortex Pro",
  shortLabel: "Cortex Pro",
  description: "Deeper reasoning for complex work, architecture, strategy, and high-quality outputs.",
  defaultIntent: "general.reasoning",
  qualityTier: "premium",
  costTier: "high",
  latencyTarget: "patient",
  toolPolicy: "optional",
  verifierPolicy: "default",
  traceVisibility: "advanced",
  status: "active",
});

const ULTRA_PREVIEW: CortexRouteProfile = p({
  id: "ultra-preview",
  mode: "ultra-preview",
  label: "Ethen Ultra Preview",
  shortLabel: "Ultra Preview",
  description: "Bounded multi-worker planning, verification, and synthesis for complex requests.",
  defaultIntent: "planning.technical",
  qualityTier: "max",
  costTier: "variable",
  latencyTarget: "patient",
  toolPolicy: "required",
  verifierPolicy: "strict",
  traceVisibility: "full",
  status: "active",
});

const CODE: CortexRouteProfile = p({
  id: "code",
  mode: "code",
  label: "Ethen Code",
  shortLabel: "Code",
  description: "Repo-aware coding intelligence with planning, validation, and safer implementation workflows.",
  defaultIntent: "coding.inspect",
  qualityTier: "premium",
  costTier: "high",
  latencyTarget: "patient",
  toolPolicy: "required",
  verifierPolicy: "strict",
  traceVisibility: "advanced",
  status: "not_implemented",
});

const RESEARCH: CortexRouteProfile = p({
  id: "research",
  mode: "research",
  label: "Ethen Research",
  shortLabel: "Research",
  description: "Source-grounded research with search, citations, evidence, and validation.",
  defaultIntent: "research.web",
  qualityTier: "premium",
  costTier: "high",
  latencyTarget: "patient",
  toolPolicy: "required",
  verifierPolicy: "strict",
  traceVisibility: "full",
  status: "active",
});

const WRITER: CortexRouteProfile = p({
  id: "writer",
  mode: "writer",
  label: "Ethen Writer",
  shortLabel: "Writer",
  description: "Polished writing, rewriting, editing, and brand voice support.",
  defaultIntent: "writing.draft",
  qualityTier: "balanced",
  costTier: "medium",
  latencyTarget: "balanced",
  toolPolicy: "none",
  verifierPolicy: "optional",
  traceVisibility: "basic",
  status: "active",
});

const COMPUTER_USE: CortexRouteProfile = p({
  id: "computer-use",
  mode: "cortex",
  label: "Computer Use Agent",
  shortLabel: "Browser",
  description: "Browser automation, web scraping, and computer-use tasks.",
  defaultIntent: "browser.web",
  qualityTier: "balanced",
  costTier: "medium",
  latencyTarget: "balanced",
  toolPolicy: "required",
  verifierPolicy: "default",
  traceVisibility: "advanced",
  status: "not_implemented",
});

const DESIGNER: CortexRouteProfile = p({
  id: "designer",
  mode: "cortex",
  label: "Designer Agent",
  shortLabel: "Design",
  description: "UI design, wireframes, prototypes, and screen specs.",
  defaultIntent: "design.ui",
  qualityTier: "balanced",
  costTier: "medium",
  latencyTarget: "balanced",
  toolPolicy: "none",
  verifierPolicy: "optional",
  traceVisibility: "basic",
  status: "not_implemented",
});

const MEDIA: CortexRouteProfile = p({
  id: "media",
  mode: "cortex",
  label: "Media Studio",
  shortLabel: "Media",
  description: "Image, video, and audio creation and editing.",
  defaultIntent: "media.image",
  qualityTier: "balanced",
  costTier: "medium",
  latencyTarget: "balanced",
  toolPolicy: "required",
  verifierPolicy: "default",
  traceVisibility: "advanced",
  status: "not_implemented",
});

const FOUNDER: CortexRouteProfile = p({
  id: "founder",
  mode: "cortex",
  label: "Founder Agent",
  shortLabel: "Founder",
  description: "Business planning, strategy, pitch decks, and startup advice.",
  defaultIntent: "business.startup",
  qualityTier: "premium",
  costTier: "medium",
  latencyTarget: "balanced",
  toolPolicy: "optional",
  verifierPolicy: "default",
  traceVisibility: "advanced",
  status: "not_implemented",
});

const COMPUTE: CortexRouteProfile = p({
  id: "compute",
  mode: "cortex",
  label: "Ethen Compute",
  shortLabel: "Compute",
  description: "VM provisioning, cloud infrastructure, and deployment management.",
  defaultIntent: "infrastructure.compute",
  qualityTier: "premium",
  costTier: "high",
  latencyTarget: "patient",
  toolPolicy: "required",
  verifierPolicy: "strict",
  traceVisibility: "full",
  status: "not_implemented",
});

const OPERATOR: CortexRouteProfile = p({
  id: "operator",
  mode: "operator",
  label: "Ethen Operator",
  shortLabel: "Operator",
  description: "Agentic workflows with tools, approvals, action plans, and audit trails.",
  defaultIntent: "automation.plan",
  qualityTier: "premium",
  costTier: "variable",
  latencyTarget: "patient",
  toolPolicy: "required",
  verifierPolicy: "strict",
  traceVisibility: "full",
  status: "not_implemented",
});

// ── Profile lookup ───────────────────────────────────────────────────────

const PROFILES_BY_MODE: Record<string, CortexRouteProfile> = {
  [CORTEX_LITE.id]: CORTEX_LITE,
  [CORTEX.id]: CORTEX,
  [CORTEX_PRO.id]: CORTEX_PRO,
  [ULTRA_PREVIEW.id]: ULTRA_PREVIEW,
  [CODE.id]: CODE,
  [RESEARCH.id]: RESEARCH,
  [WRITER.id]: WRITER,
  [COMPUTER_USE.id]: COMPUTER_USE,
  [DESIGNER.id]: DESIGNER,
  [MEDIA.id]: MEDIA,
  [FOUNDER.id]: FOUNDER,
  [COMPUTE.id]: COMPUTE,
  [OPERATOR.id]: OPERATOR,
};

const ALL_PROFILES: CortexRouteProfile[] = [
  CORTEX_LITE,
  CORTEX,
  CORTEX_PRO,
  ULTRA_PREVIEW,
  CODE,
  RESEARCH,
  WRITER,
  COMPUTER_USE,
  DESIGNER,
  MEDIA,
  FOUNDER,
  COMPUTE,
  OPERATOR,
];

// ── Gateway → Cortex route profile mappings ──────────────────────────────
//
// Each gateway route profile maps to a Cortex branded mode.
// Additional mappings (research gateway) are for future wiring.

const GATEWAY_TO_CORTEX: Record<string, CortexRouteProfile> = {
  "text-general": CORTEX_LITE,
  "text-creative": CORTEX,
  "text-quality": CORTEX_PRO,
  "text-reasoning": CORTEX_PRO,
  research: RESEARCH,
};

/**
 * Return all defined Cortex route profiles (active + not implemented).
 */
export function getAllCortexRouteProfiles(): CortexRouteProfile[] {
  return ALL_PROFILES;
}

/**
 * Look up a Cortex route profile by its branded mode ID.
 * Returns null for unknown or null input.
 */
export function getCortexRouteProfile(
  modeId: string | null
): CortexRouteProfile | null {
  const normalized = modeId?.trim();
  if (!normalized) return null;
  return PROFILES_BY_MODE[normalized] ?? null;
}

/**
 * Resolve a Cortex route profile from a gateway route ID.
 * Returns null if the gateway route has no Cortex mapping.
 */
export function getCortexProfileForGatewayRoute(
  gatewayRouteId?: string | null
): CortexRouteProfile | null {
  const normalized = gatewayRouteId?.trim();
  if (!normalized) return null;
  return GATEWAY_TO_CORTEX[normalized] ?? null;
}

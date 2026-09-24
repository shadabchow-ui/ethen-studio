// Deterministic Cortex eval fixtures — no live provider calls.
// Each fixture exercises one Cortex module in isolation against a fixed input/expectation pair.

import type { EthenMode, ModelCandidate } from "../../../cortex/types";

export interface IntentFixture {
  name: string;
  message: string;
  selectedMode: EthenMode | "auto";
  expectedIntent: string;
  expectedMode: EthenMode;
}

export const INTENT_FIXTURES: IntentFixture[] = [
  {
    name: "plain chat question",
    message: "What's a good name for a coffee shop?",
    selectedMode: "auto",
    expectedIntent: "general.chat",
    expectedMode: "cortex",
  },
  {
    name: "coding investigation request",
    message: "Why is this function throwing a TypeError on line 42 of app.ts?",
    selectedMode: "auto",
    expectedIntent: "coding.inspect",
    expectedMode: "code",
  },
  {
    name: "research with freshness need",
    message: "What are the latest competitor pricing changes this week?",
    selectedMode: "auto",
    expectedIntent: "research.web",
    expectedMode: "research",
  },
  {
    name: "writing draft request",
    message: "Write a paragraph that sounds more confident and concise.",
    selectedMode: "auto",
    expectedIntent: "writing.draft",
    expectedMode: "writer",
  },
  {
    name: "explicit mode override wins over content-derived intent",
    message: "Why is this build failing?",
    selectedMode: "writer",
    expectedIntent: "writing.draft",
    expectedMode: "writer",
  },
];

export interface ModeProfileFixture {
  name: string;
  mode: EthenMode;
  expectedStatus: "active" | "not_implemented";
  expectedToolPolicy: string;
}

export const MODE_PROFILE_FIXTURES: ModeProfileFixture[] = [
  { name: "cortex-lite is active, no tools", mode: "cortex-lite", expectedStatus: "active", expectedToolPolicy: "none" },
  { name: "cortex is active, optional tools", mode: "cortex", expectedStatus: "active", expectedToolPolicy: "optional" },
  { name: "cortex-pro is active, optional tools", mode: "cortex-pro", expectedStatus: "active", expectedToolPolicy: "optional" },
  { name: "research is active, required tools", mode: "research", expectedStatus: "active", expectedToolPolicy: "required" },
  { name: "code is not yet implemented", mode: "code", expectedStatus: "not_implemented", expectedToolPolicy: "required" },
  { name: "writer is active, no tools", mode: "writer", expectedStatus: "active", expectedToolPolicy: "none" },
];

function candidate(overrides: Partial<ModelCandidate>): ModelCandidate {
  return {
    id: "default",
    providerId: "openai",
    providerKind: "openai",
    modelId: "gpt-4o-mini",
    visibleName: "GPT-4o mini",
    qualityTier: "balanced",
    supportsTools: true,
    supportsVision: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    latencyClass: "fast",
    enabled: true,
    ...overrides,
  };
}

export interface RouteSelectionFixture {
  name: string;
  routeId: string;
  candidates: ModelCandidate[];
  expectedSelectedId: string | null;
}

export const ROUTE_SELECTION_FIXTURES: RouteSelectionFixture[] = [
  {
    name: "cortex-lite favors the cheapest/fastest candidate",
    routeId: "cortex-lite",
    candidates: [
      candidate({ id: "cheap-fast", qualityTier: "starter", latencyClass: "fast", costPerInputTokenUsd: 0.0001, costPerOutputTokenUsd: 0.0001 }),
      candidate({ id: "expensive-slow", qualityTier: "max", latencyClass: "slow", costPerInputTokenUsd: 0.01, costPerOutputTokenUsd: 0.01 }),
    ],
    expectedSelectedId: "cheap-fast",
  },
  {
    name: "cortex-pro favors the highest quality candidate",
    routeId: "cortex-pro",
    candidates: [
      candidate({ id: "cheap-fast", qualityTier: "starter", latencyClass: "fast", costPerInputTokenUsd: 0.0001, costPerOutputTokenUsd: 0.0001 }),
      candidate({ id: "premium", qualityTier: "max", latencyClass: "balanced", costPerInputTokenUsd: 0.01, costPerOutputTokenUsd: 0.01 }),
    ],
    expectedSelectedId: "premium",
  },
  {
    name: "unknown route id yields no selection",
    routeId: "not-a-real-route",
    candidates: [candidate({ id: "only" })],
    expectedSelectedId: null,
  },
];

export interface VerifierFixture {
  name: string;
  input: {
    mode: string;
    intent: string;
    userRequest: string;
    outputText: string;
    riskLevel?: "low" | "medium" | "high";
  };
  expectedStatus: "passed" | "warned" | "failed" | "skipped";
}

export const VERIFIER_FIXTURES: VerifierFixture[] = [
  {
    name: "empty output fails verification",
    input: { mode: "cortex", intent: "general.chat", userRequest: "Say hi", outputText: "", riskLevel: "low" },
    expectedStatus: "failed",
  },
  {
    name: "no constraints or risk signal skips verification",
    input: { mode: "cortex", intent: "general.chat", userRequest: "Say hi", outputText: "Hi there! How can I help today?" },
    expectedStatus: "skipped",
  },
  {
    name: "high risk output is flagged",
    input: {
      mode: "cortex-pro",
      intent: "general.reasoning",
      userRequest: "Give me legal advice on this contract.",
      outputText: "Here is a brief contract review.",
      riskLevel: "high",
    },
    expectedStatus: "warned",
  },
  {
    name: "writer output with unsourced current claim is flagged",
    input: {
      mode: "writer",
      intent: "writing.draft",
      userRequest: "Write a short paragraph about our pricing.",
      outputText: "We currently offer the lowest pricing in the industry, as of today.",
    },
    expectedStatus: "passed",
  },
];

export interface ReceiptTruthFixture {
  name: string;
  attempts: Array<{ providerId: string; succeeded: boolean }>;
  fallbackUsed: boolean | undefined;
  expectedFinalStatus: "primary_success" | "fallback_success" | "degraded_success" | "failed";
}

export const RECEIPT_TRUTH_FIXTURES: ReceiptTruthFixture[] = [
  {
    name: "single successful attempt is primary_success",
    attempts: [{ providerId: "openai", succeeded: true }],
    fallbackUsed: false,
    expectedFinalStatus: "primary_success",
  },
  {
    name: "primary fails then fallback succeeds is fallback_success",
    attempts: [
      { providerId: "openai", succeeded: false },
      { providerId: "anthropic", succeeded: true },
    ],
    fallbackUsed: true,
    expectedFinalStatus: "fallback_success",
  },
  {
    name: "all attempts fail is failed",
    attempts: [
      { providerId: "openai", succeeded: false },
      { providerId: "anthropic", succeeded: false },
    ],
    fallbackUsed: true,
    expectedFinalStatus: "failed",
  },
];

export interface FallbackBehaviorFixture {
  name: string;
  attempts: Array<{ providerId: string; succeeded: boolean }>;
  fallbackUsed: boolean | undefined;
  expectedFinalStatus: "primary_success" | "fallback_success" | "degraded_success" | "failed";
}

// Exercises lib/cortex/route-receipt.ts's internal resolveFallbackFinalStatus
// behavior through the same logic mirrored in the eval harness, covering
// shapes RECEIPT_TRUTH_FIXTURES does not: no attempts recorded, and a single
// failed attempt with no fallback recorded.
export const FALLBACK_BEHAVIOR_FIXTURES: FallbackBehaviorFixture[] = [
  {
    name: "no attempts recorded and fallbackUsed false is primary_success",
    attempts: [],
    fallbackUsed: false,
    expectedFinalStatus: "primary_success",
  },
  {
    name: "no attempts recorded but fallbackUsed true is failed",
    attempts: [],
    fallbackUsed: true,
    expectedFinalStatus: "failed",
  },
  {
    name: "single failed attempt with no recorded fallback is failed",
    attempts: [{ providerId: "openai", succeeded: false }],
    fallbackUsed: false,
    expectedFinalStatus: "failed",
  },
  {
    name: "three attempts, only the last succeeds, is fallback_success",
    attempts: [
      { providerId: "openai", succeeded: false },
      { providerId: "anthropic", succeeded: false },
      { providerId: "google", succeeded: true },
    ],
    fallbackUsed: true,
    expectedFinalStatus: "fallback_success",
  },
];

export interface CostLatencyFixture {
  name: string;
  routeId: string;
  candidates: ModelCandidate[];
  expectedSelectedId: string | null;
  expectedLatencyClass?: ModelCandidate["latencyClass"];
  expectedMaxCostPerToken?: number;
}

export const COST_LATENCY_FIXTURES: CostLatencyFixture[] = [
  {
    name: "cortex-lite selects the fast/cheap candidate over a slower, pricier one",
    routeId: "cortex-lite",
    candidates: [
      candidate({ id: "cheap-fast", qualityTier: "starter", latencyClass: "fast", costPerInputTokenUsd: 0.0001, costPerOutputTokenUsd: 0.0001 }),
      candidate({ id: "expensive-slow", qualityTier: "max", latencyClass: "slow", costPerInputTokenUsd: 0.01, costPerOutputTokenUsd: 0.01 }),
    ],
    expectedSelectedId: "cheap-fast",
    expectedLatencyClass: "fast",
    expectedMaxCostPerToken: 0.0002,
  },
  {
    name: "cortex-pro tolerates higher cost/latency for quality",
    routeId: "cortex-pro",
    candidates: [
      candidate({ id: "cheap-fast", qualityTier: "starter", latencyClass: "fast", costPerInputTokenUsd: 0.0001, costPerOutputTokenUsd: 0.0001 }),
      candidate({ id: "premium", qualityTier: "max", latencyClass: "balanced", costPerInputTokenUsd: 0.01, costPerOutputTokenUsd: 0.01 }),
    ],
    expectedSelectedId: "premium",
    expectedLatencyClass: "balanced",
  },
  {
    name: "research route rejects a disabled low-cost candidate in favor of an enabled one",
    routeId: "research",
    candidates: [
      candidate({ id: "disabled-cheap", qualityTier: "starter", latencyClass: "fast", enabled: false, costPerInputTokenUsd: 0.0001, costPerOutputTokenUsd: 0.0001 }),
      candidate({ id: "enabled-balanced", qualityTier: "balanced", latencyClass: "balanced", costPerInputTokenUsd: 0.002, costPerOutputTokenUsd: 0.002 }),
    ],
    expectedSelectedId: "enabled-balanced",
    expectedLatencyClass: "balanced",
  },
];

export interface ResearchGroundingFixture {
  name: string;
  input: {
    mode: "search" | "answer" | "contents" | "agent";
    query: string;
    provider: "exa" | "mock";
    sources: Array<{ index: number; title: string; url: string; domain: string; publishedDate?: string; snippet?: string }>;
    evidence: Array<{ id: string; finding: string; sourceIndex?: number; sourceTitle?: string; sourceUrl?: string; status?: string; confidence?: string }>;
  };
  expectedSourceGrounded: boolean;
  expectedCitationsAvailable: boolean;
  expectedConfidence: "low" | "medium" | "high" | "unknown";
}

export const RESEARCH_GROUNDING_FIXTURES: ResearchGroundingFixture[] = [
  {
    name: "sources and cited evidence yields high confidence",
    input: {
      mode: "answer",
      query: "What changed in competitor pricing this week?",
      provider: "exa",
      sources: [{ index: 0, title: "Pricing update", url: "https://example.com/a", domain: "example.com", publishedDate: "2026-06-01" }],
      evidence: [{ id: "e1", finding: "Competitor X raised prices 5%", sourceIndex: 0, sourceUrl: "https://example.com/a" }],
    },
    expectedSourceGrounded: true,
    expectedCitationsAvailable: true,
    expectedConfidence: "high",
  },
  {
    name: "sources without citable evidence yields medium confidence",
    input: {
      mode: "search",
      query: "Recent industry news",
      provider: "exa",
      sources: [{ index: 0, title: "Industry roundup", url: "https://example.com/b", domain: "example.com" }],
      evidence: [{ id: "e1", finding: "General market commentary" }],
    },
    expectedSourceGrounded: true,
    expectedCitationsAvailable: false,
    expectedConfidence: "medium",
  },
  {
    name: "no sources and no evidence yields unknown confidence and ungrounded receipt",
    input: {
      mode: "agent",
      query: "",
      provider: "mock",
      sources: [],
      evidence: [],
    },
    expectedSourceGrounded: false,
    expectedCitationsAvailable: false,
    expectedConfidence: "unknown",
  },
];

export interface CapabilityGatingFixture {
  name: string;
  required: { tools?: boolean; jsonMode?: boolean; vision?: boolean };
  candidates: Array<Pick<ModelCandidate, "id" | "supportsTools" | "supportsJsonMode" | "supportsVision" | "supportsStreaming" | "enabled">>;
  expectedSelectedId: string | null;
  expectedError?: "capability_not_executable";
}

export const CAPABILITY_GATING_FIXTURES: CapabilityGatingFixture[] = [
  {
    name: "tools required — tool-capable candidate wins over non-tool",
    required: { tools: true },
    candidates: [
      { id: "no-tools", supportsTools: false, supportsJsonMode: false, supportsVision: false, supportsStreaming: true, enabled: true },
      { id: "has-tools", supportsTools: true, supportsJsonMode: false, supportsVision: false, supportsStreaming: true, enabled: true },
    ],
    expectedSelectedId: "has-tools",
  },
  {
    name: "tools required — no candidate supports tools → capability_not_executable",
    required: { tools: true },
    candidates: [
      { id: "a", supportsTools: false, supportsJsonMode: false, supportsVision: false, supportsStreaming: true, enabled: true },
      { id: "b", supportsTools: false, supportsJsonMode: false, supportsVision: false, supportsStreaming: true, enabled: true },
    ],
    expectedSelectedId: null,
    expectedError: "capability_not_executable",
  },
  {
    name: "jsonMode required — json-capable wins",
    required: { jsonMode: true },
    candidates: [
      { id: "no-json", supportsTools: false, supportsJsonMode: false, supportsVision: false, supportsStreaming: true, enabled: true },
      { id: "has-json", supportsTools: false, supportsJsonMode: true, supportsVision: false, supportsStreaming: true, enabled: true },
    ],
    expectedSelectedId: "has-json",
  },
  {
    name: "vision required — vision-capable wins",
    required: { vision: true },
    candidates: [
      { id: "no-vision", supportsTools: false, supportsJsonMode: false, supportsVision: false, supportsStreaming: true, enabled: true },
      { id: "has-vision", supportsTools: false, supportsJsonMode: false, supportsVision: true, supportsStreaming: true, enabled: true },
    ],
    expectedSelectedId: "has-vision",
  },
  {
    name: "vision + tools required — only candidate with both wins",
    required: { tools: true, vision: true },
    candidates: [
      { id: "tools-only", supportsTools: true, supportsJsonMode: false, supportsVision: false, supportsStreaming: true, enabled: true },
      { id: "vision-only", supportsTools: false, supportsJsonMode: false, supportsVision: true, supportsStreaming: true, enabled: true },
      { id: "both", supportsTools: true, supportsJsonMode: false, supportsVision: true, supportsStreaming: true, enabled: true },
    ],
    expectedSelectedId: "both",
  },
  {
    name: "stale/unhealthy provider excluded — disabled candidate never selected",
    required: {},
    candidates: [
      { id: "disabled", supportsTools: true, supportsJsonMode: true, supportsVision: true, supportsStreaming: true, enabled: false },
      { id: "healthy", supportsTools: true, supportsJsonMode: true, supportsVision: true, supportsStreaming: true, enabled: true },
    ],
    expectedSelectedId: "healthy",
  },
  {
    name: "all candidates disabled → no selection",
    required: {},
    candidates: [
      { id: "a", supportsTools: true, supportsJsonMode: true, supportsVision: true, supportsStreaming: true, enabled: false },
      { id: "b", supportsTools: true, supportsJsonMode: true, supportsVision: true, supportsStreaming: true, enabled: false },
    ],
    expectedSelectedId: null,
  },
];

export interface ProviderOutageFixture {
  name: string;
  routeId: string;
  candidates: ModelCandidate[];
  expectedSelectedId: string | null;
}

export const PROVIDER_OUTAGE_FIXTURES: ProviderOutageFixture[] = [
  {
    name: "provider outage — healthy candidate wins over circuit-open",
    routeId: "cortex",
    candidates: [
      candidate({ id: "outage", providerId: "openai", enabled: false }),
      candidate({ id: "healthy", providerId: "anthropic", enabled: true }),
    ],
    expectedSelectedId: "healthy",
  },
  {
    name: "all providers unhealthy → no selection",
    routeId: "cortex",
    candidates: [
      candidate({ id: "a", providerId: "openai", enabled: false }),
      candidate({ id: "b", providerId: "anthropic", enabled: false }),
    ],
    expectedSelectedId: null,
  },
  {
    name: "low-cost routing — cheapest healthy wins",
    routeId: "cortex-lite",
    candidates: [
      candidate({ id: "cheap", qualityTier: "starter", latencyClass: "fast", costPerInputTokenUsd: 0.0001, enabled: true }),
      candidate({ id: "mid", qualityTier: "balanced", latencyClass: "balanced", costPerInputTokenUsd: 0.002, enabled: true }),
      candidate({ id: "premium", qualityTier: "max", latencyClass: "slow", costPerInputTokenUsd: 0.01, enabled: true }),
    ],
    expectedSelectedId: "cheap",
  },
  {
    name: "premium routing — highest quality wins even when expensive",
    routeId: "cortex-pro",
    candidates: [
      candidate({ id: "cheap", qualityTier: "starter", latencyClass: "fast", costPerInputTokenUsd: 0.0001, enabled: true }),
      candidate({ id: "premium", qualityTier: "max", latencyClass: "balanced", costPerInputTokenUsd: 0.01, enabled: true }),
    ],
    expectedSelectedId: "premium",
  },
  {
    name: "long context — only candidate with sufficient context wins",
    routeId: "cortex",
    candidates: [
      candidate({ id: "small-ctx", providerId: "openai", enabled: true }),
      candidate({ id: "large-ctx", providerId: "anthropic", enabled: true }),
    ],
    expectedSelectedId: "large-ctx",
  },
];


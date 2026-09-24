/** Machine-readable authority boundary for MI-R1 consumers. */
export const MI_AUTHORITY_CONTRACT_VERSION = "mi-authority-r1";

export type ModelFactOwner = "model-intelligence" | "gateway-runtime" | "cortex-policy" | "model-library-projection";

export const MODEL_FACT_AUTHORITY = {
  identity: "model-intelligence",
  providerMapping: "model-intelligence",
  aliases: "model-intelligence",
  familyVersionLineage: "model-intelligence",
  releaseDeprecation: "model-intelligence",
  capabilities: "model-intelligence",
  contextMaxOutput: "model-intelligence",
  pricingMetadata: "model-intelligence",
  benchmarkMetadata: "model-intelligence",
  provenanceFreshness: "model-intelligence",
  providerPolicy: "model-intelligence",
  runtimeAvailability: "gateway-runtime",
  providerCertification: "gateway-runtime",
  latencyTtftReliability: "gateway-runtime",
  routingDecision: "cortex-policy",
  displayFormatting: "model-library-projection",
} as const satisfies Record<string, ModelFactOwner>;

/** Explicit external inventory aliases; never infer provider equivalence. */
export const MI_EXTERNAL_PROVIDER_TO_CANONICAL: Readonly<Record<string, string>> = {
  moonshotai: "kimi",
  zai: "z-ai",
};

export function resolveCanonicalProviderId(providerId: string): string {
  return MI_EXTERNAL_PROVIDER_TO_CANONICAL[providerId] ?? providerId;
}

export function ownerForModelFact(fact: keyof typeof MODEL_FACT_AUTHORITY): ModelFactOwner {
  return MODEL_FACT_AUTHORITY[fact];
}

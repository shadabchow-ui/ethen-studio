/** Versioned UI derivation policy. These are derived labels, never raw facts. */
export const MI_CLASSIFICATION_POLICY_VERSION = "mi-classification-v1";
export const MI_CLASSIFICATION_THRESHOLDS = {
  lowCostInputUsdPerMillion: 0.5,
  longContextTokens: 100_000,
  fastOutputTokensPerSecond: 100,
  lowLatencySeconds: 5,
  highIntelligenceScore: 60,
} as const;

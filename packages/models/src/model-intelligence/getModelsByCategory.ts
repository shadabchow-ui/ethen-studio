/**
 * lib/model-intelligence/getModelsByCategory.ts
 * Filter model index entries by category.
 * Categories are derived from available index fields (model_type, name).
 * Only displays counts/metrics that can be derived from current data.
 */
import { getAllModelEntries, type ModelIndexEntry } from "./getAllModelSlugs";

export const SUPPORTED_CATEGORIES = [
  "open-weight",
  "proprietary",
  "reasoning",
  "coding",
  "vision",
  "long-context",
  "low-cost",
  "fastest",
] as const;

export type ModelCategory = (typeof SUPPORTED_CATEGORIES)[number];

const REASONING_KEYWORDS = [
  "reasoning", "think", "thinker",
  "deep", "deepseek-r",
  "r1", "r1-",
];
const CODING_KEYWORDS = [
  "coder", "code-dev", "code-",
];
const VISION_KEYWORDS = [
  "vision", "visual", "vl", "vlm",
  "multi-modal", "multimodal",
];
const LONG_CONTEXT_KEYWORDS = [
  "long", "context", "128k", "1m", "2m",
];
const LOW_COST_KEYWORDS = [
  "lite", "mini", "small", "nano",
];
const FASTEST_KEYWORDS = [
  "turbo", "flash", "fast", "speed", "rapid",
];

function nameMatchesKeywords(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Get model index entries for a given category.
 * Returns an object with the filtered entries and a derivation hint.
 */
export function getModelsByCategory(
  category: string,
): { entries: ModelIndexEntry[]; derivation: string; authoritative: false } {
  const all = getAllModelEntries();
  const lower = category.toLowerCase();

  switch (lower) {
    case "open-weight": {
      const entries = all.filter(
        (p) => p.model_type?.toLowerCase().includes("open"),
      );
      return {
        entries,
        derivation: `Filtered by model_type substring "open" — non-authoritative name heuristic`,
      authoritative: false,
      };
    }

    case "proprietary": {
      const entries = all.filter(
        (p) =>
          !p.model_type?.toLowerCase().includes("open") &&
          p.model_type?.trim() !== "",
      );
      return {
        entries,
        derivation: `Filtered by model_type substring ≠ "open" — non-authoritative name heuristic`,
      authoritative: false,
      };
    }

    case "reasoning":
      return {
        entries: all.filter((p) =>
          nameMatchesKeywords(p.name, REASONING_KEYWORDS),
        ),
        derivation: `Matched by model name keywords: ${REASONING_KEYWORDS.join(", ")}`,
      authoritative: false,
      };

    case "coding":
      return {
        entries: all.filter((p) =>
          nameMatchesKeywords(p.name, CODING_KEYWORDS),
        ),
        derivation: `Matched by model name keywords: ${CODING_KEYWORDS.join(", ")}`,
      authoritative: false,
      };

    case "vision":
      return {
        entries: all.filter((p) =>
          nameMatchesKeywords(p.name, VISION_KEYWORDS),
        ),
        derivation: `Matched by model name keywords: ${VISION_KEYWORDS.join(", ")}`,
      authoritative: false,
      };

    case "long-context":
      return {
        entries: all.filter((p) =>
          nameMatchesKeywords(p.name, LONG_CONTEXT_KEYWORDS),
        ),
        derivation: `Matched by model name keywords: ${LONG_CONTEXT_KEYWORDS.join(", ")}`,
      authoritative: false,
      };

    case "low-cost":
      return {
        entries: all.filter((p) =>
          nameMatchesKeywords(p.name, LOW_COST_KEYWORDS),
        ),
        derivation: `Matched by model name keywords: ${LOW_COST_KEYWORDS.join(", ")}`,
      authoritative: false,
      };

    case "fastest":
      return {
        entries: all.filter((p) =>
          nameMatchesKeywords(p.name, FASTEST_KEYWORDS),
        ),
        derivation: `Matched by model name keywords: ${FASTEST_KEYWORDS.join(", ")}`,
      authoritative: false,
      };

    default:
      return { entries: [], derivation: "Unsupported category", authoritative: false };
  }
}

/**
 * Check whether a category string is supported.
 */
export function isSupportedCategory(
  category: string,
): category is ModelCategory {
  return (SUPPORTED_CATEGORIES as readonly string[]).includes(category);
}

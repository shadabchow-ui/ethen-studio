import type { SearchIndex } from "./search";
import { keywordSearch, vectorSearch } from "./search";

/**
 * Hybrid search that runs keyword and vector searches in parallel,
 * merges, and deduplicates results with combined scores.
 */
export function hybridSearch(
  queryText: string,
  index: SearchIndex,
  topK: number = 10,
): ReturnType<typeof keywordSearch> {
  const kwResults = keywordSearch(queryText, index, topK * 3);
  const vecResults = vectorSearch(queryText, index, topK * 3);

  const merged = new Map<
    string,
    { result: ReturnType<typeof keywordSearch>[number]; kwScore: number; vecScore: number }
  >();

  for (const r of kwResults) {
    merged.set(r.chunk.id, { result: r, kwScore: r.score, vecScore: 0 });
  }
  for (const r of vecResults) {
    const existing = merged.get(r.chunk.id);
    if (existing) {
      existing.vecScore = r.score;
      existing.result.score = existing.kwScore * 0.4 + existing.vecScore * 0.6;
      existing.result.scoreBreakdown = { keyword: existing.kwScore, vector: existing.vecScore };
    } else {
      merged.set(r.chunk.id, { result: r, kwScore: 0, vecScore: r.score });
    }
  }

  const scored = Array.from(merged.values());
  scored.sort((a, b) => b.result.score - a.result.score);

  return scored.slice(0, topK).map((s, i) => {
    s.result.rank = i + 1;
    return s.result;
  });
}

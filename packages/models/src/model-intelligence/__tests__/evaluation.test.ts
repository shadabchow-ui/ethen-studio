import { describe, expect, it } from "vitest";
import { BENCHMARK_REGISTRY, evaluationId, getLeaderboard, normalizeWithinBenchmark, rankEvaluation } from "../evaluation";
const definition = BENCHMARK_REGISTRY[0];
const result = (modelId: string, score: number, evidenceState: "fresh" | "stale" | "unknown" = "fresh") => { const value = { modelId, benchmarkId: definition.id, score, displayValue: String(score), effectiveAt: "2026-01-01", recordedAt: "2026-01-01", methodologyVersion: null, evidenceState, sourceType: "external_benchmark" as const }; return { ...value, id: evaluationId(value) }; };
describe("MI-R4 evaluation engine", () => {
  it("ranks only fresh comparable records", () => { const a = result("mi:a", 10), b = result("mi:b", 20), stale = result("mi:c", 30, "stale"); const ranked = rankEvaluation(definition, [a,b,stale]); expect(ranked.map(x => x.rank)).toEqual([2,1,null]); });
  it("does not normalize incomparable or unrelated records", () => { const a = result("mi:a", 10), b = result("mi:b", 20), stale = result("mi:c", 30, "stale"); expect(normalizeWithinBenchmark(definition, a, [a,b])).toBe(0); expect(normalizeWithinBenchmark(definition, a, [a,stale])).toBeNull(); });
  it("never ranks unknown direction and exposes a canonical leaderboard query", () => { const unknown={...definition,direction:"unknown" as const}; const a=result("mi:a",10); expect(rankEvaluation(unknown,[a])[0].rank).toBeNull(); expect(getLeaderboard(definition.id,[a])[0].rank).toBe(1); });
});

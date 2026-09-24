// Client-safe grounding + freshness helpers for the Research workspace.
//
// These helpers derive truthful "is this answer backed by real provider
// sources?" metadata from an executed ResearchResult. They never infer
// grounding from query text — only from sources/evidence the provider
// (Exa or mock) actually returned. They are safe to import from client
// components (no "server-only", no server-only deps).

import type { ResearchResult, ResearchSource, EvidenceRow } from "./types";
import { buildSearchSources, buildSearchEvidence } from "./normalize";

/**
 * Coarse provider kind used for honest status labels in the UI.
 * - "live": a real provider (Exa) produced this result.
 * - "mock": the mock provider produced this result (preview/demo).
 * - "setup-required": no provider ran (no result / undefined provider).
 */
export type ResearchProviderKind = "live" | "mock" | "setup-required";

export interface ResearchGroundingSummary {
  /** Coarse provider kind, derived from the `provider` field only. */
  providerKind: ResearchProviderKind;
  provider: "exa" | "mock";
  mode: ResearchResult["mode"];
  /** True only when the result has an answer/report text AND at least one cited source. */
  groundedAnswer: boolean;
  /** Number of provider-backed source records attached to this result. */
  citedSourceCount: number;
  /** Number of claim-level evidence rows attached to this result. */
  evidenceCount: number;
  /** True when answer text exists but no sources back it (missing evidence). */
  missingEvidence: boolean;
  /** True when at least one source carries a publishedDate. */
  freshnessAvailable: boolean;
  /** How many sources carry a publishedDate. */
  freshnessSourceCount: number;
  /**
   * True when the result is a mock/preview run that produced text without
   * any real backing sources. Used to keep preview output visibly labeled.
   */
  ungroundedPreview: boolean;
}

export function getResearchProviderKind(
  provider: "exa" | "mock" | undefined,
): ResearchProviderKind {
  if (provider === "exa") return "live";
  if (provider === "mock") return "mock";
  return "setup-required";
}

/**
 * Extract the source records attached to an executed research result.
 * Search mode builds normalized sources from the raw result list (mirroring
 * the report builder) so the summary stays consistent with what the UI
 * renders. Never fabricates sources.
 */
function sourcesForResult(result: ResearchResult): ResearchSource[] {
  if (result.mode === "search") return buildSearchSources(result.results);
  return result.result.sources;
}

function evidenceForResult(result: ResearchResult): EvidenceRow[] {
  if (result.mode === "search") return buildSearchEvidence(result.results);
  return result.result.evidence;
}

function resultHasAnswerText(result: ResearchResult): boolean {
  if (result.mode === "answer") return !!result.result.answer.trim();
  if (result.mode === "agent") return !!result.result.report.trim();
  // search + contents are not "answer" surfaces; they are evidence lists.
  return false;
}

export function summarizeResearchGrounding(
  result: ResearchResult,
  provider: "exa" | "mock",
): ResearchGroundingSummary {
  const sources = sourcesForResult(result);
  const evidence = evidenceForResult(result);
  const citedSourceCount = sources.length;
  const freshnessSourceCount = sources.filter((s) => !!s.publishedDate).length;
  const hasAnswerText = resultHasAnswerText(result);

  return {
    providerKind: getResearchProviderKind(provider),
    provider,
    mode: result.mode,
    groundedAnswer: hasAnswerText && citedSourceCount > 0,
    citedSourceCount,
    evidenceCount: evidence.length,
    missingEvidence: hasAnswerText && citedSourceCount === 0,
    freshnessAvailable: freshnessSourceCount > 0,
    freshnessSourceCount,
    ungroundedPreview: provider === "mock" && hasAnswerText && citedSourceCount === 0,
  };
}

/**
 * Honest one-line label describing a provider kind for badges / copy.
 * Used to keep setup-required and mock states visibly distinct from live.
 */
export function describeProviderKind(kind: ResearchProviderKind): string {
  switch (kind) {
    case "live":
      return "Live — Exa";
    case "mock":
      return "Preview — mock";
    case "setup-required":
      return "Setup required — Exa";
  }
}

/**
 * Human label for a publishedDate value. Returns null when no date is
 * present so callers can avoid rendering freshness metadata that does
 * not exist in provider output.
 */
export function formatFreshnessLabel(publishedDate: string | undefined): string | null {
  if (!publishedDate) return null;
  const trimmed = publishedDate.trim();
  if (!trimmed) return null;
  // Provider dates vary (ISO, year, YYYY-MM-DD). Render as-is rather than
  // re-interpreting, so we never imply a precision the source did not provide.
  return trimmed;
}

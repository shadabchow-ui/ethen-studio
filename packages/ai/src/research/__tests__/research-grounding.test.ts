// Research grounding + freshness helpers — unit tests
// Run with: npx tsx lib/research/__tests__/research-grounding.test.ts
//
// These helpers derive grounding state ONLY from provider output, never from
// query text. Tests assert that empty mock results stay ungrounded, that live
// sources with citations count as grounded, and that freshness is only
// reported when publishedDate actually exists.

import {
  describeProviderKind,
  formatFreshnessLabel,
  getResearchProviderKind,
  summarizeResearchGrounding,
} from "../grounding";
import type { ResearchResult } from "../types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(
    `  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// ── getResearchProviderKind ───────────────────────────────────────────

assertEqual(getResearchProviderKind("exa"), "live", "exa provider is 'live'");
assertEqual(getResearchProviderKind("mock"), "mock", "mock provider is 'mock'");
assertEqual(getResearchProviderKind(undefined), "setup-required", "undefined provider is 'setup-required'");

// ── describeProviderKind ──────────────────────────────────────────────

assertEqual(describeProviderKind("live"), "Live — Exa", "live label is honest");
assertEqual(describeProviderKind("mock"), "Preview — mock", "mock label says preview");
assertEqual(
  describeProviderKind("setup-required"),
  "Setup required — Exa",
  "setup-required label surfaces action needed",
);

// ── formatFreshnessLabel ──────────────────────────────────────────────

assertEqual(formatFreshnessLabel(undefined), null, "no date -> null (no freshness implied)");
assertEqual(formatFreshnessLabel(""), null, "empty date -> null");
assertEqual(formatFreshnessLabel("   "), null, "whitespace date -> null");
assertEqual(formatFreshnessLabel("2025-01-15"), "2025-01-15", "ISO-ish date passes through as-is");
assertEqual(formatFreshnessLabel("2024"), "2024", "year-only date passes through as-is");

// ── summarizeResearchGrounding: mock empty search stays ungrounded ────

{
  const emptySearch: ResearchResult = { mode: "search", results: [] };
  const summary = summarizeResearchGrounding(emptySearch, "mock");
  assertEqual(summary.providerKind, "mock", "mock search: providerKind is 'mock'");
  assertEqual(summary.citedSourceCount, 0, "mock search: no sources");
  assertEqual(summary.evidenceCount, 0, "mock search: no evidence rows");
  assert(!summary.groundedAnswer, "mock search: not a grounded answer (search has no answer text)");
  assert(!summary.missingEvidence, "mock search: not flagged missing evidence (no answer text)");
  assert(!summary.ungroundedPreview, "mock search: search mode is not an ungrounded preview answer");
  assert(!summary.freshnessAvailable, "mock search: freshness not available");
  assertEqual(summary.freshnessSourceCount, 0, "mock search: freshness source count is 0");
}

// ── summarizeResearchGrounding: mock answer with no sources ───────────

{
  const mockAnswer: ResearchResult = {
    mode: "answer",
    result: { answer: "Some preview text.", sources: [], evidence: [] },
  };
  const summary = summarizeResearchGrounding(mockAnswer, "mock");
  assert(summary.missingEvidence, "mock answer with text + no sources: flagged missing evidence");
  assert(summary.ungroundedPreview, "mock answer with text + no sources: flagged ungrounded preview");
  assert(!summary.groundedAnswer, "mock answer with no sources: not grounded");
}

// ── summarizeResearchGrounding: live answer with sources + freshness ──

{
  const liveAnswer: ResearchResult = {
    mode: "answer",
    result: {
      answer: "Recent AI research shows improved reasoning.",
      sources: [
        {
          id: "src-1",
          title: "AI Paper",
          url: "https://example.com/paper",
          domain: "example.com",
          publishedDate: "2025-01-15",
        },
        { id: "src-2", title: "Other", url: "https://other.com", domain: "other.com" },
      ],
      evidence: [
        { id: "ev-1", finding: "Improved reasoning", sourceId: "src-1", status: "cited" },
      ],
    },
  };
  const summary = summarizeResearchGrounding(liveAnswer, "exa");
  assertEqual(summary.providerKind, "live", "live answer: providerKind is 'live'");
  assertEqual(summary.citedSourceCount, 2, "live answer: counts 2 sources");
  assertEqual(summary.evidenceCount, 1, "live answer: counts 1 evidence row");
  assert(summary.groundedAnswer, "live answer with sources: grounded");
  assert(!summary.missingEvidence, "live answer with sources: not missing evidence");
  assert(!summary.ungroundedPreview, "live answer: not a preview");
  assert(summary.freshnessAvailable, "live answer: freshness available (one dated source)");
  assertEqual(summary.freshnessSourceCount, 1, "live answer: 1 of 2 sources dated");
}

// ── summarizeResearchGrounding: live answer with no sources ───────────

{
  const ungrounded: ResearchResult = {
    mode: "answer",
    result: { answer: "Live provider text without sources.", sources: [], evidence: [] },
  };
  const summary = summarizeResearchGrounding(ungrounded, "exa");
  assertEqual(summary.providerKind, "live", "ungrounded live: still 'live' provider kind");
  assert(summary.missingEvidence, "live text without sources: flagged missing evidence");
  assert(!summary.groundedAnswer, "live text without sources: not grounded");
  assert(!summary.ungroundedPreview, "live text: not a preview (provider is live, not mock)");
}

// ── summarizeResearchGrounding: contents mode (no answer text) ────────

{
  const contents: ResearchResult = {
    mode: "contents",
    result: {
      url: "https://example.com",
      domain: "example.com",
      title: "Page",
      text: "extracted body",
      characterCount: 13,
      sources: [
        { id: "src-1", title: "Page", url: "https://example.com", domain: "example.com" },
      ],
      evidence: [],
    },
  };
  const summary = summarizeResearchGrounding(contents, "exa");
  assert(!summary.groundedAnswer, "contents mode: not a grounded answer (no answer text concept)");
  assert(!summary.missingEvidence, "contents mode: not flagged missing evidence");
  assertEqual(summary.citedSourceCount, 1, "contents mode: counts its source records");
}

// ── Summary ───────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}

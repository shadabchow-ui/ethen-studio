// Cortex research adapter — unit tests
// Run with: npx tsx lib/cortex/__tests__/cortex-research.test.ts

import {
  buildResearchCortexReceipt,
  buildResearchInputFromResult,
  executeCortexResearchTool,
  getResearchRouteProfile,
  getResearchToolClass,
} from "../research";
import type { CortexResearchInput } from "../research";
import type { ResearchResult } from "../../research/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── getResearchRouteProfile ──────────────────────────────────────────

{
  const profile = getResearchRouteProfile();
  assert(profile !== null, "getResearchRouteProfile returns non-null");
  assertEqual(profile!.id, "research", "profile id is 'research'");
  assertEqual(profile!.status, "active", "profile status is 'active'");
  assertEqual(profile!.mode, "research", "profile mode is 'research'");
}

// ── buildResearchCortexReceipt with full data ────────────────────────

const fullInput: CortexResearchInput = {
  mode: "answer",
  query: "What is the latest AI research?",
  provider: "exa",
  sources: [
    { index: 1, title: "AI Paper 2025", url: "https://example.com/paper", domain: "example.com", publishedDate: "2025-01-15" },
    { index: 2, title: "ML Advances", url: "https://ml.org/advances", domain: "ml.org" },
  ],
  evidence: [
    { id: "ev-1", finding: "LLMs show improved reasoning", sourceIndex: 1, sourceTitle: "AI Paper 2025", sourceUrl: "https://example.com/paper", status: "verified", confidence: "high" },
  ],
  answerText: "Here is a summary of recent AI research advances.",
};

{
  const receipt = buildResearchCortexReceipt(fullInput);
  assertEqual(receipt.route, "research", "receipt route is 'research'");
  assertEqual(receipt.mode, "answer", "receipt mode is 'answer'");
  assertEqual(receipt.provider, "exa", "receipt provider is 'exa'");
  assertEqual(receipt.sourceCount, 2, "receipt sourceCount is 2");
  assertEqual(receipt.evidenceCount, 1, "receipt evidenceCount is 1");
  assert(receipt.sourceGrounded, "receipt sourceGrounded is true");
  assert(receipt.citationsAvailable, "receipt citationsAvailable is true with evidence sourceUrl");
  assert(receipt.freshnessCheckable, "receipt freshnessCheckable is true with publishedDate");
  assert(receipt.verifierRecommended, "receipt verifierRecommended is true");
  assertEqual(receipt.confidence, "high", "receipt confidence is 'high' with sources + citations");
}

// ── buildResearchCortexReceipt with partial data ─────────────────────

const partialInput: CortexResearchInput = {
  mode: "search",
  query: "weather",
  provider: "mock",
  sources: [],
  evidence: [],
};

{
  const receipt = buildResearchCortexReceipt(partialInput);
  assertEqual(receipt.route, "research", "partial receipt route is 'research'");
  assertEqual(receipt.provider, "mock", "partial receipt provider is 'mock'");
  assertEqual(receipt.sourceCount, 0, "partial receipt sourceCount is 0");
  assertEqual(receipt.evidenceCount, 0, "partial receipt evidenceCount is 0");
  assert(!receipt.sourceGrounded, "partial receipt sourceGrounded is false");
  assert(!receipt.citationsAvailable, "partial receipt citationsAvailable is false");
  assert(!receipt.freshnessCheckable, "partial receipt freshnessCheckable is false");
  assert(!receipt.verifierRecommended, "partial receipt verifierRecommended is false with no sources");
  assertEqual(receipt.confidence, "unknown", "partial receipt confidence is 'unknown' with no sources");
}

// ── buildResearchCortexReceipt with empty query ──────────────────────

{
  const receipt = buildResearchCortexReceipt({ ...partialInput, query: "" });
  assertEqual(receipt.query, "not provided", "empty query becomes 'not provided'");
}

// ── buildResearchCortexReceipt with evidence but no sourceUrl ────────

{
  const noUrlEvidence: CortexResearchInput = {
    mode: "answer",
    query: "test",
    provider: "exa",
    sources: [{ index: 1, title: "Source", url: "https://x.com", domain: "x.com" }],
    evidence: [{ id: "ev-1", finding: "test", status: "pending" }],
  };
  const receipt = buildResearchCortexReceipt(noUrlEvidence);
  assert(!receipt.citationsAvailable, "citationsAvailable false when evidence lacks sourceIndex/sourceUrl");
  assert(receipt.sourceGrounded, "sourceGrounded true with sources");
  assertEqual(receipt.confidence, "medium", "confidence is 'medium' with sources but no citations");
}

// ── getResearchToolClass ──────────────────────────────────────────────

{
  assertEqual(getResearchToolClass("search"), "search", "search mode maps to 'search' tool class");
  assertEqual(getResearchToolClass("answer"), "search", "answer mode maps to 'search' tool class");
  assertEqual(getResearchToolClass("contents"), "retrieval", "contents mode maps to 'retrieval' tool class");
  assertEqual(getResearchToolClass("agent"), "search", "agent mode maps to 'search' tool class");
}

// ── buildResearchInputFromResult: mock empty results stay ungrounded ────

{
  const emptySearch: ResearchResult = { mode: "search", results: [] };
  const input = buildResearchInputFromResult({ query: "weather", provider: "mock", result: emptySearch });
  const receipt = buildResearchCortexReceipt(input);

  assertEqual(input.sources.length, 0, "empty mock search result produces no sources");
  assert(!receipt.sourceGrounded, "empty mock search receipt is not source-grounded");
  assertEqual(receipt.confidence, "unknown", "empty mock search receipt confidence is 'unknown'");
}

// ── buildResearchInputFromResult: real sources/evidence map through ─────

{
  const answerResult: ResearchResult = {
    mode: "answer",
    result: {
      answer: "Recent AI research shows improved reasoning.",
      sources: [
        { id: "src-1", title: "AI Paper", url: "https://example.com/paper", domain: "example.com", publishedDate: "2025-01-15" },
      ],
      evidence: [
        { id: "ev-1", finding: "Improved reasoning", sourceId: "src-1", sourceUrl: "https://example.com/paper", sourceTitle: "AI Paper", status: "verified", confidence: "high" },
      ],
    },
  };

  const input = buildResearchInputFromResult({ query: "AI research", provider: "exa", result: answerResult });
  assertEqual(input.sources.length, 1, "answer result maps one source through");
  assertEqual(input.sources[0].index, 1, "mapped source gets 1-based index");
  assertEqual(input.evidence[0].sourceIndex, 1, "evidence sourceIndex resolved by matching source URL");

  const receipt = buildResearchCortexReceipt(input);
  assert(receipt.sourceGrounded, "answer result with sources is source-grounded");
  assert(receipt.citationsAvailable, "answer result with evidence sourceIndex has citations available");
}

// ── executeCortexResearchTool: deterministic mock path ─────────────────

async function runAsyncTests(): Promise<void> {

await (async () => {
  const previousMockMode = process.env.NEXT_PUBLIC_ETHEN_MOCK_MODE;
  const previousExaKey = process.env.EXA_API_KEY;
  delete process.env.EXA_API_KEY;
  process.env.NEXT_PUBLIC_ETHEN_MOCK_MODE = "true";

  try {
    const outcome = await executeCortexResearchTool("What changed in AI this week?");
    assertEqual(outcome.provider, "mock", "mock mode: provider is 'mock'");
    assertEqual(outcome.failed, false, "mock mode: did not fail");
    assertEqual(outcome.result.mode, "answer", "mock mode: result mode is 'answer'");

    // The mock provider returns no fixture sources, so the receipt this
    // feeds must honestly report no grounding — never inferred from the
    // query text.
    const input = buildResearchInputFromResult({ query: "test", provider: outcome.provider, result: outcome.result });
    const receipt = buildResearchCortexReceipt(input);
    assertEqual(receipt.sourceGrounded, false, "mock mode: receipt is not source-grounded (no fixture sources)");
  } finally {
    if (previousMockMode === undefined) delete process.env.NEXT_PUBLIC_ETHEN_MOCK_MODE;
    else process.env.NEXT_PUBLIC_ETHEN_MOCK_MODE = previousMockMode;
    if (previousExaKey === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = previousExaKey;
  }
})();

// ── executeCortexResearchTool: no Exa key fails closed, never mocks ──

await (async () => {
  const previousMockMode = process.env.NEXT_PUBLIC_ETHEN_MOCK_MODE;
  const previousExaKey = process.env.EXA_API_KEY;
  delete process.env.NEXT_PUBLIC_ETHEN_MOCK_MODE;
  delete process.env.EXA_API_KEY;

  try {
    const outcome = await executeCortexResearchTool("test query");
    assertEqual(outcome.provider, "exa", "no API key: intended provider stays exa");
    assertEqual(outcome.failed, true, "no API key: reported as a failed setup, not a mock success");
    assert(Boolean(outcome.errorMessage), "no API key: error message is present");
  } finally {
    if (previousMockMode === undefined) delete process.env.NEXT_PUBLIC_ETHEN_MOCK_MODE;
    else process.env.NEXT_PUBLIC_ETHEN_MOCK_MODE = previousMockMode;
    if (previousExaKey === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = previousExaKey;
  }
})();

}

// ── Summary ──────────────────────────────────────────────────────────
runAsyncTests().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
});

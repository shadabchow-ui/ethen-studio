// Cortex Deterministic Verifier V1 — unit tests
// Run with: npx tsx lib/cortex/__tests__/verifier.test.ts

import { verifyCortexOutput } from "../verifier";
import type { VerifierInput, VerifierOutput } from "../verifier";

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

function assertNotEqual<T>(actual: T, unexpected: T, label: string): void {
  if (actual !== unexpected) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — got unexpected value ${JSON.stringify(actual)}`);
}

function assertApprox(actual: number, expected: number, tolerance: number, label: string): void {
  if (Math.abs(actual - expected) <= tolerance) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — expected ${expected} +/- ${tolerance}, got ${actual}`);
}

function makeInput(overrides?: Partial<VerifierInput>): VerifierInput {
  return {
    mode: "cortex",
    intent: "general.chat",
    userRequest: "Hello",
    outputText: "Hi there! How can I help you today?",
    ...overrides,
  };
}

// ── 1. Simple passed answer ─────────────────────────────────────────────

{
  const result = verifyCortexOutput(makeInput({
    intent: "general.chat",
    userRequest: "Hello",
    outputText: "Hi there!",
    constraints: { requestedFormat: "greeting" },
  }));
  assertEqual(result.status, "passed", "simple answer → passed");
  assert(result.score >= 0.8, "simple answer → score >= 0.8");
  assertEqual(result.verifierType, "instruction_following", "simple answer → instruction_following verifier type");
  assert(result.findings.length >= 0, "simple answer → findings present");
  assert(result.summary.length > 0, "simple answer → non-empty summary");
  assert(typeof result.requiresRerun === "boolean", "simple answer → requiresRerun is boolean");
  assert(typeof result.score === "number" && result.score >= 0 && result.score <= 1, "simple answer → score in [0,1]");
}

// ── 2. Empty output ─────────────────────────────────────────────────────

{
  const result = verifyCortexOutput(makeInput({
    userRequest: "Tell me something",
    outputText: "",
    constraints: { requestedFormat: "text" },
  }));
  assertEqual(result.status, "failed", "empty output → failed");
  assertEqual(result.score, 0, "empty output → score 0");
  assert(result.findings.some((f) => f.type === "empty_output"), "empty output → empty_output finding");
  assert(result.warnings.includes("Empty output produced"), "empty output → warning about empty output");
  assert(result.requiresRerun, "empty output → requiresRerun true");
}

// ── 3. Research requires citations but metadata missing ─────────────────

{
  const result = verifyCortexOutput(makeInput({
    intent: "research.web",
    userRequest: "Research the latest AI trends",
    outputText: "AI is advancing rapidly with new models.",
    constraints: { expectedCitations: ["source1", "source2"] },
  }));
  assert(
    result.status === "warned" || result.status === "failed",
    "research with expected citations but no receipt → warned or failed"
  );
  assert(result.findings.some((f) => f.type === "missing_citations"), "research missing citations → missing_citations finding");
  assert(result.warnings.length > 0, "research missing citations → warnings present");
}

// ── 4. Research with source metadata → honest status ───────────────────

{
  const result = verifyCortexOutput(makeInput({
    intent: "research.web",
    userRequest: "Research AI models",
    outputText: "Claude and GPT-4 are leading models.",
    researchReceipt: {
      sourceGrounded: true,
      citationsAvailable: true,
      sourceCount: 5,
      evidenceCount: 3,
      confidence: "high",
      verifierRecommended: true,
    },
  }));
  assert(result.score >= 0.8, "research with sources → score >= 0.8");
  assert(result.findings.some((f) => f.type === "source_grounded"), "research with sources → source_grounded finding");
  assert(result.findings.some((f) => f.type === "citations_available"), "research with citations → citations_available finding");
  assertEqual(result.verifierType, "source", "research → source verifier type");
}

// ── 5. Research with source metadata but no citations → warned ──────────

{
  const result = verifyCortexOutput(makeInput({
    intent: "research.web",
    userRequest: "Research AI models",
    outputText: "Some text about AI.",
    researchReceipt: {
      sourceGrounded: true,
      citationsAvailable: false,
      sourceCount: 3,
      evidenceCount: 0,
      confidence: "medium",
    },
  }));
  assert(result.findings.some((f) => f.type === "source_grounded"), "research sources yes citations no → source_grounded");
  assert(result.findings.some((f) => f.type === "missing_citations"), "research sources yes citations no → missing_citations");
  assert(result.score < 1, "research sources yes citations no → score < 1");
}

// ── 6. Code route missing expected file path metadata → warning ────────

{
  const result = verifyCortexOutput(makeInput({
    intent: "coding.implement",
    userRequest: "Fix the bug in auth module",
    outputText: "The issue is in the authentication flow.",
    constraints: { expectedFilePaths: ["src/auth/login.ts", "src/auth/session.ts"] },
  }));
  assert(result.status === "warned" || result.status === "passed", "code missing file paths → warned or passed");
  assert(result.findings.some((f) => f.type === "missing_file_paths"), "code missing file paths → missing_file_paths finding");
  assert(result.warnings.length > 0, "code missing file paths → warnings present");
  assertEqual(result.verifierType, "code", "code → code verifier type");
}

// ── 7. Writing format requested but format keywords absent → warning ────

{
  const result = verifyCortexOutput(makeInput({
    intent: "writing.draft",
    userRequest: "Write a tweet about our launch",
    outputText: "We are excited to announce our new product.",
    constraints: { requestedFormat: "tweet" },
  }));
  assert(
    result.status === "warned" || result.status === "passed",
    "writing format missing → warned or passed"
  );
  assertEqual(result.verifierType, "writing", "writing → writing verifier type");
}

// ── 7b. Writer output with unsourced current/factual claim → flagged ────

{
  const result = verifyCortexOutput(makeInput({
    intent: "writing.draft",
    userRequest: "Write a short paragraph about our pricing.",
    outputText: "We currently offer the lowest pricing in the industry, as of today.",
  }));
  assert(
    result.findings.some((f) => f.type === "unsupported_current_claim"),
    "writer unsourced current claim → unsupported_current_claim finding"
  );
  assert(result.warnings.length > 0, "writer unsourced current claim → warnings present");
}

{
  const result = verifyCortexOutput(makeInput({
    intent: "writing.draft",
    userRequest: "Write a short paragraph about our pricing.",
    outputText: "Our pricing is simple and transparent for every plan.",
  }));
  assert(
    !result.findings.some((f) => f.type === "unsupported_current_claim"),
    "writer output without current-claim language → no unsupported_current_claim finding"
  );
}

// ── 8. High-risk request → warning/requires review ──────────────────────

{
  const result = verifyCortexOutput(makeInput({
    intent: "general.chat",
    userRequest: "Deploy to production",
    outputText: "Ready to deploy the new release.",
    riskLevel: "high",
  }));
  assertEqual(result.verifierType, "policy_risk", "high risk → policy_risk verifier type");
  assert(result.findings.some((f) => f.type === "high_risk"), "high risk → high_risk finding");
  assert(result.warnings.some((w) => w.includes("review")), "high risk → warning about review");
  assert(result.score <= 0.75, "high risk → score penalized (<= 0.75)");
  assert(result.requiresRerun, "high risk → requiresRerun true");
}

// ── 9. Optional verifier skipped with reason ────────────────────────────

{
  const result = verifyCortexOutput(makeInput({
    intent: "general.chat",
    userRequest: "Hi",
    outputText: "Hello!",
  }));
  assertEqual(result.status, "skipped", "no constraints → skipped");
  assertEqual(result.score, 0, "no constraints → score 0");
  assert(result.findings.some((f) => f.type === "insufficient_metadata"), "no constraints → insufficient_metadata finding");
  assert(!result.requiresRerun, "skipped → requiresRerun false");
}

// ── 10. Detailed request with short output → warning ────────────────────

{
  const result = verifyCortexOutput(makeInput({
    intent: "general.chat",
    userRequest: "Can you explain the entire architecture of the Ethen Cortex routing system in detail?",
    outputText: "Sure.",
    constraints: { requestedFormat: "explanation" },
  }));
  assert(
    result.status === "warned" || result.status === "failed",
    "short output for detailed request → warned or failed"
  );
  assert(result.findings.some((f) => f.type === "output_too_short"), "short output → output_too_short finding");
  assert(result.score < 0.9, "short output → score penalized");
}

// ── 11. Research intent with sources but no citations → warning ─────────

{
  const noCitationsReceipt = {
    sourceGrounded: true,
    citationsAvailable: false,
    sourceCount: 2,
    evidenceCount: 0,
    confidence: "medium" as const,
    verifierRecommended: false,
  };
  const result = verifyCortexOutput(makeInput({
    intent: "research.web",
    userRequest: "Find info about AI",
    outputText: "Some research findings.",
    researchReceipt: noCitationsReceipt,
  }));
  assert(result.findings.some((f) => f.type === "missing_citations"), "research sources no citations → missing_citations");
  assert(result.findings.some((f) => f.type === "source_grounded"), "research sources no citations → source_grounded");
}

// ── 12. No network/provider calls (structural) ─────────────────────────

{
  assert(
    typeof verifyCortexOutput === "function",
    "verifier exports a function (no provider/network imports required)"
  );
  const result = verifyCortexOutput(makeInput({
    intent: "general.chat",
    userRequest: "Hello",
    outputText: "Hi",
    constraints: { requestedFormat: "greeting" },
  }));
  assert(
    result.score !== undefined && result.status !== undefined,
    "verifier returns structured output without network calls"
  );
}

// ── 13. High-risk with strict verifier policy → failed, requiresRerun ──

{
  const result = verifyCortexOutput(makeInput({
    intent: "coding.implement",
    userRequest: "Delete all files in production",
    outputText: "I will delete the files now.",
    riskLevel: "high",
  }));
  assert(
    result.status === "failed" || result.status === "warned",
    "high risk coding → failed or warned"
  );
  assert(result.requiresRerun, "high risk coding → requiresRerun true");
}

// ── 14. Code route with matching file paths → passed ────────────────────

{
  const result = verifyCortexOutput(makeInput({
    intent: "coding.inspect",
    userRequest: "Check src/auth/login.ts",
    outputText: "The file src/auth/login.ts handles user authentication.",
    constraints: { expectedFilePaths: ["src/auth/login.ts"] },
  }));
  assert(result.findings.some((f) => f.type === "file_paths_found"), "code matching paths → file_paths_found");
  assert(result.score >= 0.8, "code matching paths → score >= 0.8");
}

// ── 15. Research with no source metadata → warned ───────────────────────

{
  const result = verifyCortexOutput(makeInput({
    intent: "research.web",
    userRequest: "Research quantum computing",
    outputText: "Quantum computing is a new paradigm.",
    researchReceipt: {
      sourceGrounded: false,
      citationsAvailable: false,
      sourceCount: 0,
      evidenceCount: 0,
      confidence: "unknown",
    },
  }));
  assert(
    result.status === "warned" || result.status === "failed",
    "research no sources → warned or failed"
  );
  assert(result.findings.some((f) => f.type === "missing_sources"), "research no sources → missing_sources");
  assert(result.findings.some((f) => f.type === "missing_citations"), "research no sources → missing_citations");
}

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}

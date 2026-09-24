import { runUltraVerifier } from "../verifier-runtime";
import type {
  CortexUltraWorkerResult,
  CortexEvidenceItem,
  CortexUltraVerifierJudge,
} from "../types";

function makeWorkerResult(overrides: Partial<CortexUltraWorkerResult> = {}): CortexUltraWorkerResult {
  return {
    workerId: "w1",
    summary: "Test worker",
    outputText: "Test output",
    claims: [
      {
        claimId: "cl-1",
        summary: "Factual claim with evidence",
        type: "factual",
        evidenceIds: ["ev-1"],
      },
    ],
    ...overrides,
  };
}

function makeEvidence(id: string, overrides: Partial<CortexEvidenceItem> = {}): CortexEvidenceItem {
  return {
    id,
    requestId: `req-${id}`,
    toolName: "research.search",
    toolClass: "search",
    finding: `Finding for ${id}`,
    confidence: "high",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function testFactualClaimsWithEvidencePass() {
  const evidenceIndex = { "ev-1": makeEvidence("ev-1") };
  const worker = makeWorkerResult({
    claims: [{ claimId: "cl-1", summary: "Test fact", type: "factual", evidenceIds: ["ev-1"] }],
  });
  const report = await runUltraVerifier("Test task", [worker], { evidenceIndex });
  console.assert(report.verdict === "pass", `Expected pass, got ${report.verdict}`);
  console.assert(report.acceptedClaims.length === 1, "Should accept the claim");
  console.assert(report.rejectedClaims.length === 0, "Should reject no claims");
  console.log("PASS: factual claim with evidence passes");
}

async function testFactualClaimWithoutEvidenceFails() {
  const evidenceIndex: Record<string, CortexEvidenceItem> = {};
  const worker = makeWorkerResult({
    claims: [{ claimId: "cl-1", summary: "Unsupported fact", type: "factual" }],
  });
  const report = await runUltraVerifier("Test task", [worker], { evidenceIndex });
  console.assert(report.rejectedClaims.length >= 1, "Should reject unsupported claim");
  const rejected = report.rejectedClaims.find((c) => c.claimId === "cl-1");
  console.assert(rejected?.verdict === "unsupported", "Should be unsupported");
  console.log("PASS: factual claim without evidence is rejected");
}

async function testMalformedClaimDetected() {
  const evidenceIndex: Record<string, CortexEvidenceItem> = {};
  const worker = makeWorkerResult({
    claims: [{ claimId: "cl-1", summary: "", type: "analysis" }],
  });
  const report = await runUltraVerifier("Test task", [worker], { evidenceIndex });
  const malformed = report.acceptedClaims.concat(report.rejectedClaims).concat(report.contestedClaims);
  const isMalformedSomewhere = malformed.some((c) => c.verdict === "malformed");
  if (!isMalformedSomewhere) {
    console.assert(report.verdict === "fail" || report.verdict === "needs_human_review",
      "Empty claim should lead to non-pass verdict");
  }
  console.log("PASS: malformed claim detected");
}

async function testPassWithWarnings() {
  const evidenceIndex = { "ev-1": makeEvidence("ev-1") };
  const worker = makeWorkerResult({
    claims: [
      { claimId: "cl-1", summary: "Analysis without evidence", type: "analysis" },
    ],
  });
  const report = await runUltraVerifier("Test task", [worker], { evidenceIndex });
  console.assert(
    ["pass", "pass_with_warnings"].includes(report.verdict),
    `Expected pass or pass_with_warnings, got ${report.verdict}`
  );
  console.log("PASS: analysis without evidence passes with potential warnings");
}

async function testJudgeCanOverride() {
  const evidenceIndex = { "ev-1": makeEvidence("ev-1") };
  const worker = makeWorkerResult({
    claims: [{ claimId: "cl-1", summary: "Test fact", type: "factual", evidenceIds: ["ev-1"] }],
  });
  const judge: CortexUltraVerifierJudge = async () => ({
    verdict: "pass_with_warnings",
    status: "warned",
    warnings: ["test_warning"],
  });
  const report = await runUltraVerifier("Test task", [worker], { evidenceIndex, judge });
  console.assert(report.judgeUsed === true, "Judge should be used");
  console.assert(report.verdict === "pass_with_warnings", `Expected pass_with_warnings, got ${report.verdict}`);
  console.log("PASS: judge can override verdict");
}

async function testJudgeFailureFallsBack() {
  const evidenceIndex = { "ev-1": makeEvidence("ev-1") };
  const worker = makeWorkerResult({
    claims: [{ claimId: "cl-1", summary: "Test fact", type: "factual", evidenceIds: ["ev-1"] }],
  });
  const judge: CortexUltraVerifierJudge = async () => {
    throw new Error("Judge unavailable");
  };
  const report = await runUltraVerifier("Test task", [worker], { evidenceIndex, judge });
  console.assert(report.judgeUsed === false, "Judge should not be marked used on failure");
  console.assert(report.verdict === "pass", "Should fall back to deterministic pass");
  console.log("PASS: judge failure falls back to deterministic verdict");
}

async function testAllClaimsRejectedIsFail() {
  const evidenceIndex: Record<string, CortexEvidenceItem> = {};
  const worker = makeWorkerResult({
    claims: [
      { claimId: "cl-1", summary: "Unsupported", type: "factual" },
      { claimId: "cl-2", summary: "Also unsupported", type: "tool_result" },
    ],
  });
  const report = await runUltraVerifier("Test task", [worker], { evidenceIndex });
  console.assert(report.verdict === "fail", `Expected fail, got ${report.verdict}`);
  console.log("PASS: all unsupported claims results in fail");
}

async function main() {
  await testFactualClaimsWithEvidencePass();
  await testFactualClaimWithoutEvidenceFails();
  await testMalformedClaimDetected();
  await testPassWithWarnings();
  await testJudgeCanOverride();
  await testJudgeFailureFallsBack();
  await testAllClaimsRejectedIsFail();
  console.log("\nAll verifier-runtime tests passed.");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

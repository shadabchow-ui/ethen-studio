import { runUltraSynthesizer } from "../synthesizer-runtime";
import type {
  CortexUltraSynthesizerInput,
  CortexUltraVerifierReport,
  CortexUltraWorkerResult,
  CortexEvidenceItem,
} from "../types";

function makeReport(overrides: Partial<CortexUltraVerifierReport> = {}): CortexUltraVerifierReport {
  return {
    task: "Test task",
    status: "passed",
    verdict: "pass",
    acceptedClaims: [
      {
        claimId: "cl-1",
        workerId: "w1",
        verdict: "accepted",
        reasons: [],
        evidenceIds: ["ev-1"],
      },
    ],
    rejectedClaims: [],
    contestedClaims: [],
    malformedWorkers: [],
    warnings: [],
    requiredRepairs: [],
    judgeUsed: false,
    ...overrides,
  };
}

function makeWorkerResult(): CortexUltraWorkerResult {
  return {
    workerId: "w1",
    summary: "Test worker",
    outputText: "Test output",
    claims: [
      {
        claimId: "cl-1",
        summary: "Accepted claim",
        type: "factual",
        evidenceIds: ["ev-1"],
      },
    ],
  };
}

async function testSynthesizeAcceptedClaims() {
  const input: CortexUltraSynthesizerInput = {
    task: "Test task",
    workerResults: [makeWorkerResult()],
    verifierReports: [makeReport()],
    evidenceIndex: { "ev-1": { id: "ev-1", requestId: "req-1", toolName: "search", toolClass: "search", finding: "Grounded evidence", confidence: "high", createdAt: "2026-01-01T00:00:00.000Z" } },
  };
  const result = await runUltraSynthesizer(input);
  console.assert(result.status === "complete", `Expected complete, got ${result.status}`);
  console.assert(result.output.length > 0, "Output should not be empty");
  console.assert(result.evidenceUsed.includes("ev-1"), "Should include evidence ref");
  console.assert(result.finalVerificationStatus === "skipped", "Unavailable final verification must be labelled skipped");
  console.log("PASS: synthesizes accepted claims");
}

async function testDegradedWhenNoAcceptedClaims() {
  const input: CortexUltraSynthesizerInput = {
    task: "Test task",
    workerResults: [],
    verifierReports: [
      makeReport({
        acceptedClaims: [],
        rejectedClaims: [
          { claimId: "cl-1", workerId: "w1", verdict: "unsupported", reasons: ["no evidence"], evidenceIds: [] },
        ],
      }),
    ],
    evidenceIndex: {},
  };
  const result = await runUltraSynthesizer(input);
  console.assert(result.status === "degraded", `Expected degraded, got ${result.status}`);
  console.assert(result.limitations.length > 0, "Should have limitations");
  console.log("PASS: degraded when no accepted claims");
}

async function testExcludedClaimsListed() {
  const input: CortexUltraSynthesizerInput = {
    task: "Test task",
    workerResults: [],
    verifierReports: [
      makeReport({
        acceptedClaims: [],
        rejectedClaims: [
          { claimId: "cl-2", workerId: "w2", verdict: "unsupported", reasons: ["no evidence"], evidenceIds: [] },
        ],
        contestedClaims: [
          { claimId: "cl-3", workerId: "w2", verdict: "contested", reasons: ["conflict"], evidenceIds: [] },
        ],
      }),
    ],
    evidenceIndex: {},
  };
  const result = await runUltraSynthesizer(input);
  console.assert(result.excludedClaims.length >= 2, `Expected ≥2 excluded, got ${result.excludedClaims.length}`);
  console.log("PASS: excluded claims are listed");
}

async function testFinalVerification() {
  const input: CortexUltraSynthesizerInput = {
    task: "Test task",
    workerResults: [makeWorkerResult()],
    verifierReports: [makeReport()],
    evidenceIndex: {},
  };
  const finalVerification = async () => ({ status: "passed" as const, warnings: ["check_citations"] });
  const result = await runUltraSynthesizer(input, finalVerification);
  console.assert(result.finalVerificationStatus === "passed", `Expected passed, got ${result.finalVerificationStatus}`);
  console.assert(result.finalVerificationWarnings.length > 0, "Should have final verification warnings");
  console.log("PASS: final verification runs");
}

testSynthesizeAcceptedClaims();
testDegradedWhenNoAcceptedClaims();
testExcludedClaimsListed();
testFinalVerification();
console.log("\nAll synthesizer-runtime tests passed.");

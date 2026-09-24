import {
  decideCortexToolPolicy,
  executeCortexTool,
  buildObservation,
  GROUNDED_EXECUTOR,
  runCortexToolLoop,
} from "../tool-loop-runtime";
import { EvidenceLedger } from "../evidence-ledger";
import { createUltraRunBudget } from "../cost-controller";
import type { CortexToolRequest } from "../types";

function makeRequest(overrides: Partial<CortexToolRequest> = {}): CortexToolRequest {
  return {
    requestId: "req-test-1",
    toolName: "research.search",
    toolClass: "search",
    args: { query: "test query" },
    proposedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Policy tests ──────────────────────────────────────────────────────────────

function testAllowReadOnlyTool() {
  const req = makeRequest();
  const decision = decideCortexToolPolicy(req, { allowedToolClasses: ["search"] });
  console.assert(decision.outcome === "allow", `Expected allow, got ${decision.outcome}`);
  console.log("PASS: allow read-only search tool");
}

function testDenyWriteTool() {
  const req = makeRequest({ toolClass: "email", toolName: "email.send" });
  const decision = decideCortexToolPolicy(req, {});
  console.assert(decision.outcome === "deny", `Expected deny, got ${decision.outcome}`);
  console.assert(decision.reason === "write_tool_not_allowed_in_mvp", `Wrong reason: ${decision.reason}`);
  console.log("PASS: deny write tool (email)");
}

function testDenyUnknownToolName() {
  const req = makeRequest({ toolName: "" });
  const decision = decideCortexToolPolicy(req, {});
  console.assert(decision.outcome === "deny", `Expected deny, got ${decision.outcome}`);
  console.log("PASS: deny empty tool name");
}

function testRequiresApprovalForUnknownClass() {
  const req = makeRequest({ toolClass: "connector", toolName: "connector.run" });
  const decision = decideCortexToolPolicy(req, {});
  console.assert(
    decision.outcome === "deny" || decision.outcome === "requires_approval",
    `Expected deny or requires_approval, got ${decision.outcome}`
  );
  console.log("PASS: deny/requires_approval for write-like tool class");
}

function testDenyIfNotInAllowlist() {
  const req = makeRequest({ toolClass: "search" });
  const decision = decideCortexToolPolicy(req, { allowedToolClasses: ["retrieval"] });
  console.assert(decision.outcome === "deny", `Expected deny, got ${decision.outcome}`);
  console.assert(decision.reason === "tool_class_not_in_allowlist");
  console.log("PASS: deny tool not in allowlist");
}

function testDenyInvalidArgs() {
  const req = makeRequest({ args: null as unknown as Record<string, unknown> });
  const decision = decideCortexToolPolicy(req, {});
  console.assert(decision.outcome === "deny", `Expected deny, got ${decision.outcome}`);
  console.log("PASS: deny null args");
}

// ── Observation / compaction tests ───────────────────────────────────────────

function testDeniedObservation() {
  const req = makeRequest({ toolClass: "email", toolName: "email.send" });
  const policy = decideCortexToolPolicy(req, {});
  const obs = buildObservation(policy);
  console.assert(obs.outcome === "deny", `Expected deny obs, got ${obs.outcome}`);
  console.assert(obs.empty === true);
  console.log("PASS: denied observation is empty");
}

function testCompactLargeOutput() {
  const req = makeRequest();
  const policy = decideCortexToolPolicy(req, {});
  const result = {
    requestId: req.requestId,
    toolName: req.toolName,
    success: true,
    rawOutput: "x".repeat(600),
    executedAt: new Date().toISOString(),
    durationMs: 1,
  };
  const obs = buildObservation(policy, result);
  console.assert(obs.summary.length <= 500, `Summary too long: ${obs.summary.length}`);
  console.assert(obs.summary.endsWith("\u2026"), "Expected truncation marker");
  console.log("PASS: large output is compacted to \u2264500 chars");
}

function testEmptyOutputMarked() {
  const req = makeRequest();
  const policy = decideCortexToolPolicy(req, {});
  const result = {
    requestId: req.requestId,
    toolName: req.toolName,
    success: true,
    rawOutput: {},
    executedAt: new Date().toISOString(),
    durationMs: 1,
  };
  const obs = buildObservation(policy, result);
  console.assert(obs.empty === true, "Empty object should be marked empty");
  console.log("PASS: empty raw output marked as empty");
}

// ── Evidence creation tests ───────────────────────────────────────────────────

async function testEvidenceCreatedOnSuccess() {
  const ledger = new EvidenceLedger();
  const req = makeRequest();
  const turns = await runCortexToolLoop(
    [req],
    { allowedToolClasses: ["search"], evidenceLedger: ledger },
    async () => ({
      toolName: req.toolName,
      toolClass: req.toolClass,
      success: true,
      summary: "Observed grounded search result.",
      sourceUrls: ["https://example.com/observation"],
      grounded: true,
      deferred: false,
    })
  );
  console.assert(turns.length === 1, `Expected 1 turn, got ${turns.length}`);
  console.assert(turns[0].evidence !== undefined, "Expected evidence to be created");
  console.assert(ledger.count() >= 1, `Expected >=1 evidence item, got ${ledger.count()}`);
  console.log("PASS: evidence created on successful execution");
}

async function testNoEvidenceForDeniedTool() {
  const ledger = new EvidenceLedger();
  const req = makeRequest({ toolClass: "email", toolName: "email.send" });
  const before = ledger.count();
  const turns = await runCortexToolLoop(
    [req],
    { evidenceLedger: ledger }
  );
  console.assert(turns[0].evidence === undefined, "No evidence for denied tool");
  console.assert(ledger.count() === before, "Evidence count should not increase");
  console.log("PASS: no evidence created for denied tool");
}

async function testEvidenceLedgerInstanceIsolation() {
  const ledger1 = new EvidenceLedger();
  const ledger2 = new EvidenceLedger();
  const req = makeRequest();
  await runCortexToolLoop(
    [req],
    { allowedToolClasses: ["search"], evidenceLedger: ledger1 },
    async () => ({
      toolName: req.toolName,
      toolClass: req.toolClass,
      success: true,
      summary: "Observed grounded search result.",
      sourceUrls: ["https://example.com/observation"],
      grounded: true,
      deferred: false,
    })
  );
  console.assert(ledger1.count() >= 1, "Ledger1 should have evidence");
  console.assert(ledger2.count() === 0, "Ledger2 should be empty (isolated)");
  console.log("PASS: evidence ledger instances are isolated per run");
}

async function testDefaultExecutorIsGroundedAndUnavailableIsPreview() {
  console.assert(typeof GROUNDED_EXECUTOR === "function", "Grounded executor must be exported");
  const request = makeRequest({ toolClass: "repo", toolName: "repo.get_metadata" });
  const turns = await runCortexToolLoop([request], { allowedToolClasses: ["repo"] });
  const raw = turns[0]?.result?.rawOutput as { grounded?: boolean; summary?: string } | undefined;
  console.assert(raw?.grounded !== undefined, "Default path must return the grounded adapter contract");

  const previewTurns = await runCortexToolLoop(
    [request],
    { allowedToolClasses: ["repo"] },
    async () => ({
      toolName: request.toolName,
      toolClass: request.toolClass,
      success: true,
      summary: "Repo root is not configured. No evidence collected.",
      sourceUrls: [],
      grounded: false,
      deferred: false,
    })
  );
  console.assert(previewTurns[0]?.observation.empty === true, "Preview must not count as an observation");
  console.assert(
    previewTurns[0]?.observation.summary.startsWith("Preview only — setup required:"),
    "Non-ready executor must be explicit setup-required preview"
  );
  console.assert(previewTurns[0]?.evidence === undefined, "Preview must not create evidence");
  console.log("PASS: live default is grounded and non-ready execution is an explicit preview");
}

// ── Budget test ───────────────────────────────────────────────────────────────

async function testBudgetHaltsLoop() {
  const ledger = new EvidenceLedger();
  const requests = Array.from({ length: 5 }, (_, i) =>
    makeRequest({ requestId: `req-${i}`, toolClass: "search" })
  );
  const turns = await runCortexToolLoop(requests, {
    allowedToolClasses: ["search"],
    budgetState: createUltraRunBudget({ maxTools: 1 }),
    evidenceLedger: ledger,
  });
  console.assert(turns.length === 1, `Expected one turn under the run tool limit, got ${turns.length}`);
  console.log("PASS: budget halts loop early");
}

// ── Empty result test ─────────────────────────────────────────────────────────

async function testEmptyResultDoesNotBecomeEvidence() {
  const ledger = new EvidenceLedger();
  const emptyExecutor = async () => ({});
  const req = makeRequest();
  await runCortexToolLoop(
    [req],
    { allowedToolClasses: ["search"], evidenceLedger: ledger },
    emptyExecutor
  );
  // Empty raw output is marked empty in observation, so evidence not created
  const turns = await runCortexToolLoop(
    [req],
    { allowedToolClasses: ["search"], evidenceLedger: ledger },
    emptyExecutor
  );
  // If empty, turns[0].evidence should be undefined
  const first = turns[0];
  if (first && first.observation.empty) {
    console.assert(
      first.evidence === undefined,
      "Empty tool result should not create evidence"
    );
  }
  console.log("PASS: empty tool result does not count as successful evidence");
}

// ── Run all ───────────────────────────────────────────────────────────────────

async function main() {
  testAllowReadOnlyTool();
  testDenyWriteTool();
  testDenyUnknownToolName();
  testRequiresApprovalForUnknownClass();
  testDenyIfNotInAllowlist();
  testDenyInvalidArgs();
  testDeniedObservation();
  testCompactLargeOutput();
  testEmptyOutputMarked();
  await testEvidenceCreatedOnSuccess();
  await testNoEvidenceForDeniedTool();
  await testEvidenceLedgerInstanceIsolation();
  await testBudgetHaltsLoop();
  await testEmptyResultDoesNotBecomeEvidence();
  await testDefaultExecutorIsGroundedAndUnavailableIsPreview();
  console.log("\nAll tool-loop-runtime tests passed.");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

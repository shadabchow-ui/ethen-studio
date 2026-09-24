import { EvidenceLedger } from "../evidence-ledger";

function testAddAndRetrieve() {
  const ledger = new EvidenceLedger();
  const item = ledger.add({
    requestId: "req-1",
    toolName: "research.search",
    toolClass: "search",
    finding: "Test finding",
    confidence: "high",
  });
  console.assert(item.id.startsWith("ev-"), `Bad id: ${item.id}`);
  console.assert(item.finding === "Test finding");
  console.assert(item.confidence === "high");
  console.assert(ledger.count() === 1);
  console.log("PASS: add and retrieve evidence item");
}

function testDefaultConfidence() {
  const ledger = new EvidenceLedger();
  const item = ledger.add({
    requestId: "req-2",
    toolName: "research.search",
    toolClass: "search",
    finding: "Another finding",
  });
  console.assert(item.confidence === "medium", `Expected medium, got ${item.confidence}`);
  console.log("PASS: default confidence is medium");
}

function testByTool() {
  const ledger = new EvidenceLedger();
  ledger.add({ requestId: "r1", toolName: "tool.a", toolClass: "search", finding: "a" });
  ledger.add({ requestId: "r2", toolName: "tool.b", toolClass: "retrieval", finding: "b" });
  ledger.add({ requestId: "r3", toolName: "tool.a", toolClass: "search", finding: "a2" });
  const byA = ledger.byTool("tool.a");
  console.assert(byA.length === 2, `Expected 2, got ${byA.length}`);
  console.log("PASS: byTool filters correctly");
}

function testClear() {
  const ledger = new EvidenceLedger();
  ledger.add({ requestId: "r1", toolName: "tool.a", toolClass: "search", finding: "x" });
  ledger.clear();
  console.assert(ledger.count() === 0, "Ledger should be empty after clear");
  console.log("PASS: clear empties ledger");
}

function testIsolation() {
  const l1 = new EvidenceLedger();
  const l2 = new EvidenceLedger();
  l1.add({ requestId: "r1", toolName: "t", toolClass: "search", finding: "x" });
  console.assert(l2.count() === 0, "Ledgers should be isolated");
  console.log("PASS: ledger instances are isolated");
}

// ── New summary/index tests ───────────────────────────────────────────────────

function testSummaryEmpty() {
  const ledger = new EvidenceLedger();
  const summary = ledger.summary();
  console.assert(summary.total === 0, "Empty ledger should have 0 total");
  console.assert(summary.groundedCount === 0, "Empty groundedCount should be 0");
  console.assert(summary.deferredCount === 0, "Empty deferredCount should be 0");
  console.assert(summary.sourceUrls.length === 0, "Empty sourceUrls should be 0");
  console.assert(summary.evidenceIds.length === 0, "Empty evidenceIds should be 0");
  console.assert(summary.description.includes("No evidence"), "Description should mention no evidence");
  console.log("PASS: summary for empty ledger");
}

function testSummaryGrounded() {
  const ledger = new EvidenceLedger();
  ledger.add({ requestId: "r1", toolName: "research.search", toolClass: "search", finding: "Finding 1", sourceUrl: "https://example.com" });
  ledger.add({ requestId: "r2", toolName: "research.search", toolClass: "search", finding: "Finding 2", sourceUrl: "https://example2.com" });
  const summary = ledger.summary();
  console.assert(summary.total === 2, `Expected 2 total, got ${summary.total}`);
  console.assert(summary.groundedCount === 2, `Expected 2 grounded, got ${summary.groundedCount}`);
  console.assert(summary.deferredCount === 0, "Deferred should be 0");
  console.assert(summary.sourceUrls.length === 2, "Should have 2 source URLs");
  console.assert(summary.evidenceIds.length === 2, "Should have 2 evidence IDs");
  console.log("PASS: summary for grounded evidence");
}

function testSummaryWithDeferred() {
  const ledger = new EvidenceLedger();
  ledger.add({ requestId: "r1", toolName: "research.search", toolClass: "search", finding: "Grounded" });
  ledger.markDeferred("repo");
  ledger.add({ requestId: "r2", toolName: "repo.inspect", toolClass: "repo", finding: "Deferred" });
  const summary = ledger.summary();
  console.assert(summary.total === 2, `Expected 2 total, got ${summary.total}`);
  console.assert(summary.groundedCount === 1, `Expected 1 grounded, got ${summary.groundedCount}`);
  console.assert(summary.deferredCount === 1, `Expected 1 deferred, got ${summary.deferredCount}`);
  console.log("PASS: summary distinguishes grounded vs deferred");
}

function testIndex() {
  const ledger = new EvidenceLedger();
  const item = ledger.add({ requestId: "r1", toolName: "t", toolClass: "search", finding: "x" });
  const idx = ledger.index();
  console.assert(typeof idx[item.id] !== "undefined", "Index should contain item by id");
  console.assert(idx[item.id].finding === "x", "Index item should match");
  console.log("PASS: index method returns correct mapping");
}

function testAddSourceUrls() {
  const ledger = new EvidenceLedger();
  ledger.addSourceUrls(["https://a.com", "https://b.com"]);
  ledger.addSourceUrls(["https://a.com"]); // duplicate should be ignored
  const summary = ledger.summary();
  console.assert(summary.sourceUrls.length === 2, `Expected 2 unique URLs, got ${summary.sourceUrls.length}`);
  console.log("PASS: addSourceUrls deduplicates");
}

function testClearResetsAll() {
  const ledger = new EvidenceLedger();
  ledger.add({ requestId: "r1", toolName: "t", toolClass: "search", finding: "x", sourceUrl: "https://example.com" });
  ledger.markDeferred("repo");
  ledger.clear();
  const summary = ledger.summary();
  console.assert(summary.total === 0, "Total should be 0 after clear");
  console.assert(summary.sourceUrls.length === 0, "Source URLs should be 0 after clear");
  console.log("PASS: clear resets deferred and source URLs");
}

testAddAndRetrieve();
testDefaultConfidence();
testByTool();
testClear();
testIsolation();
testSummaryEmpty();
testSummaryGrounded();
testSummaryWithDeferred();
testIndex();
testAddSourceUrls();
testClearResetsAll();
console.log("\nAll evidence-ledger tests passed.");

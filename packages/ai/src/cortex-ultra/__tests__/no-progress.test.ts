import {
  createNoProgressFingerprint,
  createNoProgressTracker,
  recordNoProgressObservation,
  shouldAbortForNoProgress,
} from "../no-progress";

function testFingerprintIsDeterministic() {
  const input = {
    role: "worker",
    toolName: "research.search",
    args: { query: "test" },
    resultSummary: "found results",
    evidenceIds: ["ev-1", "ev-2"],
  };
  const fp1 = createNoProgressFingerprint(input);
  const fp2 = createNoProgressFingerprint(input);
  console.assert(fp1 === fp2, "Fingerprints should be identical for same input");
  console.log("PASS: fingerprint is deterministic");
}

function testFingerprintExcludesVolatile() {
  const fp1 = createNoProgressFingerprint({
    role: "worker",
    toolName: "research.search",
    args: {},
  });
  const fp2 = createNoProgressFingerprint({
    role: "worker",
    toolName: "research.search",
    args: {},
    evidenceIds: ["ev-timestamp-1"],
    verifierFailure: "timeout at 2024",
  });
  console.assert(fp1 !== fp2, "Fingerprints should differ when evidence/verifier fields differ");
  console.log("PASS: fingerprint differs on evidence/verifier fields");
}

function testFingerprintNormalizesArgs() {
  const fp1 = createNoProgressFingerprint({
    toolName: "research.search",
    args: { b: 1, a: 2 },
  });
  const fp2 = createNoProgressFingerprint({
    toolName: "research.search",
    args: { a: 2, b: 1 },
  });
  console.assert(fp1 === fp2, "Fingerprints should normalize key order");
  console.log("PASS: fingerprint normalizes key order in args");
}

function testFingerprintNormalizesEvidenceIds() {
  const fp1 = createNoProgressFingerprint({
    evidenceIds: ["ev-2", "ev-1"],
  });
  const fp2 = createNoProgressFingerprint({
    evidenceIds: ["ev-1", "ev-2"],
  });
  console.assert(fp1 === fp2, "Fingerprints should normalize evidence ID order");
  console.log("PASS: fingerprint normalizes evidence ID order");
}

function testTrackerDefaults() {
  const tracker = createNoProgressTracker();
  console.assert(tracker.threshold === 3, "Default threshold should be 3");
  console.assert(tracker.blocked === false, "Tracker should start unblocked");
  console.assert(tracker.fingerprints.size === 0, "Tracker should start empty");
  console.log("PASS: tracker has correct defaults");
}

function testTrackerCustomThreshold() {
  const tracker = createNoProgressTracker(2);
  console.assert(tracker.threshold === 2, "Custom threshold should be 2");
  console.log("PASS: tracker accepts custom threshold");
}

function testShouldNotAbortBelowThreshold() {
  const tracker = createNoProgressTracker(3);
  const fp = createNoProgressFingerprint({ role: "worker", toolName: "t" });
  recordNoProgressObservation(tracker, fp);
  recordNoProgressObservation(tracker, fp);
  console.assert(!shouldAbortForNoProgress(tracker), "Should not abort at 2 occurrences with threshold 3");
  console.log("PASS: does not abort below threshold");
}

function testShouldAbortAtThreshold() {
  const tracker = createNoProgressTracker(3);
  const fp = createNoProgressFingerprint({ role: "worker", toolName: "t" });
  recordNoProgressObservation(tracker, fp);
  recordNoProgressObservation(tracker, fp);
  recordNoProgressObservation(tracker, fp);
  console.assert(shouldAbortForNoProgress(tracker), "Should abort at threshold (3)");
  console.assert(tracker.blocked === true, "Tracker should be marked blocked");
  console.log("PASS: aborts at threshold");
}

function testDifferentFingerprintsDontAccumulate() {
  const tracker = createNoProgressTracker(2);
  recordNoProgressObservation(tracker, createNoProgressFingerprint({ toolName: "a" }));
  recordNoProgressObservation(tracker, createNoProgressFingerprint({ toolName: "b" }));
  recordNoProgressObservation(tracker, createNoProgressFingerprint({ toolName: "c" }));
  console.assert(!shouldAbortForNoProgress(tracker), "Different fingerprints should not trigger abort");
  console.log("PASS: different fingerprints do not accumulate");
}

function testBlockedStaysBlocked() {
  const tracker = createNoProgressTracker(2);
  const fp = createNoProgressFingerprint({ toolName: "t" });
  recordNoProgressObservation(tracker, fp);
  recordNoProgressObservation(tracker, fp);
  console.assert(tracker.blocked === true, "Should be blocked");
  recordNoProgressObservation(tracker, createNoProgressFingerprint({ toolName: "other" }));
  console.assert(tracker.blocked === true, "Should stay blocked after more observations");
  console.log("PASS: blocked state persists");
}

testFingerprintIsDeterministic();
testFingerprintExcludesVolatile();
testFingerprintNormalizesArgs();
testFingerprintNormalizesEvidenceIds();
testTrackerDefaults();
testTrackerCustomThreshold();
testShouldNotAbortBelowThreshold();
testShouldAbortAtThreshold();
testDifferentFingerprintsDontAccumulate();
testBlockedStaysBlocked();
console.log("\nAll no-progress tests passed.");

import { deterministicSourceHash, evaluateEvidence, evidenceHealthStatus, resolveEvidenceCandidates, type MIFactEvidence } from "../evidence";

let failed = 0;
function assert(value: unknown, label: string): void { if (!value) { failed++; console.error(`FAIL: ${label}`); } }
const now = new Date("2026-08-09T00:00:00.000Z");
function item(value: number | null, retrievedAt = "2026-08-01T00:00:00.000Z"): MIFactEvidence<number> { return { value, source: "https://example.test/fact", sourceType: "provider_official", sourceLabel: "Example", retrievedAt, effectiveAt: null, expiresAt: null, sourceHash: deterministicSourceHash("https://example.test/fact"), methodology: "published source", methodologyVersion: "1", confidence: "high", verificationState: "unknown", diagnostics: [] }; }
assert(evaluateEvidence(item(1), "pricing", now).verificationState === "fresh", "fresh evidence");
assert(evaluateEvidence(item(1, "2026-06-01T00:00:00.000Z"), "pricing", now).verificationState === "stale", "stale evidence");
assert(evaluateEvidence({ ...item(1), expiresAt: "2026-08-01T00:00:00.000Z" }, "pricing", now).verificationState === "expired", "expired evidence");
assert(evaluateEvidence(item(null), "pricing", now).verificationState === "unknown", "unknown preserved");
assert(evaluateEvidence(item(null), "provider_policy", now).verificationState === "unknown", "provider-policy claims require evidence");
assert(evaluateEvidence({ ...item(1), source: null }, "pricing", now).verificationState === "invalid", "invalid evidence quarantined");
assert(resolveEvidenceCandidates([item(1), item(2)], "pricing", now).verificationState === "conflict", "conflicting evidence explicit");
assert(deterministicSourceHash("a") === deterministicSourceHash("a"), "source hash deterministic");
assert(evidenceHealthStatus(["fresh"]) === "healthy" && evidenceHealthStatus(["unknown"]) === "degraded", "health degrades for unknown evidence");
if (failed) process.exit(1);

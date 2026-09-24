// REC-02G — Model Intelligence Alias Contract Tests
// Run with: node -r ./scripts/test-infrastructure/preload-server-only.cjs --import tsx lib/model-intelligence/__tests__/rec02g-alias-contract.test.ts

import { resolveCanonicalSlug, getAliasesForSlug, reconcileAliases } from "../aliases";
import type { AliasMap } from "../aliases";

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

function assertNotNull<T>(value: T | null, label: string): T {
  if (value !== null) { passed += 1; return value; }
  failed += 1; console.error(`  FAIL: ${label} — value is null`);
  return undefined as T;
}

// ── Fixture: deterministic AliasMap ────────────────────────────────────────────

function buildFixtureMap(): AliasMap {
  const map: AliasMap = new Map();
  // Self-mappings (canonical slugs)
  map.set("gpt-4o", "gpt-4o");
  map.set("gpt-4o-mini", "gpt-4o-mini");
  map.set("claude-sonnet-4", "claude-sonnet-4");
  map.set("gemini-2-5-pro", "gemini-2-5-pro");
  // Alias mappings
  map.set("gpt4o", "gpt-4o");
  map.set("4o", "gpt-4o");
  map.set("sonnet-4", "claude-sonnet-4");
  map.set("sonnet", "claude-sonnet-4");
  map.set("gemini-pro", "gemini-2-5-pro");
  return map;
}

// ── Exact alias resolution ─────────────────────────────────────────────────────

console.log("\n[REC-02G — Exact alias resolution]");

function testExactCanonicalSlugResolvesToSelf(): void {
  const map = buildFixtureMap();
  const result = resolveCanonicalSlug("gpt-4o", map);
  assertNotNull(result, "canonical slug resolves");
  assertEqual(result, "gpt-4o", "canonical slug resolves to itself");
}

function testExactAliasResolvesToCanonical(): void {
  const map = buildFixtureMap();
  const result = resolveCanonicalSlug("gpt4o", map);
  assertNotNull(result, "alias resolves");
  assertEqual(result, "gpt-4o", "alias gpt4o resolves to gpt-4o");
}

function testMultipleAliasesResolveToSameCanonical(): void {
  const map = buildFixtureMap();
  assertEqual(resolveCanonicalSlug("sonnet-4", map), "claude-sonnet-4",
    "sonnet-4 resolves to claude-sonnet-4");
  assertEqual(resolveCanonicalSlug("sonnet", map), "claude-sonnet-4",
    "sonnet resolves to claude-sonnet-4");
}

// ── Unknown alias returns null ─────────────────────────────────────────────────

console.log("\n[REC-02G — Unknown alias returns null]");

function testUnknownAliasReturnsNull(): void {
  const map = buildFixtureMap();
  const result = resolveCanonicalSlug("nonexistent-model-xyz", map);
  assert(result === null, "unknown alias returns null");
}

function testEmptyStringReturnsNull(): void {
  const map = buildFixtureMap();
  const result = resolveCanonicalSlug("", map);
  assert(result === null, "empty string returns null");
}

// ── No boolean leakage from resolver ───────────────────────────────────────────

console.log("\n[REC-02G — No boolean leakage]");

function testResultIsNeverBoolean(): void {
  const map = buildFixtureMap();
  const known = resolveCanonicalSlug("gpt-4o", map);
  const unknown = resolveCanonicalSlug("xyz-nonexistent", map);
  assert(typeof known === "string", "known alias result is string, not boolean");
  assert(unknown === null, "unknown alias result is null, not boolean");
  assert(typeof known !== "boolean", "known result is not boolean");
  assert(typeof unknown !== "boolean", "unknown result is not boolean");
}

// ── Deterministic repeated resolution ──────────────────────────────────────────

console.log("\n[REC-02G — Deterministic repeated resolution]");

function testRepeatedResolutionIsDeterministic(): void {
  const map = buildFixtureMap();
  const results: (string | null)[] = [];
  for (let i = 0; i < 10; i++) {
    results.push(resolveCanonicalSlug("gpt4o", map));
  }
  assert(results.every(r => r === "gpt-4o"),
    "repeated resolution always returns same canonical slug");
  assert(results.every(r => typeof r === "string"),
    "all repeated results are strings, not booleans");
}

// ── No provider/model cross-contamination ──────────────────────────────────────

console.log("\n[REC-02G — No provider/model cross-contamination]");

function testAliasesDontCrossContaminate(): void {
  const map = buildFixtureMap();
  // Claude aliases should not resolve to OpenAI models
  const sonnetResult = resolveCanonicalSlug("sonnet-4", map);
  assert(sonnetResult !== "gpt-4o", "sonnet-4 does not resolve to gpt-4o");
  assert(sonnetResult !== "gpt-4o-mini", "sonnet-4 does not resolve to gpt-4o-mini");

  // OpenAI aliases should not resolve to Anthropic models
  const gptResult = resolveCanonicalSlug("gpt4o", map);
  assert(gptResult !== "claude-sonnet-4", "gpt4o does not resolve to claude-sonnet-4");
  assert(gptResult !== "gemini-2-5-pro", "gpt4o does not resolve to gemini-2-5-pro");
}

// ── getAliasesForSlug ──────────────────────────────────────────────────────────

console.log("\n[REC-02G — getAliasesForSlug]");

function testGetAliasesForKnownSlug(): void {
  const map = buildFixtureMap();
  const aliases = getAliasesForSlug("gpt-4o", map);
  assert(Array.isArray(aliases), "result is an array");
  assert(aliases.includes("gpt4o"), "includes gpt4o alias");
  assert(aliases.includes("4o"), "includes 4o alias");
  assert(!aliases.includes("gpt-4o"), "does not include self (canonical slug)");
}

function testGetAliasesForUnknownSlugReturnsEmpty(): void {
  const map = buildFixtureMap();
  const aliases = getAliasesForSlug("nonexistent", map);
  assert(Array.isArray(aliases), "result is an array");
  assert(aliases.length === 0, "unknown slug returns empty array");
}

// ── reconcileAliases structural contract ───────────────────────────────────────

console.log("\n[REC-02G — reconcileAliases structural contract]");

function testReconcileAliasesReturnsMapAndResult(): void {
  const { map, result } = reconcileAliases();
  assert(map instanceof Map, "reconcileAliases returns a Map");
  assert(typeof result === "object" && result !== null, "reconcileAliases returns a result object");
  assert(typeof result.totalAliases === "number", "result has totalAliases number");
  assert(typeof result.canonicalSlugs === "number", "result has canonicalSlugs number");
  assert(typeof result.nonSelfAliases === "number", "result has nonSelfAliases number");
  assert(Array.isArray(result.duplicateAliases), "result has duplicateAliases array");
  assert(Array.isArray(result.warnings), "result has warnings array");
}

// ── No guessed alias from partial text ─────────────────────────────────────────

console.log("\n[REC-02G — No guessed alias from partial text]");

function testPartialTextDoesNotResolve(): void {
  const map = buildFixtureMap();
  // Partial matches should not resolve — aliases are exact only
  const partial = resolveCanonicalSlug("gpt", map);
  assert(partial === null, "partial text 'gpt' does not resolve — exact match only");

  const partial2 = resolveCanonicalSlug("claude", map);
  assert(partial2 === null, "partial text 'claude' does not resolve — exact match only");
}

// ── Run all tests ───────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  testExactCanonicalSlugResolvesToSelf();
  testExactAliasResolvesToCanonical();
  testMultipleAliasesResolveToSameCanonical();
  testUnknownAliasReturnsNull();
  testEmptyStringReturnsNull();
  testResultIsNeverBoolean();
  testRepeatedResolutionIsDeterministic();
  testAliasesDontCrossContaminate();
  testGetAliasesForKnownSlug();
  testGetAliasesForUnknownSlugReturnsEmpty();
  testReconcileAliasesReturnsMapAndResult();
  testPartialTextDoesNotResolve();

  console.log(`\n  ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});

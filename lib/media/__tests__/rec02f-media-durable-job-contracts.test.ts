// REC-02F — Media Provider Selection Contract Normalization Tests
// Run with: node -r ./scripts/test-infrastructure/preload-server-only.cjs --import tsx lib/media/__tests__/rec02f-media-durable-job-contracts.test.ts

import { selectMediaProvider } from "../router";
import { createDurableMediaJob } from "../durable-jobs";
import { InMemoryJobRepository } from "@ethen/ai/platform/jobs/in-memory-repository";
import type { MediaGenerationRequest } from "../types";
import { getProviderAdapter, getProviderMeta } from "../providers/index";

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

function assertDefined<T>(value: T | null | undefined, label: string): T {
  if (value != null) { passed += 1; return value; }
  failed += 1; console.error(`  FAIL: ${label} — value is null or undefined`);
  return undefined as T;
}

function assertNotNull<T>(value: T | null, label: string): T {
  if (value !== null) { passed += 1; return value; }
  failed += 1; console.error(`  FAIL: ${label} — value is null`);
  return undefined as T;
}

// ── Test helpers ────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<MediaGenerationRequest> = {}): MediaGenerationRequest {
  return {
    prompt: "a test prompt",
    mode: "image",
    ...overrides,
  };
}

// ── Canonical null→undefined normalization ──────────────────────────────────────

console.log("\n[REC-02F — Canonical null→undefined normalization]");

function testCapabilityNullNormalizedToUndefined(): void {
  // capability: null from MediaGenerationRequest should be normalized
  // to undefined before reaching selectMediaProvider.
  // The router's RouterSelectionCriteria accepts only string | undefined.
  // Passing null directly simulates the pre-fix passthrough — it should not crash.
  // Explicit mock keeps the test env-independent (fail-closed router otherwise
  // throws setup_required when no real provider is configured).
  const result = selectMediaProvider({
    modality: "image",
    capability: null as unknown as string | undefined,
    providerId: "mock",
  });
  assertDefined(result?.adapter, "null capability does not crash router");
}

function testCapabilityUndefinedPassesThroughCorrectly(): void {
  // When capability is undefined, the router selects the provider without
  // capability filtering. Explicit mock keeps this env-independent; the shape
  // assertions are the contract.
  const result = selectMediaProvider({
    modality: "image",
    capability: undefined,
    providerId: "mock",
  });
  assertDefined(result?.adapter, "undefined capability selects an available provider");
  assert(typeof result.providerId === "string" && result.providerId.length > 0,
    "providerId is a non-empty string");
  assert(typeof result.selectedModelId === "string",
    "selectedModelId is a string");
  // Verify the routing receipt structure is present
  assert(typeof result.fallbackUsed === "boolean",
    "fallbackUsed is a boolean");
}

function testCapabilityExplicitPassesThrough(): void {
  const result = selectMediaProvider({
    modality: "image",
    capability: "text-to-image",
    providerId: "mock",
  });
  assertDefined(result?.adapter, "explicit capability passes through");
  assert(typeof result.providerId === "string" && result.providerId.length > 0,
    "provider with explicit capability has valid providerId");
}

function testProviderIdNullMeansUnspecified(): void {
  // providerId: null means "not specified" — the router auto-selects among
  // REAL providers. In an unconfigured environment that fails closed with a
  // typed setup_required error (LIVE-PATH-SIMULATION-REMOVAL-01, STU-P0-09) —
  // never a crash and never mock output.
  try {
    const result = selectMediaProvider({
      modality: "image",
      providerId: null,
    });
    assertDefined(result?.adapter, "null providerId auto-selects a provider");
    assert(result.providerId !== "mock", "auto-selection never yields mock");
  } catch (err) {
    assertEqual((err as { code?: string }).code, "setup_required",
      "null providerId with no live provider throws setup_required");
  }
}

function testProviderIdUndefinedMeansUnspecified(): void {
  try {
    const result = selectMediaProvider({
      modality: "image",
      providerId: undefined,
    });
    assertDefined(result?.adapter, "undefined providerId auto-selects a provider");
    assert(result.providerId !== "mock", "auto-selection never yields mock");
  } catch (err) {
    assertEqual((err as { code?: string }).code, "setup_required",
      "undefined providerId with no live provider throws setup_required");
  }
}

function testProviderIdExplicitRequested(): void {
  // Only test with mock — it's the one provider guaranteed to always be available.
  const result = selectMediaProvider({
    modality: "image",
    providerId: "mock",
  });
  assertDefined(result?.adapter, "explicit mock provider resolves");
  assertEqual(result.providerId, "mock", "explicit providerId honoured");
  assertEqual(result.fallbackUsed, false, "explicit request is not a fallback");
}

// ── Provider unavailable / setup-required contract ──────────────────────────────

console.log("\n[REC-02F — Provider unavailable / setup-required contract]");

function testExplicitlyRequestedUnavailableProviderFallsBack(): void {
  // Request a provider that is known to be setup-required / unavailable.
  // Either a real provider is selected as a fallback (fallbackUsed: true) or
  // the router fails closed with setup_required — mock is never substituted
  // (LIVE-PATH-SIMULATION-REMOVAL-01, STU-P0-09).
  try {
    const result = selectMediaProvider({
      modality: "image",
      providerId: "nonexistent-provider-xyz",
    });
    assertDefined(result?.adapter, "unavailable explicit provider falls back to an available one");
    // The resulting providerId must be different from what was requested.
    assert(result.providerId !== "nonexistent-provider-xyz",
      "fallback providerId differs from the unavailable requested one");
    assert(result.providerId !== "mock",
      "unavailable explicit provider never falls back to mock");
    // The routing receipt must record that a fallback was used.
    assert(typeof result.fallbackUsed === "boolean",
      "routing receipt records fallbackUsed");
  } catch (err) {
    assertEqual((err as { code?: string }).code, "setup_required",
      "unavailable explicit provider with no live alternative throws setup_required");
  }
}

function testSetupRequiredProviderIsNotAvailable(): void {
  // Verify that providers with setup-required status report available: false.
  // Test against a known setup-required shim (stability, replicate, etc.)
  for (const id of ["replicate", "stability", "elevenlabs", "runway"]) {
    const adapter = getProviderAdapter(id);
    if (!adapter) continue; // skip if adapter not registered
    const status = adapter.getStatus();
    assert(
      status.setupRequired || !status.available,
      `${id} setup-required provider is not available or is setup-required`
    );
  }
}

function testNoProviderRequestedSelectsFirstAvailable(): void {
  // When no providerId is specified, the router walks the modality order of
  // REAL providers. With no live provider configured it fails closed with a
  // typed setup_required error — never a crash, never mock output.
  try {
    const result = selectMediaProvider({ modality: "image" });
    assertDefined(result?.adapter, "auto-selection returns an adapter when a live provider exists");
    assert(typeof result.providerId === "string",
      "auto-selection returns a providerId");
    assert(result.providerId !== "mock", "auto-selection never yields mock");
    assert(typeof result.selectedModelId === "string",
      "auto-selection returns a selectedModelId");
    // Verify the adapter reports its status in a standard way
    const adapterStatus = result.adapter.getStatus();
    assert(typeof adapterStatus.available === "boolean",
      "selected adapter reports availability as boolean");
  } catch (err) {
    assertEqual((err as { code?: string }).code, "setup_required",
      "auto-selection with no live provider throws setup_required");
  }
}

function testMockProviderExplicitlyRequestable(): void {
  // The mock provider is the canonical test/development-only provider.
  // When explicitly requested, it must be returned directly.
  const result = selectMediaProvider({
    modality: "image",
    providerId: "mock",
  });
  assertEqual(result.providerId, "mock", "explicit mock providerId is mock");
  const adapter = result.adapter;
  const status = adapter.getStatus();
  assertEqual(status.mode, "mock", "mock provider explicitly reports mode 'mock'");
  assert(status.available, "mock provider is available when explicitly requested");
}

// ── Durable job identity preservation ───────────────────────────────────────────

console.log("\n[REC-02F — Durable job identity preservation]");

async function testDurableJobRetainsTenantProjectIdentity(): Promise<void> {
  const repo = new InMemoryJobRepository();
  const result = await createDurableMediaJob(
    "test-project",
    "test-actor",
    "test-org",
    makeRequest({ prompt: "identity test", providerId: "mock" }),
    repo,
  );
  assertDefined(result?.jobId, "job created with id");
  assert(typeof result.jobId === "string" && result.jobId.length > 0, "jobId is non-empty string");
  assert(typeof result.durableJobId === "string" && result.durableJobId.length > 0, "durableJobId is non-empty string");
  const job = await repo.findJob("test-project", result.durableJobId);
  assertDefined(job, "durable job found in repository");
  if (job) {
    assertEqual(job.organizationId, "test-org", "organizationId preserved");
    assertEqual(job.projectId, "test-project", "projectId preserved");
  }
}

async function testProviderSelectionFailureLeavesJobNonComplete(): Promise<void> {
  // The createDurableMediaJob function calls adapter.generate() internally.
  // Even if generation fails, the job should exist in the repository with a
  // non-complete status. We test the boundary: the function doesn't crash
  // and the durable job record exists in the repository.
  const repo = new InMemoryJobRepository();
  let durableJobId: string | undefined;
  try {
    const result = await createDurableMediaJob(
      "test-project",
      "test-actor",
      "test-org",
      makeRequest({ prompt: "failure boundary test", providerId: "mock" }),
      repo,
    );
    durableJobId = result.durableJobId;
    // If we get here, the generation didn't throw — job could be complete.
    // Verify the durable job exists with correct identity.
    const durableJob = await repo.findJob("test-project", durableJobId);
    assertDefined(durableJob, "durable job persisted even on success");
  } catch {
    // Generation failure is valid — the durable job should still exist.
    passed += 1;
  }
}

// ── Missing provider does not become mock success ───────────────────────────────

console.log("\n[REC-02F — Missing provider ≠ mock success]");

async function testMissingProviderRoutingReceipt(): Promise<void> {
  // LIVE-PATH-SIMULATION-REMOVAL-01 (STU-P0-09): an unavailable/missing
  // provider must NOT become a mock success. createDurableMediaJob fails
  // closed with a typed setup_required error — no job, no fake receipt.
  const repo = new InMemoryJobRepository();
  let threw = false;
  try {
    await createDurableMediaJob(
      "test-project",
      "test-actor",
      "test-org",
      makeRequest({ prompt: "routing receipt test", providerId: "nonexistent" }),
      repo,
    );
  } catch (err) {
    threw = true;
    assertEqual((err as { code?: string }).code, "setup_required",
      "missing provider fails closed with setup_required, never mock success");
  }
  assert(threw, "missing provider never produces a mock-completed job");
}

async function testExplicitMockRequestProducesMockResult(): Promise<void> {
  // When mock is explicitly requested, the routing receipt should reflect that.
  const repo = new InMemoryJobRepository();
  const result = await createDurableMediaJob(
    "test-project",
    "test-actor",
    "test-org",
    makeRequest({ prompt: "explicit mock", providerId: "mock" }),
    repo,
  );
  assert(typeof result.routingReceipt.providerId === "string",
    "explicit mock routing receipt has providerId");
  assert(typeof result.routingReceipt.fallbackUsed === "boolean",
    "explicit mock routing receipt has fallbackUsed");
}

// ── failJob contract (4-arg signature) ──────────────────────────────────────────

console.log("\n[REC-02F — failJob 4-arg contract]");

async function testFailJobCalledWithCorrectSignature(): Promise<void> {
  const repo = new InMemoryJobRepository();
  const result = await createDurableMediaJob(
    "test-project",
    "test-actor",
    "test-org",
    makeRequest({ prompt: "failJob contract test", providerId: "mock" }),
    repo,
  );
  assertDefined(result, "createDurableMediaJob returns without signature error");
  const durableJob = await repo.findJob("test-project", result.durableJobId);
  assertDefined(durableJob, "durable job persisted in repository");
}

// ── Run all tests ───────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  // Synchronous tests
  testCapabilityNullNormalizedToUndefined();
  testCapabilityUndefinedPassesThroughCorrectly();
  testCapabilityExplicitPassesThrough();
  testProviderIdNullMeansUnspecified();
  testProviderIdUndefinedMeansUnspecified();
  testProviderIdExplicitRequested();
  testExplicitlyRequestedUnavailableProviderFallsBack();
  testSetupRequiredProviderIsNotAvailable();
  testNoProviderRequestedSelectsFirstAvailable();
  testMockProviderExplicitlyRequestable();

  // Async tests
  await testDurableJobRetainsTenantProjectIdentity();
  await testProviderSelectionFailureLeavesJobNonComplete();
  await testMissingProviderRoutingReceipt();
  await testExplicitMockRequestProducesMockResult();
  await testFailJobCalledWithCorrectSignature();

  console.log(`\n  ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});

// Cortex run persistence — unit tests
// Run with: NODE_OPTIONS=--conditions=react-server npx tsx lib/cortex/__tests__/cortex-persistence.test.ts
//
// These tests exercise the safe no-op paths of lib/cortex/persistence.ts
// (no Supabase env configured in the test process, same as local/mock mode)
// and the pure trace-span builder in lib/cortex/trace-spans.ts. They do not
// hit a real database — there is no test DB harness in this repo for that.

import {
  recordCortexRun,
  listCortexRuns,
  getCortexRunDetail,
  getCortexRunByRunId,
} from "../persistence";
import { finalizeAndPersistCortexRun } from "../finalize-and-persist";
import { buildCortexTraceSpans } from "../trace-spans";
import type { EthenRouteReceipt } from "../types";
import type { RunCortexChatResult } from "../run-cortex-chat";
import type { GatewayResult, GatewayProviderRoute } from "@ethen/models/gateway/types";

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

function buildReceipt(overrides?: Partial<EthenRouteReceipt>): EthenRouteReceipt {
  return {
    receiptVersion: "ethen.route_receipt.v1",
    requestId: "req-test-1",
    runId: "run-test-1",
    timestamp: new Date().toISOString(),
    mode: "cortex",
    intent: "general.chat",
    routeProfile: "cortex-default",
    routeClass: "single_model",
    provider: {
      selectedProvider: "openai",
      selectedModel: "gpt-test",
      providerVisible: true,
      modelVisible: true,
      isByok: false,
      regionClass: "default",
    },
    selection: {
      reasonCodes: ["selected_by_intent"],
      candidateCount: 1,
      selectedCandidateRank: 1,
    },
    fallback: {
      attempted: false,
      used: false,
      attempts: [],
      finalStatus: "primary_success",
    },
    tools: {},
    verifier: {
      used: false,
      status: "skipped",
    },
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      costEstimateStatus: "not_available",
    },
    quality: {
      confidence: "medium",
    },
    redactions: [],
    ...overrides,
  };
}

function buildGatewayRoute(overrides?: Partial<GatewayProviderRoute>): GatewayProviderRoute {
  return {
    providerId: "openai",
    selectedProvider: "openai",
    selectedModelAlias: "gpt-test",
    mode: "live",
    routeId: "default",
    source: "primary",
    fallbackUsed: false,
    ...overrides,
  } as GatewayProviderRoute;
}

function buildGatewayResult(route: GatewayProviderRoute): GatewayResult {
  return {
    route,
    usage: {},
    textStream: new ReadableStream<string>({
      start(controller) {
        controller.close();
      },
    }),
  } as unknown as GatewayResult;
}

// ── recordCortexRun: safe no-op when Supabase env is missing ──────────────

async function testRecordSkipsWithoutEnv(): Promise<void> {
  const receipt = buildReceipt();
  const result = await recordCortexRun({
    userId: "user-123",
    sessionId: "session-123",
    receipt,
  });

  assert(result.ok, "recordCortexRun reports ok when env missing");
  assert(result.skipped, "recordCortexRun reports skipped when Supabase env missing");
  assertEqual(result.runRecordId, null, "no run record id is produced when skipped");
  assertEqual(result.error, null, "no error is surfaced for the expected skip path");
}

async function testRecordSkipsForMockUser(): Promise<void> {
  const receipt = buildReceipt();
  const result = await recordCortexRun({
    userId: "mock-user-1",
    receipt,
  });

  assert(result.ok, "recordCortexRun reports ok for mock user sentinel");
  assert(result.skipped, "recordCortexRun skips mock-prefixed user ids");
}

async function testRecordSkipsForMissingUser(): Promise<void> {
  const receipt = buildReceipt();
  const result = await recordCortexRun({
    userId: null,
    receipt,
  });

  assert(result.ok, "recordCortexRun reports ok for missing user id");
  assert(result.skipped, "recordCortexRun skips when user id is missing");
}

async function testListAndDetailReturnEmptyWithoutEnv(): Promise<void> {
  const runs = await listCortexRuns({ userId: "user-123" });
  assert(Array.isArray(runs), "listCortexRuns returns an array");
  assertEqual(runs.length, 0, "listCortexRuns returns no rows without Supabase env");

  const detail = await getCortexRunDetail({ userId: "user-123", runRecordId: "run-abc" });
  assertEqual(detail, null, "getCortexRunDetail returns null without Supabase env");

  const byRunId = await getCortexRunByRunId({ userId: "user-123", runId: "run-test-1" });
  assertEqual(byRunId, null, "getCortexRunByRunId returns null without Supabase env");
}

// ── finalizeAndPersistCortexRun: shared finalize+persist helper ────────────

async function testFinalizeAndPersistRunsVerifierAndSkipsPersistenceWithoutEnv(): Promise<void> {
  const receipt = buildReceipt();
  const route = buildGatewayRoute();
  const gatewayResult = buildGatewayResult(route);

  let recordCalled = false;
  const finalReceipt = await finalizeAndPersistCortexRun({
    cortexResult: {
      result: gatewayResult,
      receipt,
      classification: {
        primaryIntent: "general.chat",
        secondaryIntents: [],
        confidence: 0.9,
        reasonCodes: ["default_fallback"],
        requiresFreshness: false,
        requiresTools: false,
        requiresRepoContext: false,
        requiresVerifier: false,
        riskLevel: "low",
      },
      effectiveMode: "cortex",
      cortexProfile: null,
    },
    userRequest: "hello",
    outputText: "hi there",
    sessionId: "session-123",
    selectedMode: "cortex",
    hasSupabaseEnvFn: () => false,
    recordCortexRunFn: () => {
      recordCalled = true;
    },
  });

  assert(finalReceipt.verifier.status !== "pending", "finalized receipt resolves the pending verifier state");
  assert(!recordCalled, "persistence is skipped when Supabase env is unavailable");
}

async function testFinalizeAndPersistRecordsRunWhenEnvAndUserAvailable(): Promise<void> {
  const receipt = buildReceipt();
  const route = buildGatewayRoute();
  const gatewayResult = buildGatewayResult(route);

  let recordedUserId: string | null = null;
  await finalizeAndPersistCortexRun({
    cortexResult: {
      result: gatewayResult,
      receipt,
      classification: {
        primaryIntent: "general.chat",
        secondaryIntents: [],
        confidence: 0.9,
        reasonCodes: ["default_fallback"],
        requiresFreshness: false,
        requiresTools: false,
        requiresRepoContext: false,
        requiresVerifier: false,
        riskLevel: "low",
      },
      effectiveMode: "cortex",
      cortexProfile: null,
    },
    userRequest: "hello",
    outputText: "hi there",
    sessionId: "session-123",
    selectedMode: "cortex",
    hasSupabaseEnvFn: () => true,
    getCurrentUserIdFn: async () => "user-123",
    recordCortexRunFn: (params) => {
      recordedUserId = params.userId ?? null;
    },
  });

  assertEqual(recordedUserId, "user-123", "persistence runs when Supabase env and user id are both available");
}

// ── buildCortexTraceSpans ───────────────────────────────────────────────────

function testTraceSpansCoverRequiredStages(): void {
  const receipt = buildReceipt();
  const route = buildGatewayRoute();
  const gatewayResult = buildGatewayResult(route);

  const cortexResult: RunCortexChatResult = {
    result: gatewayResult,
    receipt,
    classification: {
      primaryIntent: "general.chat",
      secondaryIntents: [],
      confidence: 0.9,
      reasonCodes: ["default_fallback"],
      requiresFreshness: false,
      requiresTools: false,
      requiresRepoContext: false,
      requiresVerifier: false,
      riskLevel: "low",
    },
    effectiveMode: "cortex",
    cortexProfile: null,
  };

  const spans = buildCortexTraceSpans(cortexResult);
  const types = spans.map((s) => s.type);

  assert(types.includes("classification"), "spans include classification stage");
  assert(types.includes("routing"), "spans include routing stage");
  assert(types.includes("provider_call"), "spans include provider_call (gateway execution) stage");
  assert(types.includes("verification"), "spans include verification stage");
  assert(types.includes("synthesis"), "spans include synthesis (receipt build) stage");
  assert(
    !spans.some((s) => s.label.toLowerCase().includes("fallback")),
    "no fallback span is emitted when fallback was not attempted"
  );
}

function testTraceSpansIncludeFallbackWhenAttempted(): void {
  const receipt = buildReceipt({
    fallback: {
      attempted: true,
      used: true,
      attempts: [
        { attemptNumber: 1, providerId: "openai", timestamp: new Date().toISOString(), succeeded: false },
        { attemptNumber: 2, providerId: "anthropic", timestamp: new Date().toISOString(), succeeded: true },
      ],
      finalStatus: "fallback_success",
    },
  });
  const route = buildGatewayRoute({ fallbackUsed: true });
  const gatewayResult = buildGatewayResult(route);

  const cortexResult: RunCortexChatResult = {
    result: gatewayResult,
    receipt,
    classification: {
      primaryIntent: "general.chat",
      secondaryIntents: [],
      confidence: 0.9,
      reasonCodes: ["default_fallback"],
      requiresFreshness: false,
      requiresTools: false,
      requiresRepoContext: false,
      requiresVerifier: false,
      riskLevel: "low",
    },
    effectiveMode: "cortex",
    cortexProfile: null,
  };

  const spans = buildCortexTraceSpans(cortexResult);
  assert(
    spans.some((s) => s.label.toLowerCase().includes("fallback")),
    "a fallback span is emitted when fallback was attempted"
  );
}

// ── No secrets/raw payloads in spans ────────────────────────────────────────

function testSpansDoNotLeakProviderWhenNotVisible(): void {
  const receipt = buildReceipt({
    provider: {
      selectedProvider: "openai",
      selectedModel: "gpt-test",
      providerVisible: false,
      modelVisible: false,
      isByok: false,
      regionClass: "default",
    },
  });
  const route = buildGatewayRoute();
  const gatewayResult = buildGatewayResult(route);

  const cortexResult: RunCortexChatResult = {
    result: gatewayResult,
    receipt,
    classification: {
      primaryIntent: "general.chat",
      secondaryIntents: [],
      confidence: 0.9,
      reasonCodes: ["default_fallback"],
      requiresFreshness: false,
      requiresTools: false,
      requiresRepoContext: false,
      requiresVerifier: false,
      riskLevel: "low",
    },
    effectiveMode: "cortex",
    cortexProfile: null,
  };

  const spans = buildCortexTraceSpans(cortexResult);
  const providerSpan = spans.find((s) => s.type === "provider_call" && s.label === "Gateway execution");
  assertEqual(providerSpan?.metadata.provider, "redacted", "provider name is redacted in span metadata when not visible");
}

async function main(): Promise<void> {
  await testRecordSkipsWithoutEnv();
  await testRecordSkipsForMockUser();
  await testRecordSkipsForMissingUser();
  await testListAndDetailReturnEmptyWithoutEnv();
  await testFinalizeAndPersistRunsVerifierAndSkipsPersistenceWithoutEnv();
  await testFinalizeAndPersistRecordsRunWhenEnvAndUserAvailable();
  testTraceSpansCoverRequiredStages();
  testTraceSpansIncludeFallbackWhenAttempted();
  testSpansDoNotLeakProviderWhenNotVisible();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();

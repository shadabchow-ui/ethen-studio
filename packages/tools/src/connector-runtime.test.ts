import {
  dispatchAction,
  registerHandler,
  getHandler,
  listLiveHandlers,
  getConnectorRuntimeHealth,
  RuntimeError,
} from "./connector-runtime";
import type { UserContext } from "./connector-runtime";

// ── Simple assertion helpers (no test framework dependency) ────────────────────

let failures = 0;
let passes = 0;

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    failures += 1;
    throw new Error(`FAIL: ${msg}`);
  }
  passes += 1;
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    failures += 1;
    throw new Error(`FAIL: ${msg} — expected ${String(expected)}, got ${String(actual)}`);
  }
  passes += 1;
}

function assertDeepEqual(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    throw new Error(`FAIL: ${msg} — expected ${b}, got ${a}`);
  }
  passes += 1;
}

function assertContains<T>(haystack: T[], needle: T, msg: string): void {
  if (!haystack.includes(needle)) {
    failures += 1;
    throw new Error(`FAIL: ${msg} — ${String(needle)} not in ${JSON.stringify(haystack)}`);
  }
  passes += 1;
}

function assertGreaterThan(actual: number, min: number, msg: string): void {
  if (!(actual > min)) {
    failures += 1;
    throw new Error(`FAIL: ${msg} — expected > ${min}, got ${actual}`);
  }
  passes += 1;
}

// ── Test context ───────────────────────────────────────────────────────────────

const CTX: UserContext = {
  sessionId: "test-session",
  userId: "test-user",
  agentSlug: "test-agent",
};

// ── Handler registry tests ────────────────────────────────────────────────────

function testHandlerRegistry(): string[] {
  const log: string[] = [];

  // fails closed when no handler is registered
  const handler = getHandler("unknown-provider", "unknown-action");
  assert(handler === undefined, "getHandler returns undefined for missing provider/action");
  log.push("getHandler returns undefined for missing entries");

  // registers and retrieves handlers
  const providerId = "test-provider";
  const actionId = "test-action";
  const mockHandler = async () => "test-result";
  registerHandler(providerId, actionId, mockHandler);
  const retrieved = getHandler(providerId, actionId);
  assert(retrieved !== undefined, "getHandler returns defined handler");
  assert(retrieved === mockHandler, "getHandler returns the exact same handler reference");
  log.push("registerHandler + getHandler roundtrip works");

  // lists live handlers
  const before = listLiveHandlers().length;
  registerHandler("p-a", "a-1", async () => "ok");
  registerHandler("p-b", "a-2", async () => "ok");
  const handlers = listLiveHandlers();
  assertEqual(handlers.length, before + 2, "listLiveHandlers reflects new registrations");
  assert(handlers.some((h) => h.providerId === "p-a" && h.actionId === "a-1"), "listLiveHandlers contains p-a/a-1");
  assert(handlers.some((h) => h.providerId === "p-b" && h.actionId === "a-2"), "listLiveHandlers contains p-b/a-2");
  log.push("listLiveHandlers works correctly");

  // health stats
  const health = getConnectorRuntimeHealth();
  assertGreaterThan(health.registeredActions, 0, "health.registeredActions > 0");
  assert(Array.isArray(health.enabledHandlers), "health.enabledHandlers is an array");
  log.push("getConnectorRuntimeHealth returns valid stats");

  return log;
}

// ── Dispatcher: unknown provider/action ───────────────────────────────────────

async function testUnknownAction(): Promise<string[]> {
  const log: string[] = [];

  const r1 = await dispatchAction("nonexistent.action", {}, CTX);
  assertEqual(r1.status, "action_not_found", "status is action_not_found");
  assertEqual(r1.error?.code, "action_not_found", "error code is action_not_found");
  assertContains(r1.trace, "failed", "trace contains failed");
  log.push("rejects unknown action id");

  const r2 = await dispatchAction("", {}, CTX);
  assertEqual(r2.status, "validation_error", "empty action id → validation_error");
  assertEqual(r2.error?.code, "validation_error", "empty action id error code");
  log.push("rejects empty action id");

  const r3 = await dispatchAction(null as unknown as string, {}, CTX);
  assertEqual(r3.status, "validation_error", "null action id → validation_error");
  assertEqual(r3.error?.code, "validation_error", "null action id error code");
  log.push("rejects null action id");

  return log;
}

// ── Dispatcher: read action with no handler ───────────────────────────────────

async function testReadActionNoHandler(): Promise<string[]> {
  const log: string[] = [];

  const result = await dispatchAction("research.search", {}, CTX);
  assertEqual(result.status, "handler_not_configured", "read action w/o handler is not_configured");
  assertEqual(result.error?.code, "handler_not_configured", "error code is handler_not_configured");
  assertContains(result.trace, "failed", "trace contains failed");
  log.push("read action with no handler returns handler_not_configured");

  return log;
}

// ── Dispatcher: write action returns approval_required ────────────────────────

async function testWriteAction(): Promise<string[]> {
  const log: string[] = [];

  const r1 = await dispatchAction("artifact.create", {}, CTX);
  assertEqual(r1.status, "approval_required", "artifact.create → approval_required");
  assertEqual(r1.error?.code, "approval_required", "error code is approval_required");
  assertContains(r1.trace, "approval_checked", "trace includes approval_checked");
  assertContains(r1.trace, "failed", "trace includes failed");
  log.push("write action artifact.create blocked for approval");

  const r2 = await dispatchAction("job-search.tracker", {}, CTX);
  assertEqual(r2.status, "approval_required", "job-search.tracker → approval_required");
  assertEqual(r2.error?.code, "approval_required", "error code is approval_required");
  log.push("write action job-search.tracker blocked for approval");

  return log;
}

// ── Dispatcher: contract_only actions ─────────────────────────────────────────

async function testContractOnly(): Promise<string[]> {
  const log: string[] = [];

  const result = await dispatchAction("artifact.read", {}, CTX);
  assertEqual(result.status, "not_configured", "contract_only → not_configured");
  assertEqual(result.error?.code, "handler_not_configured", "contract_only error code");
  log.push("contract_only action returns not_configured");

  return log;
}

// ── Dispatcher: successful dispatch ───────────────────────────────────────────

async function testSuccessfulDispatch(): Promise<string[]> {
  const log: string[] = [];

  const expectedResult = { value: 42 };
  registerHandler("exa", "research.search", async () => expectedResult);

  const result = await dispatchAction("research.search", {}, CTX);
  assertEqual(result.status, "success", "status is success");
  assertDeepEqual(result.result, expectedResult, "result matches handler output");
  assertContains(result.trace, "started", "trace has started");
  assertContains(result.trace, "handler_dispatched", "trace has handler_dispatched");
  assertContains(result.trace, "completed", "trace has completed");
  assertEqual(result.providerId, "exa", "providerId matches registry");
  log.push("successful dispatch through registered handler");

  return log;
}

// ── Error normalization ───────────────────────────────────────────────────────

async function testErrorNormalization(): Promise<string[]> {
  const log: string[] = [];

  // RuntimeError preserves code and message
  registerHandler("language-tool", "writing.check", async () => {
    throw new RuntimeError("provider_error", "Upstream provider failed.");
  });

  const r1 = await dispatchAction("writing.check", {}, CTX);
  assertEqual(r1.status, "provider_error", "RuntimeError → provider_error status");
  assertEqual(r1.error?.code, "provider_error", "RuntimeError preserves code");
  assertEqual(r1.error?.message, "Upstream provider failed.", "RuntimeError preserves message");
  assertContains(r1.trace, "failed", "trace has failed");
  log.push("RuntimeError normalization preserves code and message");

  // Non-RuntimeError details are redacted
  registerHandler("language-tool", "writing.check", async () => {
    throw new Error("Raw provider error with AK-12345 secret key");
  });

  const r2 = await dispatchAction("writing.check", {}, CTX);
  assertEqual(r2.status, "provider_error", "generic Error → provider_error status");
  assertEqual(r2.error?.code, "provider_error", "generic Error code is provider_error");
  assertEqual(r2.error?.message, "An internal error occurred.", "generic Error message is redacted");
  log.push("generic Error details are redacted/normalized");

  return log;
}

// ── Input validation ───────────────────────────────────────────────────────────

async function testInputValidation(): Promise<string[]> {
  const log: string[] = [];

  const r1 = await dispatchAction("research.search", [], CTX);
  assertEqual(r1.status, "validation_error", "array input → validation_error");
  assertEqual(r1.error?.code, "validation_error", "array input error code");
  log.push("rejects array input");

  registerHandler("exa", "research.search", async () => "ok");
  const r2 = await dispatchAction("research.search", undefined, CTX);
  assertEqual(r2.status, "success", "undefined input accepted");
  log.push("accepts undefined input");

  registerHandler("language-tool", "writing.check", async () => "ok");
  const r3 = await dispatchAction("writing.check", null, CTX);
  assertEqual(r3.status, "success", "null input accepted");
  log.push("accepts null input");

  return log;
}

// ── Trace completeness ─────────────────────────────────────────────────────────

async function testTraceCompleteness(): Promise<string[]> {
  const log: string[] = [];

  const r1 = await dispatchAction("nonexistent.tool", {}, CTX);
  assert(r1.trace.length > 0, "trace is not empty");
  assertEqual(r1.trace[0], "started", "first trace event is started");
  log.push("all results include started trace");

  registerHandler("twelve-data", "finance.overview", async () => "market-data");
  const r2 = await dispatchAction("finance.overview", {}, CTX);
  assertEqual(r2.status, "success", "finance.overview success");
  assertContains(r2.trace, "started", "success trace has started");
  assertContains(r2.trace, "auth_checked", "success trace has auth_checked");
  assertContains(r2.trace, "approval_checked", "success trace has approval_checked");
  assertContains(r2.trace, "handler_dispatched", "success trace has handler_dispatched");
  assertContains(r2.trace, "completed", "success trace has completed");
  log.push("success path has complete trace");

  return log;
}

// ── Test runner ────────────────────────────────────────────────────────────────

type TestCase = {
  name: string;
  fn: () => string[] | Promise<string[]>;
};

const TESTS: TestCase[] = [
  { name: "Handler Registry", fn: testHandlerRegistry },
  { name: "Dispatcher - unknown action", fn: testUnknownAction },
  { name: "Dispatcher - read action no handler", fn: testReadActionNoHandler },
  { name: "Dispatcher - write action blocked", fn: testWriteAction },
  { name: "Dispatcher - contract_only", fn: testContractOnly },
  { name: "Dispatcher - successful dispatch", fn: testSuccessfulDispatch },
  { name: "Error normalization", fn: testErrorNormalization },
  { name: "Input validation", fn: testInputValidation },
  { name: "Trace completeness", fn: testTraceCompleteness },
];

export async function runTests(): Promise<{ failures: number; passes: number }> {
  failures = 0;
  passes = 0;

  for (const test of TESTS) {
    try {
      const log = await test.fn();
      console.log(`PASS: ${test.name}`);
      for (const entry of log) {
        console.log(`  - ${entry}`);
      }
    } catch (err) {
      // failures already counted inside helpers
      console.error(`FAIL: ${test.name} — ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  return { failures, passes };
}

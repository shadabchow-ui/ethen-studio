// Cortex fallback resilience — failure classification and policy resolution.
// Run with: npx tsx lib/cortex/__tests__/fallback.test.ts

import { GatewayError } from "@ethen/models/gateway/errors";
import {
  classifyFailure,
  isRetryableFailure,
  resolveCrossProviderFallbacks,
  resolveSameProviderRetries,
} from "../fallback";
import {
  isProviderCircuitOpen,
  recordProviderFailure,
  recordProviderSuccess,
  resetCircuitBreaker,
} from "../circuit-breaker";
import type { FallbackPolicy } from "../types";

let passed = 0;
let failed = 0;

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label}`);
}

// ── classifyFailure ─────────────────────────────────────────────────────

assertEqual(
  classifyFailure(new GatewayError({ code: "provider_key_missing", message: "x", status: 503 })),
  "auth_missing",
  "provider_key_missing classifies as auth_missing"
);

assertEqual(
  classifyFailure(new GatewayError({ code: "provider_unavailable", message: "x", status: 503 })),
  "provider_unavailable",
  "provider_unavailable classifies as provider_unavailable"
);

assertEqual(
  classifyFailure(new GatewayError({ code: "provider_timeout", message: "deadline", status: 504 })),
  "timeout",
  "provider_timeout classifies as timeout"
);

assertEqual(
  classifyFailure(new GatewayError({ code: "provider_error", message: "upstream timeout", status: 504 })),
  "timeout",
  "HTTP 504 classifies as timeout"
);

assertEqual(
  classifyFailure(new GatewayError({ code: "provider_error", message: "rate limited", status: 429 })),
  "rate_limited",
  "status 429 classifies as rate_limited"
);

assertEqual(
  classifyFailure(new GatewayError({ code: "provider_error", message: "bad request", status: 400 })),
  "invalid_request",
  "status 400 classifies as invalid_request"
);

assertEqual(
  classifyFailure(new Error("Request timed out")),
  "timeout",
  "plain Error mentioning timeout classifies as timeout"
);

assertEqual(classifyFailure("not an error"), "unknown", "non-Error value classifies as unknown");

// ── isRetryableFailure ──────────────────────────────────────────────────

assert(isRetryableFailure("timeout"), "timeout is retryable");
assert(isRetryableFailure("rate_limited"), "rate_limited is retryable");
assert(isRetryableFailure("provider_unavailable"), "provider_unavailable is retryable");
assert(!isRetryableFailure("auth_missing"), "auth_missing is not retryable");
assert(!isRetryableFailure("invalid_request"), "invalid_request is not retryable");

// ── resolveSameProviderRetries / resolveCrossProviderFallbacks ──────────

assertEqual(resolveSameProviderRetries(undefined), 0, "no fallback policy defaults to 0 same-provider retries");
assertEqual(resolveCrossProviderFallbacks(undefined), 1, "no fallback policy defaults to 1 cross-provider fallback (legacy behavior)");

const disabledPolicy: FallbackPolicy = {
  enabled: false,
  maxAttempts: 3,
  sameProviderRetries: 2,
  crossProviderFallbacks: 3,
  allowQualityDowngrade: false,
  allowCostUpgrade: false,
  allowToolDowngrade: false,
  degradedModeAllowed: false,
};
assertEqual(resolveSameProviderRetries(disabledPolicy), 0, "disabled policy ignores configured same-provider retries");
assertEqual(resolveCrossProviderFallbacks(disabledPolicy), 1, "disabled policy ignores configured cross-provider fallbacks");

const explicitPolicy: FallbackPolicy = {
  enabled: true,
  maxAttempts: 5,
  sameProviderRetries: 2,
  crossProviderFallbacks: 3,
  allowQualityDowngrade: false,
  allowCostUpgrade: false,
  allowToolDowngrade: false,
  degradedModeAllowed: false,
};
assertEqual(resolveSameProviderRetries(explicitPolicy), 2, "enabled policy honors configured same-provider retries");
assertEqual(resolveCrossProviderFallbacks(explicitPolicy), 3, "enabled policy honors configured cross-provider fallbacks");

// ── circuit breaker ──────────────────────────────────────────────────────

resetCircuitBreaker();
assert(!isProviderCircuitOpen("test-provider-a"), "fresh provider starts with circuit closed");

recordProviderFailure("test-provider-a");
recordProviderFailure("test-provider-a");
assert(!isProviderCircuitOpen("test-provider-a"), "circuit stays closed below failure threshold");

recordProviderFailure("test-provider-a");
assert(isProviderCircuitOpen("test-provider-a"), "circuit opens at failure threshold");

recordProviderSuccess("test-provider-a");
assert(!isProviderCircuitOpen("test-provider-a"), "circuit closes after a recorded success");

resetCircuitBreaker();
recordProviderFailure("test-provider-b");
recordProviderFailure("test-provider-b");
recordProviderFailure("test-provider-b");
assert(isProviderCircuitOpen("test-provider-b"), "circuit opens after threshold for provider b");
assert(!isProviderCircuitOpen("test-provider-a"), "circuit state is isolated per provider");

resetCircuitBreaker();
recordProviderFailure("test-provider-c");
recordProviderFailure("test-provider-c");
recordProviderFailure("test-provider-c");
assert(isProviderCircuitOpen("test-provider-c", Date.now()), "circuit is open immediately after threshold");
assert(!isProviderCircuitOpen("test-provider-c", Date.now() + 60_000), "circuit auto-closes after cooldown window elapses");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}

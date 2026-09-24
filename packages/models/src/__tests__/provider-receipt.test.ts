// Provider Receipt Mapping — Regression Suite
// Run with: npx tsx lib/providers/__tests__/provider-receipt.test.ts
//
// Verifies that every trust-state, provider-status, and connector-status
// source maps correctly into canonical provider statuses with no
// dropped cases, no overclaims, and consistent isUsable/isBlocking/isDegraded.

import {
  fromAgentTrustState,
  fromMediaProviderTrust,
  fromMediaProviderMode,
  fromConnectorStatus,
  isUsable,
  isBlocking,
  isDegraded,
  CANONICAL_STATUS_LABELS,
  CANONICAL_STATUS_TONE,
} from "../provider-receipt";
import type { AgentTrustState } from "@ethen/contracts/agents/types";
import type { ProviderTrustLabel, ProviderMode } from "@ethen/contracts/media/types";
import type { ConnectorStatus } from "@ethen/tools/connectors/connection-status";

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

// ── Agent trust state → canonical status ──────────────────────────────

function testAgentTrustStateMapping(): void {
  console.log("\n[Agent Trust State → Canonical Status]");

  const agentStates: AgentTrustState[] = ["live", "preview", "mock", "setup-required", "degraded", "unavailable", "planned"];
  for (const s of agentStates) {
    const mapped = fromAgentTrustState(s);
    assert(typeof mapped === "string", `${s} → ${mapped} (valid status)`);
    assert(CANONICAL_STATUS_LABELS[mapped] !== undefined, `${s} → ${mapped} has label`);
    assert(CANONICAL_STATUS_TONE[mapped] !== undefined, `${s} → ${mapped} has tone`);
  }

  assertEqual(fromAgentTrustState("live"), "live", "live → live");
  assertEqual(fromAgentTrustState("preview"), "live", "preview → live (credible but preview)");
  assertEqual(fromAgentTrustState("mock"), "mock", "mock → mock");
  assertEqual(fromAgentTrustState("setup-required"), "setup-required", "setup-required → setup-required");
  assertEqual(fromAgentTrustState("degraded"), "degraded", "degraded → degraded");
  assertEqual(fromAgentTrustState("unavailable"), "unavailable", "unavailable → unavailable");
  assertEqual(fromAgentTrustState("planned"), "unknown", "planned → unknown");
}

// ── Media provider trust → canonical status ───────────────────────────

function testMediaProviderTrustMapping(): void {
  console.log("\n[Media Provider Trust → Canonical Status]");

  const trustLabels = ["live", "mock", "setup_required", "not_provided", "disabled", "failed", "fallback", "degraded", "unavailable"] as const;
  for (const t of trustLabels) {
    const mapped = fromMediaProviderTrust(t);
    assert(typeof mapped === "string", `${t} → ${mapped} (valid)`);
    assert(CANONICAL_STATUS_LABELS[mapped] !== undefined, `${t} → ${mapped} has label`);
  }

  assertEqual(fromMediaProviderTrust("live"), "live", "live → live");
  assertEqual(fromMediaProviderTrust("mock"), "mock", "mock → mock");
  assertEqual(fromMediaProviderTrust("setup_required"), "setup-required", "setup_required → setup-required");
  assertEqual(fromMediaProviderTrust("not_provided"), "unknown", "not_provided → unknown");
  assertEqual(fromMediaProviderTrust("disabled"), "unavailable", "disabled → unavailable");
  assertEqual(fromMediaProviderTrust("failed"), "unavailable", "failed → unavailable");
  assertEqual(fromMediaProviderTrust("fallback"), "fallback", "fallback → fallback");
  assertEqual(fromMediaProviderTrust("degraded"), "degraded", "degraded → degraded");
  assertEqual(fromMediaProviderTrust("unavailable"), "unavailable", "unavailable → unavailable");
}

// ── Media provider mode → canonical status ────────────────────────────

function testMediaProviderModeMapping(): void {
  console.log("\n[Media Provider Mode → Canonical Status]");

  const modes = ["live", "mock", "setup-required", "disabled", "fallback", "degraded"] as const;
  for (const m of modes) {
    const mapped = fromMediaProviderMode(m);
    assert(typeof mapped === "string", `${m} → ${mapped} (valid)`);
  }

  assertEqual(fromMediaProviderMode("live"), "live", "live → live");
  assertEqual(fromMediaProviderMode("mock"), "mock", "mock → mock");
  assertEqual(fromMediaProviderMode("setup-required"), "setup-required", "setup-required → setup-required");
  assertEqual(fromMediaProviderMode("disabled"), "unavailable", "disabled → unavailable");
  assertEqual(fromMediaProviderMode("fallback"), "fallback", "fallback → fallback");
  assertEqual(fromMediaProviderMode("degraded"), "degraded", "degraded → degraded");
}

// ── Connector status → canonical status ───────────────────────────────

function testConnectorStatusMapping(): void {
  console.log("\n[Connector Status → Canonical Status]");

  const statuses: ConnectorStatus[] = ["live", "mock", "setup-required", "degraded", "unavailable", "planned"];
  for (const s of statuses) {
    const mapped = fromConnectorStatus(s);
    assert(typeof mapped === "string", `${s} → ${mapped} (valid)`);
  }

  assertEqual(fromConnectorStatus("live"), "live", "live → live");
  assertEqual(fromConnectorStatus("mock"), "mock", "mock → mock");
  assertEqual(fromConnectorStatus("setup-required"), "setup-required", "setup-required → setup-required");
  assertEqual(fromConnectorStatus("degraded"), "degraded", "degraded → degraded");
  assertEqual(fromConnectorStatus("unavailable"), "unavailable", "unavailable → unavailable");
  assertEqual(fromConnectorStatus("planned"), "unknown", "planned → unknown");
}

// ── isUsable / isBlocking / isDegraded ────────────────────────────────

function testStatusClassificationHelpers(): void {
  console.log("\n[Status Classification Helpers]");

  const usable: Array<string> = ["live", "mock", "demo"];
  for (const s of usable) {
    assert(isUsable(s as never) === true, `isUsable: ${s} → true`);
  }
  const notUsable: Array<string> = ["setup-required", "needs-key", "unavailable", "degraded", "fallback", "unknown"];
  for (const s of notUsable) {
    assert(isUsable(s as never) === false, `isUsable: ${s} → false`);
  }

  const blocking: Array<string> = ["setup-required", "needs-key", "unavailable"];
  for (const s of blocking) {
    assert(isBlocking(s as never) === true, `isBlocking: ${s} → true`);
  }
  const notBlocking: Array<string> = ["live", "mock", "demo", "degraded", "fallback", "unknown"];
  for (const s of notBlocking) {
    assert(isBlocking(s as never) === false, `isBlocking: ${s} → false`);
  }

  const degraded: Array<string> = ["degraded", "fallback"];
  for (const s of degraded) {
    assert(isDegraded(s as never) === true, `isDegraded: ${s} → true`);
  }
  const notDegraded: Array<string> = ["live", "mock", "demo", "setup-required", "needs-key", "unavailable", "unknown"];
  for (const s of notDegraded) {
    assert(isDegraded(s as never) === false, `isDegraded: ${s} → false`);
  }
}

// ── Canonical labels and tones exhaustiveness ─────────────────────────

function testCanonicalLabelToneExhaustive(): void {
  console.log("\n[Canonical Label/Tone Exhaustiveness]");

  const statuses = Object.keys(CANONICAL_STATUS_LABELS);
  assertEqual(statuses.length, 9, "9 canonical statuses defined");

  for (const s of statuses) {
    assert(typeof CANONICAL_STATUS_LABELS[s as keyof typeof CANONICAL_STATUS_LABELS] === "string", `Label: ${s}`);
    assert(typeof CANONICAL_STATUS_TONE[s as keyof typeof CANONICAL_STATUS_TONE] === "string", `Tone: ${s}`);
  }

  // Every tone maps to a valid CSS-class-compatible string
  const tones = Object.values(CANONICAL_STATUS_TONE);
  const validTones: string[] = ["success", "warning", "danger", "muted", "neutral"];
  for (const t of tones) {
    assert(validTones.includes(t), `Tone value "${t}" is in valid set`);
  }
}

// ── No overclaim: mock/setup-required never map to "live" ─────────────

function testNoStatusOverclaim(): void {
  console.log("\n[No Status Overclaim]");

  const mockStates: Array<{ fn: (s: string) => string; label: string; inputs: string[] }> = [
    { fn: (s) => fromAgentTrustState(s as AgentTrustState), label: "agent trust", inputs: ["mock", "setup-required", "degraded", "unavailable", "planned"] },
    { fn: (s) => fromMediaProviderTrust(s as ProviderTrustLabel), label: "media trust", inputs: ["mock", "setup_required", "not_provided", "disabled", "failed", "fallback", "degraded", "unavailable"] },
    { fn: (s) => fromMediaProviderMode(s as ProviderMode), label: "media mode", inputs: ["mock", "setup-required", "disabled", "fallback", "degraded"] },
    { fn: (s) => fromConnectorStatus(s as ConnectorStatus), label: "connector", inputs: ["mock", "setup-required", "degraded", "unavailable", "planned"] },
  ];

  for (const group of mockStates) {
    for (const input of group.inputs) {
      const result = group.fn(input);
      assert(result !== "live", `${group.label}: "${input}" does NOT map to "live" (got "${result}")`);
    }
  }

  // preview → live is the only honest exception
  assertEqual(fromAgentTrustState("preview"), "live", "preview → live is intentional (workspace available)");
}

// ── Summary ───────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

// Cortex route profile mapping — unit tests
// Run with: npx tsx lib/cortex/__tests__/cortex-routes.test.ts

import {
  getAllCortexRouteProfiles,
  getCortexProfileForGatewayRoute,
  getCortexRouteProfile,
} from "../routes";
import type { CortexRouteProfile } from "../types";

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

function assertNotNull<T>(value: T | null | undefined, label: string): T {
  if (value != null) { passed += 1; return value; }
  failed += 1; console.error(`  FAIL: ${label} — value was null/undefined`);
  return null as unknown as T;
}

// ── getAllCortexRouteProfiles ──────────────────────────────────────────

{
  const profiles = getAllCortexRouteProfiles();
  assert(Array.isArray(profiles), "getAllCortexRouteProfiles returns an array");
  assert(profiles.length >= 12, "at least 12 Cortex profiles defined");
}

// ── getCortexRouteProfile ──────────────────────────────────────────────

{
  const cortex = getCortexRouteProfile("cortex");
  const profile = assertNotNull(cortex, "getCortexRouteProfile('cortex') returns non-null");
  assertEqual(profile.mode, "cortex", "cortex profile mode is 'cortex'");
  assertEqual(profile.status, "active", "cortex profile status is 'active'");
  assertEqual(profile.qualityTier, "balanced", "cortex profile qualityTier is 'balanced'");
  assertEqual(profile.costTier, "medium", "cortex profile costTier is 'medium'");
}

{
  const lite = getCortexRouteProfile("cortex-lite");
  const profile = assertNotNull(lite, "getCortexRouteProfile('cortex-lite') returns non-null");
  assertEqual(profile.status, "active", "cortex-lite profile status is 'active'");
  assertEqual(profile.qualityTier, "starter", "cortex-lite qualityTier is 'starter'");
  assert(profile.fallbackPolicy.degradedModeAllowed, "cortex-lite allows degraded mode");
}

{
  const pro = getCortexRouteProfile("cortex-pro");
  const profile = assertNotNull(pro, "getCortexRouteProfile('cortex-pro') returns non-null");
  assertEqual(profile.status, "active", "cortex-pro profile status is 'active'");
  assertEqual(profile.qualityTier, "premium", "cortex-pro qualityTier is 'premium'");
}

{
  const code = getCortexRouteProfile("code");
  const profile = assertNotNull(code, "getCortexRouteProfile('code') returns non-null");
  assertEqual(profile.status, "not_implemented", "code profile status is 'not_implemented'");
}

{
  const research = getCortexRouteProfile("research");
  const profile = assertNotNull(research, "getCortexRouteProfile('research') returns non-null");
  assertEqual(profile.status, "active", "research profile status is 'active'");
  assertEqual(profile.qualityTier, "premium", "research profile qualityTier is 'premium'");
  assertEqual(profile.costTier, "high", "research profile costTier is 'high'");
  assertEqual(profile.toolPolicy, "required", "research profile toolPolicy is 'required'");
  assertEqual(profile.verifierPolicy, "strict", "research profile verifierPolicy is 'strict'");
  assertEqual(profile.traceVisibility, "full", "research profile traceVisibility is 'full'");
}

{
  const writer = getCortexRouteProfile("writer");
  const profile = assertNotNull(writer, "getCortexRouteProfile('writer') returns non-null");
  assertEqual(profile.status, "active", "writer profile status is 'active'");
  assertEqual(profile.toolPolicy, "none", "writer profile toolPolicy is 'none'");
  assertEqual(profile.verifierPolicy, "optional", "writer profile verifierPolicy is 'optional'");
}

{
  const operator = getCortexRouteProfile("operator");
  assertNotNull(operator, "getCortexRouteProfile('operator') returns non-null");
}

{
  const result = getCortexRouteProfile(null);
  assertEqual(result, null, "getCortexRouteProfile(null) returns null");
}

{
  const result = getCortexRouteProfile("nonexistent");
  assertEqual(result, null, "getCortexRouteProfile('nonexistent') returns null");
}

// ── getCortexProfileForGatewayRoute ─────────────────────────────────────

{
  const profile = getCortexProfileForGatewayRoute("text-general");
  const p = assertNotNull(profile, "gateway text-general maps to a Cortex profile");
  assertEqual(p.id, "cortex-lite", "text-general → cortex-lite");
}

{
  const profile = getCortexProfileForGatewayRoute("text-creative");
  const p = assertNotNull(profile, "gateway text-creative maps to a Cortex profile");
  assertEqual(p.id, "cortex", "text-creative → cortex");
}

{
  const profile = getCortexProfileForGatewayRoute("text-quality");
  const p = assertNotNull(profile, "gateway text-quality maps to a Cortex profile");
  assertEqual(p.id, "cortex-pro", "text-quality → cortex-pro");
}

{
  const profile = getCortexProfileForGatewayRoute("text-reasoning");
  const p = assertNotNull(profile, "gateway text-reasoning maps to a Cortex profile");
  assertEqual(p.id, "cortex-pro", "text-reasoning → cortex-pro");
}

{
  const profile = getCortexProfileForGatewayRoute("unknown-route");
  assertEqual(profile, null, "unknown gateway route returns null Cortex profile");
}

{
  const profile = getCortexProfileForGatewayRoute(null);
  assertEqual(profile, null, "null gateway route returns null Cortex profile");
}

// ── Profile completeness checks ─────────────────────────────────────────

for (const profile of getAllCortexRouteProfiles()) {
  assert(typeof profile.id === "string" && profile.id.length > 0,
    `profile '${profile.id}' has non-empty id`);
  assert(typeof profile.label === "string" && profile.label.length > 0,
    `profile '${profile.id}' has non-empty label`);
  assert(typeof profile.shortLabel === "string" && profile.shortLabel.length > 0,
    `profile '${profile.id}' has non-empty shortLabel`);
  assert(typeof profile.description === "string" && profile.description.length > 0,
    `profile '${profile.id}' has non-empty description`);
  assert(typeof profile.mode === "string",
    `profile '${profile.id}' has mode`);
  assert(typeof profile.qualityTier === "string",
    `profile '${profile.id}' has qualityTier`);
  assert(typeof profile.costTier === "string",
    `profile '${profile.id}' has costTier`);
  assert(typeof profile.latencyTarget === "string",
    `profile '${profile.id}' has latencyTarget`);
  assert(typeof profile.toolPolicy === "string",
    `profile '${profile.id}' has toolPolicy`);
  assert(typeof profile.verifierPolicy === "string",
    `profile '${profile.id}' has verifierPolicy`);
  assert(typeof profile.traceVisibility === "string",
    `profile '${profile.id}' has traceVisibility`);
  assert(typeof profile.fallbackPolicy === "object",
    `profile '${profile.id}' has fallbackPolicy object`);
  assert(typeof profile.fallbackPolicy.enabled === "boolean",
    `profile '${profile.id}' fallbackPolicy.enabled is boolean`);
  assert(typeof profile.fallbackPolicy.maxAttempts === "number",
    `profile '${profile.id}' fallbackPolicy.maxAttempts is number`);
}

// ── All active profiles appear in gateway mapping ───────────────────────

const activeIds = getAllCortexRouteProfiles()
  .filter((p) => p.status === "active")
  .map((p) => p.id);
assert(activeIds.includes("cortex"), "cortex profile is active");
assert(activeIds.includes("cortex-lite"), "cortex-lite profile is active");
assert(activeIds.includes("cortex-pro"), "cortex-pro profile is active");
assert(activeIds.includes("research"), "research profile is active");
assert(activeIds.includes("writer"), "writer profile is active");

const gatewayRoutes = ["text-general", "text-creative", "text-quality", "text-reasoning"];
for (const gw of gatewayRoutes) {
  const cp = getCortexProfileForGatewayRoute(gw);
  assert(
    cp !== null && activeIds.includes(cp.id),
    `gateway route '${gw}' maps to active Cortex profile '${cp?.id}'`
  );
}

{
  const researchGw = getCortexProfileForGatewayRoute("research");
  const p = assertNotNull(researchGw, "gateway research maps to a Cortex profile");
  assertEqual(p.id, "research", "research → research");
  assertEqual(p.status, "active", "research gateway mapping is active");
}

// ── Not-implemented profiles have correct status ────────────────────────

const notImplemented = ["code", "computer-use", "designer", "media", "founder", "compute", "operator"];
for (const id of notImplemented) {
  const profile = getCortexRouteProfile(id);
  assert(
    profile !== null && profile.status === "not_implemented",
    `profile '${id}' is marked as 'not_implemented'`
  );
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}

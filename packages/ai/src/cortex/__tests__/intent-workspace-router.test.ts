// Intent-to-Workspace Router — unit tests
// Run with: npx tsx lib/cortex/__tests__/intent-workspace-router.test.ts

import {
  resolveIntentWorkspaceRoute,
  resolveIntentWorkspaceRoutes,
  staysInCortex,
} from "../intent-workspace-router";
import type { EthenIntent } from "../types";

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

// ── staysInCortex ──────────────────────────────────────────────────────

{
  assert(staysInCortex("general.chat"), "general.chat stays in cortex");
  assert(staysInCortex("general.reasoning"), "general.reasoning stays in cortex");
  assert(staysInCortex("unknown"), "unknown stays in cortex");
  assert(!staysInCortex("coding.inspect"), "coding.inspect does not stay in cortex");
  assert(!staysInCortex("research.web"), "research.web does not stay in cortex");
  assert(!staysInCortex("design.ui"), "design.ui does not stay in cortex");
}

// ── resolveIntentWorkspaceRoute — Coding workspace ──────────────────────

{
  const route = resolveIntentWorkspaceRoute("coding.inspect" as EthenIntent);
  assertEqual(route.workspaceSlug, "code-helper", "coding.inspect → code-helper slug");
  assertEqual(route.workspaceLabel, "Coding Agent", "coding.inspect → Coding Agent label");
  assert(route.workspaceDescription.length > 0, "coding.inspect has description");
  assert(route.trustState != null, "coding.inspect has trust state");
  assert(typeof route.available === "boolean", "coding.inspect available is boolean");
  assert(typeof route.blocked === "boolean", "coding.inspect blocked is boolean");
}

{
  const route = resolveIntentWorkspaceRoute("coding.implement" as EthenIntent);
  assertEqual(route.workspaceSlug, "code-helper", "coding.implement → code-helper");
}

{
  const route = resolveIntentWorkspaceRoute("coding.debug" as EthenIntent);
  assertEqual(route.workspaceSlug, "code-helper", "coding.debug → code-helper");
}

{
  const route = resolveIntentWorkspaceRoute("coding.review" as EthenIntent);
  assertEqual(route.workspaceSlug, "code-helper", "coding.review → code-helper");
}

// ── resolveIntentWorkspaceRoute — Browser workspace ─────────────────────

{
  const route = resolveIntentWorkspaceRoute("browser.web" as EthenIntent);
  assertEqual(route.workspaceSlug, "computer-use-agent", "browser.web → computer-use-agent");
  assertEqual(route.workspaceLabel, "Computer Use Agent", "browser.web → Computer Use Agent label");
}

{
  const route = resolveIntentWorkspaceRoute("browser.automation" as EthenIntent);
  assertEqual(route.workspaceSlug, "computer-use-agent", "browser.automation → computer-use-agent");
}

// ── resolveIntentWorkspaceRoute — Design workspace ──────────────────────

{
  const route = resolveIntentWorkspaceRoute("design.ui" as EthenIntent);
  assertEqual(route.workspaceSlug, "designer-agent", "design.ui → designer-agent");
  assertEqual(route.workspaceLabel, "Designer Agent", "design.ui → Designer Agent label");
}

{
  const route = resolveIntentWorkspaceRoute("design.brand" as EthenIntent);
  assertEqual(route.workspaceSlug, "designer-agent", "design.brand → designer-agent");
}

// ── resolveIntentWorkspaceRoute — Media workspace ───────────────────────

{
  const route = resolveIntentWorkspaceRoute("media.image" as EthenIntent);
  assertEqual(route.workspaceSlug, "media-agent", "media.image → media-agent");
  assertEqual(route.workspaceLabel, "Media Studio", "media.image → Media Studio label");
}

{
  const route = resolveIntentWorkspaceRoute("media.video" as EthenIntent);
  assertEqual(route.workspaceSlug, "media-agent", "media.video → media-agent");
}

{
  const route = resolveIntentWorkspaceRoute("media.audio" as EthenIntent);
  assertEqual(route.workspaceSlug, "media-agent", "media.audio → media-agent");
}

// ── resolveIntentWorkspaceRoute — Business workspace ────────────────────

{
  const route = resolveIntentWorkspaceRoute("business.startup" as EthenIntent);
  assertEqual(route.workspaceSlug, "founder-agent", "business.startup → founder-agent");
  assertEqual(route.workspaceLabel, "Founder Agent", "business.startup → Founder Agent label");
}

{
  const route = resolveIntentWorkspaceRoute("business.strategy" as EthenIntent);
  assertEqual(route.workspaceSlug, "founder-agent", "business.strategy → founder-agent");
}

// ── resolveIntentWorkspaceRoute — Compute workspace ─────────────────────

{
  const route = resolveIntentWorkspaceRoute("infrastructure.compute" as EthenIntent);
  assertEqual(route.workspaceSlug, "compute-agent", "infrastructure.compute → compute-agent");
  assertEqual(route.workspaceLabel, "Ethen Compute", "infrastructure.compute → Ethen Compute label");
}

{
  const route = resolveIntentWorkspaceRoute("infrastructure.deploy" as EthenIntent);
  assertEqual(route.workspaceSlug, "compute-agent", "infrastructure.deploy → compute-agent");
}

// ── resolveIntentWorkspaceRoute — Research workspace ────────────────────

{
  const route = resolveIntentWorkspaceRoute("research.web" as EthenIntent);
  assertEqual(route.workspaceSlug, "research-agent", "research.web → research-agent");
}

{
  const route = resolveIntentWorkspaceRoute("research.competitor" as EthenIntent);
  assertEqual(route.workspaceSlug, "research-agent", "research.competitor → research-agent");
}

{
  const route = resolveIntentWorkspaceRoute("research.technical" as EthenIntent);
  assertEqual(route.workspaceSlug, "research-agent", "research.technical → research-agent");
}

// ── resolveIntentWorkspaceRoute — Writing workspace ─────────────────────

{
  const route = resolveIntentWorkspaceRoute("writing.draft" as EthenIntent);
  assertEqual(route.workspaceSlug, "writing-assistant", "writing.draft → writing-assistant");
}

{
  const route = resolveIntentWorkspaceRoute("writing.rewrite" as EthenIntent);
  assertEqual(route.workspaceSlug, "writing-assistant", "writing.rewrite → writing-assistant");
}

{
  const route = resolveIntentWorkspaceRoute("writing.edit" as EthenIntent);
  assertEqual(route.workspaceSlug, "writing-assistant", "writing.edit → writing-assistant");
}

// ── resolveIntentWorkspaceRoute — General chat (stays in cortex) ────────

{
  const route = resolveIntentWorkspaceRoute("general.chat" as EthenIntent);
  assertEqual(route.workspaceSlug, null, "general.chat has no workspace slug");
  assertEqual(route.workspaceLabel, "General Chat", "general.chat → General Chat label");
  assert(route.available, "general.chat is available");
}

{
  const route = resolveIntentWorkspaceRoute("general.reasoning" as EthenIntent);
  assertEqual(route.workspaceSlug, null, "general.reasoning has no workspace slug");
}

// ── resolveIntentWorkspaceRoute — Trust state reflects AGENT_TRUST_STATES

{
  const codeRoute = resolveIntentWorkspaceRoute("coding.inspect" as EthenIntent);
  assert(
    codeRoute.trustState === "preview" || codeRoute.trustState === "mock" || codeRoute.trustState === "setup-required" || codeRoute.trustState === "live" || codeRoute.trustState === "planned",
    `code-helper has a known trust state: ${codeRoute.trustState}`
  );
}

{
  const computeRoute = resolveIntentWorkspaceRoute("infrastructure.compute" as EthenIntent);
  assertEqual(computeRoute.trustState, "setup-required", "compute-agent trust state is setup-required");
  assertEqual(computeRoute.available, false, "compute-agent is not available");
  assertEqual(computeRoute.blocked, true, "compute-agent is blocked");
}

// ── resolveIntentWorkspaceRoutes with secondary intents ─────────────────

{
  const result = resolveIntentWorkspaceRoutes({
    primaryIntent: "coding.inspect" as EthenIntent,
    secondaryIntents: ["research.web" as EthenIntent],
  });

  assertEqual(result.primary.workspaceSlug, "code-helper", "primary route is code-helper");
  assertEqual(result.secondary.length, 1, "one secondary route");
  assertEqual(result.secondary[0].workspaceSlug, "research-agent", "secondary route is research-agent");
  assert(!result.staysInCortex, "coding intent does not stay in cortex");
}

{
  const result = resolveIntentWorkspaceRoutes({
    primaryIntent: "general.chat" as EthenIntent,
    secondaryIntents: [],
  });

  assertEqual(result.primary.workspaceSlug, null, "general.chat has no workspace slug");
  assert(result.staysInCortex, "general chat stays in cortex");
}

{
  const result = resolveIntentWorkspaceRoutes({
    primaryIntent: "unknown" as EthenIntent,
    secondaryIntents: [],
  });

  assert(result.staysInCortex, "unknown stays in cortex");
}

// ── All defined intents produce a route without crashing ─────────────────

const ALL_INTENTS: EthenIntent[] = [
  "general.chat", "general.reasoning",
  "planning.product", "planning.technical",
  "coding.inspect", "coding.implement", "coding.debug", "coding.review",
  "research.web", "research.competitor", "research.technical",
  "writing.draft", "writing.rewrite", "writing.edit",
  "automation.plan", "automation.execute",
  "data.analyze", "ops.workflow",
  "browser.web", "browser.automation",
  "design.ui", "design.brand",
  "media.image", "media.video", "media.audio",
  "business.startup", "business.strategy",
  "infrastructure.compute", "infrastructure.deploy",
  "unknown",
];

for (const intent of ALL_INTENTS) {
  const route = resolveIntentWorkspaceRoute(intent);
  assert(typeof route.workspaceLabel === "string" && route.workspaceLabel.length > 0,
    `intent '${intent}' has non-empty workspaceLabel`);
  assert(typeof route.trustState === "string",
    `intent '${intent}' has a trust state`);
  assert(typeof route.available === "boolean",
    `intent '${intent}' available is boolean`);
  assert(typeof route.blocked === "boolean",
    `intent '${intent}' blocked is boolean`);
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}

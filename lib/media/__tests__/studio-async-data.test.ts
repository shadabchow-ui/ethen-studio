import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAsyncDataOutcome } from "@ethen/ui/settings/settings-data";
import {
  parseProviderHealthResponse,
  providerHealthLabel,
} from "../../../components/studio/v5/health/provider-health";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

// ── RC3: async-data outcome classifier ─────────────────────────────────

test("RC3 401/403 map to signed_out (legacy error string preserved)", () => {
  assert.deepEqual(resolveAsyncDataOutcome(401, null), { status: "signed_out", error: "signed_out" });
  assert.deepEqual(resolveAsyncDataOutcome(403, { error: "Forbidden." }), {
    status: "signed_out",
    error: "signed_out",
  });
});

test("RC3 2xx maps to ready with no error", () => {
  for (const httpStatus of [200, 201, 204]) {
    assert.deepEqual(resolveAsyncDataOutcome(httpStatus, { ok: true }), { status: "ready", error: null });
  }
});

test("RC3 503 maps to setup with human copy (never the raw code)", () => {
  assert.deepEqual(resolveAsyncDataOutcome(503, null), { status: "setup", error: "Setup is incomplete." });
  assert.deepEqual(resolveAsyncDataOutcome(503, {}), { status: "setup", error: "Setup is incomplete." });
  assert.deepEqual(resolveAsyncDataOutcome(503, { error: "setup_required" }), {
    status: "setup",
    error: "Setup is incomplete.",
  });
  assert.deepEqual(resolveAsyncDataOutcome(503, { error: "Storage is being provisioned." }), {
    status: "setup",
    error: "Storage is being provisioned.",
  });
});

test("RC3 other failures map to error with the server message or fallback", () => {
  // HTML 404 (JSON parse failed → null body): the old Skills/Connectors
  // "connection error" path now carries an explicit error status.
  assert.deepEqual(resolveAsyncDataOutcome(404, null), {
    status: "error",
    error: "Could not be loaded. Check your connection and try again.",
  });
  assert.deepEqual(resolveAsyncDataOutcome(404, {}), {
    status: "error",
    error: "Could not be loaded. Check your connection and try again.",
  });
  assert.deepEqual(resolveAsyncDataOutcome(500, { error: "Boom." }), { status: "error", error: "Boom." });
  assert.deepEqual(resolveAsyncDataOutcome(500, { error: 42 }), {
    status: "error",
    error: "Could not be loaded. Check your connection and try again.",
  });
});

test("RC3 useAsyncData exposes status and classifies through the resolver", () => {
  const data = source("packages/ui/src/settings/settings-data.ts");
  assert.ok(data.includes("status: AsyncDataStatus"), "AsyncData carries the status field");
  assert.ok(
    data.includes("resolveAsyncDataOutcome(httpStatus, body)"),
    "the hook classifies through the tested resolver",
  );
  // Backward compatibility: the legacy fields keep their shapes.
  assert.ok(data.includes("data: T | null"), "data field preserved");
  assert.ok(data.includes("error: string | null"), "error field preserved");
  assert.ok(data.includes("loading: boolean"), "loading field preserved");
});

// ── RC3: provider-health parser + labels ───────────────────────────────

const HEALTHY_ROW = {
  configured: true,
  reachable: true,
  registered: true,
  catalogQualified: true,
  workerReady: true,
  storageReady: true,
};

test("RC3 provider-health parser validates rows and rejects bad shapes", () => {
  assert.deepEqual(
    parseProviderHealthResponse({ ok: true, data: { health: { providers: { fal: HEALTHY_ROW } } } }),
    { fal: HEALTHY_ROW },
  );
  // Invalid rows are skipped, never rendered.
  assert.deepEqual(
    parseProviderHealthResponse({
      ok: true,
      data: { health: { providers: { fal: HEALTHY_ROW, bogus: { configured: "yes" } } } },
    }),
    { fal: HEALTHY_ROW },
  );
  assert.equal(parseProviderHealthResponse(null), null);
  assert.equal(parseProviderHealthResponse({}), null);
  assert.equal(parseProviderHealthResponse({ ok: true, data: null }), null);
  assert.equal(parseProviderHealthResponse({ ok: true, data: { health: null } }), null);
});

test("RC3 provider-health labels pin the unmeasured vocabulary", () => {
  assert.equal(providerHealthLabel(null, true), "Checking…");
  assert.equal(providerHealthLabel(null, false), "Unknown");
  assert.equal(providerHealthLabel(HEALTHY_ROW, false), "Live");
  assert.equal(providerHealthLabel({ ...HEALTHY_ROW, configured: false }, false), "Not configured");
});

test("RC3 provider-health hook bounds loading and names signed-out", () => {
  const hook = source("components/studio/v5/health/provider-health.ts");
  assert.ok(hook.includes("PROVIDER_HEALTH_TIMEOUT_MS"), "loading is bounded by a timeout");
  assert.ok(hook.includes("response.status === 401"), "401/403 map to signed_out, not unmeasured");
  assert.ok(hook.includes("retry"), "failures offer a retry");
});

// ── RC3: consumer wiring tripwires (browser-verified locally) ──────────

test("RC3 danger zone renders only when signed_in", () => {
  const sections = source("packages/ui/src/settings/settings-shared-sections.tsx");
  const at = sections.indexOf('label="Danger zone"');
  assert.ok(at > 0, "danger zone exists");
  assert.ok(
    sections.slice(Math.max(0, at - 400), at).includes("info?.signedIn === true"),
    "danger zone must sit behind a signed_in gate (never arms signed-out)",
  );
});

test("RC3 settings consumers branch on status, not magic strings", () => {
  const shared = source("packages/ui/src/settings/settings-shared-sections.tsx");
  assert.ok(shared.includes("account.status ==="), "AccountSection branches on account.status");
  assert.ok(shared.includes("sessions.status ==="), "Active sessions branches on sessions.status");
  assert.ok(!shared.includes('account.error === "signed_out"'), "no magic signed_out string on account");
  assert.ok(!shared.includes('sessions.error === "signed_out"'), "no magic signed_out string on sessions");
  const product = source("packages/ui/src/settings/settings-product-sections.tsx");
  assert.ok(product.includes("skills.status ==="), "Skills branches on skills.status");
  assert.ok(product.includes("connectors.status ==="), "Connectors branches on connectors.status");
});

test("RC3 rail footer no longer infers state from useAsyncData", () => {
  const chrome = source("components/studio/StudioWorkbenchChrome.tsx");
  assert.ok(!chrome.includes("useAsyncData"), "rail footer uses useStudioIdentity, not useAsyncData");
  assert.ok(chrome.includes("useStudioIdentity"), "rail footer consumes the identity hook");
});

test("RC3 catalog summary separates loading, content, and error+retry", () => {
  const home = source("components/studio/v5/discovery/StudioHome.tsx");
  assert.ok(home.includes("Loading catalog summary…"), "loading copy distinct from unavailable");
  assert.ok(home.includes("onClick={catalog.retry}"), "real errors get a Retry");
});

test("RC3 models health prompts sign-in on 401 and retries on error", () => {
  const health = source("components/studio/v5/discovery/StudioModelsHealth.tsx");
  assert.ok(health.includes("Sign in to see provider health."), "401 prompts sign-in, not unmeasured");
  assert.ok(health.includes("onClick={retry}"), "errors get a Retry");
  assert.ok(health.includes("useProviderHealth"), "view consumes the status hook");
});

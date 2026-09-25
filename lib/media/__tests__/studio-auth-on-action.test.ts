import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateStudioApiAccess,
  evaluateStudioPageAccess,
  evaluateStudioStandaloneAccess,
  isPublicAnonymousApiRead,
  isStudioEnrolled,
  STUDIO_READINESS_KEYS,
} from "../../studio-access-guard";
import {
  isStudioAuthFailure,
  requestStudioSignIn,
  STUDIO_REQUIRE_AUTH_EVENT,
  translateStudioAuthFailure,
} from "../../../components/studio/auth/studio-auth-action-core";
import { workStateForErrorCode } from "../../../components/studio/v5/work/work-api-client";
import { parseCatalogResponse } from "../../../components/studio/v5/discovery/catalog-client";

const READY_ENV: Record<string, string> = {};
for (const key of STUDIO_READINESS_KEYS) READY_ENV[key] = "true";

// ── S4C §2: anonymous page entry (no global auth wall) ───────────────────

test("S4C pages render for signed-out visitors (kill switch off)", () => {
  for (const pathname of [
    "/studio",
    "/studio/explore",
    "/studio/models",
    "/studio/create/image",
    "/studio/create/video",
    "/studio/workflows",
    "/studio/agent",
    "/studio/work/assets",
  ]) {
    const decision = evaluateStudioPageAccess({ pathname, actorId: null, organizationId: null, env: READY_ENV });
    assert.equal(decision.allowed, true, `${pathname} must render anonymously`);
  }
});

test("S4C kill switch still blocks page renders (incident master)", () => {
  const decision = evaluateStudioPageAccess({
    pathname: "/studio",
    actorId: null,
    organizationId: null,
    env: { ...READY_ENV, ETHEN_STUDIO_KILL_SWITCH: "true" },
  });
  assert.equal(decision.allowed, false);
  assert.equal((decision as { status: number }).status, 503);
  assert.equal((decision as { code: string }).code, "STUDIO_DISABLED");
});

test("S4C pages render even when readiness is unmet (readiness moved to APIs)", () => {
  const decision = evaluateStudioPageAccess({ pathname: "/studio/models", actorId: null, organizationId: null, env: {} });
  assert.equal(decision.allowed, true);
});

// ── S4C §8/§9: API boundary (auth + readiness, NO global enrollment) ─────

test("S4C API denies signed-out mutations with 401", () => {
  const decision = evaluateStudioApiAccess({
    pathname: "/api/studio/v1/jobs",
    method: "POST",
    actorId: null,
    organizationId: null,
    env: READY_ENV,
  });
  assert.equal(decision.allowed, false);
  assert.equal((decision as { status: number }).status, 401);
  assert.equal((decision as { code: string }).code, "AUTHENTICATION_REQUIRED");
});

test("S4C API admits signed-in actors WITHOUT enrollment (no manual IDs)", () => {
  const decision = evaluateStudioApiAccess({
    pathname: "/api/studio/v1/jobs",
    method: "POST",
    actorId: "user_anybody",
    organizationId: null,
    env: { ...READY_ENV, ETHEN_STUDIO_ENROLLED_ORG_IDS: "", ETHEN_STUDIO_ENROLLED_USER_IDS: "" },
  });
  assert.equal(decision.allowed, true);
});

test("S4C API keeps readiness enforcement for authenticated actors", () => {
  const env = { ...READY_ENV, ETHEN_STUDIO_FAL_READY: "false" };
  const decision = evaluateStudioApiAccess({
    pathname: "/api/studio/v1/jobs",
    method: "POST",
    actorId: "user_anybody",
    organizationId: null,
    env,
  });
  assert.equal(decision.allowed, false);
  assert.equal((decision as { code: string }).code, "STUDIO_NOT_READY");
});

test("S4C API kill switch wins over authenticated actors", () => {
  const decision = evaluateStudioApiAccess({
    pathname: "/api/studio/v1/jobs",
    method: "POST",
    actorId: "user_anybody",
    organizationId: null,
    env: { ...READY_ENV, ETHEN_STUDIO_KILL_SWITCH: "true" },
  });
  assert.equal(decision.allowed, false);
  assert.equal((decision as { code: string }).code, "STUDIO_DISABLED");
});

// ── Public anonymous reads ───────────────────────────────────────────────

test("S4C allowlist opens project-less catalog/templates GETs only", () => {
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/catalog", "GET", false), true);
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/composites/templates", "GET", false), true);
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/catalog", "GET", true), false);
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/composites/templates", "GET", true), false);
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/catalog", "POST", false), false);
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/jobs", "GET", false), false);
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/jobs", "POST", false), false);
  assert.equal(isPublicAnonymousApiRead("/api/studio/v1/agent/runs", "GET", false), false);
});

// ── Legacy shape pinned (documents the removed wall) ─────────────────────

test("S4C legacy evaluator still encodes the old page wall (deprecated)", () => {
  const decision = evaluateStudioStandaloneAccess({ pathname: "/studio", actorId: null, organizationId: null, env: READY_ENV });
  assert.equal(decision.allowed, false);
  assert.equal((decision as { code: string }).code, "AUTHENTICATION_REQUIRED");
});

test("S4C enrollment mechanism retained fail-closed for capability use", () => {
  assert.equal(isStudioEnrolled({ actorId: "user_a", organizationId: null }, {}), false);
  assert.equal(
    isStudioEnrolled({ actorId: "user_a", organizationId: null }, { ETHEN_STUDIO_ENROLLED_USER_IDS: "user_a" }),
    true,
  );
  assert.equal(
    isStudioEnrolled({ actorId: "user_a", organizationId: "org_x" }, { ETHEN_STUDIO_ENROLLED_ORG_IDS: "org_x" }),
    true,
  );
});

// ── Auth-action core: failure classification ─────────────────────────────

test("S4C auth-failure classification", () => {
  assert.equal(isStudioAuthFailure(401, null), true);
  assert.equal(isStudioAuthFailure(401, "WHATEVER"), true);
  assert.equal(isStudioAuthFailure(200, "AUTHENTICATION_REQUIRED"), true);
  assert.equal(isStudioAuthFailure(200, "unauthenticated"), true);
  assert.equal(isStudioAuthFailure(200, "UNAUTHORIZED"), true);
  assert.equal(isStudioAuthFailure(200, "signed_out"), true);
  assert.equal(isStudioAuthFailure(403, "FORBIDDEN"), false);
  assert.equal(isStudioAuthFailure(500, "INTERNAL_ERROR"), false);
  assert.equal(isStudioAuthFailure(200, "SETUP_REQUIRED"), false);
  assert.equal(isStudioAuthFailure(200, null), false);
});

test("S4C translate dispatches the modal event only for auth failures", () => {
  const seen: Array<{ type: string; action?: string }> = [];
  const target = new EventTarget();
  (globalThis as unknown as { window: unknown }).window = target;
  try {
    target.addEventListener(STUDIO_REQUIRE_AUTH_EVENT, (event) => {
      seen.push({ type: event.type, action: (event as CustomEvent<{ action?: string }>).detail?.action });
    });
    assert.equal(translateStudioAuthFailure(401, "AUTHENTICATION_REQUIRED", "create-generate"), true);
    assert.equal(translateStudioAuthFailure(500, "INTERNAL_ERROR", "create-generate"), false);
    assert.equal(translateStudioAuthFailure(403, "FORBIDDEN", "create-generate"), false);
    assert.deepEqual(seen, [{ type: STUDIO_REQUIRE_AUTH_EVENT, action: "create-generate" }]);
    requestStudioSignIn({ action: "chrome-sign-in" });
    assert.equal(seen.length, 2);
    assert.equal(seen[1].action, "chrome-sign-in");
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window;
  }
});

// ── Signed-out read states ───────────────────────────────────────────────

test("S4C work reads map auth denials to the signed-out state", () => {
  assert.equal(workStateForErrorCode("AUTHENTICATION_REQUIRED"), "permission");
  assert.equal(workStateForErrorCode("unauthenticated"), "permission");
  assert.equal(workStateForErrorCode("signed_out"), "permission");
  assert.equal(workStateForErrorCode("SETUP_REQUIRED"), "setup");
  assert.equal(workStateForErrorCode("UNKNOWN"), "error");
});

test("S4C catalog reads map auth denials to the signed-out state", () => {
  assert.equal(parseCatalogResponse({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } }).state, "permission");
  assert.equal(parseCatalogResponse({ ok: false, error: { code: "unauthenticated" } }).state, "permission");
  assert.equal(parseCatalogResponse({ ok: false, error: { code: "SETUP_REQUIRED" } }).state, "setup");
});

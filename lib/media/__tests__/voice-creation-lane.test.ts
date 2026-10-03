import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { buildOpenApiDocument } from "@ethen/studio-core/server/gateway";
import { localStores, resetLocalStores } from "../../../app/api/studio/v1/_lib/local-lane";
import {
  fixtureCountActiveSessions,
  fixtureGetSession,
  fixtureInsertSession,
  fixtureListSessions,
  fixtureStopSession,
} from "../../../app/api/studio/v1/_lib/realtime-lane";
import {
  getMemoryIdentityRepository,
  resetMemoryIdentityRepository,
} from "../../../app/api/studio/v1/_lib/memory-identity";
import { POST as cloneVoice } from "../../../app/api/studio/v1/voices/clone/route";
import { GET as listBindings } from "../../../app/api/studio/v1/voices/bindings/route";
import { GET as listSessions } from "../../../app/api/studio/v1/realtime/sessions/route";
import { POST as revokeConsent } from "../../../app/api/studio/v1/policy/consents/[consentId]/revoke/route";
import {
  STUDIO_MEDIA_API_TITLE,
  withStudioMediaApiTitle,
} from "../../../app/api/studio/v1/gateway/openapi/route";

// MUSE-004 — voice creation surface verification. The sandbox blocks
// loopback listeners, so live Tier-2 HTTP is covered by owner/CI sweep;
// this suite certifies the same flows one layer down: the exact
// fixture-lane functions the routes call, plus honest setup mapping
// (503, never 500) on every backend-less route in the voice family.

// Dev bypass + mock project auth (per-file process; no suite crosstalk).
process.env.ETHEN_DEV_AUTH_BYPASS = "1";
process.env.NODE_ENV = "development";
process.env.NEXT_PUBLIC_ETHEN_MOCK_MODE = "true";

const SCOPE = {
  scope: { tenantId: "t-voice", workspaceId: "w-voice", projectId: "p-voice" },
  projectId: "p-voice",
} as never;

function postRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readError(response: Response): Promise<{ status: number; code: string }> {
  const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: { code?: string } } | null;
  return { status: response.status, code: typeof body?.error?.code === "string" ? body.error.code : "?" };
}

test("fixture lane: realtime session lifecycle without the money leg", async () => {
  resetLocalStores();
  const lane = localStores();
  assert.deepEqual(await fixtureListSessions(lane.realtime, lane.keys, SCOPE), []);
  const row = await fixtureInsertSession(lane.realtime, lane.keys, SCOPE, {
    agentSnapshot: { agentId: "agent-1", name: "Voice Agent" },
    identityBindingId: null,
    spendCapIcu: 100,
    ceilingIcu: 1000,
    rateIcuPerSecond: 1,
    quoteId: "quote-1",
    toolScopeIds: [],
    consentGrantId: null,
    recordingRetention: "none",
    idempotencyKey: "voice-lane-1",
  } as never);
  assert.equal(row.status, "STARTING");
  assert.equal(row.reservationId, null);
  assert.equal((await fixtureGetSession(lane.realtime, lane.keys, SCOPE, row.sessionId))?.sessionId, row.sessionId);
  assert.equal((await fixtureListSessions(lane.realtime, lane.keys, SCOPE)).length, 1);
  assert.equal(await fixtureCountActiveSessions(lane.realtime, SCOPE), 1);
  // Duplicate idempotency keys conflict, matching the Supabase unique path.
  await assert.rejects(
    fixtureInsertSession(lane.realtime, lane.keys, SCOPE, {
      agentSnapshot: { agentId: "agent-1" },
      identityBindingId: null,
      spendCapIcu: 100,
      ceilingIcu: 1000,
      rateIcuPerSecond: 1,
      quoteId: "quote-2",
      toolScopeIds: [],
      consentGrantId: null,
      recordingRetention: "none",
      idempotencyKey: "voice-lane-1",
    } as never),
    /already exists/,
  );
  const stopped = await fixtureStopSession(lane.realtime, SCOPE, row.sessionId, new Date().toISOString(), 12);
  assert.equal(stopped.status, "ENDED");
  assert.equal((await fixtureGetSession(lane.realtime, lane.keys, SCOPE, row.sessionId))?.status, "ENDED");
  resetLocalStores();
});

test("memory lane: voice identity, binding, and revoke lifecycle", () => {
  resetMemoryIdentityRepository();
  const repo = getMemoryIdentityRepository();
  assert.deepEqual(repo.listIdentities(SCOPE.scope), []);
  const created = repo.createIdentity({
    scope: SCOPE.scope,
    kind: "voice",
    origin: "designed",
    name: "Lane Voice",
    payload: { flow: "design", purpose: "fixture verification", locale: "en-US", capability: "speech" },
    consentGrantId: null,
  });
  assert.ok(created.record.identityId);
  assert.equal(repo.listIdentities(SCOPE.scope).length, 1);
  // Pending binding: provider voice known, no qualified endpoint yet.
  const pending = repo.createBinding({
    scope: SCOPE.scope,
    identityId: created.record.identityId,
    identityVersion: 1,
    providerId: "fixture-provider",
    providerVoiceId: "fixture-voice-1",
    endpointId: null,
    adapterVersion: "test",
  });
  assert.equal(pending.revokedAt, null);
  assert.equal(repo.listBindings(created.record.identityId, null).length, 1);
  const revoked = repo.revokeBinding(pending.bindingId);
  assert.ok(revoked.revokedAt);
  assert.ok(repo.listBindings(created.record.identityId, null)[0]!.revokedAt);
  resetMemoryIdentityRepository();
  assert.deepEqual(getMemoryIdentityRepository().listIdentities(SCOPE.scope), []);
});

test("backend-less voice routes fail honest (503), never 500", async () => {
  const clone = await cloneVoice(postRequest("/api/studio/v1/voices/clone", {
    projectId: "00000000-0000-4000-8000-000000000000",
    flow: "design",
    name: "No Backend",
    purpose: "honesty probe",
    locale: "en-US",
    capability: "speech",
  }));
  assert.equal((await readError(clone)).status, 503);

  const bindings = await listBindings(
    new NextRequest("http://localhost/api/studio/v1/voices/bindings?projectId=00000000-0000-4000-8000-000000000000&identityId=missing"),
  );
  assert.equal((await readError(bindings)).status, 503);

  const sessions = await listSessions(
    new NextRequest("http://localhost/api/studio/v1/realtime/sessions?projectId=00000000-0000-4000-8000-000000000000"),
  );
  assert.equal((await readError(sessions)).status, 503);

  const revoke = await revokeConsent(
    postRequest("/api/studio/v1/policy/consents/c1/revoke", {
      projectId: "00000000-0000-4000-8000-000000000000",
      reason: "honesty probe",
    }),
    { params: Promise.resolve({ consentId: "c1" }) },
  );
  const revokeResult = await readError(revoke);
  assert.equal(revokeResult.status, 503);
  assert.equal(revokeResult.code, "SETUP_REQUIRED");
});

test("Studio Media API label overrides the vendored gateway title", () => {
  assert.equal(STUDIO_MEDIA_API_TITLE, "Studio Media API");
  const document = withStudioMediaApiTitle(buildOpenApiDocument());
  assert.equal(document.info.title, "Studio Media API");
  assert.equal(document.info.version, "1.0.0");
  assert.deepEqual(Object.keys(document.paths).sort(), Object.keys(buildOpenApiDocument().paths).sort());
  assert.ok(document.paths["/api/studio/v1/gateway/keys"], "route paths unchanged");
});

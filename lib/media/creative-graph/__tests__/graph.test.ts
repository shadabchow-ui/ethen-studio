/**
 * Studio V2 Job 01 — focused creative-graph slice tests.
 * Standalone tsx (mirrors lib/media/__tests__ convention): Memory repository,
 * no network, no DB. Run via `pnpm validate:studio-creative-graph`.
 *
 * Proves: idempotent create replay, revision-conflict rejection, cross-scope
 * isolation, payload reservation (no ID/scope overwrite), atomic event+outbox
 * pairing, decision-lock replay/supersede/stale rejection, legacy import
 * dry-run / apply / replay / quarantine.
 */

import { MemoryStudioRepository } from "../../persistence/studio-repository";
import { createDocument, lockDecision, readProjectGraph, updateDocument } from "../service";
import { formatRevisionRef, parseRevisionRef } from "../envelopes";
import { adaptSnapshotAssets, adaptSnapshotProjects, applyLegacyImport, planLegacyImport } from "../legacy-import";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label}`);
}

const SCOPE_A = { organizationId: "user:actor-a", projectId: "00000000-0000-4000-8000-0000000000a1", actorId: "actor-a" };
const SCOPE_B = { organizationId: "user:actor-b", projectId: "00000000-0000-4000-8000-0000000000b2", actorId: "actor-b" };

async function testIdempotentCreateReplay(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const first = await createDocument(repo, SCOPE_A, "brief", { title: "Launch brief", body: { audience: "founders" } }, "idem-key-0001");
  assert(first.replayed === false, "first create applies");
  assert(first.record.id.length > 0, "created brief has an id");
  const second = await createDocument(repo, SCOPE_A, "brief", { title: "Launch brief changed", body: {} }, "idem-key-0001");
  assert(second.replayed === true, "same key replays");
  assert(second.record.id === first.record.id, "replay returns the original row");
  const rows = await repo.list(SCOPE_A, "studio_briefs");
  assert(rows.length === 1, "replay creates no duplicate row");
  const payload = first.record.payload as Record<string, unknown>;
  assert(payload.title === "Launch brief", "replay keeps the original title");
}

async function testRevisionConflict(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const created = await createDocument(repo, SCOPE_A, "deliverable", { title: "Hero image" }, "idem-key-0002");
  const updated = await updateDocument(repo, SCOPE_A, "deliverable", created.record.id, 1, { status: "in_review" }, "idem-key-0003");
  assert((updated.record.payload as Record<string, unknown>).revision === 2, "correct CAS bumps revision to 2");
  let conflicted = false;
  try {
    await updateDocument(repo, SCOPE_A, "deliverable", created.record.id, 1, { status: "approved" }, "idem-key-0004");
  } catch (error) {
    conflicted = error instanceof Error && error.message.includes("STUDIO_REVISION_CONFLICT");
  }
  assert(conflicted, "stale expectedRevision is rejected cleanly");
  const current = await repo.get(SCOPE_A, "studio_deliverables", created.record.id);
  assert((current?.payload as Record<string, unknown>).status === "in_review", "failed CAS writes nothing");
}

async function testCrossScopeIsolation(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const inA = await createDocument(repo, SCOPE_A, "brief", { title: "A brief" }, "idem-key-0005");
  const inB = await createDocument(repo, SCOPE_B, "brief", { title: "B brief" }, "idem-key-0005");
  assert(inA.record.id !== inB.record.id, "same key in another project is a distinct row");
  assert((await repo.get(SCOPE_B, "studio_briefs", inA.record.id)) === null, "cross-project get returns null");
  const listA = await repo.list(SCOPE_A, "studio_briefs");
  assert(listA.length === 1 && listA[0]?.id === inA.record.id, "list stays scope-bound");
}

async function testPayloadReservation(): Promise<void> {
  const repo = new MemoryStudioRepository();
  await repo.insert(SCOPE_A, "studio_briefs", {
    id: "brief-reserved-1",
    payload: { title: "Reserved", project_id: "evil-project", organization_id: "evil-org", actor_id: "evil-actor", id: "evil-id", created_at: "yesterday", revision: 1, idempotency_key: "idem-key-0006" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  });
  const row = await repo.get(SCOPE_A, "studio_briefs", "brief-reserved-1");
  const payload = (row?.payload ?? {}) as Record<string, unknown>;
  assert(row?.id === "brief-reserved-1", "record id comes from the id field, not payload");
  assert(payload.project_id === undefined && payload.organization_id === undefined && payload.actor_id === undefined, "payload cannot overwrite scope fields");
  assert(payload.created_at === undefined, "payload cannot overwrite timestamps");
  assert(payload.revision === 1 && payload.idempotency_key === "idem-key-0006", "column-valued revision/key pass through");
}

async function testEventOutboxAtomicity(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const created = await createDocument(repo, SCOPE_A, "direction_spec", { title: "Tone spec" }, "idem-key-0007");
  assert(Boolean(created.event.eventId), "create returns an event receipt");
  const events = await repo.list(SCOPE_A, "studio_events");
  const outbox = await repo.list(SCOPE_A, "studio_outbox");
  assert(events.length === 1 && outbox.length === 1, "one event pairs with exactly one outbox row");
  assert((outbox[0]?.payload as Record<string, unknown>).event_id === events[0]?.id, "outbox row references the event");
  const graph = await readProjectGraph(repo, SCOPE_A);
  assert(graph.directionSpecs.length === 1 && graph.pendingOutbox === 1 && graph.latestEvents.length === 1, "graph read reflects one project graph");
}

async function testDecisionLocks(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const created = await createDocument(repo, SCOPE_A, "brief", { title: "Lockable" }, "idem-key-0008");
  const hash1 = "a".repeat(64);
  const first = await lockDecision(repo, SCOPE_A, { entityKind: "brief", entityId: created.record.id, entityRevision: 1, payloadHash: hash1 }, "idem-key-0009");
  assert(first.replayed === false, "first lock applies");
  const replay = await lockDecision(repo, SCOPE_A, { entityKind: "brief", entityId: created.record.id, entityRevision: 1, payloadHash: hash1 }, "idem-key-0010");
  assert(replay.replayed === true && replay.record.id === first.record.id, "same revision replays");
  await updateDocument(repo, SCOPE_A, "brief", created.record.id, 1, { status: "approved" }, "idem-key-0011");
  const hash2 = "b".repeat(64);
  const superseded = await lockDecision(repo, SCOPE_A, { entityKind: "brief", entityId: created.record.id, entityRevision: 2, payloadHash: hash2 }, "idem-key-0012");
  assert(superseded.replayed === false && superseded.supersededId === first.record.id, "newer revision supersedes");
  let stale = false;
  try {
    await lockDecision(repo, SCOPE_A, { entityKind: "brief", entityId: created.record.id, entityRevision: 1, payloadHash: hash1 }, "idem-key-0013");
  } catch (error) {
    stale = error instanceof Error && error.message.includes("STUDIO_REVISION_CONFLICT");
  }
  assert(stale, "older revision after supersede is rejected");
}

async function testRevisionRefs(): Promise<void> {
  assert(formatRevisionRef({ entityKind: "brief", entityId: "abc", revision: 3 }) === "brief:abc:3", "revision ref formats");
  assert(parseRevisionRef("brief:abc:3")?.revision === 3, "revision ref parses");
  assert(parseRevisionRef("brief:abc:0") === null, "zero revision rejected");
  assert(parseRevisionRef("nope") === null, "malformed ref rejected");
}

async function testLegacyImport(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const projects = adaptSnapshotProjects([{ id: "mock-project-1", name: "Legacy One", ownerId: "session-1" }]);
  const assets = adaptSnapshotAssets([{ id: "mock-asset-1", title: "Legacy shot" }]);
  assert(projects.length === 1 && assets.length === 1, "adapters inventory snapshot shapes");

  // Dry run with no ownership: everything quarantines, zero writes.
  const dry = planLegacyImport([...projects, ...assets], new Map());
  assert(dry.manifest.total === 2 && dry.manifest.quarantined === 2 && dry.manifest.mapped === 0, "no proven ownership quarantines everything");
  assert(typeof dry.manifest.contentHash === "string" && dry.manifest.contentHash.length === 64, "manifest carries a hash");
  assert((await repo.list(SCOPE_A, "studio_legacy_imports")).length === 0, "dry run writes nothing");

  // Apply with proven ownership for the project only; the evidenceless asset quarantines.
  const ownership = new Map([
    ["mock-project-1", { organizationId: SCOPE_A.organizationId, projectId: SCOPE_A.projectId, actorId: SCOPE_A.actorId }],
    ["mock-asset-1", { organizationId: SCOPE_A.organizationId, projectId: SCOPE_A.projectId, actorId: SCOPE_A.actorId }],
  ]);
  const planned = planLegacyImport([...projects, ...assets], ownership);
  assert(planned.manifest.mapped === 1 && planned.manifest.quarantined === 1, "only proven ownership maps; evidenceless asset quarantines");
  const report = await applyLegacyImport(repo, planned.plan, planned.manifest);
  assert(report.mapped === 1 && report.quarantined === 1, "apply maps one and quarantines one");
  assert(report.quarantinedReasons["no-bytes-no-evidence"] === 1, "quarantine reason recorded");

  // Replay: mapping guard makes the second apply a no-op.
  const replay = await applyLegacyImport(repo, planned.plan, planned.manifest);
  assert(replay.mapped === 0 && replay.replayed === 1 && replay.quarantined === 1, "repeated import replays without duplicates");
  const extensions = await repo.list(SCOPE_A, "studio_projects");
  assert(extensions.length === 1, "project extension created exactly once");
}

async function main(): Promise<void> {
  await testIdempotentCreateReplay();
  await testRevisionConflict();
  await testCrossScopeIsolation();
  await testPayloadReservation();
  await testEventOutboxAtomicity();
  await testDecisionLocks();
  await testRevisionRefs();
  await testLegacyImport();
  console.log(`studio creative-graph tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { createInitialItServiceDeskState } from "../fixture";
import {
  classifyTicket,
  searchServiceCatalog,
  lookupKnowledgeBase,
  draftResolution,
  routeEscalation,
  generateResolutionSummary,
  createKbDraft,
  assignKbGapOwner,
  markKbGapReviewed,
  dismissKbGap,
  proposeKbUpdateStatusChange,
} from "../actions";
import type { ItServiceDeskState } from "../state";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.error(`  FAIL: ${label}`); }
}

function makeState(): ItServiceDeskState {
  return createInitialItServiceDeskState();
}

function testFixtureIntegrity(): void {
  console.log("\n[Fixture Integrity]");
  const state = makeState();
  assert(state.tickets.length >= 5, `fixture has at least 5 tickets (got ${state.tickets.length})`);
  assert(state.tickets.some((t) => t.status === "open"), "has open tickets");
  assert(state.tickets.some((t) => t.status === "escalated"), "has escalated tickets");
  assert(state.catalogItems.length >= 3, "has catalog items");
  assert(state.kbArticles.length >= 3, "has KB articles");
  assert(state.artifacts.length === 0, "no artifacts initially");
}

function testClassifyTicket(): void {
  console.log("\n[classifyTicket]");
  const state = makeState();
  const ticket = state.tickets[0];
  const result = classifyTicket(state, ticket.id, "incident", "p2_high");
  assert(result.event.action === "classify_ticket", "event action is classify_ticket");
  const updated = result.state.tickets.find((t) => t.id === ticket.id);
  assert(updated?.category === "incident", "ticket category updated");
  assert(updated?.priority === "p2_high", "ticket priority updated");
}

function testSearchServiceCatalog(): void {
  console.log("\n[searchServiceCatalog]");
  const state = makeState();
  const result = searchServiceCatalog(state, "VPN");
  assert(result.artifact.type === "checklist", "artifact type is checklist");
  assert(result.artifact.content.includes("VPN Access Provisioning"), "catalog results include VPN");
  assert(result.state.artifacts.length === 1, "one artifact created");
}

function testSearchServiceCatalogNoMatch(): void {
  console.log("\n[searchServiceCatalog — no match]");
  const state = makeState();
  const result = searchServiceCatalog(state, "nonexistent_service_xyz");
  assert(result.artifact.content.includes("No catalog results"), "reports no results");
}

function testLookupKnowledgeBase(): void {
  console.log("\n[lookupKnowledgeBase]");
  const state = makeState();
  const result = lookupKnowledgeBase(state, "VPN");
  assert(result.artifact.type === "report", "artifact type is report");
  assert(result.artifact.content.includes("VPN Connection Troubleshooting"), "KB results include VPN article");
}

function testDraftResolution(): void {
  console.log("\n[draftResolution]");
  const state = makeState();
  const ticket = state.tickets[0];
  const result = draftResolution(state, ticket.id);
  assert(result.artifact.type === "summary", "artifact type is summary");
  assert(result.artifact.content.includes(ticket.title), "content includes ticket title");
  assert(result.state.tickets.find((t) => t.id === ticket.id)?.linkedArtifactIds.length === 1, "ticket linked to artifact");
}

function testDraftResolutionNotFound(): void {
  console.log("\n[draftResolution — not found]");
  const state = makeState();
  const result = draftResolution(state, "nonexistent-id");
  assert(result.event.summary.includes("not found"), "reports not found");
}

function testRouteEscalation(): void {
  console.log("\n[routeEscalation]");
  const state = makeState();
  const ticket = state.tickets.find((t) => t.escalationLevel === "l1");
  if (!ticket) return assert(false, "no l1 ticket found");
  const result = routeEscalation(state, ticket.id);
  assert(result.artifact.type === "recommendation", "artifact type is recommendation");
  assert(result.artifact.content.includes("Escalation Path"), "content includes escalation header");
  const updated = result.state.tickets.find((t) => t.id === ticket.id);
  assert(updated?.escalationLevel === "l2", "escalation increased to l2");
  assert(updated?.status === "escalated", "status set to escalated");
}

function testGenerateResolutionSummary(): void {
  console.log("\n[generateResolutionSummary]");
  const state = makeState();
  const ticket = state.tickets[0];
  const result = generateResolutionSummary(state, ticket.id);
  assert(result.artifact.type === "summary", "artifact type is summary");
  assert(result.artifact.content.includes("Resolution Summary"), "content includes summary header");
  const updated = result.state.tickets.find((t) => t.id === ticket.id);
  assert(updated?.status === "resolved", "ticket status set to resolved");
}

function testReceiptQuality(): void {
  console.log("\n[Receipt Quality]");
  const state = makeState();
  const r1 = classifyTicket(state, state.tickets[0].id, "incident", "p3_medium");
  assert(!r1.event.summary.includes("[object"), "receipt is not raw JSON");
  assert(r1.event.summary.startsWith("Classified"), "receipt starts clearly");
}

/* ── KB Gap Tests ── */

function testFixtureHasKbGaps(): void {
  console.log("\n[Fixture KB Gaps]");
  const state = makeState();
  assert(state.kbGaps.length >= 1, `fixture has at least 1 KB gap (got ${state.kbGaps.length})`);
  assert(state.kbGaps.some((g) => g.reason === "no_evidence"), "has no_evidence gap");
  assert(state.kbGaps.every((g) => g.suggestedArticleTitle), "every gap has suggested article title");
  assert(state.kbGaps.every((g) => g.suggestedOwner), "every gap has suggested owner");
}

function testCreateKbDraft(): void {
  console.log("\n[createKbDraft]");
  const state = makeState();
  const gap = state.kbGaps[0];
  const result = createKbDraft(state, gap.id);
  assert(result.state.proposedKbUpdates.length > 0, "proposed KB updates created");
  const updatedGap = result.state.kbGaps.find((g) => g.id === gap.id);
  assert(updatedGap?.status === "draft_created", "gap status changed to draft_created");
}

function testCreateKbDraftNotFound(): void {
  console.log("\n[createKbDraft — not found]");
  const state = makeState();
  const result = createKbDraft(state, "nonexistent-gap-id");
  assert(result.event.summary.includes("not found"), "reports not found");
}

function testAssignKbGapOwner(): void {
  console.log("\n[assignKbGapOwner]");
  const state = makeState();
  const gap = state.kbGaps[0];
  const result = assignKbGapOwner(state, gap.id, "Network Team");
  const updatedGap = result.state.kbGaps.find((g) => g.id === gap.id);
  assert(updatedGap?.suggestedOwner === "Network Team", "owner updated");
  assert(updatedGap?.status === "assigned", "status changed to assigned");
}

function testMarkKbGapReviewed(): void {
  console.log("\n[markKbGapReviewed]");
  const state = makeState();
  const gap = state.kbGaps[0];
  const result = markKbGapReviewed(state, gap.id);
  const updatedGap = result.state.kbGaps.find((g) => g.id === gap.id);
  assert(updatedGap?.status === "reviewed", "status changed to reviewed");
}

function testDismissKbGap(): void {
  console.log("\n[dismissKbGap]");
  const state = makeState();
  const gap = state.kbGaps[0];
  const result = dismissKbGap(state, gap.id);
  const updatedGap = result.state.kbGaps.find((g) => g.id === gap.id);
  assert(updatedGap?.status === "dismissed", "status changed to dismissed");
}

function testProposeKbUpdateStatus(): void {
  console.log("\n[proposeKbUpdateStatus]");
  const state = makeState();
  const gap = state.kbGaps[0];
  const withDraft = createKbDraft(state, gap.id);
  const update = withDraft.state.proposedKbUpdates[0];
  const result = proposeKbUpdateStatusChange(withDraft.state, update.id, "ready_for_review");
  const updated = result.state.proposedKbUpdates.find((u) => u.id === update.id);
  assert(updated?.status === "ready_for_review", "status changed to ready_for_review");
}

function runAll(): void {
  passed = 0; failed = 0;
  testFixtureIntegrity();
  testClassifyTicket();
  testSearchServiceCatalog();
  testSearchServiceCatalogNoMatch();
  testLookupKnowledgeBase();
  testDraftResolution();
  testDraftResolutionNotFound();
  testRouteEscalation();
  testGenerateResolutionSummary();
  testReceiptQuality();
  testFixtureHasKbGaps();
  testCreateKbDraft();
  testCreateKbDraftNotFound();
  testAssignKbGapOwner();
  testMarkKbGapReviewed();
  testDismissKbGap();
  testProposeKbUpdateStatus();
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

runAll();

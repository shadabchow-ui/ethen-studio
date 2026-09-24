import { createInitialCrmEngagementState } from "../fixture";
import {
  viewAccountHealth,
  scoreEngagement,
  generateAccountBrief,
  draftFollowUpMessage,
  proposeCrmUpdate,
  submitUpdateForApproval,
  approveProposal,
  rejectProposal,
  editProposal,
  markArtifactReviewed,
  approveArtifact,
  dismissArtifact,
} from "../actions";
import type { CrmEngagementState } from "../state";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.error(`  FAIL: ${label}`); }
}

function makeState(): CrmEngagementState {
  return createInitialCrmEngagementState();
}

/* ── Fixture Integrity ── */

function testFixtureIntegrity(): void {
  console.log("\n[Fixture Integrity]");
  const state = makeState();

  assert(state.accounts.length >= 5, `fixture has at least 5 accounts (got ${state.accounts.length})`);
  assert(state.accounts.some((a) => a.health === "healthy"), "has healthy accounts");
  assert(state.accounts.some((a) => a.health === "at_risk"), "has at-risk accounts");
  assert(state.accounts.some((a) => a.health === "watch"), "has watch accounts");
  assert(state.opportunities.length > 0, "has opportunities");
  assert(state.stakeholders.length > 0, "has stakeholders");
  assert(state.meetings.length > 0, "has meetings");
  assert(state.evidence.length > 0, "has evidence");
  assert(state.risks.length > 0, "has risks");
  assert(state.artifacts.length === 0, "no artifacts initially");
  assert(state.activityLog.length === 0, "no activity log initially");
  assert(state.updateProposals.length === 0, "no proposals initially");
  assert(state.receipts.length === 0, "no receipts initially");
  assert(Object.keys(state.artifactReviewStates).length === 0, "no review states initially");
  assert(state.activeFocusTab === "today", "default focus tab is today");
  assert(state.demoLoaded === true, "demo is loaded");

  for (const account of state.accounts) {
    assert(typeof account.id === "string" && account.id.length > 0, `account ${account.name} has valid id`);
    assert(typeof account.name === "string" && account.name.length > 0, `account has valid name`);
    assert(typeof account.owner === "string" && account.owner.length > 0, `account ${account.name} has owner`);
    assert(["healthy", "watch", "at_risk"].includes(account.health), `account ${account.name} has valid health`);
    assert(["low", "medium", "high"].includes(account.engagementScore), `account ${account.name} has valid engagement`);
    assert(typeof account.pipelineStage === "string", `account ${account.name} has pipeline stage`);
    assert(typeof account.dealValue === "number" && account.dealValue > 0, `account ${account.name} has positive deal value`);
    assert(typeof account.nextAction === "string", `account ${account.name} has next action`);
  }

  for (const opp of state.opportunities) {
    assert(typeof opp.name === "string" && opp.name.length > 0, `opportunity ${opp.name} has name`);
    assert(typeof opp.stage === "string", `opportunity ${opp.name} has stage`);
    assert(typeof opp.amount === "number" && opp.amount > 0, `opportunity ${opp.name} has positive amount`);
  }
}

/* ── No Template Leakage ── */

function testNoTemplateLeakage(): void {
  console.log("\n[No Template Leakage]");
  const state = makeState();

  for (const account of state.accounts) {
    assert(!account.name.toLowerCase().includes("lorem"), `${account.name} has no lorem ipsum`);
    assert(!account.name.toLowerCase().includes("placeholder"), `${account.name} has no placeholder text`);
    assert(!account.name.toLowerCase().includes("template"), `${account.name} has no template text`);
    assert(!account.name.toLowerCase().includes("test account"), `${account.name} has no generic label`);
    assert(!account.owner.toLowerCase().includes("placeholder"), `owner for ${account.name} is not a placeholder`);
    assert(!account.nextAction.toLowerCase().includes("lorem"), `next action for ${account.name} has no lorem`);
  }

  const r1 = viewAccountHealth(state);
  assert(!r1.event.summary.includes("[object"), "view health receipt is not raw JSON");
  assert(!r1.event.summary.includes("undefined"), "view health receipt has no undefined");

  const r3 = generateAccountBrief(state, state.accounts[0].id);
  assert(!r3.artifact.content.includes("placeholder"), "account brief has no placeholder text");
  assert(!r3.artifact.content.includes("lorem"), "account brief has no lorem ipsum");

  const r4 = draftFollowUpMessage(state, state.accounts[0].id);
  assert(!r4.artifact.content.toLowerCase().includes("project work"), "follow-up has no project work label leak");
}

/* ── Read-only Actions ── */

function testViewAccountHealth(): void {
  console.log("\n[viewAccountHealth]");
  const state = makeState();
  const result = viewAccountHealth(state);
  assert(result.event.action === "view_account_health", "event action is correct");
  assert(result.event.summary.includes("healthy"), "summary mentions healthy");
  assert(result.state.activityLog.length === 1, "activity log has one entry");
  assert(result.state.accounts.length === state.accounts.length, "accounts unchanged");
}

function testScoreEngagement(): void {
  console.log("\n[scoreEngagement]");
  const state = makeState();
  const result = scoreEngagement(state);
  assert(result.event.action === "score_engagement", "event action is correct");
  assert(result.event.summary.includes("Engagement scored"), "summary mentions scored");
  assert(result.state.activityLog.length === 1, "activity log has one entry");
}

/* ── Artifact Generation ── */

function testGenerateAccountBrief(): void {
  console.log("\n[generateAccountBrief]");
  const state = makeState();
  const account = state.accounts[0];
  const result = generateAccountBrief(state, account.id);

  assert(result.artifact.title.includes(account.name), "artifact includes account name");
  assert(result.artifact.type === "report", "artifact type is report");
  assert(result.artifact.content.includes("Account Brief"), "content includes header");
  assert(result.artifact.content.includes(account.owner), "content includes owner");
  assert(result.event.action === "generate_account_brief", "event action is correct");
  assert(result.state.artifacts.length === 1, "one artifact generated");
}

function testGenerateAccountBriefNotFound(): void {
  console.log("\n[generateAccountBrief — not found]");
  const state = makeState();
  const result = generateAccountBrief(state, "nonexistent-id");
  assert(result.event.summary.includes("not found"), "reports not found");
  assert(result.state.artifacts.length === 0, "no artifact for not-found account");
}

function testDraftFollowUpMessage(): void {
  console.log("\n[draftFollowUpMessage]");
  const state = makeState();
  const account = state.accounts[0];
  const result = draftFollowUpMessage(state, account.id);

  assert(result.artifact.type === "draft", "artifact type is draft");
  assert(result.artifact.content.includes(account.name), "content mentions account");
  assert(result.artifact.content.includes(account.owner), "content includes owner signature");
  assert(result.state.artifacts.length === 1, "one artifact generated");
}

function testDraftFollowUpNotFound(): void {
  console.log("\n[draftFollowUpMessage — not found]");
  const state = makeState();
  const result = draftFollowUpMessage(state, "nonexistent-id");
  assert(result.event.summary.includes("not found"), "reports not found");
}

/* ── CRM Update Proposals ── */

function testProposeCrmUpdate(): void {
  console.log("\n[proposeCrmUpdate]");
  const state = makeState();
  const account = state.accounts[0];
  const result = proposeCrmUpdate(state, account.id);

  assert(result.artifact.type === "recommendation", "artifact type is recommendation");
  assert(result.artifact.content.includes("CRM Update"), "content includes proposal header");
  assert(result.state.artifacts.length === 1, "one artifact generated");
  assert(result.state.updateProposals.length === 3, "3 proposals generated");
  assert(result.state.receipts.length === 1, "one receipt generated");

  for (const prop of result.state.updateProposals) {
    assert(prop.objectType === "account", "proposal is for account object");
    assert(prop.objectId === account.id, "proposal links to correct account");
    assert(prop.approvalStatus === "pending", "proposal starts pending");
    assert(typeof prop.fieldLabel === "string" && prop.fieldLabel.length > 0, "proposal has field label");
    assert(typeof prop.reason === "string" && prop.reason.length > 0, "proposal has reason");
  }
}

function testProposeCrmUpdateNotFound(): void {
  console.log("\n[proposeCrmUpdate — not found]");
  const state = makeState();
  const result = proposeCrmUpdate(state, "nonexistent-id");
  assert(result.event.summary.includes("not found"), "reports not found");
}

/* ── Approval Workflow ── */

function testApproveProposal(): void {
  console.log("\n[approveProposal]");
  const state = makeState();
  const account = state.accounts[0];
  const withProposals = proposeCrmUpdate(state, account.id).state;
  const proposalId = withProposals.updateProposals[0].id;

  const result = approveProposal(withProposals, proposalId);
  assert(result.proposal !== null, "proposal returned");
  assert(result.proposal!.approvalStatus === "approved", "proposal marked approved");
  assert(result.event.summary.includes("Recorded locally only"), "event confirms mock/local only");
}

function testApproveProposalAlreadyProcessed(): void {
  console.log("\n[approveProposal — already processed]");
  const state = makeState();
  const account = state.accounts[0];
  const withProposals = proposeCrmUpdate(state, account.id).state;
  const proposalId = withProposals.updateProposals[0].id;
  const approved = approveProposal(withProposals, proposalId).state;
  const result = approveProposal(approved, proposalId);

  assert(result.proposal === null, "second approve returns null");
  assert(result.event.summary.includes("already"), "event notes already processed");
}

function testRejectProposal(): void {
  console.log("\n[rejectProposal]");
  const state = makeState();
  const account = state.accounts[0];
  const withProposals = proposeCrmUpdate(state, account.id).state;
  const proposalId = withProposals.updateProposals[0].id;

  const result = rejectProposal(withProposals, proposalId);
  assert(result.proposal !== null, "proposal returned");
  assert(result.proposal!.approvalStatus === "rejected", "proposal marked rejected");
  assert(result.event.summary.includes("Rejected"), "event confirms rejection");
}

function testEditProposal(): void {
  console.log("\n[editProposal]");
  const state = makeState();
  const account = state.accounts[0];
  const withProposals = proposeCrmUpdate(state, account.id).state;
  const proposalId = withProposals.updateProposals[0].id;

  const result = editProposal(withProposals, proposalId, "Custom edited value");
  assert(result.proposal !== null, "proposal returned");
  assert(result.proposal!.approvalStatus === "edited", "proposal marked edited");
  assert(result.proposal!.editedValue === "Custom edited value", "edited value stored");
}

/* ── Artifact Review ── */

function testMarkArtifactReviewed(): void {
  console.log("\n[markArtifactReviewed]");
  const state = makeState();
  const account = state.accounts[0];
  const withArtifact = generateAccountBrief(state, account.id).state;
  const artifactId = withArtifact.artifacts[0].id;

  const result = markArtifactReviewed(withArtifact, artifactId);
  assert(result.state.artifactReviewStates[artifactId] === "reviewed", "artifact marked reviewed");
  assert(result.state.receipts.some((r) => r.actionType === "artifact_reviewed"), "receipt created");
}

function testApproveArtifact(): void {
  console.log("\n[approveArtifact]");
  const state = makeState();
  const account = state.accounts[0];
  const withArtifact = generateAccountBrief(state, account.id).state;
  const artifactId = withArtifact.artifacts[0].id;

  const result = approveArtifact(withArtifact, artifactId);
  assert(result.state.artifactReviewStates[artifactId] === "approved", "artifact marked approved");
  assert(result.event.summary.includes("No live action taken"), "event confirms mock behavior");
  assert(result.state.receipts.some((r) => r.actionType === "artifact_approved"), "receipt created");
}

function testDismissArtifact(): void {
  console.log("\n[dismissArtifact]");
  const state = makeState();
  const account = state.accounts[0];
  const withArtifact = generateAccountBrief(state, account.id).state;
  const artifactId = withArtifact.artifacts[0].id;

  const result = dismissArtifact(withArtifact, artifactId);
  assert(result.state.artifactReviewStates[artifactId] === "dismissed", "artifact marked dismissed");
  assert(result.state.receipts.some((r) => r.actionType === "artifact_dismissed"), "receipt created");
}

/* ── Submission ── */

function testSubmitUpdateForApproval(): void {
  console.log("\n[submitUpdateForApproval]");
  const state = makeState();
  const account = state.accounts[0];
  const withProposals = proposeCrmUpdate(state, account.id).state;
  const result = submitUpdateForApproval(withProposals, account.id);

  assert(result.event.action === "submit_update_for_approval", "event action is correct");
  assert(result.event.summary.includes("approval"), "summary mentions approval");
  assert(result.state.receipts.length > 0, "receipts generated");
}

/* ── Receipt Quality ── */

function testReceiptQuality(): void {
  console.log("\n[Receipt Quality]");
  const state = makeState();

  const r1 = viewAccountHealth(state);
  assert(!r1.event.summary.includes("[object"), "receipt is not raw JSON");

  const r2 = scoreEngagement(state);
  assert(r2.event.summary.startsWith("Engagement"), "receipt starts clearly");

  const r3 = proposeCrmUpdate(state, state.accounts[0].id);
  assert(r3.state.receipts.length > 0, "proposal creates receipts");

  const proposalId = r3.state.updateProposals[0].id;
  const r6 = approveProposal(r3.state, proposalId);
  const approvalReceipts = r6.state.receipts.filter((r) => r.actionType === "proposal_approved");
  assert(approvalReceipts.length > 0, "approval creates receipt");
}

/* ── Side Effect Isolation ── */

function testSideEffectIsolation(): void {
  console.log("\n[Side Effect Isolation]");

  const s1 = makeState();
  const r1 = viewAccountHealth(s1);
  assert(r1.state.accounts.length === s1.accounts.length, "viewHealth does not modify accounts");
  assert(JSON.stringify(r1.state.accounts) === JSON.stringify(s1.accounts), "accounts unchanged by viewHealth");

  const s2 = makeState();
  const r2 = proposeCrmUpdate(s2, s2.accounts[0].id);
  assert(r2.state.accounts[0].pipelineStage === s2.accounts[0].pipelineStage, "propose does not mutate account stage");
  assert(r2.state.accounts[0].health === s2.accounts[0].health, "propose does not mutate account health");
}

/* ── Determinism ── */

function testActionDeterminism(): void {
  console.log("\n[Action Determinism]");

  const s1 = makeState();
  const s2 = makeState();

  const r1 = generateAccountBrief(s1, s1.accounts[0].id);
  const r2 = generateAccountBrief(s2, s2.accounts[0].id);

  assert(r1.artifact.title === r2.artifact.title, "brief title is deterministic");
  assert(r1.artifact.content === r2.artifact.content, "brief content is deterministic");
  assert(r1.event.action === r2.event.action, "event action is deterministic");
}

/* ── Run All ── */

function runAll(): void {
  passed = 0; failed = 0;

  testFixtureIntegrity();
  testNoTemplateLeakage();
  testViewAccountHealth();
  testScoreEngagement();
  testGenerateAccountBrief();
  testGenerateAccountBriefNotFound();
  testDraftFollowUpMessage();
  testDraftFollowUpNotFound();
  testProposeCrmUpdate();
  testProposeCrmUpdateNotFound();
  testApproveProposal();
  testApproveProposalAlreadyProcessed();
  testRejectProposal();
  testEditProposal();
  testMarkArtifactReviewed();
  testApproveArtifact();
  testDismissArtifact();
  testSubmitUpdateForApproval();
  testReceiptQuality();
  testSideEffectIsolation();
  testActionDeterminism();

  console.log(`\n${"\u2500".repeat(40)}`);
  console.log(`Results: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

runAll();

import type {
  CrmEngagementState,
  CrmActivityEvent,
  CrmArtifact,
  CrmUpdateProposal,
  CrmActionReceipt,
  ApprovalStatus,
  ReceiptActionType,
  ArtifactReviewStatus,
  CrmOutreachDraft,
  CrmMeetingPrepPacket,
  CrmFollowUpPacket,
  CrmClosePlan,
  CrmFieldUpdateEntry,
  CrmUpdatePacket,
  CrmEvidence,
  CrmTimelineEvent,
  CrmRisk,
  CrmPriorityScore,
  CrmScoringInput,
  RiskSeverity,
  FocusTab,
  CrmRecommendation,
} from "./state";

let _evCounter = 800;
let _artCounter = 300;
let _propCounter = 100;
let _recCounter = 400;
let _odCounter = 500;
let _ppCounter = 600;
let _fpCounter = 700;
let _cpCounter = 800;
let _upCounter = 900;

function nextEventId(): string { _evCounter += 1; return `crm-evt-${_evCounter}`; }
function nextArtifactId(): string { _artCounter += 1; return `crm-art-${_artCounter}`; }
function nextProposalId(): string { _propCounter += 1; return `crm-prop-${_propCounter}`; }
function nextReceiptId(): string { _recCounter += 1; return `crm-rec-${_recCounter}`; }
function nextOutreachId(): string { _odCounter += 1; return `crm-od-${_odCounter}`; }
function nextPrepId(): string { _ppCounter += 1; return `crm-pp-${_ppCounter}`; }
function nextFollowUpId(): string { _fpCounter += 1; return `crm-fup-${_fpCounter}`; }
function nextClosePlanId(): string { _cpCounter += 1; return `crm-cp-${_cpCounter}`; }
function nextUpdatePacketId(): string { _upCounter += 1; return `crm-up-${_upCounter}`; }
function nowISO(): string { return new Date().toISOString(); }

function createEvent(
  action: string, summary: string, accountIds: string[], artifactId?: string,
): CrmActivityEvent {
  return { id: nextEventId(), timestamp: nowISO(), actor: "crm_engagement_agent", action, summary, linkedAccountIds: accountIds, artifactId };
}

function createReceipt(
  actionType: ReceiptActionType,
  title: string,
  accountId: string,
  accountName: string,
  inputsSummary: string,
  output: string,
  status: string,
  extra?: { proposalId?: string; artifactId?: string },
): CrmActionReceipt {
  return {
    id: nextReceiptId(),
    actionType,
    title,
    accountId,
    accountName,
    inputsSummary,
    output,
    status,
    createdAt: nowISO(),
    proposalId: extra?.proposalId,
    artifactId: extra?.artifactId,
  };
}

export function viewAccountHealth(
  state: CrmEngagementState,
): { state: CrmEngagementState; event: CrmActivityEvent } {
  const healthy = state.accounts.filter((a) => a.health === "healthy").length;
  const atRisk = state.accounts.filter((a) => a.health === "at_risk").length;
  const stale = state.accounts.filter((a) => a.health === "watch").length;
  const event = createEvent("view_account_health", `Account health overview: ${healthy} healthy, ${atRisk} at risk, ${stale} watch.`, state.accounts.map((a) => a.id));
  return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
}

export function scoreEngagement(
  state: CrmEngagementState,
): { state: CrmEngagementState; event: CrmActivityEvent } {
  const low = state.accounts.filter((a) => a.engagementScore === "low").length;
  const event = createEvent("score_engagement", `Engagement scored for ${state.accounts.length} accounts. ${low} account(s) need re-engagement.`, state.accounts.map((a) => a.id));

  const receipt = createReceipt(
    "engagement_scored",
    "Engagement scoring completed",
    "all",
    "All accounts",
    `${state.accounts.length} accounts`,
    `${low} account(s) need re-engagement`,
    "completed",
  );

  return { state: { ...state, activityLog: [...state.activityLog, event], receipts: [...state.receipts, receipt] }, event };
}

export function generateAccountBrief(
  state: CrmEngagementState,
  accountId: string,
): { state: CrmEngagementState; event: CrmActivityEvent; artifact: CrmArtifact } {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) {
    const event = createEvent("generate_account_brief", `Account brief generation failed: account ${accountId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, artifact: { id: "", type: "report", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedAccountIds: [] } };
  }
  const content = [
    `# Account Brief — ${account.name}`,
    `**Owner:** ${account.owner}`,
    `**Industry:** ${account.industry}`,
    `**Pipeline Stage:** ${account.pipelineStage}`,
    `**Deal Value:** $${account.dealValue.toLocaleString()}`,
    `**Health:** ${account.health.replace(/_/g, " ")}`,
    `**Engagement:** ${account.engagementScore}`,
    `**Last Contact:** ${account.lastContactDate}`,
    `**Next Action:** ${account.nextAction}`,
    ``,
    `## Talking Points`,
    `- Account is in ${account.pipelineStage} stage with $${account.dealValue.toLocaleString()} deal value.`,
    `- Engagement is ${account.engagementScore} — ${account.engagementScore === "low" ? "re-engagement campaign recommended." : "maintain current cadence."}`,
    `- Health status: ${account.health === "healthy" ? "on track." : account.health === "at_risk" ? "requires attention." : "needs re-engagement."}`,
  ].join("\n");

  const artifact: CrmArtifact = {
    id: nextArtifactId(),
    type: "report",
    title: `Account Brief — ${account.name}`,
    createdAt: nowISO(),
    sourceAction: "generate_account_brief",
    preview: `Brief for ${account.name}: ${account.pipelineStage}, $${account.dealValue.toLocaleString()}, ${account.health}.`,
    content,
    linkedAccountIds: [accountId],
  };

  const event = createEvent("generate_account_brief", `Generated account brief for ${account.name}.`, [accountId], artifact.id);

  const receipt = createReceipt(
    "account_brief_generated",
    `Account brief — ${account.name}`,
    accountId,
    account.name,
    `3 signals: ${account.health}, ${account.engagementScore} engagement, ${account.pipelineStage}`,
    `Brief generated for ${account.name}`,
    "completed",
    { artifactId: artifact.id },
  );

  const newReviewState: ArtifactReviewStatus = state.artifactReviewStates[artifact.id] ?? "unreviewed";

  return {
    state: {
      ...state,
      artifacts: [...state.artifacts, artifact],
      activityLog: [...state.activityLog, event],
      receipts: [...state.receipts, receipt],
      artifactReviewStates: { ...state.artifactReviewStates, [artifact.id]: newReviewState },
    },
    event,
    artifact,
  };
}

export function draftFollowUpMessage(
  state: CrmEngagementState,
  accountId: string,
): { state: CrmEngagementState; event: CrmActivityEvent; artifact: CrmArtifact } {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) {
    const event = createEvent("draft_follow_up_message", `Draft failed: account ${accountId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, artifact: { id: "", type: "draft", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedAccountIds: [] } };
  }

  const tone = account.engagementScore === "high" ? "warm" : account.engagementScore === "low" ? "re-engagement" : "professional";
  const content = [
    `# Follow-up Draft — ${account.name}`,
    ``,
    `**Tone:** ${tone}`,
    `**Context:** Last contacted ${account.lastContactDate} | Pipeline stage: ${account.pipelineStage}`,
    ``,
    `Hi ${account.name} team,`,
    ``,
    `Following up on our recent discussion regarding your ${account.industry} requirements.`,
    `${account.engagementScore === "low" ? "We haven't connected recently and wanted to check in on your priorities." : "I wanted to share some additional context based on our last conversation."}`,
    ``,
    `Next step: ${account.nextAction}`,
    ``,
    `Looking forward to continuing the conversation.`,
    ``,
    `Best,`,
    `${account.owner}`,
  ].join("\n");

  const artifact: CrmArtifact = {
    id: nextArtifactId(),
    type: "draft",
    title: `Follow-up Draft — ${account.name}`,
    createdAt: nowISO(),
    sourceAction: "draft_follow_up_message",
    preview: `Draft message for ${account.name} (${tone} tone). Next step: ${account.nextAction}.`,
    content,
    linkedAccountIds: [accountId],
  };

  const event = createEvent("draft_follow_up_message", `Drafted ${tone} follow-up message for ${account.name}.`, [accountId], artifact.id);

  const receipt = createReceipt(
    "draft_generated",
    `Follow-up draft — ${account.name}`,
    accountId,
    account.name,
    `Tone: ${tone}, Stage: ${account.pipelineStage}`,
    `Draft generated for ${account.name}`,
    "awaiting_review",
    { artifactId: artifact.id },
  );

  const newReviewState: ArtifactReviewStatus = state.artifactReviewStates[artifact.id] ?? "unreviewed";

  return {
    state: {
      ...state,
      artifacts: [...state.artifacts, artifact],
      activityLog: [...state.activityLog, event],
      receipts: [...state.receipts, receipt],
      artifactReviewStates: { ...state.artifactReviewStates, [artifact.id]: newReviewState },
    },
    event,
    artifact,
  };
}

export function proposeCrmUpdate(
  state: CrmEngagementState,
  accountId: string,
): { state: CrmEngagementState; event: CrmActivityEvent; artifact: CrmArtifact } {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) {
    const event = createEvent("propose_crm_update", `CRM update proposal failed: account ${accountId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, artifact: { id: "", type: "recommendation", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedAccountIds: [] } };
  }

  const proposals: CrmUpdateProposal[] = [
    {
      id: nextProposalId(),
      objectType: "account",
      objectId: accountId,
      fieldName: "pipelineStage",
      fieldLabel: "Pipeline Stage",
      currentValue: account.pipelineStage,
      proposedValue: account.health === "at_risk" ? "Negotiation" : account.pipelineStage === "Lead" ? "Discovery" : account.pipelineStage,
      editedValue: null,
      reason: "Based on engagement signals and deal momentum, stage should reflect recent activity.",
      evidenceIds: ["ev-signal-1"],
      riskLevel: "low",
      approvalStatus: "pending",
      createdAt: nowISO(),
    },
    {
      id: nextProposalId(),
      objectType: "account",
      objectId: accountId,
      fieldName: "health",
      fieldLabel: "Health Status",
      currentValue: account.health.replace(/_/g, " "),
      proposedValue: account.engagementScore === "low" ? "at risk" : account.engagementScore === "medium" ? "watch" : "healthy",
      editedValue: null,
      reason: "Health reassessed from recent engagement score and last contact recency.",
      evidenceIds: ["ev-signal-2"],
      riskLevel: "medium",
      approvalStatus: "pending",
      createdAt: nowISO(),
    },
    {
      id: nextProposalId(),
      objectType: "account",
      objectId: accountId,
      fieldName: "nextAction",
      fieldLabel: "Next Action",
      currentValue: account.nextAction,
      proposedValue: account.engagementScore === "low"
        ? "Schedule re-engagement call within 7 days"
        : `Follow up on ${account.nextAction.toLowerCase()}`,
      editedValue: null,
      reason: "Next action updated based on current engagement score and pipeline urgency.",
      evidenceIds: ["ev-signal-3"],
      riskLevel: "low",
      approvalStatus: "pending",
      createdAt: nowISO(),
    },
  ];

  const content = [
    `# CRM Update Proposal — ${account.name}`,
    ``,
    `**Account:** ${account.name}`,
    `**Owner:** ${account.owner}`,
    ``,
    ...proposals.map((p) => [
      `## ${p.fieldLabel}`,
      `- Current: ${p.currentValue}`,
      `- Proposed: ${p.proposedValue}`,
      `- Reason: ${p.reason}`,
      `- Risk: ${p.riskLevel}`,
      `- Status: ${p.approvalStatus}`,
      ``,
    ].join("\n")),
    ``,
    `*Ethen will not update CRM records until you approve the selected changes.*`,
  ].join("\n");

  const artifact: CrmArtifact = {
    id: nextArtifactId(),
    type: "recommendation",
    title: `CRM Update — ${account.name}`,
    createdAt: nowISO(),
    sourceAction: "propose_crm_update",
    preview: `Proposed CRM update for ${account.name}: ${proposals.length} field changes awaiting review.`,
    content,
    linkedAccountIds: [accountId],
  };

  const event = createEvent("propose_crm_update", `Proposed ${proposals.length} CRM field update(s) for ${account.name}. Requires approval.`, [accountId], artifact.id);

  const receipt = createReceipt(
    "proposal_submitted",
    `CRM update proposal — ${account.name}`,
    accountId,
    account.name,
    `${proposals.length} field changes proposed`,
    `Awaiting review for ${account.name}`,
    "awaiting_review",
    { artifactId: artifact.id },
  );

  const newReviewState: ArtifactReviewStatus = state.artifactReviewStates[artifact.id] ?? "unreviewed";

  return {
    state: {
      ...state,
      artifacts: [...state.artifacts, artifact],
      activityLog: [...state.activityLog, event],
      updateProposals: [...state.updateProposals, ...proposals],
      receipts: [...state.receipts, receipt],
      artifactReviewStates: { ...state.artifactReviewStates, [artifact.id]: newReviewState },
    },
    event,
    artifact,
  };
}

export function approveProposal(
  state: CrmEngagementState,
  proposalId: string,
): { state: CrmEngagementState; event: CrmActivityEvent; proposal: CrmUpdateProposal | null } {
  const idx = state.updateProposals.findIndex((p) => p.id === proposalId);
  if (idx === -1) {
    const event = createEvent("approve_proposal", `Approval failed: proposal ${proposalId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, proposal: null };
  }

  const proposal = state.updateProposals[idx];
  if (proposal.approvalStatus !== "pending") {
    const event = createEvent("approve_proposal", `Approval skipped: proposal ${proposalId} already ${proposal.approvalStatus}.`, [proposal.objectId]);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, proposal: null };
  }

  const updated: CrmUpdateProposal = {
    ...proposal,
    approvalStatus: "approved" as ApprovalStatus,
    editedValue: null,
  };

  const newProposals = state.updateProposals.map((p, i) => (i === idx ? updated : p));

  const account = state.accounts.find((a) => a.id === proposal.objectId);
  const event = createEvent("approve_proposal", `Approved CRM update: ${proposal.fieldLabel} for ${account?.name ?? proposal.objectId}. Recorded locally only.`, [proposal.objectId]);

  const effectiveValue = updated.editedValue ?? updated.proposedValue;
  const receipt = createReceipt(
    "proposal_approved",
    `Approved: ${proposal.fieldLabel} — ${account?.name ?? proposal.objectId}`,
    proposal.objectId,
    account?.name ?? proposal.objectId,
    `Current: ${proposal.currentValue}`,
    `Approved: ${effectiveValue} (mock/local only)`,
    "approved_locally",
    { proposalId: updated.id },
  );

  return {
    state: {
      ...state,
      updateProposals: newProposals,
      activityLog: [...state.activityLog, event],
      receipts: [...state.receipts, receipt],
    },
    event,
    proposal: updated,
  };
}

export function rejectProposal(
  state: CrmEngagementState,
  proposalId: string,
): { state: CrmEngagementState; event: CrmActivityEvent; proposal: CrmUpdateProposal | null } {
  const idx = state.updateProposals.findIndex((p) => p.id === proposalId);
  if (idx === -1) {
    const event = createEvent("reject_proposal", `Rejection failed: proposal ${proposalId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, proposal: null };
  }

  const proposal = state.updateProposals[idx];
  if (proposal.approvalStatus !== "pending") {
    const event = createEvent("reject_proposal", `Rejection skipped: proposal ${proposalId} already ${proposal.approvalStatus}.`, [proposal.objectId]);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, proposal: null };
  }

  const updated: CrmUpdateProposal = {
    ...proposal,
    approvalStatus: "rejected" as ApprovalStatus,
  };

  const newProposals = state.updateProposals.map((p, i) => (i === idx ? updated : p));

  const account = state.accounts.find((a) => a.id === proposal.objectId);
  const event = createEvent("reject_proposal", `Rejected CRM update: ${proposal.fieldLabel} for ${account?.name ?? proposal.objectId}.`, [proposal.objectId]);

  const receipt = createReceipt(
    "proposal_rejected",
    `Rejected: ${proposal.fieldLabel} — ${account?.name ?? proposal.objectId}`,
    proposal.objectId,
    account?.name ?? proposal.objectId,
    `Proposed: ${proposal.proposedValue}`,
    `Rejected, no change applied`,
    "rejected",
    { proposalId: updated.id },
  );

  return {
    state: {
      ...state,
      updateProposals: newProposals,
      activityLog: [...state.activityLog, event],
      receipts: [...state.receipts, receipt],
    },
    event,
    proposal: updated,
  };
}

export function editProposal(
  state: CrmEngagementState,
  proposalId: string,
  editedValue: string,
): { state: CrmEngagementState; event: CrmActivityEvent; proposal: CrmUpdateProposal | null } {
  const idx = state.updateProposals.findIndex((p) => p.id === proposalId);
  if (idx === -1) {
    const event = createEvent("edit_proposal", `Edit failed: proposal ${proposalId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, proposal: null };
  }

  const proposal = state.updateProposals[idx];
  if (proposal.approvalStatus !== "pending") {
    const event = createEvent("edit_proposal", `Edit skipped: proposal ${proposalId} already ${proposal.approvalStatus}.`, [proposal.objectId]);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, proposal: null };
  }

  const updated: CrmUpdateProposal = {
    ...proposal,
    editedValue,
    approvalStatus: "edited" as ApprovalStatus,
  };

  const newProposals = state.updateProposals.map((p, i) => (i === idx ? updated : p));

  const account = state.accounts.find((a) => a.id === proposal.objectId);
  const event = createEvent("edit_proposal", `Edited CRM update: ${proposal.fieldLabel} for ${account?.name ?? proposal.objectId}. Original proposed "${proposal.proposedValue}", edited to "${editedValue}".`, [proposal.objectId]);

  const receipt = createReceipt(
    "proposal_edited",
    `Edited: ${proposal.fieldLabel} — ${account?.name ?? proposal.objectId}`,
    proposal.objectId,
    account?.name ?? proposal.objectId,
    `Original proposed: ${proposal.proposedValue}`,
    `Edited to: ${editedValue} (pending review)`,
    "edited_pending",
    { proposalId: updated.id },
  );

  return {
    state: {
      ...state,
      updateProposals: newProposals,
      activityLog: [...state.activityLog, event],
      receipts: [...state.receipts, receipt],
    },
    event,
    proposal: updated,
  };
}

export function submitUpdateForApproval(
  state: CrmEngagementState,
  accountId: string,
): { state: CrmEngagementState; event: CrmActivityEvent } {
  const account = state.accounts.find((a) => a.id === accountId);
  const pendingProposals = state.updateProposals.filter(
    (p) => p.objectId === accountId && p.approvalStatus === "pending",
  );
  const event = createEvent(
    "submit_update_for_approval",
    `Submitted ${pendingProposals.length} CRM update proposal(s) for ${account?.name ?? accountId} to approval queue. Review before applying.`,
    accountId ? [accountId] : [],
  );
  const receipt = createReceipt(
    "proposal_submitted",
    `Submission — ${account?.name ?? accountId}`,
    accountId,
    account?.name ?? accountId,
    `${pendingProposals.length} pending proposal(s)`,
    `Submitted for review — no CRM records changed`,
    "submitted",
  );
  return {
    state: {
      ...state,
      activityLog: [...state.activityLog, event],
      receipts: [...state.receipts, receipt],
    },
    event,
  };
}

export function markArtifactReviewed(
  state: CrmEngagementState,
  artifactId: string,
): { state: CrmEngagementState; event: CrmActivityEvent } {
  const artifact = state.artifacts.find((a) => a.id === artifactId);
  if (!artifact) {
    const event = createEvent("mark_artifact_reviewed", `Review failed: artifact ${artifactId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
  }

  const account = state.accounts.find((a) => a.id === artifact.linkedAccountIds[0]);
  const event = createEvent("mark_artifact_reviewed", `Marked "${artifact.title}" as reviewed.`, artifact.linkedAccountIds, artifactId);

  const receipt = createReceipt(
    "artifact_reviewed",
    `Reviewed: ${artifact.title}`,
    account?.id ?? artifact.linkedAccountIds[0] ?? "",
    account?.name ?? artifact.linkedAccountIds[0] ?? "",
    `${artifact.type} artifact`,
    `Marked as reviewed`,
    "reviewed",
    { artifactId },
  );

  return {
    state: {
      ...state,
      activityLog: [...state.activityLog, event],
      artifactReviewStates: { ...state.artifactReviewStates, [artifactId]: "reviewed" },
      receipts: [...state.receipts, receipt],
    },
    event,
  };
}

export function approveArtifact(
  state: CrmEngagementState,
  artifactId: string,
): { state: CrmEngagementState; event: CrmActivityEvent } {
  const artifact = state.artifacts.find((a) => a.id === artifactId);
  if (!artifact) {
    const event = createEvent("approve_artifact", `Approval failed: artifact ${artifactId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
  }

  const account = state.accounts.find((a) => a.id === artifact.linkedAccountIds[0]);
  const event = createEvent("approve_artifact", `Approved "${artifact.title}". No live action taken.`, artifact.linkedAccountIds, artifactId);

  const receipt = createReceipt(
    "artifact_approved",
    `Approved: ${artifact.title}`,
    account?.id ?? artifact.linkedAccountIds[0] ?? "",
    account?.name ?? artifact.linkedAccountIds[0] ?? "",
    `${artifact.type} artifact`,
    `Approved locally (mock mode — no live CRM write or send)`,
    "approved_locally",
    { artifactId },
  );

  return {
    state: {
      ...state,
      activityLog: [...state.activityLog, event],
      artifactReviewStates: { ...state.artifactReviewStates, [artifactId]: "approved" },
      receipts: [...state.receipts, receipt],
    },
    event,
  };
}

export function dismissArtifact(
  state: CrmEngagementState,
  artifactId: string,
): { state: CrmEngagementState; event: CrmActivityEvent } {
  const artifact = state.artifacts.find((a) => a.id === artifactId);
  if (!artifact) {
    const event = createEvent("dismiss_artifact", `Dismiss failed: artifact ${artifactId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
  }

  const account = state.accounts.find((a) => a.id === artifact.linkedAccountIds[0]);
  const event = createEvent("dismiss_artifact", `Dismissed "${artifact.title}".`, artifact.linkedAccountIds, artifactId);

  const receipt = createReceipt(
    "artifact_dismissed",
    `Dismissed: ${artifact.title}`,
    account?.id ?? artifact.linkedAccountIds[0] ?? "",
    account?.name ?? artifact.linkedAccountIds[0] ?? "",
    `${artifact.type} artifact`,
    `Dismissed, no action taken`,
    "dismissed",
    { artifactId },
  );

  return {
    state: {
      ...state,
      activityLog: [...state.activityLog, event],
      artifactReviewStates: { ...state.artifactReviewStates, [artifactId]: "dismissed" },
      receipts: [...state.receipts, receipt],
    },
    event,
  };
}

export function draftOutreach(
  state: CrmEngagementState,
  recommendationId: string,
  options: { goal: string; recipient: string; tone: string; cta: string; talkingPoints: string[] } = { goal: "Re-engage", recipient: "Stakeholder", tone: "professional", cta: "Schedule a call", talkingPoints: [] },
): { state: CrmEngagementState; event: CrmActivityEvent; outreachDraft: CrmOutreachDraft; artifact: CrmArtifact } {
  const accountId = state.accounts.find((a) => a.id === recommendationId)?.id ?? state.accounts[0]?.id ?? "";
  const account = state.accounts.find((a) => a.id === accountId);
  const body = [
    `Subject: ${options.goal} — ${account?.name ?? "Follow-up"}`,
    ``,
    `Hi ${options.recipient},`,
    ``,
    `${options.goal === "Re-engage" ? "I wanted to reconnect and explore how we can support your current priorities." : `Following up on our recent discussion about ${account?.industry ?? "your requirements"}.`}`,
    ...options.talkingPoints.map((tp) => `- ${tp}`),
    ``,
    options.cta ? `Next step: ${options.cta}` : `Looking forward to your thoughts.`,
    ``,
    `Best,`,
    `${account?.owner ?? "Your team"}`,
  ].join("\n");

  const evidenceIds = state.evidence.filter((e) => e.accountId === accountId).map((e) => e.id);

  const outreachDraft: CrmOutreachDraft = {
    id: nextOutreachId(),
    recommendationId,
    accountId,
    goal: options.goal,
    recipient: options.recipient,
    tone: options.tone,
    cta: options.cta,
    talkingPoints: options.talkingPoints,
    body,
    evidenceIds,
    createdAt: nowISO(),
  };

  const artifact: CrmArtifact = {
    id: nextArtifactId(),
    type: "outreach_draft",
    title: `Outreach: ${options.goal} — ${account?.name ?? "Draft"}`,
    createdAt: nowISO(),
    sourceAction: "draft_outreach",
    preview: `Outreach draft for ${options.recipient}. Tone: ${options.tone}. CTA: ${options.cta}.`,
    content: body,
    linkedAccountIds: accountId ? [accountId] : [],
  };

  const event = createEvent("draft_outreach", `Drafted outreach (${options.goal}) for ${options.recipient}.`, accountId ? [accountId] : [], artifact.id);
  const receipt = createReceipt(
    "outreach_drafted",
    `Outreach draft — ${account?.name ?? "Draft"}`,
    accountId,
    account?.name ?? "Draft",
    `Goal: ${options.goal}, Tone: ${options.tone}, CTA: ${options.cta}`,
    `Outreach draft generated for ${options.recipient}`,
    "completed",
    { artifactId: artifact.id },
  );

  const newReviewState: ArtifactReviewStatus = state.artifactReviewStates[artifact.id] ?? "unreviewed";

  return {
    state: {
      ...state,
      outreachDrafts: [...state.outreachDrafts, outreachDraft],
      artifacts: [...state.artifacts, artifact],
      activityLog: [...state.activityLog, event],
      receipts: [...state.receipts, receipt],
      artifactReviewStates: { ...state.artifactReviewStates, [artifact.id]: newReviewState },
    },
    event,
    outreachDraft,
    artifact,
  };
}

export function prepareMeeting(
  state: CrmEngagementState,
  meetingId: string,
): { state: CrmEngagementState; event: CrmActivityEvent; prepPacket: CrmMeetingPrepPacket; artifact: CrmArtifact } {
  const meeting = state.meetings.find((m) => m.id === meetingId);
  if (!meeting) {
    const event = createEvent("prepare_meeting", `Meeting prep failed: meeting ${meetingId} not found.`, []);
    const emptyPacket: CrmMeetingPrepPacket = { id: "", meetingId, accountId: "", meetingGoal: "", accountContext: "", opportunityStatus: "", peopleInRoom: [], risks: [], likelyQuestions: [], recommendedAsks: [], followUpPlan: "", createdAt: "" };
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, prepPacket: emptyPacket, artifact: { id: "", type: "meeting_prep", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedAccountIds: [] } };
  }

  const account = state.accounts.find((a) => a.id === meeting.accountId);
  const opp = state.opportunities.find((o) => o.id === meeting.opportunityId);

  const prepPacket: CrmMeetingPrepPacket = {
    id: nextPrepId(),
    meetingId,
    accountId: meeting.accountId,
    meetingGoal: `Review ${meeting.subject}`,
    accountContext: `${account?.name ?? "Account"} is in ${account?.pipelineStage ?? "active"} stage with ${account ? `$${account.dealValue.toLocaleString()}` : "active"} deal value. Owner: ${account?.owner ?? "Unassigned"}.`,
    opportunityStatus: opp ? `Stage: ${opp.stage}, Amount: $${opp.amount.toLocaleString()}, Close: ${opp.closeDate}, Confidence: ${opp.confidence}%.` : "No linked opportunity.",
    peopleInRoom: meeting.attendees,
    risks: opp?.warnings?.length ? opp.warnings : ["No known risks identified for this meeting."],
    likelyQuestions: [
      "What is the timeline for implementation?",
      "How does pricing scale with usage?",
      "What security certifications do you hold?",
      "How is the onboarding process structured?",
    ],
    recommendedAsks: [
      `Confirm next steps for ${account?.nextAction ?? "moving forward"}`,
      "Identify any additional stakeholders who need to be involved",
      "Set a timeline for the next check-in",
    ],
    followUpPlan: "Send meeting summary within 24 hours. Create CRM task for follow-up items. Schedule next touchpoint.",
    createdAt: nowISO(),
  };

  const content = [
    `# Meeting Prep — ${meeting.subject}`,
    ``,
    `## Meeting Goal`,
    prepPacket.meetingGoal,
    ``,
    `## Account Context`,
    prepPacket.accountContext,
    ``,
    `## Opportunity Status`,
    prepPacket.opportunityStatus,
    ``,
    `## People in the Room`,
    ...prepPacket.peopleInRoom.map((p) => `- ${p}`),
    ``,
    `## Risks / Watch-outs`,
    ...prepPacket.risks.map((r) => `- ${r}`),
    ``,
    `## Likely Customer Questions`,
    ...prepPacket.likelyQuestions.map((q) => `- ${q}`),
    ``,
    `## Recommended Asks`,
    ...prepPacket.recommendedAsks.map((a) => `- ${a}`),
    ``,
    `## Follow-up Plan`,
    prepPacket.followUpPlan,
  ].join("\n");

  const artifact: CrmArtifact = {
    id: nextArtifactId(),
    type: "meeting_prep",
    title: `Meeting Prep — ${meeting.subject}`,
    createdAt: nowISO(),
    sourceAction: "prepare_meeting",
    preview: `Prep packet for ${meeting.subject} with ${prepPacket.peopleInRoom.length} attendees.`,
    content,
    linkedAccountIds: [meeting.accountId],
  };

  const updatedMeetings = state.meetings.map((m) =>
    m.id === meetingId ? { ...m, prepStatus: "prepared" as const } : m
  );

  const event = createEvent("prepare_meeting", `Prepared meeting packet for "${meeting.subject}".`, [meeting.accountId], artifact.id);
  const receipt = createReceipt(
    "meeting_prepared",
    `Meeting prep — ${meeting.subject}`,
    meeting.accountId,
    account?.name ?? meeting.accountId,
    `${prepPacket.peopleInRoom.length} attendees, ${prepPacket.risks.length} risks identified`,
    `Prep packet generated for ${meeting.subject}`,
    "completed",
    { artifactId: artifact.id },
  );

  const newReviewState: ArtifactReviewStatus = state.artifactReviewStates[artifact.id] ?? "unreviewed";

  return {
    state: {
      ...state,
      meetings: updatedMeetings,
      meetingPrepPackets: [...state.meetingPrepPackets, prepPacket],
      artifacts: [...state.artifacts, artifact],
      activityLog: [...state.activityLog, event],
      receipts: [...state.receipts, receipt],
      artifactReviewStates: { ...state.artifactReviewStates, [artifact.id]: newReviewState },
    },
    event,
    prepPacket,
    artifact,
  };
}

export function createClosePlan(
  state: CrmEngagementState,
  opportunityId: string,
): { state: CrmEngagementState; event: CrmActivityEvent; closePlan: CrmClosePlan; artifact: CrmArtifact } {
  const opp = state.opportunities.find((o) => o.id === opportunityId);
  if (!opp) {
    const event = createEvent("create_close_plan", `Close plan failed: opportunity ${opportunityId} not found.`, []);
    const emptyPlan: CrmClosePlan = { id: "", opportunityId, accountId: "", goal: "", milestones: [], blockers: [], stakeholders: [], nextSteps: [], ownerActions: [], createdAt: "" };
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, closePlan: emptyPlan, artifact: { id: "", type: "close_plan", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedAccountIds: [] } };
  }

  const account = state.accounts.find((a) => a.id === opp.accountId);
  const stakeholders = state.stakeholders.filter((s) => s.accountId === opp.accountId);

  const closePlan: CrmClosePlan = {
    id: nextClosePlanId(),
    opportunityId,
    accountId: opp.accountId,
    goal: `Close ${opp.name} by ${opp.closeDate}`,
    milestones: [
      `Confirm stakeholder alignment by ${opp.closeDate}`,
      `Address all ${opp.warnings.length} identified risks`,
      "Deliver final proposal and pricing",
      "Obtain signed agreement",
    ],
    blockers: opp.warnings.length ? opp.warnings : ["No blockers identified"],
    stakeholders: stakeholders.map((s) => `${s.name} (${s.title})`),
    nextSteps: [
      opp.nextAction,
      "Schedule executive alignment meeting",
      "Prepare final proposal package",
    ],
    ownerActions: [
      `${opp.owner}: Drive next steps`,
      "Legal: Review contract terms",
      `Procurement: Finalize vendor assessment`,
    ],
    createdAt: nowISO(),
  };

  const content = [
    `# Close Plan — ${opp.name}`,
    ``,
    `**Goal:** ${closePlan.goal}`,
    ``,
    `## Milestones`,
    ...closePlan.milestones.map((m) => `- ${m}`),
    ``,
    `## Blockers`,
    ...closePlan.blockers.map((b) => `- ${b}`),
    ``,
    `## Stakeholders`,
    ...closePlan.stakeholders.map((s) => `- ${s}`),
    ``,
    `## Next Steps`,
    ...closePlan.nextSteps.map((ns) => `- ${ns}`),
    ``,
    `## Owner Actions`,
    ...closePlan.ownerActions.map((oa) => `- ${oa}`),
  ].join("\n");

  const artifact: CrmArtifact = {
    id: nextArtifactId(),
    type: "close_plan",
    title: `Close Plan — ${opp.name}`,
    createdAt: nowISO(),
    sourceAction: "create_close_plan",
    preview: `Close plan for ${opp.name}: $${opp.amount.toLocaleString()}, ${opp.stage}, ${opp.warnings.length} warnings.`,
    content,
    linkedAccountIds: [opp.accountId],
  };

  const event = createEvent("create_close_plan", `Created close plan for "${opp.name}".`, [opp.accountId], artifact.id);
  const receipt = createReceipt(
    "close_plan_created",
    `Close plan — ${opp.name}`,
    opp.accountId,
    account?.name ?? opp.accountId,
    `${closePlan.milestones.length} milestones, ${closePlan.blockers.length} blockers`,
    `Close plan generated for ${opp.name}`,
    "completed",
    { artifactId: artifact.id },
  );

  const newReviewState: ArtifactReviewStatus = state.artifactReviewStates[artifact.id] ?? "unreviewed";

  return {
    state: {
      ...state,
      closePlans: [...state.closePlans, closePlan],
      artifacts: [...state.artifacts, artifact],
      activityLog: [...state.activityLog, event],
      receipts: [...state.receipts, receipt],
      artifactReviewStates: { ...state.artifactReviewStates, [artifact.id]: newReviewState },
    },
    event,
    closePlan,
    artifact,
  };
}

export function createCrmUpdatePacket(
  state: CrmEngagementState,
  opportunityId: string,
): { state: CrmEngagementState; event: CrmActivityEvent; updatePacket: CrmUpdatePacket; artifact: CrmArtifact } {
  const opp = state.opportunities.find((o) => o.id === opportunityId);
  if (!opp) {
    const event = createEvent("create_crm_update_packet", `CRM update packet failed: opportunity ${opportunityId} not found.`, []);
    const emptyPacket: CrmUpdatePacket = { id: "", opportunityId, accountId: "", fieldUpdates: [], createdAt: "" };
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, updatePacket: emptyPacket, artifact: { id: "", type: "crm_update_packet", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedAccountIds: [] } };
  }

  const account = state.accounts.find((a) => a.id === opp.accountId);
  const evidenceIds = state.evidence.filter((e) => e.accountId === opp.accountId).map((e) => e.id);

  const fieldUpdates: CrmFieldUpdateEntry[] = [
    { field: "Next Step", currentValue: account?.nextAction ?? "\u2014", proposedValue: opp.nextAction, reason: `Opportunity next action needs to reflect current stage (${opp.stage}).`, evidenceIds },
    { field: "Stage", currentValue: account?.pipelineStage ?? "\u2014", proposedValue: opp.stage, reason: "Opportunity stage has progressed in pipeline review.", evidenceIds },
    { field: "Close Date", currentValue: "\u2014", proposedValue: opp.closeDate, reason: "Target close date based on opportunity record.", evidenceIds },
  ];

  if (opp.warnings.length > 0) {
    fieldUpdates.push({
      field: "Risk Status",
      currentValue: "\u2014",
      proposedValue: opp.health === "at_risk" ? "At Risk" : opp.health === "watch" ? "Watch" : "Healthy",
      reason: `Warnings detected: ${opp.warnings.join(", ")}.`,
      evidenceIds,
    });
  }

  const updatePacket: CrmUpdatePacket = {
    id: nextUpdatePacketId(),
    opportunityId,
    accountId: opp.accountId,
    fieldUpdates,
    createdAt: nowISO(),
  };

  const content = [
    `# CRM Update Packet — ${opp.name}`,
    ``,
    `**Proposed field updates:**`,
    ...fieldUpdates.map((fu) => [
      `---`,
      `**Field:** ${fu.field}`,
      `**Current:** ${fu.currentValue || "\u2014"}`,
      `**Proposed:** ${fu.proposedValue}`,
      `**Reason:** ${fu.reason}`,
      `**Evidence sources:** ${fu.evidenceIds.length}`,
    ].join("\n")),
    ``,
    `---`,
    ``,
    `*Draft proposal only. No CRM records will be updated until changes are approved.*`,
  ].join("\n");

  const artifact: CrmArtifact = {
    id: nextArtifactId(),
    type: "crm_update_packet",
    title: `CRM Update Packet — ${opp.name}`,
    createdAt: nowISO(),
    sourceAction: "create_crm_update_packet",
    preview: `CRM update packet for ${opp.name}: ${fieldUpdates.length} proposed field changes.`,
    content,
    linkedAccountIds: [opp.accountId],
  };

  const event = createEvent("create_crm_update_packet", `Created CRM update packet for "${opp.name}" with ${fieldUpdates.length} proposed changes.`, [opp.accountId], artifact.id);
  const receipt = createReceipt(
    "update_packet_created",
    `CRM update packet — ${opp.name}`,
    opp.accountId,
    account?.name ?? opp.accountId,
    `${fieldUpdates.length} field updates proposed`,
    `Update packet generated for ${opp.name}`,
    "completed",
    { artifactId: artifact.id },
  );

  const newReviewState: ArtifactReviewStatus = state.artifactReviewStates[artifact.id] ?? "unreviewed";

  return {
    state: {
      ...state,
      updatePackets: [...state.updatePackets, updatePacket],
      artifacts: [...state.artifacts, artifact],
      activityLog: [...state.activityLog, event],
      receipts: [...state.receipts, receipt],
      artifactReviewStates: { ...state.artifactReviewStates, [artifact.id]: newReviewState },
    },
    event,
    updatePacket,
    artifact,
  };
}

export function saveActionReceipt(
  state: CrmEngagementState,
  actionType: string,
  summary: string,
  evidenceIds: string[],
  linkedAccountIds: string[],
  artifactId?: string,
): { state: CrmEngagementState; receipt: CrmActionReceipt; event: CrmActivityEvent } {
  const receipt = createReceipt(
    "receipt_saved",
    `Receipt: ${summary}`,
    linkedAccountIds[0] ?? "",
    state.accounts.find((a) => a.id === linkedAccountIds[0])?.name ?? "",
    actionType,
    summary,
    "completed",
    { artifactId },
  );

  const event = createEvent("save_action_receipt", `Receipt saved: ${summary}`, linkedAccountIds, artifactId);
  return {
    state: {
      ...state,
      receipts: [...state.receipts, receipt],
      activityLog: [...state.activityLog, event],
    },
    receipt,
    event,
  };
}

/* ── Job 2: Evidence/Timeline/Risk Lookups ── */

export function getEvidenceForAccount(
  state: CrmEngagementState,
  accountId: string,
): { state: CrmEngagementState; evidence: CrmEvidence[]; event: CrmActivityEvent } {
  const evidence = state.evidence.filter((e) => e.accountId === accountId);
  const event = createEvent("get_evidence", `Retrieved ${evidence.length} evidence items for account ${accountId}.`, [accountId]);
  return { state: { ...state, activityLog: [...state.activityLog, event] }, evidence, event };
}

export function getTimelineForAccount(
  state: CrmEngagementState,
  accountId: string,
): { state: CrmEngagementState; timeline: CrmTimelineEvent[]; event: CrmActivityEvent } {
  const timeline = state.timelineEvents.filter((t) => t.accountId === accountId);
  const event = createEvent("get_timeline", `Retrieved ${timeline.length} timeline events for account ${accountId}.`, [accountId]);
  return { state: { ...state, activityLog: [...state.activityLog, event] }, timeline, event };
}

export function getRisksForAccount(
  state: CrmEngagementState,
  accountId: string,
): { state: CrmEngagementState; risks: CrmRisk[]; event: CrmActivityEvent } {
  const risks = state.risks.filter((r) => r.linkedAccountId === accountId);
  const event = createEvent("get_risks", `Retrieved ${risks.length} risks for account ${accountId}.`, [accountId]);
  return { state: { ...state, activityLog: [...state.activityLog, event] }, risks, event };
}

export function getEvidenceById(
  state: CrmEngagementState,
  evidenceId: string,
): CrmEvidence | undefined {
  return state.evidence.find((e) => e.id === evidenceId);
}

/* ── Job 2: Deterministic Scoring ── */

export function prioritizeOpportunities(
  state: CrmEngagementState,
): { state: CrmEngagementState; scores: CrmPriorityScore[]; event: CrmActivityEvent } {
  const scores: CrmPriorityScore[] = state.accounts.map((account) => {
    const evidenceCount = state.evidence.filter((e) => e.accountId === account.id).length;
    const riskCount = state.risks.filter((r) => r.linkedAccountId === account.id).length;
    const timelineCount = state.timelineEvents.filter((t) => t.accountId === account.id).length;

    const healthMult: Record<string, { impact: number; urgency: number }> = {
      healthy: { impact: 0.6, urgency: 0.3 },
      at_risk: { impact: 0.9, urgency: 0.9 },
      watch: { impact: 0.5, urgency: 0.4 },
    };
    const hw = healthMult[account.health] ?? { impact: 0.5, urgency: 0.5 };
    const engagementMult: Record<string, number> = { low: 0.3, medium: 0.6, high: 0.9 };
    const valueScore = Math.min(account.dealValue / 500000, 1.0);

    const impactScore = 0.5 * hw.impact + 0.3 * valueScore + 0.2 * engagementMult[account.engagementScore];
    const urgencyScore = hw.urgency * (1 - Math.min(account.dealValue / 1000000, 0.3));
    const confidenceScore = Math.min(evidenceCount / 5, 1.0) * 0.8 + 0.2;
    const engagementDeltaScore = account.health === "at_risk" ? 0.8 : account.health === "watch" ? 0.4 : 0.6;
    const effortReductionScore = Math.min(timelineCount / 8, 1.0) * 0.5 + 0.3;

    const totalScore =
      0.35 * impactScore +
      0.25 * urgencyScore +
      0.20 * confidenceScore +
      0.10 * engagementDeltaScore +
      0.10 * effortReductionScore;

    const dimensions: CrmScoringInput = {
      impactScore: Math.round(impactScore * 100),
      urgencyScore: Math.round(urgencyScore * 100),
      confidenceScore: Math.round(confidenceScore * 100),
      engagementDeltaScore: Math.round(engagementDeltaScore * 100),
      effortReductionScore: Math.round(effortReductionScore * 100),
    };

    let label: CrmPriorityScore["label"] = "standard";
    if (totalScore >= 0.75) label = "high_priority";
    else if (totalScore >= 0.5) label = "medium_priority";
    else label = "low_priority";

    return {
      accountId: account.id,
      totalScore: Math.round(totalScore * 100),
      dimensions,
      label,
    };
  });

  scores.sort((a, b) => b.totalScore - a.totalScore);

  const event = createEvent("prioritize_opportunities", `Prioritized ${scores.length} accounts by impact, urgency, confidence, engagement delta, and effort reduction.`, scores.map((s) => s.accountId));
  const receipt = createReceipt(
    "prioritized",
    "Account priority scores calculated",
    "all",
    "All accounts",
    `${scores.length} accounts scored`,
    `Top priority: ${state.accounts.find((a) => a.id === scores[0]?.accountId)?.name ?? "N/A"}`,
    "completed",
  );

  return {
    state: { ...state, scores, activityLog: [...state.activityLog, event], receipts: [...state.receipts, receipt] },
    scores,
    event,
  };
}

/* ── Job 2: Recommendation Management ── */

export function dismissRecommendation(
  state: CrmEngagementState,
  recommendationId: string,
): { state: CrmEngagementState; event: CrmActivityEvent } {
  const rec = state.recommendations.find((r) => r.id === recommendationId);
  if (!rec) {
    const event = createEvent("dismiss_recommendation", `Dismiss failed: recommendation ${recommendationId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
  }
  const updated = state.recommendations.map((r) =>
    r.id === recommendationId ? { ...r, status: "dismissed" as const } : r,
  );
  const event = createEvent("dismiss_recommendation", `Dismissed recommendation: ${rec.title}.`, [rec.accountId]);
  const receipt = createReceipt(
    "recommendation_dismissed",
    `Dismissed recommendation — ${rec.title}`,
    rec.accountId,
    state.accounts.find((a) => a.id === rec.accountId)?.name ?? "",
    rec.reason,
    `Dismissed by user`,
    "dismissed",
  );
  return {
    state: {
      ...state,
      recommendations: updated,
      activityLog: [...state.activityLog, event],
      receipts: [...state.receipts, receipt],
    },
    event,
  };
}

export function setFocusTab(state: CrmEngagementState, tab: FocusTab): CrmEngagementState {
  return { ...state, activeFocusTab: tab, selectedAccountId: null, selectedOpportunityId: null, drawerOpen: false };
}

export function selectAccount(state: CrmEngagementState, accountId: string | null): CrmEngagementState {
  return { ...state, selectedAccountId: accountId, selectedOpportunityId: null, drawerOpen: accountId !== null };
}

export function selectOpportunity(state: CrmEngagementState, opportunityId: string | null): CrmEngagementState {
  return { ...state, selectedOpportunityId: opportunityId, selectedAccountId: null, drawerOpen: opportunityId !== null };
}

export function closeDrawer(state: CrmEngagementState): CrmEngagementState {
  return { ...state, drawerOpen: false, selectedAccountId: null, selectedOpportunityId: null };
}

export function getAtRiskCount(state: CrmEngagementState): number {
  return state.opportunities.filter((o) => o.health === "at_risk").length;
}

export function getDraftCount(state: CrmEngagementState): number {
  return state.recommendations.filter((r) => r.status === "drafted").length;
}

export function getMeetingPrepCount(state: CrmEngagementState): number {
  return state.recommendations.filter((r) => r.priority === "meeting_prep").length;
}

export function getPriorityActionCount(state: CrmEngagementState): number {
  return state.recommendations.filter((r) => r.status === "new" || r.status === "viewed").length;
}

export function getActiveRecommendations(state: CrmEngagementState): CrmRecommendation[] {
  return state.recommendations.filter((r) => r.status !== "dismissed").sort((a, b) => b.confidence - a.confidence);
}

export function getAccountWithOpportunities(state: CrmEngagementState, accountId: string) {
  const account = state.accounts.find((a) => a.id === accountId);
  const opps = state.opportunities.filter((o) => o.accountId === accountId);
  const stakeholdersList = state.stakeholders.filter((s) => s.accountId === accountId);
  const timeline = state.timelineEvents.filter((e) => e.accountId === accountId);
  return { account, opportunities: opps, stakeholders: stakeholdersList, timelineEvents: timeline };
}

export function getOpportunityDetail(state: CrmEngagementState, opportunityId: string) {
  const opp = state.opportunities.find((o) => o.id === opportunityId);
  if (!opp) return null;
  const account = state.accounts.find((a) => a.id === opp.accountId);
  const stakeholdersList = state.stakeholders.filter((s) => s.accountId === opp.accountId);
  const timeline = state.timelineEvents.filter((e) => e.opportunityId === opportunityId);
  const evidence = opp.warnings.length > 0 ? state.evidence.slice(0, 2) : [];
  return { opportunity: opp, account, stakeholders: stakeholdersList, timelineEvents: timeline, evidence };
}

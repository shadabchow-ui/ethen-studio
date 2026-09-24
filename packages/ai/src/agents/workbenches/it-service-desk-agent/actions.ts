import type {
  ItServiceDeskState,
  ItServiceDeskEvent,
  ItArtifact,
  TicketCategory,
  TicketPriority,
  KbGapStatus,
  ProposedKbUpdateStatus,
  ProposedKbUpdate,
} from "./state";

let _evCounter = 900;
let _artCounter = 400;

function nextEventId(): string { _evCounter += 1; return `it-evt-${_evCounter}`; }
function nextArtifactId(): string { _artCounter += 1; return `it-art-${_artCounter}`; }
function nowISO(): string { return new Date().toISOString(); }

function createEvent(
  action: string, summary: string, ticketIds: string[], artifactId?: string,
): ItServiceDeskEvent {
  return { id: nextEventId(), timestamp: nowISO(), actor: "it_service_desk_agent", action, summary, linkedTicketIds: ticketIds, artifactId };
}

const CATEGORY_LABEL: Record<string, string> = {
  incident: "Incident",
  service_request: "Service Request",
  access_grant: "Access Grant",
  asset_change: "Asset Change",
  security: "Security",
  network: "Network",
  software: "Software",
  onboarding: "Onboarding",
};

const PRIORITY_LABEL: Record<string, string> = {
  p1_critical: "P1 Critical",
  p2_high: "P2 High",
  p3_medium: "P3 Medium",
  p4_low: "P4 Low",
};

export function classifyTicket(
  state: ItServiceDeskState,
  ticketId: string,
  category: TicketCategory,
  priority: TicketPriority,
): { state: ItServiceDeskState; event: ItServiceDeskEvent } {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  const updatedTickets = state.tickets.map((t) =>
    t.id === ticketId ? { ...t, category, priority, updatedAt: nowISO() } : t,
  );
  const event = createEvent("classify_ticket", `Classified ticket "${ticket?.title ?? ticketId}" as ${CATEGORY_LABEL[category]} / ${PRIORITY_LABEL[priority]}.`, [ticketId]);
  return { state: { ...state, tickets: updatedTickets, activityLog: [...state.activityLog, event] }, event };
}

export function searchServiceCatalog(
  state: ItServiceDeskState,
  query: string,
): { state: ItServiceDeskState; event: ItServiceDeskEvent; artifact: ItArtifact } {
  const results = state.catalogItems.filter(
    (c) => c.serviceName.toLowerCase().includes(query.toLowerCase()) || c.description.toLowerCase().includes(query.toLowerCase()),
  );
  const content = results.length > 0
    ? results.map((c) => `- **${c.serviceName}**: ${c.description} (${c.supportLevel}, SLA: ${c.sla})`).join("\n")
    : `No catalog results for "${query}".`;

  const artifact: ItArtifact = {
    id: nextArtifactId(),
    type: "checklist",
    title: `Catalog Search: "${query}"`,
    createdAt: nowISO(),
    sourceAction: "search_service_catalog",
    preview: `${results.length} result(s) for "${query}"`,
    content,
    linkedTicketIds: [],
  };

  const event = createEvent("search_service_catalog", `Searched service catalog for "${query}": ${results.length} result(s).`, [], artifact.id);
  return { state: { ...state, artifacts: [...state.artifacts, artifact], activityLog: [...state.activityLog, event] }, event, artifact };
}

export function lookupKnowledgeBase(
  state: ItServiceDeskState,
  query: string,
): { state: ItServiceDeskState; event: ItServiceDeskEvent; artifact: ItArtifact } {
  const results = state.kbArticles.filter(
    (a) => a.title.toLowerCase().includes(query.toLowerCase()) || a.category.toLowerCase().includes(query.toLowerCase()) || a.summary.toLowerCase().includes(query.toLowerCase()),
  );
  const content = results.length > 0
    ? results.map((a) => `## ${a.title} (${a.category})\n${a.summary}\n\n${a.content}`).join("\n\n---\n\n")
    : `No KB articles found for "${query}".`;

  const artifact: ItArtifact = {
    id: nextArtifactId(),
    type: "report",
    title: `KB Search: "${query}"`,
    createdAt: nowISO(),
    sourceAction: "lookup_knowledge_base",
    preview: `${results.length} article(s) found for "${query}"`,
    content,
    linkedTicketIds: [],
  };

  const event = createEvent("lookup_knowledge_base", `Looked up KB for "${query}": ${results.length} article(s).`, [], artifact.id);
  return { state: { ...state, artifacts: [...state.artifacts, artifact], activityLog: [...state.activityLog, event] }, event, artifact };
}

export function draftResolution(
  state: ItServiceDeskState,
  ticketId: string,
): { state: ItServiceDeskState; event: ItServiceDeskEvent; artifact: ItArtifact } {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) {
    const event = createEvent("draft_resolution", `Resolution draft failed: ticket ${ticketId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, artifact: { id: "", type: "summary", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedTicketIds: [] } };
  }

  const content = [
    `# Resolution Draft — ${ticket.title}`,
    ``,
    `**Ticket:** ${ticket.id}`,
    `**Category:** ${CATEGORY_LABEL[ticket.category] ?? ticket.category}`,
    `**Priority:** ${PRIORITY_LABEL[ticket.priority] ?? ticket.priority}`,
    `**Requester:** ${ticket.requester}`,
    `**Affected Asset:** ${ticket.affectedAsset}`,
    ``,
    `## Recommended Resolution Steps`,
    ``,
    `1. Verify issue details with requester`,
    `2. Check relevant KB articles for known solution`,
    `3. Apply workaround if available`,
    `4. Test resolution in staging if applicable`,
    `5. Document resolution and close ticket`,
    ``,
    `## Notes`,
    `- Escalation level: ${ticket.escalationLevel.toUpperCase()}`,
    `- Assignee: ${ticket.assignee}`,
    ticket.description ? `- Description: ${ticket.description}` : "",
  ].filter(Boolean).join("\n");

  const artifact: ItArtifact = {
    id: nextArtifactId(),
    type: "summary",
    title: `Resolution Draft — ${ticket.title}`,
    createdAt: nowISO(),
    sourceAction: "draft_resolution",
    preview: `Resolution steps drafted for ticket "${ticket.title}".`,
    content,
    linkedTicketIds: [ticketId],
  };

  const updatedTickets = state.tickets.map((t) =>
    t.id === ticketId ? { ...t, linkedArtifactIds: [...t.linkedArtifactIds, artifact.id] } : t,
  );
  const event = createEvent("draft_resolution", `Drafted resolution steps for ticket "${ticket.title}".`, [ticketId], artifact.id);
  return { state: { ...state, tickets: updatedTickets, artifacts: [...state.artifacts, artifact], activityLog: [...state.activityLog, event] }, event, artifact };
}

export function routeEscalation(
  state: ItServiceDeskState,
  ticketId: string,
): { state: ItServiceDeskState; event: ItServiceDeskEvent; artifact: ItArtifact } {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) {
    const event = createEvent("route_escalation", `Escalation routing failed: ticket ${ticketId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, artifact: { id: "", type: "recommendation", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedTicketIds: [] } };
  }

  const escalationMap: Record<string, string> = { l1: "L1 Support", l2: "L2 Security", l3: "L3 Engineering" };
  const nextLevel: Record<string, string> = { l1: "l2", l2: "l3", l3: "l3" };
  const currentLevel = ticket.escalationLevel;
  const nextEscLevel = nextLevel[currentLevel];
  const nextAssignee = escalationMap[nextEscLevel] ?? escalationMap[currentLevel];

  const content = [
    `# Escalation Path — ${ticket.title}`,
    ``,
    `**Current Level:** ${escalationMap[currentLevel] ?? currentLevel}`,
    `**Recommended Level:** ${escalationMap[nextEscLevel] ?? nextEscLevel}`,
    `**Assignee:** ${nextAssignee}`,
    ``,
    `**Reason for escalation:**`,
    `- Current level cannot resolve within SLA`,
    `- Issue requires specialized expertise`,
    `- Affected asset requires ${nextEscLevel.toUpperCase()} access`,
    ``,
    `**Suggested action:** Route to ${nextAssignee} with full ticket history.`,
  ].join("\n");

  const artifact: ItArtifact = {
    id: nextArtifactId(),
    type: "recommendation",
    title: `Escalation Path — ${ticket.title}`,
    createdAt: nowISO(),
    sourceAction: "route_escalation",
    preview: `Escalate ${ticket.escalationLevel.toUpperCase()} → ${nextEscLevel.toUpperCase()} (${nextAssignee})`,
    content,
    linkedTicketIds: [ticketId],
  };

  const updatedTickets = state.tickets.map((t) =>
    t.id === ticketId ? { ...t, escalationLevel: nextEscLevel as typeof t.escalationLevel, assignee: nextAssignee, status: "escalated" as const, updatedAt: nowISO(), linkedArtifactIds: [...t.linkedArtifactIds, artifact.id] } : t,
  );
  const event = createEvent("route_escalation", `Routing ticket "${ticket.title}" from ${currentLevel.toUpperCase()} to ${nextEscLevel.toUpperCase()} (${nextAssignee}).`, [ticketId], artifact.id);
  return { state: { ...state, tickets: updatedTickets, artifacts: [...state.artifacts, artifact], activityLog: [...state.activityLog, event] }, event, artifact };
}

export function generateResolutionSummary(
  state: ItServiceDeskState,
  ticketId: string,
): { state: ItServiceDeskState; event: ItServiceDeskEvent; artifact: ItArtifact } {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) {
    const event = createEvent("generate_resolution_summary", `Resolution summary failed: ticket ${ticketId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event, artifact: { id: "", type: "summary", title: "", createdAt: "", sourceAction: "", preview: "", content: "", linkedTicketIds: [] } };
  }

  const content = [
    `# Resolution Summary — ${ticket.title}`,
    ``,
    `**Ticket ID:** ${ticket.id}`,
    `**Status:** ${ticket.status}`,
    `**Category:** ${CATEGORY_LABEL[ticket.category] ?? ticket.category}`,
    `**Priority:** ${PRIORITY_LABEL[ticket.priority] ?? ticket.priority}`,
    `**Assignee:** ${ticket.assignee}`,
    `**Created:** ${ticket.createdAt}`,
    `**Last Updated:** ${ticket.updatedAt}`,
    ``,
    `## Description`,
    ticket.description,
    ``,
    `## Resolution`,
    ticket.resolution ?? "Resolution details not yet documented.",
    ``,
    `## KB References`,
    `Relevant KB articles were searched for this ticket type.`,
  ].join("\n");

  const artifact: ItArtifact = {
    id: nextArtifactId(),
    type: "summary",
    title: `Resolution Summary — ${ticket.title}`,
    createdAt: nowISO(),
    sourceAction: "generate_resolution_summary",
    preview: `Resolution summary for ticket "${ticket.title}".`,
    content,
    linkedTicketIds: [ticketId],
  };

  const updatedTickets = state.tickets.map((t) =>
    t.id === ticketId ? { ...t, status: "resolved" as const, resolution: ticket.resolution ?? "Resolved per standard procedure.", updatedAt: nowISO(), linkedArtifactIds: [...t.linkedArtifactIds, artifact.id] } : t,
  );
  const event = createEvent("generate_resolution_summary", `Generated resolution summary for ticket "${ticket.title}".`, [ticketId], artifact.id);
  return { state: { ...state, tickets: updatedTickets, artifacts: [...state.artifacts, artifact], activityLog: [...state.activityLog, event] }, event, artifact };
}

export function createKbDraft(
  state: ItServiceDeskState,
  gapId: string,
): { state: ItServiceDeskState; event: ItServiceDeskEvent } {
  const gap = state.kbGaps.find((g) => g.id === gapId);
  if (!gap) {
    const event = createEvent("create_kb_draft", `KB draft creation failed: gap ${gapId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
  }

  const update: ProposedKbUpdate = {
    id: nextArtifactId().replace("it-art-", "kb-upd-"),
    kbGapId: gapId,
    articleTitle: gap.suggestedArticleTitle,
    symptoms: gap.symptoms,
    cause: gap.cause,
    resolutionSteps: gap.draftResolutionSteps,
    verificationSteps: gap.verificationSteps,
    relatedTicketIds: gap.relatedTicketIds,
    sourceWeaknessReason: gap.evidenceWeakness,
    suggestedOwner: gap.suggestedOwner,
    status: "draft",
    createdBy: "IT Service Desk Agent",
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  const updatedGaps = state.kbGaps.map((g) =>
    g.id === gapId ? { ...g, status: "draft_created" as KbGapStatus, updatedAt: nowISO() } : g,
  );

  const event = createEvent("create_kb_draft", `Created KB draft "${update.articleTitle}" from gap "${gap.title}".`, gap.relatedTicketIds);
  return {
    state: {
      ...state,
      kbGaps: updatedGaps,
      proposedKbUpdates: [...state.proposedKbUpdates, update],
      activityLog: [...state.activityLog, event],
    },
    event,
  };
}

export function assignKbGapOwner(
  state: ItServiceDeskState,
  gapId: string,
  owner: string,
): { state: ItServiceDeskState; event: ItServiceDeskEvent } {
  const gap = state.kbGaps.find((g) => g.id === gapId);
  if (!gap) {
    const event = createEvent("assign_kb_gap_owner", `Owner assignment failed: gap ${gapId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
  }

  const updatedGaps = state.kbGaps.map((g) =>
    g.id === gapId ? { ...g, suggestedOwner: owner, status: "assigned" as KbGapStatus, updatedAt: nowISO() } : g,
  );

  const event = createEvent("assign_kb_gap_owner", `Assigned KB gap "${gap.title}" to "${owner}".`, gap.relatedTicketIds);
  return { state: { ...state, kbGaps: updatedGaps, activityLog: [...state.activityLog, event] }, event };
}

export function markKbGapReviewed(
  state: ItServiceDeskState,
  gapId: string,
): { state: ItServiceDeskState; event: ItServiceDeskEvent } {
  const gap = state.kbGaps.find((g) => g.id === gapId);
  if (!gap) {
    const event = createEvent("mark_kb_gap_reviewed", `Review mark failed: gap ${gapId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
  }

  const updatedGaps = state.kbGaps.map((g) =>
    g.id === gapId ? { ...g, status: "reviewed" as KbGapStatus, updatedAt: nowISO() } : g,
  );

  const event = createEvent("mark_kb_gap_reviewed", `Marked KB gap "${gap.title}" as reviewed.`, gap.relatedTicketIds);
  return { state: { ...state, kbGaps: updatedGaps, activityLog: [...state.activityLog, event] }, event };
}

export function dismissKbGap(
  state: ItServiceDeskState,
  gapId: string,
): { state: ItServiceDeskState; event: ItServiceDeskEvent } {
  const gap = state.kbGaps.find((g) => g.id === gapId);
  if (!gap) {
    const event = createEvent("dismiss_kb_gap", `Dismissal failed: gap ${gapId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
  }

  const updatedGaps = state.kbGaps.map((g) =>
    g.id === gapId ? { ...g, status: "dismissed" as KbGapStatus, updatedAt: nowISO() } : g,
  );

  const event = createEvent("dismiss_kb_gap", `Dismissed KB gap "${gap.title}".`, gap.relatedTicketIds);
  return { state: { ...state, kbGaps: updatedGaps, activityLog: [...state.activityLog, event] }, event };
}

export function proposeKbUpdateStatusChange(
  state: ItServiceDeskState,
  updateId: string,
  status: ProposedKbUpdateStatus,
): { state: ItServiceDeskState; event: ItServiceDeskEvent } {
  const update = state.proposedKbUpdates.find((u) => u.id === updateId);
  if (!update) {
    const event = createEvent("propose_kb_update_status", `Status change failed: update ${updateId} not found.`, []);
    return { state: { ...state, activityLog: [...state.activityLog, event] }, event };
  }

  const updated = state.proposedKbUpdates.map((u) =>
    u.id === updateId ? { ...u, status, updatedAt: nowISO() } : u,
  );

  const statusLabel: Record<string, string> = { draft: "Draft", ready_for_review: "Ready for Review", approved: "Approved", published: "Published" };
  const event = createEvent("propose_kb_update_status", `KB update "${update.articleTitle}" status changed to "${statusLabel[status] ?? status}".`, update.relatedTicketIds);
  return { state: { ...state, proposedKbUpdates: updated, activityLog: [...state.activityLog, event] }, event };
}

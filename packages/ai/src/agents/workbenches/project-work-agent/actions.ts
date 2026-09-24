import type {
  ProjectWorkState,
  ProjectBlocker,
  ProjectDependency,
  ProjectArtifact,
  ProjectActivityEvent,
  ActionPlanItem,
  TaskStatus,
} from "./state";

let _evCounter = 500;
let _artCounter = 200;

function nextEventId(): string {
  _evCounter += 1;
  return `evt-${_evCounter}`;
}

function nextArtifactId(): string {
  _artCounter += 1;
  return `art-${_artCounter}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function createEvent(
  action: string,
  summary: string,
  taskIds: string[],
  blockerIds: string[],
  artifactId?: string,
): ProjectActivityEvent {
  return {
    id: nextEventId(),
    timestamp: nowISO(),
    actor: "project_work_agent",
    action,
    summary,
    linkedTaskIds: taskIds,
    linkedBlockerIds: blockerIds,
    artifactId,
  };
}

function countOpenBlockers(state: ProjectWorkState): number {
  return state.blockers.filter((b) => b.status !== "resolved").length;
}

function recalcProjectHealth(state: ProjectWorkState): ProjectWorkState {
  const openBlockers = countOpenBlockers(state);
  const progress =
    state.tasks.length > 0
      ? Math.round(state.tasks.reduce((s, t) => s + (t.progressPercent ?? 0), 0) / state.tasks.length)
      : 0;

  let health = state.project.health;
  if (openBlockers >= 5 || progress < 25) health = "off_track";
  else if (openBlockers >= 2) health = "at_risk";
  else if (openBlockers === 0 && progress > 80) health = "on_track";

  return {
    ...state,
    project: {
      ...state.project,
      health,
      progressPercent: progress,
      openBlockers,
      lastUpdated: nowISO(),
    },
  };
}

export function updateTaskStatus(
  state: ProjectWorkState,
  taskId: string,
  newStatus: TaskStatus,
): { state: ProjectWorkState; event: ProjectActivityEvent } {
  const tasks = state.tasks.map((t) => {
    if (t.id !== taskId) return t;
    return { ...t, status: newStatus, lastUpdated: nowISO() };
  });

  const task = state.tasks.find((t) => t.id === taskId);
  const event = createEvent(
    "update_task_status",
    `Changed "${task?.title ?? taskId}" status to ${newStatus.replace(/_/g, " ")}.`,
    [taskId],
    [],
  );

  const next = recalcProjectHealth({ ...state, tasks, activityLog: [...state.activityLog, event] });
  return { state: next, event };
}

export function assignOwner(
  state: ProjectWorkState,
  taskId: string,
  newOwner: string,
): { state: ProjectWorkState; event: ProjectActivityEvent } {
  const tasks = state.tasks.map((t) => {
    if (t.id !== taskId) return t;
    return { ...t, owner: newOwner, lastUpdated: nowISO() };
  });

  const task = state.tasks.find((t) => t.id === taskId);
  const oldOwner = task?.owner ?? "unassigned";
  const event = createEvent(
    "assign_owner",
    `Assigned "${task?.title ?? taskId}" from ${oldOwner} to ${newOwner}.`,
    [taskId],
    [],
  );

  const next = { ...state, tasks, activityLog: [...state.activityLog, event] };
  return { state: next, event };
}

export function prioritizeTasks(
  state: ProjectWorkState,
): { state: ProjectWorkState; event: ProjectActivityEvent } {
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const blockerCountByTask = new Map<string, number>();
  for (const b of state.blockers) {
    for (const tid of b.linkedTaskIds) {
      blockerCountByTask.set(tid, (blockerCountByTask.get(tid) ?? 0) + 1);
    }
  }

  const downstreamUnblocks = new Map<string, number>();
  for (const t of state.tasks) {
    for (const unblocked of t.unblocks) {
      downstreamUnblocks.set(unblocked, (downstreamUnblocks.get(unblocked) ?? 0) + 1);
    }
  }

  const sorted = [...state.tasks].sort((a, b) => {
    const aBlockerCount = blockerCountByTask.get(a.id) ?? 0;
    const bBlockerCount = blockerCountByTask.get(b.id) ?? 0;
    if (bBlockerCount !== aBlockerCount) return bBlockerCount - aBlockerCount;

    const aSeverity = severityOrder[a.priority] ?? 9;
    const bSeverity = severityOrder[b.priority] ?? 9;
    if (aSeverity !== bSeverity) return aSeverity - bSeverity;

    const aDue = new Date(a.dueDate).getTime();
    const bDue = new Date(b.dueDate).getTime();
    if (aDue !== bDue) return aDue - bDue;

    const aDownstream = downstreamUnblocks.get(a.id) ?? 0;
    const bDownstream = downstreamUnblocks.get(b.id) ?? 0;
    return bDownstream - aDownstream;
  });

  const event = createEvent(
    "prioritize_tasks",
    `Prioritized ${sorted.length} tasks by blocker severity, due date, and downstream unblock impact.`,
    sorted.map((t) => t.id),
    [],
  );

  const next = { ...state, tasks: sorted, activityLog: [...state.activityLog, event] };
  return { state: next, event };
}

export function resolveBlocker(
  state: ProjectWorkState,
  blockerId: string,
): { state: ProjectWorkState; event: ProjectActivityEvent } {
  const blocker = state.blockers.find((b) => b.id === blockerId);
  if (!blocker) return { state, event: createEvent("resolve_blocker", "Blocker not found.", [], []) };

  const blockers = state.blockers.map((b) => {
    if (b.id !== blockerId) return b;
    return { ...b, status: "resolved" as const };
  });

  const unblockedTaskIds: string[] = [];
  const tasks = state.tasks.map((t) => {
    if (t.blockedBy.includes(blockerId)) {
      const remaining = t.blockedBy.filter((bid) => bid !== blockerId);
      const stillBlocked = remaining.some((bid) => {
        const rb = state.blockers.find((b) => b.id === bid);
        return rb && rb.status !== "resolved";
      });
      if (remaining.length === 0 || !stillBlocked) {
        unblockedTaskIds.push(t.id);
        const newStatus = t.status === "blocked" ? "todo" : t.status;
        return {
          ...t,
          blockedBy: remaining,
          status: newStatus,
          lastUpdated: nowISO(),
        };
      }
      return { ...t, blockedBy: remaining, lastUpdated: nowISO() };
    }
    return t;
  });

  const taskTitles = state.tasks
    .filter((t) => unblockedTaskIds.includes(t.id))
    .map((t) => t.title);
  const unblockedNote =
    unblockedTaskIds.length > 0
      ? ` and unblocked ${unblockedTaskIds.length} task(s): ${taskTitles.join(", ")}.`
      : "";

  const event = createEvent(
    "resolve_blocker",
    `Resolved "${blocker.title}"${unblockedNote}`,
    unblockedTaskIds,
    [blockerId],
  );

  const blockerSummary = buildBlockerSummary(state);
  const artifact = blockerSummary
    ? blockerSummary
    : {
        id: nextArtifactId(),
        type: "blocker_summary" as const,
        title: `Blocker Summary — ${nowISO().slice(0, 10)}`,
        createdAt: nowISO(),
        sourceAction: "resolve_blocker",
        preview: `Resolved "${blocker.title}". ${state.blockers.filter((b) => b.status !== "resolved").length} blockers remaining.`,
        content: `## Blocker Summary\n\nResolved: ${blocker.title}\n\nRemaining blockers to resolve.`,
        linkedTaskIds: unblockedTaskIds,
        linkedBlockerIds: [blockerId],
      };

  const next = recalcProjectHealth({
    ...state,
    blockers,
    tasks,
    activityLog: [...state.activityLog, event],
    artifacts: [...state.artifacts, artifact],
  });
  return { state: next, event };
}

function buildBlockerSummary(state: ProjectWorkState): ProjectArtifact | null {
  const openBlockers = state.blockers.filter((b) => b.status !== "resolved");
  if (openBlockers.length === 0) return null;

  const lines = openBlockers.map(
    (b) =>
      `- **${b.title}** (${b.severity}) — ${b.status}: ${b.impact}\n  Resolution: ${b.resolutionPlan}${b.decisionNeeded ? `\n  Decision needed: ${b.decisionNeeded}` : ""}`,
  );

  return {
    id: nextArtifactId(),
    type: "blocker_summary",
    title: `Blocker Summary — ${nowISO().slice(0, 10)}`,
    createdAt: nowISO(),
    sourceAction: "resolve_blocker",
    preview: `${openBlockers.length} open blockers. ${openBlockers.filter((b) => b.severity === "critical" || b.severity === "high").length} high/critical.`,
    content: `## Blocker Summary\n\n${lines.join("\n\n")}`,
    linkedTaskIds: openBlockers.flatMap((b) => b.linkedTaskIds),
    linkedBlockerIds: openBlockers.map((b) => b.id),
  };
}

export function generateActionPlan(
  state: ProjectWorkState,
): { state: ProjectWorkState; event: ProjectActivityEvent; artifact: ProjectArtifact } {
  const items = buildActionPlanItems(state);
  const planLines = items
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
    })
    .map(
      (item) =>
        `- [${item.status === "done" ? "x" : " "}] **${item.title}** — ${item.owner}, due ${item.dueDate} (${item.priority})`,
    );

  const content = `## Action Plan — ${state.project.name}\n\n${planLines.join("\n")}`;

  const artifact: ProjectArtifact = {
    id: nextArtifactId(),
    type: "action_plan",
    title: `Action Plan — ${nowISO().slice(0, 10)}`,
    createdAt: nowISO(),
    sourceAction: "generate_action_plan",
    preview: `${items.length} action items from current project state.`,
    content,
    linkedTaskIds: items.flatMap((i) => i.linkedTaskIds),
    linkedBlockerIds: items.flatMap((i) => i.linkedBlockerIds),
  };

  const event = createEvent(
    "generate_action_plan",
    `Generated action plan from ${items.length} items across ${state.tasks.length} tasks and ${state.blockers.filter((b) => b.status !== "resolved").length} blockers.`,
    state.tasks.map((t) => t.id),
    state.blockers.map((b) => b.id),
    artifact.id,
  );

  let next = {
    ...state,
    actionPlanItems: [...items],
    artifacts: [...state.artifacts, artifact],
    activityLog: [...state.activityLog, event],
  };
  next = recalcProjectHealth(next);
  return { state: next, event, artifact };
}

function buildActionPlanItems(state: ProjectWorkState): ActionPlanItem[] {
  const existing = [...state.actionPlanItems];

  for (const task of state.tasks) {
    if (task.status === "done" || task.status === "cancelled") continue;
    const already = existing.some((a) => a.linkedTaskIds.includes(task.id));
    if (already) continue;
    existing.push({
      id: `api-auto-${existing.length + 1}`,
      title: task.title,
      owner: task.owner,
      dueDate: task.dueDate,
      priority: task.priority,
      source: "task",
      status: task.status === "in_progress" ? "in_progress" : "planned",
      linkedTaskIds: [task.id],
      linkedBlockerIds: task.blockedBy,
    });
  }

  for (const blocker of state.blockers) {
    if (blocker.status === "resolved") continue;
    const already = existing.some((a) => a.linkedBlockerIds.includes(blocker.id));
    if (already) continue;
    existing.push({
      id: `api-auto-${existing.length + 1}`,
      title: `Resolve: ${blocker.title}`,
      owner: blocker.owner,
      dueDate: blocker.targetResolutionDate,
      priority: blocker.severity === "critical" ? "critical" : blocker.severity === "high" ? "high" : "medium",
      source: "blocker",
      status: blocker.status === "mitigating" ? "in_progress" : "planned",
      linkedTaskIds: blocker.linkedTaskIds,
      linkedBlockerIds: [blocker.id],
    });
  }

  return existing;
}

export function composeStakeholderReport(
  state: ProjectWorkState,
): { state: ProjectWorkState; event: ProjectActivityEvent; artifact: ProjectArtifact } {
  const done = state.tasks.filter((t) => t.status === "done");
  const inProgress = state.tasks.filter(
    (t) => t.status === "in_progress" || t.status === "in_review",
  );
  const upcoming = state.tasks.filter(
    (t) =>
      t.status === "todo" ||
      t.status === "backlog" ||
      t.status === "triage",
  );
  const blocked = state.tasks.filter((t) => t.status === "blocked");
  const openBlockers = state.blockers.filter((b) => b.status !== "resolved");
  const atRiskDeps = state.dependencies.filter((d) => d.status === "at_risk");
  const highRiskDeps = state.dependencies.filter((d) => d.risk === "high");

  const statusLabel =
    state.project.health === "on_track"
      ? "green"
      : state.project.health === "at_risk"
        ? "amber"
        : "red";

  const nextSteps = [...inProgress, ...blocked, ...upcoming.slice(0, 5)]
    .filter((t) => t.status !== "done" && t.status !== "cancelled")
    .slice(0, 8)
    .map((t) => ({
      title: t.title,
      owner: t.owner,
      dueDate: t.dueDate,
    }));

  const content = [
    `# Stakeholder Report — ${state.project.name}`,
    ``,
    `**Period:** ${nowISO().slice(0, 10)}`,
    `**Overall Status:** ${statusLabel.toUpperCase()}`,
    `**Phase:** ${state.project.phase}`,
    `**Target Date:** ${state.project.targetDate}`,
    ``,
    `## Executive Summary`,
    ``,
    `Project is **${state.project.health.replace(/_/g, " ")}** with ${openBlockers.length} open blocker(s) and ${state.project.progressPercent}% of tasks completed. ${blocked.length} task(s) are currently blocked.`,
    ``,
    `## Completed This Period`,
    ``,
    ...done.map((t) => `- ${t.title} (${t.owner})`),
    ``,
    `## Upcoming Milestones`,
    ``,
    ...upcoming.slice(0, 5).map((t) => `- ${t.title} — due ${t.dueDate}`),
    ``,
    `## Current Blockers`,
    ``,
    ...openBlockers.map(
      (b) =>
        `- **${b.title}** (${b.severity}) — ${b.impact}${b.decisionNeeded ? ` Decision needed: ${b.decisionNeeded}` : ""}`,
    ),
    ``,
    `## Risks and Mitigations`,
    ``,
    ...atRiskDeps.map((d) => {
      const src = state.tasks.find((t) => t.id === d.sourceTaskId);
      const tgt = state.tasks.find((t) => t.id === d.targetTaskId);
      return `- Dependency at risk: "${src?.title ?? d.sourceTaskId}" → "${tgt?.title ?? d.targetTaskId}": ${d.reason}`;
    }),
    ...highRiskDeps.map((d) => {
      const src = state.tasks.find((t) => t.id === d.sourceTaskId);
      const tgt = state.tasks.find((t) => t.id === d.targetTaskId);
      return `- High-risk dependency: "${src?.title ?? d.sourceTaskId}" → "${tgt?.title ?? d.targetTaskId}": ${d.reason}`;
    }),
    ``,
    `## Decisions Needed`,
    ``,
    ...openBlockers
      .filter((b) => b.decisionNeeded)
      .map((b) => `- ${b.decisionNeeded}`),
    ``,
    `## Next Steps`,
    ``,
    ...nextSteps.map((s) => `- ${s.title} — **${s.owner}**, due ${s.dueDate}`),
  ].join("\n");

  const artifact: ProjectArtifact = {
    id: nextArtifactId(),
    type: "stakeholder_report",
    title: `Stakeholder Report — ${nowISO().slice(0, 10)}`,
    createdAt: nowISO(),
    sourceAction: "compose_stakeholder_report",
    preview: `${statusLabel.toUpperCase()} — ${state.project.health.replace(/_/g, " ")}. ${openBlockers.length} blockers, ${done.length} tasks completed.`,
    content,
    linkedTaskIds: state.tasks.map((t) => t.id),
    linkedBlockerIds: openBlockers.map((b) => b.id),
  };

  const event = createEvent(
    "compose_stakeholder_report",
    `Generated stakeholder report from ${state.tasks.length} tasks, ${openBlockers.length} blockers, and ${state.dependencies.length} dependencies.`,
    state.tasks.map((t) => t.id),
    openBlockers.map((b) => b.id),
    artifact.id,
  );

  const next = {
    ...state,
    artifacts: [...state.artifacts, artifact],
    activityLog: [...state.activityLog, event],
  };
  return { state: next, event, artifact };
}

export function linkDependency(
  state: ProjectWorkState,
  sourceTaskId: string,
  targetTaskId: string,
  depType: ProjectDependency["type"],
  risk: ProjectDependency["risk"],
  reason: string,
): { state: ProjectWorkState; event: ProjectActivityEvent } {
  const dep: ProjectDependency = {
    id: `dep-auto-${state.dependencies.length + 1}`,
    sourceTaskId,
    targetTaskId,
    type: depType,
    status: risk === "high" ? "at_risk" : "active",
    risk,
    reason,
  };

  const sourceTask = state.tasks.find((t) => t.id === sourceTaskId);
  const targetTask = state.tasks.find((t) => t.id === targetTaskId);

  const event = createEvent(
    "link_dependency",
    `Linked "${sourceTask?.title ?? sourceTaskId}" → "${targetTask?.title ?? targetTaskId}" as ${depType.replace(/_/g, " ")} (risk: ${risk}).`,
    [sourceTaskId, targetTaskId],
    [],
  );

  const next = {
    ...state,
    dependencies: [...state.dependencies, dep],
    activityLog: [...state.activityLog, event],
  };
  return { state: next, event };
}

export function escalateRisk(
  state: ProjectWorkState,
  blockerId: string,
): { state: ProjectWorkState; event: ProjectActivityEvent } {
  const blocker = state.blockers.find((b) => b.id === blockerId);
  if (!blocker)
    return { state, event: createEvent("escalate_risk", "Blocker not found.", [], []) };

  const severityNext: Record<string, ProjectBlocker["severity"]> = {
    low: "medium",
    medium: "high",
    high: "critical",
    critical: "critical",
  };

  const blockers = state.blockers.map((b) => {
    if (b.id !== blockerId) return b;
    return {
      ...b,
      severity: severityNext[b.severity] ?? b.severity,
    };
  });

  const event = createEvent(
    "escalate_risk",
    `Escalated "${blocker.title}" from ${blocker.severity} to ${severityNext[blocker.severity] ?? blocker.severity} severity${blocker.decisionNeeded ? `. Decision needed: ${blocker.decisionNeeded}` : ""}.`,
    blocker.linkedTaskIds,
    [blockerId],
  );

  const riskMemo: ProjectArtifact = {
    id: nextArtifactId(),
    type: "risk_dependency_memo",
    title: `Risk Escalation Memo — ${blocker.title}`,
    createdAt: nowISO(),
    sourceAction: "escalate_risk",
    preview: `Escalated "${blocker.title}" to ${severityNext[blocker.severity]} severity. ${blocker.decisionNeeded ? `Action needed: ${blocker.decisionNeeded}` : "Review required."}`,
    content: `## Risk Escalation — ${blocker.title}\n\n- **Severity:** ${blocker.severity} → ${severityNext[blocker.severity]}\n- **Impact:** ${blocker.impact}\n- **Resolution plan:** ${blocker.resolutionPlan}\n${blocker.decisionNeeded ? `- **Decision needed:** ${blocker.decisionNeeded}` : ""}\n- **Owner:** ${blocker.owner}\n- **Target resolution:** ${blocker.targetResolutionDate}\n\nThis blocker has been escalated for immediate attention.`,
    linkedTaskIds: blocker.linkedTaskIds,
    linkedBlockerIds: [blockerId],
  };

  const next = {
    ...state,
    blockers,
    artifacts: [...state.artifacts, riskMemo],
    activityLog: [...state.activityLog, event],
  };
  return { state: next, event };
}

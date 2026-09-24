/**
 * Studio V2 Job 06 — agent trajectory projection.
 * Pure read model over a plan, its tasks, its actions, and recent events:
 * what was proposed, what was applied with what evidence, what is blocked
 * and why, what still needs a human. No I/O, no spend.
 */

import type { StudioPersistenceRecord } from "./persistence/studio-repository";
import { planStatusOf, taskStatusOf } from "./director-plan";

export interface TrajectoryTask {
  key: string;
  title: string;
  kind: string;
  status: string;
  deps: string[];
  budgetCap: number;
  attemptCount: number;
  evidence: Record<string, unknown>;
}

export interface TrajectoryAction {
  id: string;
  taskKey: string | null;
  kind: string;
  status: string;
  actorId: string;
  createdAt: string;
  evidence: Record<string, unknown>;
}

export interface TrajectoryEvent {
  id: string;
  type: string;
  at: string;
}

export interface AgentTrajectory {
  planId: string;
  title: string;
  status: string;
  mode: string;
  budgetCeiling: number;
  spentCredits: number;
  acceptance: { by: string | null; expiresAt: string | null; live: boolean };
  tasks: TrajectoryTask[];
  actions: TrajectoryAction[];
  events: TrajectoryEvent[];
  blocked: Array<{ key: string; reason: string }>;
  needsHuman: string[];
}

function payloadOf(row: StudioPersistenceRecord): Record<string, unknown> {
  return row.payload as Record<string, unknown>;
}

/** Project plan + tasks + actions + events into one inspectable trajectory. */
export function projectTrajectory(input: {
  plan: StudioPersistenceRecord;
  tasks: StudioPersistenceRecord[];
  actions: StudioPersistenceRecord[];
  events: StudioPersistenceRecord[];
  nowMs?: number;
}): AgentTrajectory {
  const nowMs = input.nowMs ?? Date.now();
  const planData = payloadOf(input.plan);
  const tasks: TrajectoryTask[] = input.tasks.map((task) => {
    const data = payloadOf(task);
    return {
      key: String(data.task_key ?? ""),
      title: String(data.title ?? ""),
      kind: String(data.kind ?? ""),
      status: taskStatusOf(task),
      deps: [...((data.deps ?? []) as string[])],
      budgetCap: Number(data.budget_cap ?? 0),
      attemptCount: Number(data.attempt_count ?? 0),
      evidence: { ...((data.evidence ?? {}) as Record<string, unknown>) },
    };
  });
  const actions: TrajectoryAction[] = input.actions
    .map((action) => {
      const data = payloadOf(action);
      const taskRow = typeof data.task_id === "string" && data.task_id ? input.tasks.find((task) => task.id === data.task_id) : undefined;
      const actor = typeof data.actor === "string" && data.actor
        ? data.actor
        : typeof data.actor_id === "string" ? data.actor_id : "";
      return {
        id: action.id,
        taskKey: taskRow ? String(payloadOf(taskRow).task_key ?? "") : null,
        kind: String(data.kind ?? ""),
        status: String(data.status ?? ""),
        actorId: actor,
        createdAt: action.createdAt,
        evidence: { ...((data.evidence ?? {}) as Record<string, unknown>) },
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const events: TrajectoryEvent[] = input.events
    .map((event) => {
      const data = payloadOf(event);
      return { id: event.id, type: String(data.type ?? ""), at: event.createdAt };
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 50);
  const blocked: AgentTrajectory["blocked"] = [];
  for (const task of tasks) {
    if (task.status !== "blocked") continue;
    const reason = (task.evidence.blocked as string)
      ?? (actions.find((action) => action.taskKey === task.key && action.kind === "task.block")?.evidence.reason as string)
      ?? "blocked";
    blocked.push({ key: task.key, reason: String(reason) });
  }
  const needsHuman: string[] = [];
  const frozen = (planData.frozen_envelope ?? null) as { expiresAt?: string } | null;
  if ((planStatusOf(input.plan) === "accepted" || planStatusOf(input.plan) === "running") && frozen && Date.parse(frozen.expiresAt ?? "") <= nowMs) {
    needsHuman.push("plan acceptance expired");
  }
  if (String(planData.mode ?? "manual") === "manual") {
    for (const task of tasks) {
      if (task.status === "proposed") needsHuman.push(`task ${task.key} awaits acceptance`);
    }
  }
  for (const entry of blocked) needsHuman.push(`task ${entry.key} blocked: ${entry.reason}`);
  return {
    planId: input.plan.id,
    title: String(planData.title ?? ""),
    status: planStatusOf(input.plan),
    mode: String(planData.mode ?? "manual"),
    budgetCeiling: Number(planData.budget_ceiling ?? 0),
    spentCredits: Number(planData.spent_credits ?? 0),
    acceptance: {
      by: typeof planData.accepted_by === "string" ? planData.accepted_by : null,
      expiresAt: frozen?.expiresAt ?? null,
      live: needsHuman.every((item) => item !== "plan acceptance expired"),
    },
    tasks,
    actions,
    events,
    blocked,
    needsHuman,
  };
}

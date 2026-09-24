// ── Cortex Ultra Team Assembler ──────────────────────────────────────────
// Maps topology to deterministic roles.
// Enforces maxWorkers = 2.
// No concrete provider/model invention.

import type {
  UltraPlan,
  UltraTeamAssembly,
  UltraTeamMember,
  UltraTopology,
  UltraWorkerTaskContract,
} from "./ultra-types";

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeMember(
  role: UltraTeamMember["role"],
  assignedTasks: string[],
  toolScope: string[],
  maxToolCalls: number,
  workerContract?: UltraWorkerTaskContract
): UltraTeamMember {
  return {
    memberId: genId("m"),
    role,
    assignedTasks,
    toolScope,
    maxToolCalls,
    workerContract,
  };
}

function toolScopeForTopology(topology: UltraTopology): string[] {
  switch (topology) {
    case "single_verified":
      return ["search", "retrieval"];
    case "parallel_primary_and_critic":
      return ["search"];
    case "research_and_analysis":
      return ["search", "retrieval"];
    case "tool_heavy_single_worker":
      return ["search", "retrieval", "file"];
  }
}

export function assembleTeam(plan: UltraPlan): UltraTeamAssembly {
  if (!plan.workers || plan.workers.length === 0) {
    throw new Error("Cannot assemble team: plan has no workers");
  }

  const members: UltraTeamMember[] = [];
  const maxW = Math.min(plan.maxWorkers, 2);
  const workers = plan.workers.slice(0, maxW);

  // Planner
  members.push(makeMember("planner", ["analyze_task", "select_topology"], ["search"], 2));

  // Workers
  for (const w of workers) {
    members.push(
      makeMember(
        "worker",
        [w.assignedTask],
        w.requiredTools.length > 0 ? w.requiredTools : toolScopeForTopology(plan.topology),
        w.maxToolCalls,
        w
      )
    );
  }

  // Tool executor (shared across workers)
  members.push(
    makeMember("tool_executor", ["execute_tool_calls"], plan.toolRequirements, plan.maxWorkers * 5)
  );

  // Verifier
  members.push(makeMember("verifier", plan.verifierChecklist, [], 0));

  // Synthesizer
  members.push(makeMember("synthesizer", ["synthesize_output"], [], 0));

  // Cost controller
  const costController = makeMember("coordinator", ["track_cost", "enforce_budget"], [], 0);

  return {
    assemblyId: genId("asm"),
    planId: plan.planId,
    topology: plan.topology,
    members,
    maxWorkers: maxW,
    costController,
  };
}

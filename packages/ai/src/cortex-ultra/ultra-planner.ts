// ── Cortex Ultra Planner ─────────────────────────────────────────────────
// Determines execution topology from task characteristics.
// No model calls — purely deterministic rule-based selection.
// Prefers smallest useful topology.

import type {
  UltraTopology,
  UltraPlan,
  UltraPlanInput,
  UltraWorkerTaskContract,
} from "./ultra-types";

const ALL_TOPOLOGIES: UltraTopology[] = [
  "single_verified",
  "parallel_primary_and_critic",
  "research_and_analysis",
  "tool_heavy_single_worker",
];

function scoreTopology(
  topology: UltraTopology,
  input: UltraPlanInput
): number {
  const task = input.task.toLowerCase();
  let score = 0;

  switch (topology) {
    case "single_verified": {
      // Prefer when task is simple, single-domain, or low risk
      score += 5; // base simplicity bonus
      if (!task.includes("compare") && !task.includes("versus")) score += 3;
      if (!task.includes("multiple") && !task.includes("parallel")
          && !task.includes("both") && !task.includes("independent")) score += 2;
      break;
    }
    case "parallel_primary_and_critic": {
      if (task.includes("compare") || task.includes("versus") || task.includes("evaluate")) score += 16;
      if (task.includes("review") || task.includes("critique") || task.includes("challenge")) score += 12;
      if (task.includes("parallel") || task.includes("independent")) score += 6;
      break;
    }
    case "research_and_analysis": {
      if (task.includes("research") || task.includes("investigate") || task.includes("sources")) score += 14;
      if (task.includes("analyze") || task.includes("analysis")) score += 6;
      break;
    }
    case "tool_heavy_single_worker": {
      if (task.includes("tool") || task.includes("file") || task.includes("repository")) score += 18;
      if (task.includes("gather") || task.includes("fetch") || task.includes("download")) score += 12;
      break;
    }
  }

  return score;
}

function selectTopology(input: UltraPlanInput): UltraTopology {
  let best: UltraTopology = "single_verified";
  let bestScore = -1;
  for (const t of ALL_TOPOLOGIES) {
    const s = scoreTopology(t, input);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}

const DEFAULT_TOOLS = ["search"];

function allowedTools(input: UltraPlanInput, preferred: string[]): string[] {
  if (!input.availableTools) return preferred;
  return preferred.filter((tool) => input.availableTools!.includes(tool));
}

function contract(
  workerId: string,
  specialistRole: UltraWorkerTaskContract["specialistRole"],
  assignedTask: string,
  expectedOutputContract: string[],
  input: UltraPlanInput,
  preferredTools: string[],
  evidenceRequirements: string[],
  verifierChecklistLink: string[],
  maxToolCalls: number,
  timeoutMs: number
): UltraWorkerTaskContract {
  const tools = allowedTools(input, preferredTools);
  return {
    workerId,
    role: "worker",
    specialistRole,
    assignedTask,
    expectedOutputContract,
    requiredTools: tools,
    toolPolicy: { allowedTools: tools, mode: tools.length > 0 ? "optional" : "required" },
    evidenceRequirements,
    verifierChecklistLink,
    maxToolCalls: tools.length > 0 ? maxToolCalls : 0,
    timeoutMs,
  };
}

function buildWorkerTasks(
  topology: UltraTopology,
  input: UltraPlanInput,
  verifierChecklist: string[]
): UltraWorkerTaskContract[] {
  const timeoutMs = input.timeLimitMs ?? 60_000;
  const task = input.task.trim();

  switch (topology) {
    case "single_verified":
      return [contract("worker-single", "primary", task, ["direct answer", "brief evidence-backed rationale", "uncertainties when applicable"], input, DEFAULT_TOOLS, ["source_grounded"], verifierChecklist, 5, timeoutMs)];
    case "parallel_primary_and_critic":
      return [
        contract("worker-primary", "primary", `Develop a well-supported answer to: ${task}`, ["proposed answer", "supporting evidence", "explicit assumptions"], input, DEFAULT_TOOLS, ["source_grounded"], verifierChecklist, 4, timeoutMs),
        contract("worker-critic", "critic", `Independently test the proposed answer space for gaps, counterexamples, and unsupported claims for: ${task}`, ["risks or counterexamples", "corrections", "evidence for critiques"], input, DEFAULT_TOOLS, ["source_grounded", "counterexample_or_gap"], verifierChecklist, 4, timeoutMs),
      ];
    case "research_and_analysis":
      return [
        contract("worker-researcher", "researcher", `Gather and summarize relevant, attributable evidence for: ${task}`, ["evidence inventory", "source references", "coverage gaps"], input, ["search", "retrieval"], ["source_grounded", "source_attribution"], verifierChecklist, 5, timeoutMs),
        contract("worker-analyst", "analyst", `Analyze the available evidence and produce a bounded conclusion for: ${task}`, ["analysis", "conclusion", "limitations and uncertainty"], input, ["retrieval"], ["source_grounded", "limitations"], verifierChecklist, 3, timeoutMs),
      ];
    case "tool_heavy_single_worker":
      return [contract("worker-tool-specialist", "tool_specialist", `Use the permitted tools to complete: ${task}`, ["result summary", "tool-backed evidence", "unavailable information"], input, ["search", "retrieval", "file"], ["source_grounded", "tool_trace"], verifierChecklist, 8, input.timeLimitMs ?? 120_000)];
  }
}

function inferToolRequirements(workers: UltraWorkerTaskContract[]): string[] {
  return [...new Set(workers.flatMap((worker) => worker.requiredTools))];
}

function buildVerifierChecklist(topology: UltraTopology): string[] {
  const base = [
    "claims_have_evidence",
    "no_hallucinated_facts",
    "output_complete",
  ];
  switch (topology) {
    case "parallel_primary_and_critic":
      return [...base, "worker_outputs_consistent", "no_contradictory_claims"];
    case "research_and_analysis":
      return [...base, "sources_accessible", "analysis_distinguishes_evidence_from_inference"];
    case "tool_heavy_single_worker":
      return [...base, "tool_outputs_cited", "sources_accessible"];
    default:
      return base;
  }
}

function buildUserVisibleSummary(
  topology: UltraTopology,
  input: UltraPlanInput
): string {
  switch (topology) {
    case "single_verified":
      return `Single verified worker will process: ${input.task.slice(0, 120)}`;
    case "parallel_primary_and_critic":
      return `A primary worker will draft an answer and a critic will test it for gaps: ${input.task.slice(0, 120)}`;
    case "research_and_analysis":
      return `A researcher will gather evidence and an analyst will form a bounded conclusion: ${input.task.slice(0, 120)}`;
    case "tool_heavy_single_worker":
      return `One tool-specialist worker will use only permitted tools: ${input.task.slice(0, 120)}`;
  }
}

export function planUltraTask(input: UltraPlanInput): UltraPlan {
  const task = input.task.trim();
  if (!task) {
    throw new Error("Ultra planner requires a non-empty task");
  }

  const topology = selectTopology(input);
  const verifierChecklist = buildVerifierChecklist(topology);
  const workers = buildWorkerTasks(topology, { ...input, task }, verifierChecklist);
  const toolRequirements = inferToolRequirements(workers);
  const userVisibleSummary = buildUserVisibleSummary(topology, input);

  return {
    planId: `plan-${topology}`,
    taskSummary: task,
    topology,
    workers,
    toolRequirements,
    evidenceRequirements: ["source_grounded"],
    verifierChecklist,
    userVisibleSummary,
    costLimitUsd: input.costLimitUsd ?? 2.0,
    timeLimitMs: input.timeLimitMs ?? 60_000,
    maxWorkers: Math.min(Math.max(input.maxWorkers ?? 2, 1), 2),
  };
}

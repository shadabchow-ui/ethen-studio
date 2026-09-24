/**
 * Studio V5 Creative Agent — explicit stage machine (STUDIO_17).
 * Recovered from Director guarded transitions (director-plan.ts
 * PLAN_TRANSITIONS/TASK_TRANSITIONS): every move is allow-listed, every
 * bypass records a skip reason, and only the four authority backedges may
 * move backwards, each within its cap.
 */
import "server-only";
import {
  BACKEDGE_CAPS,
  agentError,
  type AgentStage,
  type AgentTerminal,
  type BackedgeUsage,
} from "./types";

export type StageNode = AgentStage | AgentTerminal;

/** Forward edges of the machine (authority §14 stage order). */
const FORWARD_EDGES: Readonly<Record<AgentStage, readonly StageNode[]>> = {
  INVESTIGATE: ["PLAN"],
  PLAN: ["AUTHOR"],
  AUTHOR: ["VALIDATE"],
  VALIDATE: ["ESTIMATE"],
  ESTIMATE: ["RESERVE"],
  RESERVE: ["POLICY_CHECK"],
  POLICY_CHECK: ["APPROVAL", "EXECUTE"],
  // POLICY_CHECK→EXECUTE is a recorded skip (no approval needed), never silent.
  APPROVAL: ["EXECUTE", "PLAN"],
  // APPROVAL→PLAN is the revise-after-deny edge (replan, not a repair loop).
  EXECUTE: ["OBSERVE"],
  OBSERVE: ["VERIFY"],
  VERIFY: ["PRESENT"],
  PRESENT: ["PUBLISH_APPROVAL", "COMPLETED"],
  PUBLISH_APPROVAL: ["PUBLISHED", "PRESENT"],
  // PUBLISH_APPROVAL→PRESENT: publish declined, results still presented.
};

/** Permitted backedges (authority §14), each with a per-run cap. */
export const ALLOWED_BACKEDGES: ReadonlyArray<{
  from: AgentStage;
  to: AgentStage;
  counter: keyof BackedgeUsage;
  cap: number;
}> = [
  { from: "EXECUTE", to: "PLAN", counter: "executeToPlan", cap: BACKEDGE_CAPS.executeToPlan },
  { from: "VERIFY", to: "OBSERVE", counter: "verifyToObserve", cap: BACKEDGE_CAPS.verifyToObserve },
  { from: "VERIFY", to: "PLAN", counter: "verifyToPlan", cap: BACKEDGE_CAPS.verifyToPlan },
  { from: "INVESTIGATE", to: "PLAN", counter: "executeToPlan", cap: BACKEDGE_CAPS.executeToPlan },
];

export interface TransitionRequest {
  from: StageNode;
  to: StageNode;
  backedges: BackedgeUsage;
  /** Required when the edge skips a stage (recorded skip reason). */
  skipReason?: string;
}

export interface TransitionOutcome {
  kind: "forward" | "backedge" | "stop" | "terminal" | "skip";
  /** Backedge counter to increment, when kind is backedge. */
  counter: keyof BackedgeUsage | null;
}

const TERMINAL_MOVES: Readonly<Record<AgentTerminal, readonly StageNode[]>> = {
  COMPLETED: [],
  PUBLISHED: [],
  STOPPED: [],
  FAILED: [],
  BLOCKED: [],
};

/** Edges that count as skips and require a recorded reason. */
const SKIP_EDGES: ReadonlySet<string> = new Set([
  "POLICY_CHECK→EXECUTE",
  "PRESENT→COMPLETED",
]);

export function classifyTransition(request: TransitionRequest): TransitionOutcome {
  const { from, to } = request;
  if (from === to) {
    throw agentError("BAD_REQUEST", `Agent transition ${from} → ${to} is a no-op.`);
  }
  // Terminals are absorbing.
  if ((TERMINAL_MOVES as Readonly<Record<string, readonly StageNode[]>>)[from] !== undefined) {
    throw agentError("CONFLICT", `Agent run is terminal (${from}); no further transitions.`);
  }
  // Operator stop from any live stage.
  if (to === "STOPPED") return { kind: "stop", counter: null };
  // Terminal outcomes from their valid sources.
  if (to === "FAILED" || to === "BLOCKED") {
    if (from === "EXECUTE" || from === "OBSERVE" || from === "VERIFY" || from === "POLICY_CHECK" || from === "APPROVAL") {
      return { kind: "terminal", counter: null };
    }
    throw agentError("BAD_REQUEST", `Agent transition ${from} → ${to} is not permitted.`);
  }
  const forward = FORWARD_EDGES[from as AgentStage] ?? [];
  if ((forward as readonly string[]).includes(to)) {
    const edgeKey = `${from}→${to}`;
    if (SKIP_EDGES.has(edgeKey)) {
      if (!request.skipReason?.trim()) {
        throw agentError("BAD_REQUEST", `Agent transition ${edgeKey} skips a stage and needs a recorded reason.`);
      }
      return { kind: "skip", counter: null };
    }
    return { kind: "forward", counter: null };
  }
  const backedge = ALLOWED_BACKEDGES.find((edge) => edge.from === from && edge.to === to);
  if (backedge) {
    // INVESTIGATE→PLAN is also a forward edge; the table above already
    // returned it. Remaining backedges consume capped counters.
    const used = request.backedges[backedge.counter];
    if (used >= backedge.cap) {
      throw agentError(
        "CONFLICT",
        `Backedge ${from} → ${to} exhausted its cap (${backedge.cap}); a human must intervene.`,
        { from, to, cap: backedge.cap },
      );
    }
    return { kind: "backedge", counter: backedge.counter };
  }
  throw agentError("BAD_REQUEST", `Agent transition ${from} → ${to} is not a permitted edge.`, {
    from,
    to,
    permitted: [...forward, ...ALLOWED_BACKEDGES.filter((e) => e.from === from).map((e) => e.to)],
  });
}

/** All legal successors of a stage (for UI affordances; terminals none). */
export function legalSuccessors(from: StageNode, backedges: BackedgeUsage): StageNode[] {
  if ((TERMINAL_MOVES as Readonly<Record<string, readonly StageNode[]>>)[from] !== undefined) return [];
  const next = new Set<StageNode>([...(FORWARD_EDGES[from as AgentStage] ?? []), "STOPPED"]);
  for (const edge of ALLOWED_BACKEDGES) {
    if (edge.from === from && backedges[edge.counter] < edge.cap) next.add(edge.to);
  }
  if (from === "EXECUTE" || from === "OBSERVE" || from === "VERIFY" || from === "POLICY_CHECK" || from === "APPROVAL") {
    next.add("FAILED");
    next.add("BLOCKED");
  }
  return [...next];
}

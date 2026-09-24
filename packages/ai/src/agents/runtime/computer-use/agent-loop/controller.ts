/**
 * DEPRECATED — Reference typed state machine. NOT the live authoritative agent loop.
 *
 * The live authoritative agent-loop path is:
 *   lib/agents/runtime/computer-use/deterministic-loop.ts
 * called from:
 *   app/api/computer-use/runs/[runId]/agent-loop/start/route.ts
 *
 * This controller is retained as a type-safe reference implementation of the
 * full state machine contract, but no API or UI code calls it at runtime.
 * Do not base validation, budget tracking, or security reasoning on this file.
 */
import type { ComputerAction, ComputerUseReplayEvent, PermissionScope } from "../types";
import { createRun, addComputerUseEvent, setComputerUseRunStatus, getNowIso } from "../store";
import { createMockBrowserSession } from "../actions";
import type { BrowserSession } from "../actions";

import type {
  AgentLoopState,
  AgentLoopBudget,
  AgentLoopContext,
  AgentDecision,
  LoopRunResult,
} from "./types";
import { AGENT_LOOP_TERMINAL_STATES, agentLoopStateToRunStatus } from "./types";

import {
  createBudgetTracker,
  recordAction,
  recordFailure,
  validateBudget,
  isBudgetExceeded,
  type BudgetTracker,
} from "./budgets";

import { requestMockDecision } from "./mock-planner";

export interface AgentLoopController {
  context: AgentLoopContext;
  runId: string;
  state: AgentLoopState;
  session: BrowserSession;
  tracker: BudgetTracker;
  decisions: AgentDecision[];
  events: ComputerUseReplayEvent[];
}

export function createLoopController(context: AgentLoopContext): AgentLoopController {
  const defaultScope: PermissionScope = context.permissionScope || {
    allowedDomains: [],
    blockedDomains: [],
    allowedActions: ["screenshot", "click", "type", "scroll", "navigate", "wait", "inspectDom"],
    approvalRequiredActions: [],
    blockedActions: [],
    credentialMode: "none",
    fileSystemScope: "none",
    networkMode: "allowlist",
    dataRetention: "session-only",
    maxSteps: context.budget.maxSteps,
    maxRuntimeMinutes: Math.ceil(context.budget.maxDurationMs / 60000),
  };

  const run = createRun({
    userId: "agent-loop",
    title: context.goal.slice(0, 80),
    task: context.goal,
    mode: "browser",
    provider: "playwright",
    maxSteps: context.budget.maxSteps,
    permissionScope: defaultScope,
  });

  setComputerUseRunStatus(run.id, "starting");

  addComputerUseEvent(run.id, {
    runId: run.id,
    type: "run.started",
    timestamp: getNowIso(),
    actor: "system",
    metadata: { goal: context.goal, budgetMaxSteps: context.budget.maxSteps },
  });

  const initialUrl = context.initialUrl || "about:blank";
  const session = createMockBrowserSession(run.id, initialUrl);

  return {
    context,
    runId: run.id,
    state: "starting",
    session,
    tracker: createBudgetTracker(),
    decisions: [],
    events: [],
  };
}

export async function tickLoop(ctrl: AgentLoopController): Promise<{
  state: AgentLoopState;
  decision: AgentDecision | null;
  budgetExceeded: boolean;
  budgetReason?: string;
}> {
  if (AGENT_LOOP_TERMINAL_STATES.has(ctrl.state)) {
    return { state: ctrl.state, decision: null, budgetExceeded: false };
  }

  const budgetStatus = validateBudget(ctrl.tracker, ctrl.context.budget);
  if (isBudgetExceeded(budgetStatus)) {
    completeLoop(ctrl, "timed_out", budgetStatus.reason || "Budget exhausted");
    return {
      state: "timed_out",
      decision: null,
      budgetExceeded: true,
      budgetReason: budgetStatus.reason,
    };
  }

  const decision = requestMockDecision({
    goal: ctrl.context.goal,
    currentUrl: ctrl.session.currentUrl,
    stepIndex: ctrl.tracker.stepsUsed,
    maxSteps: ctrl.context.budget.maxSteps,
  });

  ctrl.decisions.push(decision);

  addComputerUseEvent(ctrl.runId, {
    runId: ctrl.runId,
    type: "agent.thought_summary",
    timestamp: getNowIso(),
    actor: "agent",
    metadata: {
      stepIndex: ctrl.tracker.stepsUsed,
      intent: decision.intent,
      summary: decision.summary,
      confidence: decision.confidence,
    },
  });

  switch (decision.intent) {
    case "act": {
      if (decision.nextAction) {
        const normalizedAction = normalizeLoopAction(decision.nextAction);
        recordAction(ctrl.tracker, normalizedAction);

        addComputerUseEvent(ctrl.runId, {
          runId: ctrl.runId,
          type: "action.proposed",
          timestamp: getNowIso(),
          actor: "agent",
          action: normalizedAction,
          metadata: {
            stepIndex: ctrl.tracker.stepsUsed - 1,
            summary: decision.summary,
            confidence: decision.confidence,
          },
        });

        ctrl.state = "proposed_action";
        setComputerUseRunStatus(ctrl.runId, "running");
      } else {
        recordFailure(ctrl.tracker);
        addComputerUseEvent(ctrl.runId, {
          runId: ctrl.runId,
          type: "action.failed",
          timestamp: getNowIso(),
          actor: "agent",
          metadata: {
            error: "act intent without nextAction",
            stepIndex: ctrl.tracker.stepsUsed,
          },
        });
      }
      break;
    }

    case "request_approval": {
      addComputerUseEvent(ctrl.runId, {
        runId: ctrl.runId,
        type: "approval.requested",
        timestamp: getNowIso(),
        actor: "agent",
        action: decision.nextAction,
        metadata: {
          reason: decision.reason,
          summary: decision.summary,
          stepIndex: ctrl.tracker.stepsUsed,
        },
      });

      ctrl.state = "approval_needed";
      setComputerUseRunStatus(ctrl.runId, "approval_needed");
      break;
    }

    case "ask_user": {
      addComputerUseEvent(ctrl.runId, {
        runId: ctrl.runId,
        type: "user.paused",
        timestamp: getNowIso(),
        actor: "agent",
        metadata: {
          question: decision.question,
          summary: decision.summary,
          stepIndex: ctrl.tracker.stepsUsed,
        },
      });

      ctrl.state = "paused";
      setComputerUseRunStatus(ctrl.runId, "paused");
      break;
    }

    case "complete": {
      completeLoop(ctrl, "completed", decision.summary);
      break;
    }

    case "fail": {
      recordFailure(ctrl.tracker);
      completeLoop(ctrl, "failed", decision.summary || decision.reason || "Task failed");
      break;
    }

    case "blocked": {
      addComputerUseEvent(ctrl.runId, {
        runId: ctrl.runId,
        type: "policy.blocked",
        timestamp: getNowIso(),
        actor: "policy",
        metadata: {
          reason: decision.reason,
          summary: decision.summary,
          stepIndex: ctrl.tracker.stepsUsed,
        },
      });

      completeLoop(ctrl, "failed", decision.reason || "Action blocked by policy");
      break;
    }
  }

  return {
    state: ctrl.state,
    decision,
    budgetExceeded: false,
  };
}

function completeLoop(ctrl: AgentLoopController, state: AgentLoopState, reason: string): void {
  ctrl.state = state;
  const runStatus = agentLoopStateToRunStatus(state) as Parameters<typeof setComputerUseRunStatus>[1];

  setComputerUseRunStatus(ctrl.runId, runStatus);

  const eventType = state === "completed"
    ? "run.completed"
    : state === "failed"
    ? "run.failed"
    : state === "cancelled"
    ? "run.aborted"
    : "run.failed";

  addComputerUseEvent(ctrl.runId, {
    runId: ctrl.runId,
    type: eventType as ComputerUseReplayEvent["type"],
    timestamp: getNowIso(),
    actor: "runtime",
    metadata: {
      finalState: state,
      reason,
      stepsProposed: ctrl.tracker.stepsUsed,
      decisions: ctrl.decisions.length,
    },
  });
}

export function getLoopResult(ctrl: AgentLoopController): LoopRunResult {
  const durationMs = Date.now() - ctrl.tracker.startedAt;

  return {
    runId: ctrl.runId,
    finalState: ctrl.state,
    stepsProposed: ctrl.tracker.stepsUsed,
    decisions: ctrl.decisions,
    events: ctrl.events,
    durationMs,
    summary: `Loop ended in state "${ctrl.state}" after ${ctrl.tracker.stepsUsed} steps (${durationMs}ms)`,
  };
}

export async function runAutonomousLoop(
  ctx: AgentLoopContext,
): Promise<LoopRunResult> {
  const ctrl = createLoopController(ctx);
  const startedAt = Date.now();

  while (!AGENT_LOOP_TERMINAL_STATES.has(ctrl.state)) {
    await tickLoop(ctrl);

    if (ctrl.state === "approval_needed" || ctrl.state === "paused") {
      break;
    }
  }

  const result = getLoopResult(ctrl);
  result.durationMs = Date.now() - startedAt;
  return result;
}

function normalizeLoopAction(action: ComputerAction): ComputerAction {
  return {
    type: action.type,
    x: action.x,
    y: action.y,
    button: action.button ?? "left",
    from: action.from,
    to: action.to,
    direction: action.direction ?? "down",
    amount: action.amount,
    text: action.text,
    keys: action.keys,
    ms: action.ms,
    url: action.url,
    ref: action.ref,
    targetLabel: action.targetLabel,
    sensitive: action.sensitive ?? false,
    reason: action.reason,
    summary: action.summary,
    metadata: action.metadata,
  };
}

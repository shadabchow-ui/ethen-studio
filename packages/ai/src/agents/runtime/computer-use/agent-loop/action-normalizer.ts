import type { ComputerAction, ComputerActionType } from "../types";
import type { ModelActionProposal, ModelIntent, AgentDecision } from "./types";

const KNOWN_ACTION_TYPES: Set<ComputerActionType> = new Set([
  "screenshot",
  "click",
  "double_click",
  "drag",
  "scroll",
  "type",
  "key",
  "wait",
  "navigate",
  "pressKey",
  "inspectDom",
  "dom_click",
  "dom_type",
  "extractText",
  "extractLinks",
  "extractHeadings",
  "extractTable",
  "complete",
  "fail",
]);

const ACTION_REQUIRED_FIELDS: Record<string, string[]> = {
  navigate: ["url"],
  click: ["x", "y"],
  double_click: ["x", "y"],
  dom_click: [],
  drag: ["from", "to"],
  scroll: [],
  type: ["text"],
  dom_type: ["text"],
  key: [],
  pressKey: [],
  wait: [],
  screenshot: [],
  inspectDom: [],
  extractText: [],
  extractLinks: [],
  extractHeadings: [],
  extractTable: [],
  complete: [],
  fail: [],
};

const MAX_WAIT_MS = 30_000;
const VALID_SCROLL_DIRECTIONS = new Set(["up", "down", "left", "right"]);
const VALID_BUTTONS = new Set(["left", "right", "middle"]);

export interface NormalizeResult {
  ok: boolean;
  action: ComputerAction | null;
  error: string | null;
  intent: ModelIntent | null;
}

export function normalizeModelProposal(proposal: ModelActionProposal): NormalizeResult {
  if (!proposal) {
    return {
      ok: false,
      action: null,
      error: "Proposal is null or undefined.",
      intent: null,
    };
  }

  const validIntents: Set<ModelIntent> = new Set([
    "act",
    "ask_user",
    "request_approval",
    "complete",
    "fail",
  ]);

  if (!validIntents.has(proposal.intent)) {
    return {
      ok: false,
      action: null,
      error: `Unknown intent "${proposal.intent}". Must be one of: act, ask_user, request_approval, complete, fail.`,
      intent: null,
    };
  }

  if (typeof proposal.summary !== "string" || proposal.summary.length === 0) {
    return {
      ok: false,
      action: null,
      error: "Proposal summary is required and must be a non-empty string.",
      intent: proposal.intent,
    };
  }

  if (typeof proposal.confidence !== "number" || proposal.confidence < 0 || proposal.confidence > 1) {
    return {
      ok: false,
      action: null,
      error: `Confidence must be a number between 0 and 1. Got: ${proposal.confidence}`,
      intent: proposal.intent,
    };
  }

  if (proposal.intent === "act" || proposal.intent === "request_approval") {
    if (!proposal.nextAction) {
      return {
        ok: false,
        action: null,
        error: `Intent "${proposal.intent}" requires a nextAction.`,
        intent: proposal.intent,
      };
    }

    return normalizeNextAction(proposal.nextAction, proposal);
  }

  if (proposal.intent === "ask_user") {
    return {
      ok: true,
      action: null,
      error: null,
      intent: "ask_user",
    };
  }

  if (proposal.intent === "complete") {
    return {
      ok: true,
      action: {
        type: "complete",
        summary: proposal.summary,
        reason: proposal.expectedOutcome ?? undefined,
      },
      error: null,
      intent: "complete",
    };
  }

  if (proposal.intent === "fail") {
    return {
      ok: true,
      action: {
        type: "fail",
        reason: proposal.summary,
        summary: proposal.expectedOutcome ?? undefined,
      },
      error: null,
      intent: "fail",
    };
  }

  return {
    ok: false,
    action: null,
    error: `Unhandled intent "${proposal.intent}".`,
    intent: proposal.intent,
  };
}

function normalizeNextAction(
  rawAction: ComputerAction,
  _proposal: ModelActionProposal,
): NormalizeResult {
  const actionType = rawAction.type as ComputerActionType;

  if (!KNOWN_ACTION_TYPES.has(actionType)) {
    return {
      ok: false,
      action: null,
      error: `Unknown action type "${actionType}". Known types: ${Array.from(KNOWN_ACTION_TYPES).join(", ")}`,
      intent: _proposal.intent,
    };
  }

  const requiredFields = ACTION_REQUIRED_FIELDS[actionType] ?? [];

  const missingFields: string[] = [];
  for (const field of requiredFields) {
    const value = (rawAction as unknown as Record<string, unknown>)[field];
    if (value === undefined || value === null) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      action: null,
      error: `Action type "${actionType}" requires missing fields: ${missingFields.join(", ")}`,
      intent: _proposal.intent,
    };
  }

  const requiresCoordinates = actionType === "click" || actionType === "double_click";
  if (requiresCoordinates && (!isFiniteCoordinate(rawAction.x) || !isFiniteCoordinate(rawAction.y))) {
    return { ok: false, action: null, error: `${actionType} requires finite numeric x and y coordinates.`, intent: _proposal.intent };
  }
  if (actionType === "drag" && (!isCoordinatePair(rawAction.from) || !isCoordinatePair(rawAction.to))) {
    return { ok: false, action: null, error: "drag requires finite [x, y] from and to coordinates.", intent: _proposal.intent };
  }
  if ((actionType === "type" || actionType === "dom_type") && (typeof rawAction.text !== "string" || rawAction.text.length === 0)) {
    return { ok: false, action: null, error: `${actionType} requires non-empty text.`, intent: _proposal.intent };
  }

  if (actionType === "wait") {
    const ms = rawAction.ms;
    if (ms !== undefined) {
      if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) {
        return {
          ok: false,
          action: null,
          error: `wait ms must be a positive number. Got: ${ms}`,
          intent: _proposal.intent,
        };
      }
      if (ms > MAX_WAIT_MS) {
        return {
          ok: false,
          action: null,
          error: `wait ms exceeds maximum allowed (${MAX_WAIT_MS}ms). Got: ${ms}`,
          intent: _proposal.intent,
        };
      }
    }
  }

  if (actionType === "navigate" && rawAction.url !== undefined) {
    if (typeof rawAction.url !== "string" || rawAction.url.trim().length === 0) {
      return {
        ok: false,
        action: null,
        error: "navigate url must be a non-empty string.",
        intent: _proposal.intent,
      };
    }
  }

  // dom_click now supports ref-based targeting: either (x,y) coordinates or a
  // snapshot-scoped ref (resolved to coordinates at execution time). Both missing
  // is a hard error.
  if (actionType === "dom_click") {
    const hasXY = rawAction.x !== undefined && rawAction.y !== undefined;
    const hasRef = typeof rawAction.ref === "string" && rawAction.ref.length > 0;
    if (!hasXY && !hasRef) {
      return {
        ok: false,
        action: null,
        error: `dom_click requires (x, y) coordinates or a valid element ref. Neither provided.`,
        intent: _proposal.intent,
      };
    }
  }

  if (actionType === "scroll") {
    if (rawAction.direction !== undefined && !VALID_SCROLL_DIRECTIONS.has(rawAction.direction)) {
      return {
        ok: false,
        action: null,
        error: `scroll direction "${rawAction.direction}" is invalid. Must be one of: ${Array.from(VALID_SCROLL_DIRECTIONS).join(", ")}`,
        intent: _proposal.intent,
      };
    }
    if (rawAction.amount !== undefined && (typeof rawAction.amount !== "number" || rawAction.amount < 0)) {
      return {
        ok: false,
        action: null,
        error: `scroll amount must be a non-negative number. Got: ${rawAction.amount}`,
        intent: _proposal.intent,
      };
    }
  }

  if (actionType === "click" || actionType === "double_click" || actionType === "dom_click") {
    if (rawAction.button !== undefined && !VALID_BUTTONS.has(rawAction.button)) {
      return {
        ok: false,
        action: null,
        error: `button "${rawAction.button}" is invalid. Must be one of: ${Array.from(VALID_BUTTONS).join(", ")}`,
        intent: _proposal.intent,
      };
    }
  }

  if (actionType === "key" || actionType === "pressKey") {
    const hasKeys = Array.isArray(rawAction.keys) && rawAction.keys.length > 0;
    const hasText = typeof rawAction.text === "string" && rawAction.text.length > 0;
    if (!hasKeys && !hasText) {
      return {
        ok: false,
        action: null,
        error: `Action type "${actionType}" requires at least one of keys (array) or text (string).`,
        intent: _proposal.intent,
      };
    }
  }

  const normalized: ComputerAction = {
    type: actionType,
  };

  if (rawAction.x !== undefined) normalized.x = rawAction.x;
  if (rawAction.y !== undefined) normalized.y = rawAction.y;
  if (rawAction.button !== undefined) normalized.button = rawAction.button;
  else if (actionType === "click" || actionType === "double_click" || actionType === "dom_click") normalized.button = "left";
  if (rawAction.from !== undefined) normalized.from = rawAction.from;
  if (rawAction.to !== undefined) normalized.to = rawAction.to;
  if (rawAction.direction !== undefined) normalized.direction = rawAction.direction;
  else if (actionType === "scroll") normalized.direction = "down";
  if (rawAction.amount !== undefined) normalized.amount = rawAction.amount;
  if (rawAction.text !== undefined) normalized.text = rawAction.text;
  if (rawAction.keys !== undefined) normalized.keys = rawAction.keys;
  if (rawAction.ms !== undefined) normalized.ms = rawAction.ms;
  if (rawAction.url !== undefined) normalized.url = rawAction.url;
  if (rawAction.ref !== undefined) normalized.ref = rawAction.ref;
  if (rawAction.targetLabel !== undefined) normalized.targetLabel = rawAction.targetLabel;
  if (rawAction.sensitive !== undefined) normalized.sensitive = rawAction.sensitive;
  else normalized.sensitive = false;
  if (rawAction.reason !== undefined) normalized.reason = rawAction.reason;
  if (rawAction.summary !== undefined) normalized.summary = rawAction.summary;
  if (rawAction.metadata !== undefined) normalized.metadata = rawAction.metadata;

  return {
    ok: true,
    action: normalized,
    error: null,
    intent: _proposal.intent,
  };
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && isFiniteCoordinate(value[0]) && isFiniteCoordinate(value[1]);
}

export function rejectProposal(proposal: ModelActionProposal, reason: string): NormalizeResult {
  return {
    ok: false,
    action: null,
    error: reason,
    intent: proposal?.intent ?? null,
  };
}

const ALLOWED_DECISION_INTENTS: Set<AgentDecision["intent"]> = new Set([
  "act",
  "complete",
  "ask_user",
  "fail",
]);

export function validateDecisionSchema(decision: AgentDecision): { valid: boolean; error?: string } {
  if (!decision || typeof decision !== "object") {
    return { valid: false, error: "Decision is null or not an object." };
  }

  if (!ALLOWED_DECISION_INTENTS.has(decision.intent)) {
    return {
      valid: false,
      error: `Unknown intent "${decision.intent}". Allowed: act, complete, ask_user, fail.`,
    };
  }

  if (typeof decision.summary !== "string" || decision.summary.length === 0) {
    return { valid: false, error: "Decision summary is required and must be a non-empty string." };
  }

  if ((decision.intent === "act") && !decision.nextAction) {
    return { valid: false, error: 'Intent "act" requires a nextAction.' };
  }

  if (decision.intent === "ask_user" && (!decision.question || typeof decision.question !== "string")) {
    return { valid: false, error: 'Intent "ask_user" requires a question string.' };
  }

  const validConfidences = new Set(["high", "medium", "low"]);
  if (!validConfidences.has(decision.confidence)) {
    return { valid: false, error: `Invalid confidence "${decision.confidence}". Must be high, medium, or low.` };
  }

  if (decision.nextAction) {
    const action = decision.nextAction;
    const actionType = action.type as ComputerActionType;
    if (!KNOWN_ACTION_TYPES.has(actionType)) {
      return {
        valid: false,
        error: `Unknown action type "${actionType}". Known types: ${Array.from(KNOWN_ACTION_TYPES).join(", ")}`,
      };
    }

    const normalized = normalizeNextAction(action, {
      intent: decision.intent === "act" ? "act" : "request_approval",
      summary: decision.summary,
      confidence: decision.confidence === "high" ? 0.9 : decision.confidence === "medium" ? 0.6 : 0.3,
      nextAction: action,
      expectedOutcome: null,
      riskAssessment: null,
    });
    if (!normalized.ok) return { valid: false, error: normalized.error ?? "Invalid action proposal." };

    if (actionType === "wait" && action.ms !== undefined) {
      if (typeof action.ms !== "number" || !Number.isFinite(action.ms) || action.ms <= 0) {
        return { valid: false, error: `wait ms must be a positive number. Got: ${action.ms}` };
      }
      if (action.ms > MAX_WAIT_MS) {
        return { valid: false, error: `wait ms exceeds maximum allowed (${MAX_WAIT_MS}ms). Got: ${action.ms}` };
      }
    }

    if (actionType === "scroll" && action.direction !== undefined) {
      if (!VALID_SCROLL_DIRECTIONS.has(action.direction)) {
        return { valid: false, error: `scroll direction "${action.direction}" is invalid.` };
      }
    }

    if (actionType === "key" || actionType === "pressKey") {
      const hasKeys = Array.isArray(action.keys) && action.keys.length > 0;
      const hasText = typeof action.text === "string" && action.text.length > 0;
      if (!hasKeys && !hasText) {
        return { valid: false, error: `Action type "${actionType}" requires at least one of keys or text.` };
      }
    }
  }

  return { valid: true };
}

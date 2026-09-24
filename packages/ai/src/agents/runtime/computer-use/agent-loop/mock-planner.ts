// DETERMINISTIC FALLBACK PLANNER — not AI, not an LLM.
// This is the safe fallback used when no LLM provider is configured for
// Computer Use planning. Uses keyword matching against the user's task/goal
// to select structured actions. Produces AgentDecision objects that must
// pass schema validation before any action executes.
//
// The model router (planner/model-router.ts) calls this planner automatically
// when no LLM provider is configured or all providers fail.
//
// This planner must be preserved and must never be described as true AI
// browser planning. UI must label it "Fallback planner — no LLM provider
// configured" when active.

import type { ComputerAction } from "../types";
import type { AgentDecision } from "./types";

export interface MockPlannerInput {
  goal: string;
  currentUrl: string;
  stepIndex: number;
  maxSteps: number;
}

function createDecision(
  intent: AgentDecision["intent"],
  summary: string,
  overrides?: Partial<AgentDecision>,
): AgentDecision {
  return {
    intent,
    summary,
    confidence: "high",
    ...overrides,
  };
}

export function requestFallbackDecision(input: MockPlannerInput): AgentDecision {
  const { goal, currentUrl, stepIndex, maxSteps } = input;

  if (stepIndex >= maxSteps) {
    return createDecision("complete", "Reached maximum steps", {
      confidence: "high",
      summary: "Task stopped: maximum step budget reached.",
    });
  }

  const lower = goal.toLowerCase().trim();

  if (lower.includes("navigate") || lower.includes("go to") || lower.includes("open") || lower.includes("visit")) {
    const urlMatch = goal.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      return createDecision("act", `Navigate to ${urlMatch[0]}`, {
        nextAction: { type: "navigate", url: urlMatch[0] },
        confidence: "high",
      });
    }
    if (stepIndex === 0 && (currentUrl === "about:blank" || !currentUrl)) {
      return createDecision("ask_user", "No URL specified for navigation", {
        question: "Which URL would you like me to navigate to?",
        confidence: "high",
        reason: "goal mentions navigation but no URL found",
      });
    }
  }

  if (lower.includes("screenshot") || lower.includes("capture") || lower.includes("take a picture")) {
    return createDecision("act", "Capture screenshot", {
      nextAction: { type: "screenshot" },
      confidence: "high",
    });
  }

  if (lower.includes("click")) {
    const labelMatch = goal.match(/click\s+(?:on\s+)?["']?([^"'.,]+)["']?/i);
    const targetLabel = labelMatch?.[1]?.trim();
    return createDecision("act", `Click ${targetLabel ? `on "${targetLabel}"` : ""}`, {
      nextAction: {
        type: "click",
        x: 400,
        y: 300,
        targetLabel: targetLabel || "target",
      },
      confidence: "medium",
    });
  }

  if (lower.includes("type") || lower.includes("fill") || lower.includes("enter") || lower.includes("write")) {
    return createDecision("act", "Type text into field", {
      nextAction: {
        type: "type",
        text: "mock input",
        targetLabel: "input field",
      },
      confidence: "medium",
    });
  }

  if (lower.includes("scroll")) {
    return createDecision("act", "Scroll page", {
      nextAction: { type: "scroll", direction: "down", amount: 300 },
      confidence: "high",
    });
  }

  if (lower.includes("wait") || lower.includes("pause")) {
    return createDecision("act", "Wait", {
      nextAction: { type: "wait", ms: 2000 },
      confidence: "high",
    });
  }

  if (lower.includes("inspect") || lower.includes("dom") || lower.includes("elements")) {
    return createDecision("act", "Inspect DOM", {
      nextAction: { type: "inspectDom" },
      confidence: "high",
    });
  }

  if (lower.includes("extract text") || lower.includes("get text") || lower.includes("read text") || lower.includes("page text") || (lower.includes("text") && (lower.includes("extract") || lower.includes("read")))) {
    return createDecision("act", "Extract visible text from page", {
      nextAction: { type: "extractText" },
      confidence: "high",
    });
  }

  if (lower.includes("extract links") || lower.includes("get links") || lower.includes("all links") || lower.includes("list links")) {
    return createDecision("act", "Extract links from page", {
      nextAction: { type: "extractLinks" },
      confidence: "high",
    });
  }

  if (lower.includes("extract headings") || lower.includes("get headings") || lower.includes("list headings") || lower.includes("page headings") || (lower.includes("headings") && (lower.includes("extract") || lower.includes("get") || lower.includes("list") || lower.includes("read")))) {
    return createDecision("act", "Extract headings from page", {
      nextAction: { type: "extractHeadings" },
      confidence: "high",
    });
  }

  if (lower.includes("extract table") || lower.includes("get table") || lower.includes("read table") || lower.includes("table data")) {
    return createDecision("act", "Extract table from page", {
      nextAction: { type: "extractTable" },
      confidence: "high",
    });
  }

  if (lower.includes("press") || lower.includes("key") || lower.includes("enter key") || lower.includes("escape")) {
    let keys: string[] = ["Enter"];
    if (lower.includes("escape")) keys = ["Escape"];
    else if (lower.includes("tab")) keys = ["Tab"];
    return createDecision("act", "Press key", {
      nextAction: { type: "pressKey", keys },
      confidence: "high",
    });
  }

  if (lower.includes("login") || lower.includes("sign in") || lower.includes("authenticate")) {
    return createDecision("ask_user", "Login requires user takeover", {
      reason: "Authentication flows require user approval or takeover",
      question: "Authentication is needed. Would you like to take over the browser to log in?",
      confidence: "high",
    });
  }

  if (lower.includes("submit") || lower.includes("send") || lower.includes("confirm")) {
    return createDecision("ask_user", "Form submission requires approval", {
      reason: "Submitting forms may have external side effects",
      question: "A form submission is needed. Approve to continue.",
      confidence: "high",
    });
  }

  if (lower.includes("delete") || lower.includes("remove") || lower.includes("destroy")) {
    return createDecision("fail", "Destructive actions blocked", {
      reason: "Delete/remove actions require explicit admin approval",
      confidence: "high",
    });
  }

  if (lower.includes("buy") || lower.includes("purchase") || lower.includes("pay") || lower.includes("checkout")) {
    return createDecision("fail", "Payment actions blocked", {
      reason: "Purchase and payment actions require explicit user approval and takeover",
      confidence: "high",
    });
  }

  if (stepIndex === 0) {
    return createDecision("act", "Take initial screenshot to observe", {
      nextAction: { type: "screenshot" },
      confidence: "medium",
    });
  }

  return createDecision("ask_user", "Unsupported or ambiguous task", {
    question: `I'm not sure how to proceed with: "${goal}". What would you like me to do?`,
    confidence: "low",
    reason: "task did not match any known action patterns",
  });
}

export { requestFallbackDecision as requestMockDecision };

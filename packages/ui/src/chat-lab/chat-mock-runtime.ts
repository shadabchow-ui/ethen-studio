/**
 * CHAT_A2_1 deterministic mock + CHAT_A2_2 streaming story runtime.
 *
 * The design lab must deterministically exercise success / stop / failure /
 * retry without a production model API. A real streaming transport can
 * replace this mock later behind the same narrow interface: start a run for
 * a submission snapshot, observe working → tool activity → chunk → completed
 * / failed hooks, cancel the run. Every hook carries the runId so the
 * controller can ignore late events after Stop.
 */

import type { ChatSource, ToolStep } from "./chat-fixtures";
import type { ChatSubmission } from "./chat-conversation";

export type ChatRuntimeHooks = Readonly<{
  onWorking: (runId: string) => void;
  onToolActivity: (runId: string, steps: readonly ToolStep[]) => void;
  onSources: (runId: string, sources: readonly ChatSource[]) => void;
  onChunk: (runId: string, text: string) => void;
  onCompleted: (runId: string, text: string) => void;
  onFailed: (runId: string) => void;
}>;

export type ChatRuntimeHandle = Readonly<{ cancel: () => void }>;

export type ChatRuntimeOutcome = "success" | "failure";

export type ChatRuntime = Readonly<{
  start: (submission: ChatSubmission, hooks: ChatRuntimeHooks) => ChatRuntimeHandle;
}>;

const SUCCESS_TEXT =
  "The pattern is consistent: the conversational surface stays deliberately " +
  "sparse, and everything organisational moves to the platform. This is a " +
  "deterministic design-lab response — no production model was called.";

export { createEthenProductionRuntime } from "./chat-production-runtime";

function assertNotProduction(name: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[SECURITY] ${name} is a mock/scripted test runtime and is strictly prohibited in production builds. ` +
      `Use createEthenProductionRuntime() instead.`
    );
  }
}

function timerHandle(ids: readonly number[]): ChatRuntimeHandle {
  let cancelled = false;
  return {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      for (const id of ids) clearTimeout(id);
    },
  };
}

/**
 * Deterministic timed mock: working → one partial chunk → completed/failed.
 * Cancel clears pending timers; any timer that already fired is still gated
 * by runId in the controller, so late events stay ignored.
 */
export function createDeterministicMockRuntime(outcome: ChatRuntimeOutcome = "success"): ChatRuntime {
  assertNotProduction("createDeterministicMockRuntime");
  return {
    start: (submission, hooks) => {
      const ids: number[] = [];
      ids.push(
        window.setTimeout(() => hooks.onWorking(submission.runId), 0),
        window.setTimeout(() => hooks.onChunk(submission.runId, SUCCESS_TEXT.slice(0, 96)), 120),
        window.setTimeout(
          () =>
            outcome === "success"
              ? hooks.onCompleted(submission.runId, SUCCESS_TEXT)
              : hooks.onFailed(submission.runId),
          320,
        ),
      );
      return timerHandle(ids);
    },
  };
}

// ── Streaming story ─────────────────────────────────────────────────────────

/** The deterministic story: prose → code → tool activity → more prose. */
export const STREAMING_STORY_TEXT =
  "The pattern is consistent: the conversational surface stays deliberately sparse, and everything organisational moves to the platform.\n\n" +
  "```css\n.rail {\n  background: var(--chat-sidebar);\n  width: 272px;\n}\n```\n\n" +
  "The rail recedes; the conversation is the only lit surface. Send stays quiet until there is something worth sending.";

export const STREAMING_STORY_SOURCES: readonly ChatSource[] = [
  { id: "story-s1", title: "Ethen Chat — dedicated chatbot UI design spec", origin: "Repository", detail: "design/ref/chat" },
  { id: "story-s2", title: "D18 route redesign map", origin: "Repository", detail: "artifacts/d18" },
  { id: "story-s3", title: "Cortex provider registry", origin: "Repository", detail: "lib/cortex/provider-registry.ts" },
];

/** Steady word-group cadence (~35ms) inside the 25–40ms band; first chunk is immediate. */
export const STREAMING_STORY_CADENCE_MS = 35;

function storyPrefixes(text: string, wordsPerChunk: number): string[] {
  const words = text.split(/(\s+)/);
  const prefixes: string[] = [];
  let current = "";
  let wordCount = 0;
  for (const part of words) {
    current += part;
    if (!/^\s+$/.test(part)) wordCount += 1;
    if (wordCount >= wordsPerChunk) {
      prefixes.push(current);
      current = "";
      wordCount = 0;
    }
  }
  if (current.length > 0) prefixes.push(text);
  else if (prefixes.length > 0) prefixes[prefixes.length - 1] = text;
  return prefixes;
}

/**
 * Deterministic multi-stage story runtime for the streaming specimen:
 * Working → Searching/Reading → prose chunks → code fence chunks → Running
 * code → sources → more prose → completion (or mid-stream failure, which
 * preserves everything received so far). Cancel clears pending timers.
 */
export function createStreamingStoryRuntime(scenario: ChatRuntimeOutcome = "success"): ChatRuntime {
  assertNotProduction("createStreamingStoryRuntime");
  return {
    start: (submission, hooks) => {
      const runId = submission.runId;
      const ids: number[] = [];
      const at = (ms: number, fn: () => void) => ids.push(window.setTimeout(fn, ms));
      const searching: readonly ToolStep[] = [{ id: `${runId}-search`, label: "Searching", detail: "8 sources", state: "running" }];
      const reading: readonly ToolStep[] = [
        { id: `${runId}-search`, label: "Searched the web", detail: "8 sources", state: "done" },
        { id: `${runId}-read`, label: "Reading sources", detail: "2 of 3", state: "running" },
      ];
      const coding: readonly ToolStep[] = [
        { id: `${runId}-search`, label: "Searched the web", detail: "8 sources", state: "done" },
        { id: `${runId}-read`, label: "Read sources", detail: "3 pages", state: "done" },
        { id: `${runId}-code`, label: "Running code", detail: "Completed in 1.4s", state: "running" },
      ];

      at(0, () => hooks.onWorking(runId));
      at(60, () => hooks.onToolActivity(runId, searching));
      at(140, () => hooks.onToolActivity(runId, reading));

      const prefixes = storyPrefixes(STREAMING_STORY_TEXT, 6);
      const cutoff = scenario === "success" ? prefixes.length : Math.max(2, Math.floor(prefixes.length * 0.6));
      prefixes.slice(0, cutoff).forEach((prefix, k) => {
        at(200 + k * STREAMING_STORY_CADENCE_MS, () => hooks.onChunk(runId, prefix));
      });
      const lastChunkAt = 200 + (cutoff - 1) * STREAMING_STORY_CADENCE_MS;

      at(lastChunkAt + 40, () => hooks.onToolActivity(runId, coding));
      at(lastChunkAt + 80, () => hooks.onSources(runId, STREAMING_STORY_SOURCES.slice(0, 2)));
      if (scenario === "success") {
        at(lastChunkAt + 120, () => hooks.onSources(runId, STREAMING_STORY_SOURCES));
        at(lastChunkAt + 160, () => hooks.onCompleted(runId, STREAMING_STORY_TEXT));
      } else {
        at(lastChunkAt + 120, () => hooks.onFailed(runId));
      }
      return timerHandle(ids);
    },
  };
}

/**
 * Synchronous scripted runtime for tests: the caller steps the run manually,
 * so stop/cancel and late-event ordering are fully deterministic.
 */
export function createScriptedTestRuntime() {
  assertNotProduction("createScriptedTestRuntime");
  const started: ChatSubmission[] = [];
  let cancelled = 0;
  let hooksFor: ChatRuntimeHooks | null = null;
  let submissionFor: ChatSubmission | null = null;
  const runtime: ChatRuntime = {
    start: (submission, hooks) => {
      started.push(submission);
      hooksFor = hooks;
      submissionFor = submission;
      return { cancel: () => { cancelled += 1; } };
    },
  };
  return {
    runtime,
    started,
    emitWorking: () => { if (submissionFor && hooksFor) hooksFor.onWorking(submissionFor.runId); },
    emitToolActivity: (steps: readonly ToolStep[]) => { if (submissionFor && hooksFor) hooksFor.onToolActivity(submissionFor.runId, steps); },
    emitSources: (sources: readonly ChatSource[]) => { if (submissionFor && hooksFor) hooksFor.onSources(submissionFor.runId, sources); },
    emitChunk: (text: string) => { if (submissionFor && hooksFor) hooksFor.onChunk(submissionFor.runId, text); },
    emitCompleted: (text: string) => { if (submissionFor && hooksFor) hooksFor.onCompleted(submissionFor.runId, text); },
    emitFailed: () => { if (submissionFor && hooksFor) hooksFor.onFailed(submissionFor.runId); },
    cancelledCount: () => cancelled,
  };
}

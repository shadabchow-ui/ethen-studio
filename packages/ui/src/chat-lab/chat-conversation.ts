/**
 * CHAT_A2_1 — local conversation controller/state machine.
 *
 * One owner for draft, submission, turns, active run, run status, model,
 * intelligence mode, tools, attachments, retry, stop and failure state.
 * Pure (no React, no DOM, no network) so the design lab can exercise the
 * lifecycle deterministically and the focused test can prove it in node.
 *
 * Lifecycle: idle → submitting → working → streaming → completed
 *                              ↘ stopped / failed → retrying → working …
 *
 * A real streaming transport can replace the deterministic mock runtime
 * later: the runtime only needs `start(submission, hooks)` returning a
 * cancellable handle, and every hook carries the runId so late events from
 * a cancelled run are ignored by id comparison.
 */

import type { ChatAttachment, ChatSource, ChatTurn, ThinkingLevel, ToolStep } from "./chat-fixtures";
import { parseStreamText } from "./chat-stream-blocks";

export type ChatRunStatus =
  | "idle"
  | "submitting"
  | "working"
  | "streaming"
  | "tool-running"
  | "completed"
  | "stopped"
  | "failed"
  | "retrying";

export type ChatSubmission = Readonly<{
  runId: string;
  text: string;
  attachments: readonly ChatAttachment[];
  modelId: string;
  thinking: ThinkingLevel;
  tools: readonly string[];
  userTurnId: string;
  assistantTurnId: string;
}>;

export type ChatFailure = Readonly<{ title: string; detail: string; action: string }>;

export type ChatConversationState = Readonly<{
  draft: string;
  attachments: readonly ChatAttachment[];
  tools: readonly string[];
  modelId: string;
  thinking: ThinkingLevel;
  turns: readonly ChatTurn[];
  activeChatId: string | null;
  runStatus: ChatRunStatus;
  activeRunId: string | null;
  runSequence: number;
  lastSubmission: ChatSubmission | null;
  failure: ChatFailure | null;
  /** attempts per assistant turn id, so retry never overwrites history. */
  attempts: Readonly<Record<string, number>>;
}>;

export type ChatConversationInit = Readonly<{
  draft?: string;
  attachments?: readonly ChatAttachment[];
  tools?: readonly string[];
  modelId?: string;
  thinking?: ThinkingLevel;
  turns?: readonly ChatTurn[];
  activeChatId?: string | null;
}>;

const DEFAULT_MODEL = "astra";

export function createInitialConversation(init: ChatConversationInit = {}): ChatConversationState {
  return {
    draft: init.draft ?? "",
    attachments: init.attachments ?? [],
    tools: init.tools ?? [],
    modelId: init.modelId ?? DEFAULT_MODEL,
    thinking: init.thinking ?? "Think",
    turns: init.turns ?? [],
    activeChatId: init.activeChatId ?? null,
    runStatus: "idle",
    activeRunId: null,
    runSequence: 0,
    lastSubmission: null,
    failure: null,
    attempts: {},
  };
}

/** An attachment blocks Send unless it is explicitly ready (absent state counts as ready). */
export function isAttachmentReady(attachment: ChatAttachment): boolean {
  return (attachment.state ?? "ready") === "ready";
}

export function hasBlockingAttachment(attachments: readonly ChatAttachment[]): boolean {
  return attachments.some((attachment) => !isAttachmentReady(attachment));
}

export function isBusyStatus(status: ChatRunStatus): boolean {
  return (
    status === "submitting" ||
    status === "working" ||
    status === "streaming" ||
    status === "tool-running" ||
    status === "retrying"
  );
}

export function isBusy(state: ChatConversationState): boolean {
  return state.activeRunId !== null && isBusyStatus(state.runStatus);
}

/** Send is allowed only with sendable content, ready attachments, and no active run. */
export function canSend(state: ChatConversationState): boolean {
  const hasText = state.draft.trim().length > 0;
  const hasReadyAttachment = state.attachments.some(isAttachmentReady);
  if (!hasText && !hasReadyAttachment) return false;
  if (hasBlockingAttachment(state.attachments)) return false;
  if (isBusy(state)) return false;
  return true;
}

function nextRunId(sequence: number): string {
  return `run-${sequence}`;
}

/**
 * Snapshot the exact submission BEFORE clearing the editable draft, create
 * the user turn immediately, and open a placeholder assistant turn in
 * `working` state. Returns `accepted: false` with unchanged state when the
 * send is not allowed (empty, blocked attachment, or a run already active)
 * so repeated Enter/click cannot duplicate the turn.
 */
export function submit(
  state: ChatConversationState,
): Readonly<{ state: ChatConversationState; submission: ChatSubmission | null; accepted: boolean }> {
  if (!canSend(state)) return { state, submission: null, accepted: false };
  const sequence = state.runSequence + 1;
  const runId = nextRunId(sequence);
  const text = state.draft.trim();
  // Snapshot only ready attachments; failed/uploading tiles stay in the
  // composer for retry/removal and are never silently submitted or dropped.
  const readyAttachments = state.attachments.filter(isAttachmentReady);
  const leftoverAttachments = state.attachments.filter((attachment) => !isAttachmentReady(attachment));
  const submission: ChatSubmission = {
    runId,
    text,
    attachments: readyAttachments,
    modelId: state.modelId,
    thinking: state.thinking,
    tools: state.tools,
    userTurnId: `u-${runId}`,
    assistantTurnId: `a-${runId}`,
  };
  const userTurn: ChatTurn = {
    id: submission.userTurnId,
    role: "user",
    text: submission.text,
    ...(submission.attachments.length > 0 ? { attachments: submission.attachments } : {}),
  };
  const assistantTurn: ChatTurn = {
    id: submission.assistantTurnId,
    role: "ethen",
    streaming: true,
    streamText: "",
    steps: [{ id: `${runId}-thinking`, label: "Thinking", detail: "", state: "running" }],
  };
  return {
    state: {
      ...state,
      draft: "",
      // Clear only the submitted ready attachments; keep failed/uploading.
      attachments: leftoverAttachments,
      turns: [...state.turns, userTurn, assistantTurn],
      runStatus: "working",
      activeRunId: runId,
      runSequence: sequence,
      lastSubmission: submission,
      failure: null,
      attempts: { ...state.attempts, [submission.assistantTurnId]: 1 },
    },
    submission,
    accepted: true,
  };
}

/**
 * Append streamed text to the active assistant turn; stale runIds are
 * ignored. `text` is cumulative: the incremental parser keeps the completed
 * prefix stable (same keys, same content) and only the tail grows, so the
 * response tree never remounts mid-stream.
 */
export function applyRunChunk(
  state: ChatConversationState,
  runId: string,
  text: string,
): ChatConversationState {
  if (state.activeRunId !== runId || !isBusy(state)) return state;
  return {
    ...state,
    runStatus: "streaming",
    turns: state.turns.map((turn) =>
      turn.id === `a-${runId}`
        ? { ...turn, streaming: true, streamText: text, blocks: parseStreamText(text) }
        : turn,
    ),
  };
}

/**
 * Truthful tool-activity update for the active run; stale runIds are
 * ignored. Only execution state is stored — never private reasoning.
 */
export function applyRunToolActivity(
  state: ChatConversationState,
  runId: string,
  steps: readonly ToolStep[],
): ChatConversationState {
  if (state.activeRunId !== runId || !isBusy(state)) return state;
  return {
    ...state,
    runStatus: "tool-running",
    turns: state.turns.map((turn) => (turn.id === `a-${runId}` ? { ...turn, steps } : turn)),
  };
}

/**
 * Append newly available sources; identifiers seen before keep their
 * position, so citation numbers already shown are never renumbered.
 */
export function applyRunSources(
  state: ChatConversationState,
  runId: string,
  sources: readonly ChatSource[],
): ChatConversationState {
  if (state.activeRunId !== runId || !isBusy(state)) return state;
  return {
    ...state,
    turns: state.turns.map((turn) => {
      if (turn.id !== `a-${runId}`) return turn;
      const seen = new Set((turn.sources ?? []).map((source) => source.id));
      const merged = [...(turn.sources ?? [])];
      for (const source of sources) {
        if (!seen.has(source.id)) {
          seen.add(source.id);
          merged.push(source);
        }
      }
      return { ...turn, sources: merged };
    }),
  };
}

/**
 * Mark the active run complete: flush buffered content, finalize the
 * unfinished tail, and keep the response tree (same deterministic keys —
 * completion never remounts the attempt).
 */
export function applyRunCompleted(
  state: ChatConversationState,
  runId: string,
  text?: string,
): ChatConversationState {
  if (state.activeRunId !== runId || !isBusy(state)) return state;
  return {
    ...state,
    runStatus: "completed",
    activeRunId: null,
    turns: state.turns.map((turn) => {
      if (turn.id !== `a-${runId}`) return turn;
      const finalText = text ?? turn.streamText ?? "";
      return {
        ...turn,
        streaming: false,
        streamText: finalText,
        steps: (turn.steps ?? []).map((step) => ({ ...step, state: "done" as const })),
        ...(finalText.length > 0 ? { blocks: parseStreamText(finalText) } : {}),
      };
    }),
  };
}

/** Mark the active run failed; the user turn, attachments and submission are retained. */
export function applyRunFailed(
  state: ChatConversationState,
  runId: string,
  failure: ChatFailure,
): ChatConversationState {
  if (state.activeRunId !== runId || !isBusy(state)) return state;
  return {
    ...state,
    runStatus: "failed",
    activeRunId: null,
    failure,
    turns: state.turns.map((turn) =>
      turn.id === `a-${runId}`
        ? {
            ...turn,
            streaming: false,
            steps: (turn.steps ?? []).map((step) =>
              step.state === "running" ? { ...step, state: "failed" as const } : step,
            ),
            error: { ...failure },
          }
        : turn,
    ),
  };
}

/**
 * Stop acknowledges immediately: the run is cancelled, already-produced
 * partial output is preserved, the turn is marked Stopped, and later events
 * for the cancelled runId are ignored by the appliers above.
 */
export function stop(state: ChatConversationState): ChatConversationState {
  if (!isBusy(state) || state.activeRunId === null) return state;
  const runId = state.activeRunId;
  return {
    ...state,
    runStatus: "stopped",
    activeRunId: null,
    turns: state.turns.map((turn) =>
      turn.id === `a-${runId}`
        ? {
            ...turn,
            streaming: false,
            stopped: true,
            steps: (turn.steps ?? []).map((step) =>
              step.state === "running" ? { ...step, state: "done" as const } : step,
            ),
          }
        : turn,
    ),
  };
}

/**
 * Retry preserves the previous attempt untouched, opens a NEW assistant
 * attempt reusing the relevant prior user submission, and guards against
 * duplicate side effects (no-op while busy or with nothing to retry).
 */
export function retry(
  state: ChatConversationState,
): Readonly<{ state: ChatConversationState; submission: ChatSubmission | null; accepted: boolean }> {
  if (isBusy(state)) return { state, submission: null, accepted: false };
  const prior = state.lastSubmission;
  if (prior === null) return { state, submission: null, accepted: false };
  const sequence = state.runSequence + 1;
  const runId = nextRunId(sequence);
  const submission: ChatSubmission = {
    ...prior,
    runId,
    assistantTurnId: `a-${runId}`,
  };
  const assistantTurn: ChatTurn = {
    id: submission.assistantTurnId,
    role: "ethen",
    streaming: true,
    streamText: "",
    attempt: (state.attempts[prior.assistantTurnId] ?? 1) + 1,
    steps: [{ id: `${runId}-thinking`, label: "Thinking", detail: "", state: "running" }],
  };
  return {
    state: {
      ...state,
      runStatus: "retrying",
      activeRunId: runId,
      runSequence: sequence,
      lastSubmission: submission,
      failure: null,
      attempts: { ...state.attempts, [submission.assistantTurnId]: assistantTurn.attempt ?? 1 },
      turns: [...state.turns, assistantTurn],
    },
    submission,
    accepted: true,
  };
}

/** Minimal local conversation activation: no persistence, no backend sync. */
export function selectConversation(
  state: ChatConversationState,
  activeChatId: string | null,
  turns: readonly ChatTurn[],
): ChatConversationState {
  if (isBusy(state)) return state;
  return {
    ...state,
    activeChatId,
    turns,
    runStatus: "idle",
    activeRunId: null,
    failure: null,
    lastSubmission: null,
  };
}

export function newConversation(state: ChatConversationState): ChatConversationState {
  if (isBusy(state)) return state;
  return {
    ...state,
    draft: "",
    turns: [],
    activeChatId: null,
    runStatus: "idle",
    activeRunId: null,
    lastSubmission: null,
    failure: null,
  };
}

/** Truthful high-level UI status; never a fake chain-of-thought label. */
export function describeRunStatus(status: ChatRunStatus, thinking: ThinkingLevel): string {
  switch (status) {
    case "submitting":
      return "Working";
    case "working":
      return thinking === "Fast" ? "Working" : "Thinking";
    case "streaming":
      return "Working";
    case "tool-running":
      return "Working";
    case "retrying":
      return "Working";
    case "stopped":
      return "Stopped";
    case "failed":
      return "Failed";
    default:
      return "Idle";
  }
}

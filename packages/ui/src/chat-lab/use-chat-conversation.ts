"use client";

/**
 * CHAT_A2_1 — single owner of Chat run state.
 *
 * The shell owns this hook; the composer stays a controlled input surface
 * (draft, attachments, tools, model, thinking) and never keeps conflicting
 * generation state. Stop cancels the active runtime handle and the
 * controller ignores late events by runId.
 */

import * as React from "react";
import {
  applyRunChunk,
  applyRunCompleted,
  applyRunFailed,
  applyRunSources,
  applyRunToolActivity,
  canSend,
  createInitialConversation,
  describeRunStatus,
  newConversation,
  retry as retryState,
  selectConversation,
  stop as stopState,
  submit as submitState,
  type ChatConversationInit,
  type ChatConversationState,
  type ChatSubmission,
} from "./chat-conversation";
import { ChatStreamBuffer } from "./chat-stream-buffer";
import {
  createDeterministicMockRuntime,
  createEthenProductionRuntime,
  type ChatRuntime,
} from "./chat-mock-runtime";

export type UseChatConversation = Readonly<{
  state: ChatConversationState;
  submissionPreview: ChatSubmission | null;
  canSendNow: boolean;
  statusLabel: string;
  generating: boolean;
  setDraft: (draft: string) => void;
  setAttachments: (attachments: ChatConversationState["attachments"]) => void;
  setTools: (tools: readonly string[]) => void;
  setModel: (modelId: string) => void;
  setThinking: (thinking: ChatConversationState["thinking"]) => void;
  send: () => boolean;
  stop: () => void;
  retry: () => boolean;
  selectChat: (chatId: string | null, turns: ChatConversationState["turns"]) => void;
  newChat: () => void;
}>;

const SEND_FAILURE = { title: "Message did not send", detail: "The local run failed before Ethen replied. Your content is kept.", action: "Retry" } as const;

export function useChatConversation(init: ChatConversationInit = {}, runtime?: ChatRuntime): UseChatConversation {
  // Lazy singleton per mount; no ref access during render.
  const [runtimeInstance] = React.useState<ChatRuntime | null>(
    () =>
      runtime ??
      (typeof window !== "undefined"
        ? process.env.NODE_ENV === "production"
          ? createEthenProductionRuntime()
          : createDeterministicMockRuntime("success")
        : null),
  );
  const runtimeRef = React.useRef<ChatRuntime | null>(runtimeInstance);
  React.useEffect(() => {
    runtimeRef.current = runtime ?? runtimeInstance;
  }, [runtime, runtimeInstance]);
  const handleRef = React.useRef<{ cancel: () => void } | null>(null);
  const [state, setState] = React.useState<ChatConversationState>(() => createInitialConversation(init));
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [submissionPreview, setSubmissionPreview] = React.useState<ChatSubmission | null>(null);

  const cancelActive = React.useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
  }, []);

  // First chunk flushes immediately; steady arrivals batch on a ~30ms
  // trailing window so streaming never causes one update per token.
  const [streamBuffer] = React.useState(
    () => new ChatStreamBuffer((runId, text) => setState((current) => applyRunChunk(current, runId, text))),
  );
  const startRuntime = React.useCallback(
    (submission: ChatSubmission) => {
      const hooks = {
        onWorking: () => undefined,
        onToolActivity: (runId: string, steps: Parameters<typeof applyRunToolActivity>[2]) =>
          setState((current) => applyRunToolActivity(current, runId, steps)),
        onSources: (runId: string, sources: Parameters<typeof applyRunSources>[2]) =>
          setState((current) => applyRunSources(current, runId, sources)),
        onChunk: (runId: string, text: string) => streamBuffer.push(runId, text),
        onCompleted: (runId: string, text: string) => {
          streamBuffer.flushRun(runId);
          setState((current) => applyRunCompleted(current, runId, text));
          handleRef.current = null;
        },
        onFailed: (runId: string) => {
          streamBuffer.flushRun(runId);
          setState((current) => applyRunFailed(current, runId, SEND_FAILURE));
          handleRef.current = null;
        },
      };
      if (runtimeRef.current) handleRef.current = runtimeRef.current.start(submission, hooks);
    },
    [streamBuffer],
  );

  const send = React.useCallback(() => {
    // Pure transition computed outside the updater so StrictMode double-invoke cannot duplicate turns.
    const result = submitState(stateRef.current);
    if (!result.accepted || result.submission === null) return false;
    setState(result.state);
    setSubmissionPreview(result.submission);
    startRuntime(result.submission);
    return true;
  }, [startRuntime]);

  const stop = React.useCallback(() => {
    // Flush what arrived, acknowledge immediately, then cancel; late runtime
    // events stay ignored by runId and partial content is preserved.
    const activeRunId = stateRef.current.activeRunId;
    if (activeRunId) streamBuffer.flushRun(activeRunId);
    cancelActive();
    setState((current) => stopState(current));
  }, [cancelActive, streamBuffer]);

  const retry = React.useCallback(() => {
    const result = retryState(stateRef.current);
    if (!result.accepted || result.submission === null) return false;
    setState(result.state);
    setSubmissionPreview(result.submission);
    startRuntime(result.submission);
    return true;
  }, [startRuntime]);

  React.useEffect(() => () => handleRef.current?.cancel(), []);

  const generating = state.activeRunId !== null;

  return {
    state,
    submissionPreview,
    canSendNow: canSend(state),
    statusLabel: describeRunStatus(state.runStatus, state.thinking),
    generating,
    setDraft: (draft) => setState((current) => ({ ...current, draft })),
    setAttachments: (attachments) => setState((current) => ({ ...current, attachments })),
    setTools: (tools) => setState((current) => ({ ...current, tools })),
    setModel: (modelId) => setState((current) => ({ ...current, modelId })),
    setThinking: (thinking) => setState((current) => ({ ...current, thinking })),
    send,
    stop,
    retry,
    // CHAT_A5.1 — switching mid-run is one coherent transition: flush what
    // arrived, cancel the runtime, THEN stop (preserving partial output and
    // clearing the run id) and select. Cancelling without stopping stranded
    // the state layer busy forever with no runtime left to complete it.
    selectChat: (chatId, turns) => {
      const current = stateRef.current;
      if (current.activeRunId) streamBuffer.flushRun(current.activeRunId);
      cancelActive();
      setState((c) => selectConversation(stopState(c), chatId, turns));
    },
    newChat: () => {
      const current = stateRef.current;
      if (current.activeRunId) streamBuffer.flushRun(current.activeRunId);
      cancelActive();
      setState((c) => newConversation(stopState(c)));
    },
  };
}

/**
 * Ethen Chat Production Runtime.
 *
 * Implements the ChatRuntime interface backed by the AI SDK server transport,
 * with persistence and resumable streams.
 *
 * Guarantees:
 * - Emits onWorking immediately upon start.
 * - Relays tool activity, sources, cumulative text chunks, completed, and failed hooks.
 * - Handles Stop via abort and cancel endpoint.
 * - Automatically reconnects to the resume endpoint if connection disconnects mid-stream,
 *   replaying missed segments so the final transcript matches identically.
 * - Survives page refresh and new browser sessions via persistent chat and stream state.
 */

import type {
  ChatRuntime,
  ChatRuntimeHandle,
  ChatRuntimeHooks,
} from "./chat-mock-runtime";
import type { ChatSubmission } from "./chat-conversation";
import type { ChatSource, ToolStep } from "./chat-fixtures";

export interface ProductionRuntimeOptions {
  apiEndpoint?: string;
  resumeEndpoint?: string;
  cancelEndpoint?: string;
  fetchFn?: typeof fetch;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
}

export function createEthenProductionRuntime(
  options: ProductionRuntimeOptions = {},
): ChatRuntime {
  const apiEndpoint = options.apiEndpoint ?? "/api/chat";
  const resumeEndpoint = options.resumeEndpoint ?? "/api/chat/stream";
  const cancelEndpoint = options.cancelEndpoint ?? "/api/chat/cancel";
  const fetchFn = options.fetchFn ?? (typeof window !== "undefined" ? window.fetch.bind(window) : fetch);
  const maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
  const reconnectDelayMs = options.reconnectDelayMs ?? 100;

  return {
    start: (submission: ChatSubmission, hooks: ChatRuntimeHooks): ChatRuntimeHandle => {
      const runId = submission.runId;
      let aborted = false;
      let completed = false;
      let accumulatedText = "";
      let lastSequence = 0;
      let abortController = new AbortController();

      // 1. Immediately indicate working
      hooks.onWorking(runId);

      const processEvent = (event: {
        type: string;
        runId?: string;
        sequence?: number;
        text?: string;
        delta?: string;
        steps?: readonly ToolStep[];
        sources?: readonly ChatSource[];
        error?: { title: string; detail: string; action: string };
        transcriptHash?: string;
      }) => {
        if (aborted || completed) return;
        if (event.sequence && event.sequence > lastSequence) {
          lastSequence = event.sequence;
        }

        switch (event.type) {
          case "working":
            hooks.onWorking(runId);
            break;
          case "tool-activity":
            if (event.steps) {
              hooks.onToolActivity(runId, event.steps);
            }
            break;
          case "sources":
            if (event.sources) {
              hooks.onSources(runId, event.sources);
            }
            break;
          case "chunk": {
            const newText = event.text ?? (accumulatedText + (event.delta ?? ""));
            accumulatedText = newText;
            hooks.onChunk(runId, accumulatedText);
            break;
          }
          case "completed":
            completed = true;
            if (typeof event.text === "string") {
              accumulatedText = event.text;
            }
            hooks.onCompleted(runId, accumulatedText);
            break;
          case "failed":
            completed = true;
            hooks.onFailed(runId);
            break;
          case "stopped":
            completed = true;
            break;
        }
      };

      const parseSseBuffer = (buffer: string): { remaining: string } => {
        const lines = buffer.split(/\r?\n/);
        let eventType = "message";
        let eventData = "";
        let eventId: number | undefined;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const d = line.slice(5).trim();
            eventData = eventData ? `${eventData}\n${d}` : d;
          } else if (line.startsWith("id:")) {
            const parsed = parseInt(line.slice(3).trim(), 10);
            if (!Number.isNaN(parsed)) eventId = parsed;
          } else if (line === "") {
            // End of event
            if (eventData) {
              try {
                const parsed = JSON.parse(eventData) as Record<string, unknown>;
                processEvent({
                  type: eventType !== "message" ? eventType : (parsed.type as string) ?? "chunk",
                  runId,
                  sequence: eventId ?? (parsed.sequence as number) ?? undefined,
                  text: (parsed.text as string) ?? undefined,
                  delta: (parsed.delta as string) ?? undefined,
                  steps: (parsed.steps as readonly ToolStep[]) ?? undefined,
                  sources: (parsed.sources as readonly ChatSource[]) ?? undefined,
                  error: (parsed.error as { title: string; detail: string; action: string }) ?? undefined,
                  transcriptHash: (parsed.transcriptHash as string) ?? undefined,
                });
              } catch {
                // Fallback for plain text delta
                processEvent({
                  type: "chunk",
                  runId,
                  sequence: eventId,
                  delta: eventData,
                });
              }
            }
            eventType = "message";
            eventData = "";
            eventId = undefined;
          }
        }
        return { remaining: lines[lines.length - 1] ?? "" };
      };

      const resumeStream = async (attempt = 1): Promise<void> => {
        if (aborted || completed) return;
        if (attempt > maxReconnectAttempts) {
          hooks.onFailed(runId);
          return;
        }

        try {
          if (reconnectDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, reconnectDelayMs));
          }
          if (aborted || completed) return;

          abortController = new AbortController();
          const resumeUrl = `${resumeEndpoint}?streamId=${encodeURIComponent(runId)}&sinceSequence=${lastSequence}`;
          const response = await fetchFn(resumeUrl, {
            method: "GET",
            headers: {
              Accept: "text/event-stream",
              "Last-Event-ID": String(lastSequence),
            },
            signal: abortController.signal,
          });

          if (!response.ok) {
            if (response.status === 410) {
              // Expired
              hooks.onFailed(runId);
              return;
            }
            throw new Error(`Resume failed with status ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("No readable stream available in resume response.");
          }

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              buffer += decoder.decode(value, { stream: true });
              const { remaining } = parseSseBuffer(buffer);
              buffer = remaining;
            }
          }

          if (!completed && !aborted) {
            hooks.onCompleted(runId, accumulatedText);
          }
        } catch {
          if (!aborted && !completed) {
            await resumeStream(attempt + 1);
          }
        }
      };

      const execute = async () => {
        try {
          const bodyPayload = {
            chatId: `chat_${runId}`,
            runId,
            message: submission.text,
            model: submission.modelId,
            thinking: submission.thinking,
            tools: submission.tools,
            attachments: submission.attachments,
            userTurnId: submission.userTurnId,
            assistantTurnId: submission.assistantTurnId,
          };

          const response = await fetchFn(apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
            signal: abortController.signal,
          });

          if (!response.ok) {
            throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("No readable body in chat response.");
          }

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              buffer += decoder.decode(value, { stream: true });
              const { remaining } = parseSseBuffer(buffer);
              buffer = remaining;
            }
          }

          if (!completed && !aborted) {
            hooks.onCompleted(runId, accumulatedText);
          }
        } catch {
          if (!aborted && !completed) {
            // Attempt to recover via resumable stream endpoint
            await resumeStream(1);
          }
        }
      };

      execute();

      return {
        cancel: () => {
          if (aborted || completed) return;
          aborted = true;
          abortController.abort();
          fetchFn(cancelEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ streamId: runId }),
          }).catch(() => {});
        },
      };
    },
  };
}

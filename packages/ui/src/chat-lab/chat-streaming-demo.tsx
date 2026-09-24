"use client";

/**
 * CHAT_A2_2 — deterministic local streaming specimen (the acceptance surface).
 *
 * Mounts the real shell on the scripted story runtime: Send → Working →
 * streamed prose → streamed code fence → tool activity → sources → more
 * prose → completion. Stop mid-stream, failure mid-stream, Retry, scrolling
 * upward while the stream continues, and "Jump to latest" are all exercised
 * here. Local only — no production AI service is called.
 */
import * as React from "react";
import { THREAD_CODE, THREAD_SHORT } from "./chat-fixtures";
import { createStreamingStoryRuntime, type ChatRuntimeOutcome } from "./chat-mock-runtime";
import { EthenChatShell } from "./ethen-chat-shell";

const PREFIX_TURNS = [...THREAD_SHORT, ...THREAD_CODE];

export function StreamingDemo({ theme = "system" }: { theme?: "system" | "light" | "dark" }) {
  const [scenario, setScenario] = React.useState<ChatRuntimeOutcome>("success");
  const [play, setPlay] = React.useState(0);
  // `play` remounts the shell via key; the runtime only depends on scenario.
  const runtime = React.useMemo(() => createStreamingStoryRuntime(scenario), [scenario]);
  const replay = (next: ChatRuntimeOutcome) => {
    setScenario(next);
    setPlay((count) => count + 1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        data-streaming-demo-controls
        style={{ alignItems: "center", display: "flex", flex: "none", gap: 8, padding: "8px 12px" }}
      >
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          Local story runtime — send a message, then Stop, fail, Retry, or scroll away mid-stream.
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => replay("success")}>
          Play success
        </button>
        <button type="button" onClick={() => replay("failure")}>
          Play failure
        </button>
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <EthenChatShell
          key={`${scenario}-${play}`}
          theme={theme}
          turns={PREFIX_TURNS}
          title="Streaming follow demo"
          activeChatId="c2"
          runtime={runtime}
        />
      </div>
    </div>
  );
}

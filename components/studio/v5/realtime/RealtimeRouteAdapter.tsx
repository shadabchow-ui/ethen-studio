/**
 * STUDIO_16 — realtime route adapter.
 * Binds /studio/voice-agents to the V1 realtime routes: session list/detail,
 * transport connect/disconnect/reconnect, stop, topup. Microphone is
 * requested only on user action via getUserMedia; denial surfaces the
 * permission_denied state. Detail polls while the session is live.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RealtimeEventView,
  RealtimeMeteringView,
  RealtimeSessionView,
  RealtimeToolView,
  RealtimeUiSessionState,
  RealtimeUiState,
} from "./types";
import { RealtimeSessionWorkspace, realtimeFailureMessage } from "./RealtimeSessionWorkspace";
import {
  createSession,
  fetchSessionDetail,
  fetchSessions,
  RealtimeApiError,
  stopSession,
  topupSession,
  transportAction,
} from "./realtime-api-client";

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now().toString(36)}`;
}

function uiSessionStateFor(
  session: RealtimeSessionView | null,
  permission: "unknown" | "granted" | "denied",
): RealtimeUiSessionState {
  if (!session) return permission === "denied" ? "permission_denied" : "start";
  switch (session.status) {
    case "STARTING":
      return permission === "denied" ? "permission_denied" : permission === "granted" ? "connecting" : "start";
    case "ACTIVE":
      return "active";
    case "RECONNECTING":
      return "reconnecting";
    case "ENDED":
    case "REVOKED":
      return "ended";
    case "ERRORED":
      return "error";
    default:
      return "error";
  }
}

function speakingFromEvents(events: RealtimeEventView[]): boolean {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const type = events[i].type;
    if (type === "agent.speaking_started") return true;
    if (type === "agent.speaking_stopped" || type === "agent.interrupted" || type === "session.ended") return false;
  }
  return false;
}

export function RealtimeRouteAdapter({
  projectId,
  transportReady,
  transportMessage,
}: {
  projectId: string | null;
  transportReady: boolean;
  transportMessage: string | null;
}) {
  const [uiState, setUiState] = useState<RealtimeUiState>({ state: "loading" });
  const [sessions, setSessions] = useState<RealtimeSessionView[]>([]);
  const [selected, setSelected] = useState<RealtimeSessionView | null>(null);
  const [events, setEvents] = useState<RealtimeEventView[]>([]);
  const [tools, setTools] = useState<RealtimeToolView[]>([]);
  const [metering, setMetering] = useState<RealtimeMeteringView | null>(null);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await fetchSessions(projectId);
        if (cancelled) return;
        setSessions(loaded);
        setUiState(
          loaded.length === 0
            ? { state: "empty", message: "Start a session to talk to a voice agent. Spend is capped before you connect." }
            : { state: "ready" },
        );
      } catch (failure) {
        if (!cancelled) {
          if (failure instanceof RealtimeApiError && failure.code === "SETUP_REQUIRED") {
            setUiState({ state: "setup", message: realtimeFailureMessage(failure), dependency: failure.dependency });
          } else if (failure instanceof RealtimeApiError && failure.code === "PROVIDER_UNAVAILABLE") {
            setUiState({ state: "blocked", message: realtimeFailureMessage(failure) });
          } else {
            setUiState({ state: "error", message: realtimeFailureMessage(failure) });
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken]);

  const refreshDetail = useCallback(async (pid: string, sessionId: string) => {
    const detail = await fetchSessionDetail(pid, sessionId);
    setSelected(detail.session);
    setEvents(detail.events);
    setTools(detail.tools);
    setMetering(detail.metering);
    setSessions((prev) => prev.map((s) => (s.sessionId === sessionId ? detail.session : s)));
  }, []);

  // Poll live sessions for transcript/tool/metering updates.
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!projectId || !selected || (selected.status !== "ACTIVE" && selected.status !== "RECONNECTING")) return;
    const pid = projectId;
    const sid = selected.sessionId;
    pollRef.current = setInterval(() => {
      void refreshDetail(pid, sid).catch(() => undefined);
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [projectId, selected, refreshDetail]);

  const handleSelect = useCallback(
    (sessionId: string) => {
      if (!projectId) return;
      setNotice(null);
      void refreshDetail(projectId, sessionId).catch((failure: unknown) => setNotice(realtimeFailureMessage(failure)));
    },
    [projectId, refreshDetail],
  );

  const handleStart = useCallback(() => {
    if (!projectId) return;
    setBusy("start");
    setNotice(null);
    // Admission needs a quote from the economics estimate flow; the workspace
    // passes the project default quote reference issued at session start.
    void createSession({
      projectId,
      quoteId: "00000000-0000-4000-8000-000000000000",
      transportMode: "native",
      agentId: "default-voice-agent",
      spendCapIcu: 250,
      ceilingIcu: 500,
      rateIcuPerSecond: 1,
      toolScopeIds: [],
      consentGrantId: null,
      recordingRetention: "none",
      idempotencyKey: idempotencyKey(),
    })
      .then((created) => {
        setSessions((prev) => [created, ...prev]);
        setUiState({ state: "ready" });
        setNotice(`Session created with a ${created.spendCapIcu} ICU cap. Enable the microphone, then connect.`);
        return refreshDetail(projectId, created.sessionId);
      })
      .catch((failure: unknown) => setNotice(realtimeFailureMessage(failure)))
      .finally(() => setBusy(null));
  }, [projectId, refreshDetail]);

  const handleRequestPermission = useCallback(() => {
    setNotice(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermission("denied");
      setNotice("This browser does not expose microphone capture.");
      return;
    }
    setBusy("permission");
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        for (const track of stream.getTracks()) track.stop();
        setPermission("granted");
        setNotice("Microphone enabled. Press Connect to join the session.");
      })
      .catch(() => {
        setPermission("denied");
        setNotice("Microphone access was denied.");
      })
      .finally(() => setBusy(null));
  }, []);

  const runTransport = useCallback(
    (action: "connect" | "disconnect" | "reconnect") => {
      if (!projectId || !selected) return;
      setBusy(action);
      setNotice(null);
      void transportAction({
        projectId,
        sessionId: selected.sessionId,
        action,
        transportMode: selected.transportMode === "pipeline" ? "pipeline" : "native",
      })
        .then((result) => {
          setSelected(result.session);
          setSessions((prev) => prev.map((s) => (s.sessionId === result.session.sessionId ? result.session : s)));
          if (action === "connect") setNotice("Connected. Reconnect gaps are never billed.");
          if (action === "reconnect") setNotice(`Reconnected on epoch ${result.session.epoch}.`);
          return refreshDetail(projectId, selected.sessionId);
        })
        .catch((failure: unknown) => setNotice(realtimeFailureMessage(failure)))
        .finally(() => setBusy(null));
    },
    [projectId, selected, refreshDetail],
  );

  const handleStop = useCallback(() => {
    if (!projectId || !selected) return;
    setBusy("stop");
    setNotice(null);
    void stopSession(projectId, selected.sessionId)
      .then((result) => {
        if (result.session) {
          setSelected(result.session);
          setSessions((prev) => prev.map((s) => (s.sessionId === result.session!.sessionId ? result.session! : s)));
        }
        setNotice(
          result.metering
            ? `Session stopped. Settled ${result.metering.settledIcu} ICU; released ${result.metering.releasedIcu} ICU.`
            : "Session stopped.",
        );
        return refreshDetail(projectId, selected.sessionId);
      })
      .catch((failure: unknown) => setNotice(realtimeFailureMessage(failure)))
      .finally(() => setBusy(null));
  }, [projectId, selected, refreshDetail]);

  const handleTopup = useCallback(
    (requestedIcu: number) => {
      if (!projectId || !selected) return;
      setBusy("topup");
      setNotice(null);
      void topupSession({ projectId, sessionId: selected.sessionId, requestedIcu, idempotencyKey: idempotencyKey() })
        .then((result) => {
          if (result.session) {
            setSelected(result.session);
            setSessions((prev) => prev.map((s) => (s.sessionId === result.session!.sessionId ? result.session! : s)));
          }
          setNotice(
            result.topup.atCeiling
              ? `Topped up to the ceiling (${result.topup.reservedIcu} ICU reserved).`
              : `Topped up (${result.topup.reservedIcu} ICU reserved).`,
          );
          return refreshDetail(projectId, selected.sessionId);
        })
        .catch((failure: unknown) => setNotice(realtimeFailureMessage(failure)))
        .finally(() => setBusy(null));
    },
    [projectId, selected, refreshDetail],
  );

  const effectiveUiState: RealtimeUiState = !projectId
    ? { state: "setup", message: "Select a project to open Voice Agents. Sessions are project-scoped." }
    : uiState;

  return (
    <RealtimeSessionWorkspace
      uiState={effectiveUiState}
      sessions={sessions}
      selected={selected}
      events={events}
      tools={tools}
      metering={metering}
      agentSpeaking={speakingFromEvents(events)}
      uiSessionState={uiSessionStateFor(selected, permission)}
      transportReady={transportReady}
      transportMessage={transportMessage}
      busy={busy}
      notice={notice}
      onSelectSession={handleSelect}
      onStart={handleStart}
      onRequestPermission={handleRequestPermission}
      onConnect={() => runTransport("connect")}
      onDisconnect={() => runTransport("disconnect")}
      onReconnect={() => runTransport("reconnect")}
      onStop={handleStop}
      onTopup={handleTopup}
      onRetry={() => setReloadToken((t) => t + 1)}
    />
  );
}

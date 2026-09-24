/**
 * STUDIO_16 — realtime session workspace: start → permission → connecting →
 * active ⇄ reconnecting → ended | error. Audible indicator while the agent
 * speaks, spend cap + metering, transcript/tool feed and stop. Microphone is
 * requested only on user action; denial is an explicit state.
 */
"use client";

import { useState } from "react";
import { StudioPageHeader } from "../shell/PageHeader";
import { StudioEmptyState, StudioErrorState } from "../shell/states";
import { StudioSetupState } from "../shell/StudioSetupState";
import { STUDIO_FOCUS_RING_CLASS, STUDIO_PAGE_CLASS } from "../shell/tokens";
import { RealtimeSessionInspector } from "./RealtimeSessionInspector";
import { RealtimeApiError } from "./realtime-api-client";
import {
  formatDuration,
  formatIcu,
  REALTIME_SESSION_STATE_LABELS,
  type RealtimeEventView,
  type RealtimeMeteringView,
  type RealtimeSessionView,
  type RealtimeToolView,
  type RealtimeUiSessionState,
  type RealtimeUiState,
} from "./types";

export interface RealtimeWorkspaceProps {
  uiState: RealtimeUiState;
  sessions: RealtimeSessionView[];
  selected: RealtimeSessionView | null;
  events: RealtimeEventView[];
  tools: RealtimeToolView[];
  metering: RealtimeMeteringView | null;
  agentSpeaking: boolean;
  uiSessionState: RealtimeUiSessionState;
  transportReady: boolean;
  transportMessage: string | null;
  busy: string | null;
  notice: string | null;
  onSelectSession: (sessionId: string) => void;
  onStart: () => void;
  onRequestPermission: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  onStop: () => void;
  onTopup: (requestedIcu: number) => void;
  onRetry: () => void;
}

const INPUT_CLASS = `min-h-[44px] w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] ${STUDIO_FOCUS_RING_CLASS}`;

const BUTTON_PRIMARY = `inline-flex min-h-[44px] items-center rounded-[12px] bg-[var(--accent)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`;

const BUTTON_GHOST = `inline-flex min-h-[44px] items-center rounded-[12px] border border-[var(--border-subtle)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--text-primary)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`;

function AudibleIndicator({ speaking, live }: { speaking: boolean; live: boolean }) {
  if (!live) return null;
  return (
    <span
      role="status"
      aria-label={speaking ? "Agent is speaking" : "Session live, agent idle"}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1 text-[11px] text-[var(--text-secondary)]"
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${speaking ? "bg-[var(--accent)] motion-safe:animate-pulse" : "bg-[var(--text-muted)]"}`}
      />
      {speaking ? "Agent speaking" : "Listening"}
    </span>
  );
}

export function RealtimeSessionWorkspace(props: RealtimeWorkspaceProps) {
  const { uiState, selected, uiSessionState } = props;
  const [topupIcu, setTopupIcu] = useState("100");
  const busy = props.busy !== null;

  return (
    <div className={STUDIO_PAGE_CLASS} data-testid="realtime-workspace">
      <StudioPageHeader
        eyebrow="Advanced"
        title="Voice Agents"
        description="Realtime voice sessions with spend caps, transcripts and tool oversight."
        routeMarker="voice-agents"
        status={selected ? REALTIME_SESSION_STATE_LABELS[uiSessionState] : null}
      />

      {props.notice && (
        <p data-testid="realtime-notice" role="status" className="mt-4 rounded-[12px] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12px] text-[var(--text-primary)]">
          {props.notice}
        </p>
      )}

      {uiState.state === "loading" && (
        <div className="mt-6 space-y-3" aria-label="Loading sessions" data-testid="realtime-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[64px] rounded-[16px] bg-[var(--bg-elevated)] motion-safe:animate-pulse" />
          ))}
        </div>
      )}

      {uiState.state === "setup" ? (
        (uiState.dependency ?? null) !== null ? (
          <div className="mt-6" data-testid="realtime-setup">
            <StudioSetupState
              what="Voice Agents"
              dependency={uiState.dependency}
              primaryLabel="Go to Assets"
              primaryHref={typeof window !== "undefined" ? `/studio/work/assets?projectId=${encodeURIComponent(new URLSearchParams(window.location.search).get("projectId") ?? "")}` : "/studio/work/assets"}
            />
          </div>
        ) : (
          <>
            <section aria-label="Session preview (locked)" className="mt-6 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 opacity-80">
              <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Sessions</h2>
              <ul className="mt-3 space-y-2" aria-hidden>
                {[0, 1].map((i) => (
                  <li key={i} className="rounded-[12px] border border-[var(--border-subtle)] px-3 py-2.5">
                    <span className="block text-[12px] font-semibold text-[var(--text-tertiary)]">Voice session</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--text-tertiary)]">Select a project to list sessions.</span>
                  </li>
                ))}
              </ul>
            </section>
            <div className="mt-6" data-testid="realtime-setup">
              <StudioEmptyState title="Select a project" description={uiState.message} />
            </div>
          </>
        )
      ) : null}

      {uiState.state === "blocked" && (
        <div className="mt-6" data-testid="realtime-blocked">
          <StudioErrorState
            title="Voice Agents unavailable"
            description={uiState.message}
            retryLabel="Retry"
            onRetry={props.onRetry}
          />
        </div>
      )}

      {uiState.state === "error" && (
        <div className="mt-6" data-testid="realtime-error">
          <StudioErrorState title="Sessions failed to load" description={uiState.message} retryLabel="Retry" onRetry={props.onRetry} />
        </div>
      )}

      {(uiState.state === "ready" || uiState.state === "empty") && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <section aria-label="Sessions" className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Sessions</h2>
              <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={props.onStart} data-testid="realtime-start">
                {busy ? "Working…" : "New session"}
              </button>
            </div>
            {!props.transportReady && props.transportMessage && (
              <p className="mt-2 text-[11px] text-[var(--text-secondary)]" data-testid="realtime-transport-closed">{props.transportMessage}</p>
            )}
            {props.sessions.length === 0 ? (
              <div className="mt-3" data-testid="realtime-empty">
                <StudioEmptyState
                  title="No sessions yet"
                  description={uiState.state === "empty" ? uiState.message : "Start a session to talk to a voice agent."}
                />
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {props.sessions.map((s) => (
                  <li key={s.sessionId}>
                    <button
                      type="button"
                      onClick={() => props.onSelectSession(s.sessionId)}
                      aria-pressed={selected?.sessionId === s.sessionId}
                      data-testid={`realtime-session-${s.sessionId.slice(0, 8)}`}
                      className={`min-h-[44px] w-full rounded-[12px] border px-3 py-2.5 text-left ${STUDIO_FOCUS_RING_CLASS} ${
                        selected?.sessionId === s.sessionId
                          ? "border-[var(--border-strong)] bg-[var(--bg-elevated)]"
                          : "border-[var(--border-subtle)]"
                      }`}
                    >
                      <span className="block text-[12px] font-semibold text-[var(--text-primary)]">{s.agentName}</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--text-secondary)]">
                        {s.status} · epoch {s.epoch} · {s.transportMode}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="space-y-4">
            {!selected ? (
              <StudioEmptyState title="Select a session" description="Choose a session to inspect its transcript, tools and metering." />
            ) : (
              <>
                <section aria-label="Session controls" className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4" data-testid={`realtime-state-${uiSessionState}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="mr-auto text-[13px] font-semibold text-[var(--text-primary)]">
                      {REALTIME_SESSION_STATE_LABELS[uiSessionState]}
                    </h2>
                    <AudibleIndicator speaking={props.agentSpeaking} live={uiSessionState === "active" || uiSessionState === "reconnecting"} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                    <span>Cap {formatIcu(selected.spendCapIcu)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Reserved {formatIcu(selected.reservedIcu)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Connected {props.metering ? formatDuration(props.metering.connectedSeconds) : "—"}</span>
                    {props.metering?.atCap && (
                      <span role="alert" className="rounded-full bg-[var(--bg-inset)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-primary)]">
                        At spend cap
                      </span>
                    )}
                  </div>

                  {uiSessionState === "start" && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={props.onRequestPermission} data-testid="realtime-enable-mic">
                        Enable microphone
                      </button>
                    </div>
                  )}
                  {uiSessionState === "permission" && (
                    <p className="mt-4 text-[12px] text-[var(--text-secondary)]">
                      Microphone access is requested only when you connect. Grant it in the browser prompt, then press Connect.
                    </p>
                  )}
                  {uiSessionState === "permission_denied" && (
                    <div className="mt-4" data-testid="realtime-permission-denied">
                      <StudioErrorState
                        title="Microphone blocked"
                        description="The browser denied microphone access. Enable it in site settings, then retry."
                        retryLabel="Retry permission"
                        onRetry={props.onRequestPermission}
                      />
                    </div>
                  )}
                  {(uiSessionState === "permission" || uiSessionState === "connecting") && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={props.onConnect} data-testid="realtime-connect">
                        {busy ? "Connecting…" : "Connect"}
                      </button>
                    </div>
                  )}
                  {uiSessionState === "active" && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className={BUTTON_GHOST} disabled={busy} onClick={props.onDisconnect} data-testid="realtime-disconnect">
                        Simulate disconnect
                      </button>
                      <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={props.onStop} data-testid="realtime-stop">
                        Stop session
                      </button>
                    </div>
                  )}
                  {uiSessionState === "reconnecting" && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={props.onReconnect} data-testid="realtime-reconnect">
                        {busy ? "Reconnecting…" : "Reconnect"}
                      </button>
                      <button type="button" className={BUTTON_GHOST} disabled={busy} onClick={props.onStop} data-testid="realtime-stop">
                        Stop session
                      </button>
                    </div>
                  )}
                  {(uiSessionState === "ended" || uiSessionState === "error") && (
                    <p className="mt-4 text-[12px] text-[var(--text-secondary)]" data-testid="realtime-terminal">
                      {selected.endReason ? `Ended: ${selected.endReason}.` : "Session ended."}{" "}
                      Settled {formatIcu(selected.spentIcu)} of {formatIcu(selected.reservedIcu)} reserved.
                    </p>
                  )}

                  {(uiSessionState === "active" || uiSessionState === "reconnecting") && (
                    <form
                      className="mt-4 flex max-w-[320px] items-end gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const n = Number(topupIcu);
                        if (Number.isInteger(n) && n > 0) props.onTopup(n);
                      }}
                    >
                      <label className="flex-1 text-[11px] text-[var(--text-secondary)]">
                        Top up (ICU)
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={topupIcu}
                          onChange={(e) => setTopupIcu(e.target.value)}
                          className={`${INPUT_CLASS} mt-1`}
                          aria-label="Topup amount in ICU"
                        />
                      </label>
                      <button type="submit" className={BUTTON_GHOST} disabled={busy} data-testid="realtime-topup">
                        Top up
                      </button>
                    </form>
                  )}
                </section>

                <RealtimeSessionInspector session={selected} metering={props.metering} />

                <section aria-label="Transcript" className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Transcript</h2>
                  {props.events.length === 0 ? (
                    <p className="mt-2 text-[12px] text-[var(--text-secondary)]">No transcript events yet.</p>
                  ) : (
                    <ol className="mt-3 max-h-[280px] space-y-2 overflow-y-auto" aria-live="polite">
                      {props.events.map((e) => (
                        <li key={e.eventId} className="text-[12px]" data-testid={`realtime-event-${e.sequence}`}>
                          <span className="font-semibold text-[var(--text-primary)]">
                            {e.role === "agent" ? "Agent" : e.role === "user" ? "You" : "System"}:{" "}
                          </span>
                          <span className="text-[var(--text-secondary)]">{e.text || e.type}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <section aria-label="Tool calls" className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Tool calls</h2>
                  {props.tools.length === 0 ? (
                    <p className="mt-2 text-[12px] text-[var(--text-secondary)]">No tool calls in this session.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {props.tools.map((t) => (
                        <li
                          key={t.callId}
                          className="flex flex-wrap items-center gap-2 rounded-[12px] bg-[var(--bg-elevated)] px-3 py-2 text-[12px]"
                        >
                          <span className="font-semibold text-[var(--text-primary)]">{t.toolName}</span>
                          <span className="text-[var(--text-secondary)]">{t.task}</span>
                          <span className="ml-auto rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                            {t.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function realtimeFailureMessage(failure: unknown): string {
  if (failure instanceof RealtimeApiError) {
    // Transport attach without a live provider is a setup state, not a
    // failure: session admit/list/edit still work around it.
    if ((failure.code === "SETUP_REQUIRED" && failure.dependency === "provider") || failure.code === "PROVIDER_UNAVAILABLE") {
      return "Live voice needs a realtime provider.";
    }
    return failure.message;
  }
  if (failure instanceof Error) return failure.message;
  return "Voice Agents request failed.";
}

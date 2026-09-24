"use client";

import type { ReactNode } from "react";
import { V2VoiceButton, V2VoiceTranscript, type V2VoiceState } from "../Voice";
import { V2Button } from "../Button";

const MODE_RAIL_ITEMS = [
  { id: "edit", label: "Edit", icon: "✎" },
  { id: "chapters", label: "Chapters", icon: "▤" },
  { id: "voices", label: "Voices", icon: "◐" },
  { id: "sfx", label: "SFX", icon: "♫" },
  { id: "music", label: "Music", icon: "♪" },
  { id: "files", label: "Files", icon: "▦" },
] as const;

type ModeId = (typeof MODE_RAIL_ITEMS)[number]["id"];

export interface VoiceStudioWorkbenchProps {
  /** Active mode rail item. */
  activeMode?: ModeId;
  onModeChange?: (id: ModeId) => void;
  /** Central script value for canvas. */
  script?: string;
  onScriptChange?: (value: string) => void;
  /** Model/voice controls slot. */
  modelControl?: ReactNode;
  voiceControl?: ReactNode;
  /** AI tools slot, generation history slot, voice state feedback. */
  aiTools?: ReactNode;
  generationHistory?: ReactNode;
  voiceState?: V2VoiceState;
  voiceTranscript?: string;
  onGenerate?: () => void;
  onSelectVoice?: () => void;
  className?: string;
}

function ModeRail({ active = "edit", onChange }: { active?: ModeId; onChange?: (id: ModeId) => void }) {
  return (
    <aside className="flex w-[56px] shrink-0 flex-col items-center border-r border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] py-3" aria-label="Studio modes">
      <div className="flex w-full flex-col items-center gap-1">
        {MODE_RAIL_ITEMS.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isActive}
              aria-label={item.label}
              onClick={() => onChange?.(item.id)}
              className="flex w-full flex-col items-center gap-1 px-1 py-2 text-[12px] font-medium tracking-[-0.01em]"
            >
              <span
                className={[
                  "grid h-7 w-7 place-items-center rounded-[var(--v2-radius-base)] border text-[12px] transition-colors duration-[150ms]",
                  isActive
                    ? "border-[var(--v2-border-strong)] bg-[var(--v2-text-primary)] text-[var(--v2-canvas)]"
                    : "border-transparent text-[var(--v2-text-tertiary)] hover:bg-[var(--v2-hover)] hover:text-[var(--v2-text-secondary)]",
                ].join(" ")}
              >
                <span aria-hidden>{item.icon}</span>
              </span>
              <span className={isActive ? "text-[var(--v2-text-primary)]" : "text-[var(--v2-text-tertiary)]"}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function SpeechInspector({
  aiTools,
  generationHistory,
  voiceState,
  voiceTranscript,
  modelControl,
  voiceControl,
}: Pick<VoiceStudioWorkbenchProps, "aiTools" | "generationHistory" | "voiceState" | "voiceTranscript" | "modelControl" | "voiceControl">) {
  return (
    <aside className="w-[320px] shrink-0 overflow-hidden border-r border-[var(--v2-border-subtle)] bg-[var(--v2-surface)]" aria-label="Speech inspector">
      <div className="flex h-full flex-col overflow-y-auto" tabIndex={0} role="region" aria-label="Speech inspector">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] px-4">
          <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--v2-text-primary)]" style={{ fontFamily: "var(--font-geist-sans)" }}>
            Edit Speech
          </h3>
          <span className="text-[var(--v2-text-tertiary)]">···</span>
        </div>

        <div className="space-y-4 px-4 py-4">
          <section aria-label="Playback">
            <h4 className="mb-2 text-[12px] font-medium text-[var(--v2-text-tertiary)]">Playback</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[var(--v2-text-secondary)]">Volume</span>
                <span className="font-mono text-[11px] text-[var(--v2-text-tertiary)]">100%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--v2-hover)]">
                <div className="h-1.5 w-[56%] rounded-full bg-[var(--v2-text-secondary)]" />
              </div>
              <div className="flex justify-between gap-3 text-[12px]">
                <span className="text-[var(--v2-text-tertiary)]">Fade In 0s</span>
                <span className="text-[var(--v2-text-tertiary)]">Fade Out 0s</span>
              </div>
            </div>
          </section>

          <section aria-label="Model and voice controls">
            <h4 className="mb-2 text-[12px] font-medium text-[var(--v2-text-tertiary)]">Model</h4>
            <div className="rounded-[var(--v2-radius-base)] border border-[var(--v2-border-default)] bg-[var(--v2-raised)] px-3 py-2.5">
              {modelControl ?? <div className="text-[13px] text-[var(--v2-text-secondary)]">Eleven Multilingual v2 · V2</div>}
            </div>
            <h4 className="mb-2 mt-4 text-[12px] font-medium text-[var(--v2-text-tertiary)]">Voice</h4>
            <div className="rounded-[var(--v2-radius-base)] border border-[var(--v2-border-default)] bg-[var(--v2-raised)] px-3 py-2.5">
              {voiceControl ?? <div className="flex items-center gap-2 text-[13px] text-[var(--v2-text-tertiary)]"><span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--v2-hover)] text-[10px]">V</span> Voice unavailable · V2</div>}
            </div>
          </section>

          <section aria-label="Generation history">
            <h4 className="mb-2 text-[12px] font-medium text-[var(--v2-text-tertiary)]">Generation History</h4>
            {generationHistory ?? (
              <div className="rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-subtle)] bg-[var(--v2-hover)] px-4 py-6 text-center">
                <p className="text-[13px] font-medium text-[var(--v2-text-primary)]">No generation found</p>
                <p className="mt-1 text-[12px] text-[var(--v2-text-tertiary)]">Clip hasn’t been generated yet.</p>
              </div>
            )}
          </section>

          <section aria-label="AI tools">
            <h4 className="mb-2 text-[12px] font-medium text-[var(--v2-text-tertiary)]">AI Tools</h4>
            {aiTools ?? (
              <div className="overflow-hidden rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-subtle)] bg-[var(--v2-hover)]">
                <div className="flex items-center justify-between border-b border-[var(--v2-border-subtle)] px-3 py-2.5">
                  <span className="text-[13px] text-[var(--v2-text-secondary)]">Enhance text</span>
                  <span className="rounded-full border border-[var(--v2-border-default)] bg-[var(--v2-surface)] px-2 py-0.5 text-[12px] text-[var(--v2-text-tertiary)]">Preview</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[13px] text-[var(--v2-text-secondary)]">Remove background audio</span>
                  <span className="text-[12px] text-[var(--v2-text-tertiary)]">Setup</span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--v2-border-subtle)] px-3 py-2.5">
                  <span className="text-[13px] text-[var(--v2-text-secondary)]">Voice changer</span>
                  <span className="text-[12px] text-[var(--v2-text-tertiary)]">Setup</span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--v2-border-subtle)] px-3 py-2.5">
                  <span className="text-[13px] text-[var(--v2-text-secondary)]">Direct speech with your voice</span>
                  <span className="rounded-full bg-[var(--v2-text-primary)] px-2 py-0.5 text-[12px] text-[var(--v2-canvas)]">Consent</span>
                </div>
              </div>
            )}
          </section>

          <section aria-label="Voice state feedback">
            <h4 className="mb-2 text-[12px] font-medium text-[var(--v2-text-tertiary)]">Voice State</h4>
            <div className="flex items-center gap-3 rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] px-3 py-2">
              <V2VoiceButton state={voiceState ?? "idle"} size="sm" aria-label={`Voice ${voiceState ?? "idle"}`} />
              <span className="text-[13px] capitalize text-[var(--v2-text-secondary)]">{voiceState ?? "idle"}</span>
              {voiceTranscript ? <span className="ml-auto max-w-[140px] truncate text-[12px] text-[var(--v2-text-tertiary)]">{voiceTranscript}</span> : null}
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}

function ScriptCanvas({
  script,
  onScriptChange,
  onGenerate,
  onSelectVoice,
}: Pick<VoiceStudioWorkbenchProps, "script" | "onScriptChange" | "onGenerate" | "onSelectVoice">) {
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[var(--v2-canvas)]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] px-4">
        <div className="flex items-center gap-2">
          <V2Button size="sm" variant="primary" onClick={onGenerate}>
            Generate
          </V2Button>
          <V2Button size="sm" variant="secondary" onClick={onSelectVoice}>
            Select voice
          </V2Button>
          <V2Button size="sm" variant="ghost">
            Timing
          </V2Button>
        </div>
        <div className="flex items-center gap-2">
          <V2Button size="sm" variant="ghost">
            Lock
          </V2Button>
          <V2Button size="sm" variant="ghost">
            Notes
          </V2Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-8 py-10">
        <div className="absolute left-6 top-6 flex items-center gap-2 text-[12px] text-[var(--v2-text-tertiary)]">
          <span className="h-px w-6 bg-[var(--v2-border-subtle)]" aria-hidden />
          Script Canvas
        </div>

        <div className="w-full max-w-[680px]">
          <textarea
            value={script ?? ""}
            onChange={(e) => onScriptChange?.(e.target.value)}
            placeholder="Start typing here or paste any text you want to turn into lifelike speech..."
            className="min-h-[180px] w-full resize-none rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-default)] bg-[var(--v2-surface)] p-4 text-[14px] leading-6 text-[var(--v2-text-primary)] placeholder:text-[var(--v2-text-tertiary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-focus)] focus-visible:outline-offset-2"
            style={{ fontFamily: "var(--font-geist-sans)" }}
            aria-label="Script"
          />
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--v2-border-default)] bg-[var(--v2-surface)] px-3 py-1.5 text-[12px] text-[var(--v2-text-secondary)]">Import document</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--v2-border-default)] bg-[var(--v2-surface)] px-3 py-1.5 text-[12px] text-[var(--v2-text-secondary)]">Paste URL</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--v2-border-default)] bg-[var(--v2-surface)] px-3 py-1.5 text-[12px] text-[var(--v2-text-secondary)]">Draft narration</span>
          </div>
        </div>
      </div>
    </main>
  );
}

function TransportBar({ voiceState }: { voiceState?: V2VoiceState }) {
  return (
    <footer className="grid shrink-0 grid-rows-[52px_36px] border-t border-[var(--v2-border-subtle)] bg-[var(--v2-surface)]">
      <div className="grid grid-cols-[240px_1fr_240px] items-center border-b border-[var(--v2-border-subtle)] px-4">
        <div className="flex items-center gap-2 text-[var(--v2-text-tertiary)]">
          <span className="rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] px-2 py-1 font-mono text-[11px]">1.0×</span>
          <span className="text-[12px]">Transport</span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <V2VoiceButton state={voiceState ?? "idle"} size="sm" aria-label="Voice state" />
          <button type="button" aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full border border-[var(--v2-border-default)] bg-[var(--v2-surface)] text-[var(--v2-text-secondary)] hover:bg-[var(--v2-hover)]">◀</button>
          <button type="button" aria-label="Play" className="grid h-9 w-9 place-items-center rounded-full bg-[var(--v2-text-primary)] text-[var(--v2-canvas)]">▶</button>
          <button type="button" aria-label="Forward" className="grid h-8 w-8 place-items-center rounded-full border border-[var(--v2-border-default)] bg-[var(--v2-surface)] text-[var(--v2-text-secondary)] hover:bg-[var(--v2-hover)]">▶</button>
          <span className="ml-2 font-mono text-[11px] text-[var(--v2-text-tertiary)]">0:00 / 0:00</span>
        </div>
        <div className="flex items-center justify-end gap-3">
          <div className="h-1.5 w-28 rounded-full bg-[var(--v2-hover)]">
            <div className="h-1.5 w-1/3 rounded-full bg-[var(--v2-text-secondary)]" />
          </div>
          <span className="font-mono text-[11px] text-[var(--v2-text-tertiary)]">Voice: {voiceState ?? "idle"}</span>
        </div>
      </div>
      <div className="relative overflow-hidden bg-[var(--v2-canvas)] px-4 py-2">
        <div className="flex h-full items-end gap-px opacity-60">
          {Array.from({ length: 96 }).map((_, i) => {
            const h = 12 + ((i * 13) % 14);
            return <span key={i} className="w-[6px] shrink-0 rounded-t-[2px] bg-[var(--v2-border-default)]" style={{ height: h }} aria-hidden />;
          })}
        </div>
        <V2VoiceTranscript text="Timeline — generation history and bottom transport share the same voice state." time="—" className="absolute inset-x-4 bottom-1 hidden md:block" />
      </div>
    </footer>
  );
}

export function VoiceStudioShell(props: VoiceStudioWorkbenchProps) {
  return <VoiceStudioWorkbench {...props} />;
}

export function VoiceStudioWorkbench(props: VoiceStudioWorkbenchProps) {
  const { activeMode, onModeChange, voiceState, className, ...rest } = props;
  return (
    <div
      className={[
        "flex min-h-[620px] min-w-0 w-full max-w-full flex-col overflow-hidden rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-default)] bg-[var(--v2-surface)] shadow-[var(--v2-shadow-medium)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ fontFamily: "var(--font-geist-sans)" }}
      data-testid="voice-studio-workbench"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] px-3">
        <div className="flex items-center gap-2 text-[var(--v2-text-tertiary)]">
          <span className="grid h-7 w-7 place-items-center rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-hover)] text-[12px]">☰</span>
          <span className="h-4 w-px bg-[var(--v2-border-subtle)]" aria-hidden />
          <span className="text-[12px]">Voice Studio</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[12px] text-[var(--v2-text-tertiary)] md:inline-flex">
            <span className="h-2 w-2 rounded-full border border-[var(--v2-border-default)] bg-[var(--v2-surface)]" aria-hidden /> 10,000 credits remaining
          </span>
          <V2Button size="sm" variant="ghost">
            Share
          </V2Button>
          <V2Button size="sm" variant="primary">
            Export
          </V2Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <ModeRail active={activeMode} onChange={onModeChange} />
        <SpeechInspector voiceState={voiceState} voiceTranscript={props.voiceTranscript} modelControl={props.modelControl} voiceControl={props.voiceControl} aiTools={props.aiTools} generationHistory={props.generationHistory} />
        <ScriptCanvas script={props.script} onScriptChange={props.onScriptChange} onGenerate={props.onGenerate} onSelectVoice={props.onSelectVoice} />
      </div>

      <TransportBar voiceState={voiceState} />
    </div>
  );
}

/**
 * STUDIO_11 — batch voice (TTS) frame. Binds the 09 voice slot:
 * script composer, separate voice identity slot, separate model
 * control, one Generate action, in-flow result with playback.
 *
 * Restored generator grammar (GeneratorLayout) adapted to audio: the stage
 * is the result and playback, the inspector holds voice/model/output, and
 * the bottom composer carries the script, the estimate and the one Generate
 * action — the same composer shape as Image.
 */

"use client";

import * as React from "react";
import { StudioEmptyState, StudioErrorState } from "../../shell/states";
import { STUDIO_FOCUS_RING_CLASS } from "../../shell/tokens";
import { CreateVoiceSlotBinding } from "../../identity/CreateVoiceSlotBinding";
import { VoicePreview } from "../../identity/VoicePreview";
import type { CreateVoiceSlotState } from "../types";
import { EstimateBar } from "../EstimateBar";
import { formatIcuDollars } from "../create-api-client";
import { CreateHistoryList } from "../CreateResult";
import { useCreateHistory } from "../useCreateHistory";
import { GeneratorLayout, GeneratorModeTabs, InspectorSection } from "../GeneratorLayout";
import { StudioModelSwitcherField } from "../StudioModelSwitcher";
import { ComposerInputField, GeneratorComposer } from "../GeneratorComposer";
import { ProWorkbenchLink } from "../ProWorkbenchLink";
import { adaptAudioSubmit } from "../composer-legacy-adapter";
import { composerToolFor } from "../composer-registry";
import type { AudioToolDefinition } from "./types";
import { useAudioJob } from "./useAudioJob";
import { toAudioHistoryEntry } from "./audio-history";
import { AudioStagePanel } from "./AudioGenerator";

export function VoiceFrame({ tool, projectId, initialScript = null }: { tool: AudioToolDefinition; projectId: string | null; initialScript?: string | null }) {
  const [script, setScript] = React.useState(initialScript ?? "");
  const [voice, setVoice] = React.useState<CreateVoiceSlotState>({ voiceIdentityId: null, bound: true });
  const [modelSelection, setModelSelection] = React.useState("auto");
  const history = useCreateHistory(projectId, "voice");
  const job = useAudioJob({
    projectId,
    tool: "voice",
    modelSelection,
    capIcu: null,
    sourceLanguage: null,
    targetLanguage: null,
    stageParameters: React.useCallback(
      () => ({ text: script, voiceIdentityId: voice.voiceIdentityId }),
      [script, voice.voiceIdentityId],
    ),
  });

  const quote = job.quotes.synthesize ?? null;
  const result = job.jobs.synthesize ?? null;
  // Record the admitted synthesize job into durable history exactly once.
  const recordedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!projectId || !result || !job.project || recordedRef.current === result.jobId) return;
    recordedRef.current = result.jobId;
    history.record(
      toAudioHistoryEntry({
        toolId: "voice",
        projectId,
        audioProjectId: job.project.audioProjectId,
        job: result,
        quote,
        promptText: script,
      }),
    );
  }, [projectId, result, job.project, quote, script, history]);
  const entry = composerToolFor("voice");
  const { model: submitModel } = adaptAudioSubmit(
    entry,
    "voice",
    {
      busy: job.busy,
      values: { voiceIdentityId: voice.voiceIdentityId, script },
      extraDisabled: projectId === null || job.busy,
      blockedMessage: null,
    },
    job.start,
  );
  const tabs = <GeneratorModeTabs activeId="voice" modality="audio" projectId={projectId} />;

  if (!projectId) {
    // VISUAL-02 — safe read-only preview: the creative frame stays
    // visible but locked, with one action to resolve the state.
    return (
      <GeneratorLayout
        title={tool.title}
        routeMarker={tool.route}
        tabs={tabs}
        stage={
          <AudioStagePanel title={tool.title} lead={tool.description}>
            <div className="mx-auto max-w-[430px]">
              <StudioEmptyState
                title="Select a project to start"
                description="Voice generations belong to a project. Pick one to unlock the script composer and history."
                actionLabel="Open projects"
                actionHref="/studio/projects"
                testId="create-no-project"
                compact
              />
            </div>
          </AudioStagePanel>
        }
        composer={() => (
          <GeneratorComposer
            entry={entry}
            label="Voice preview (locked)"
            locked
            input={<ComposerInputField copy={entry.input} variant={entry.inputVariant} value="" onChange={() => {}} disabled rows={2} textareaClassName="resize-none" />}
          />
        )}
        inspector={
          <InspectorSection title="Voice">
            <p className="text-[12px] text-[var(--text-secondary)]">Settings unlock with a project scope.</p>
          </InspectorSection>
        }
      />
    );
  }

  return (
    <GeneratorLayout
      title={tool.title}
      routeMarker={tool.route}
      tabs={tabs}
      stage={
        <AudioStagePanel title={tool.title} lead={tool.description}>
          {result ? (
            <section aria-label="Result" className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3.5">
              <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Result</h2>
              <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]" data-testid="audio-result-status">
                {result.statusLabel} · {result.endpointId}
                {quote ? ` · est. ${formatIcuDollars(quote.estimatedIcu)}` : ""}
              </p>
              <div className="mt-2">
                <VoicePreview voiceName="Generated voice" audioUrl={null} unavailableReason="Playback is verified at runtime; no preview URL is stored in Studio state." />
              </div>
            </section>
          ) : null}
        </AudioStagePanel>
      }
      history={
        <section aria-label="History" className="w-full space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[12px] font-semibold text-[var(--text-secondary)]">History</h2>
            <button type="button" onClick={history.refresh} className={`inline-flex min-h-[44px] items-center rounded-[8px] px-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] pointer-fine:min-h-[28px] ${STUDIO_FOCUS_RING_CLASS}`}>
              Refresh
            </button>
          </div>
          <CreateHistoryList entries={history.entries} />
        </section>
      }
      composer={(openSettings) => (
        <GeneratorComposer
          entry={entry}
          label="Script and estimate"
          openSettings={openSettings}
          input={
            <section aria-label="Script">
              <ComposerInputField
                copy={entry.input}
                variant={entry.inputVariant}
                id="create-input-voice"
                value={script}
                onChange={setScript}
                textareaClassName="max-h-[40dvh] min-h-[24px] resize-none [field-sizing:content]"
              />
              <p className="text-[11.5px] text-[var(--text-tertiary)]">{script.trim().length} characters.</p>
            </section>
          }
          controls={<ProWorkbenchLink toolId="voice" projectId={projectId} />}
          estimate={
            <EstimateBar
              quote={quote}
              stale={false}
              reapprovalRequired={false}
              estimating={job.phase === "estimating"}
              error={job.error && quote === null ? { code: job.error.code, message: job.error.message } : null}
              onRetry={job.start}
            />
          }
          submit={submitModel}
          error={
            job.error && quote !== null ? (
              <StudioErrorState
                title={entry.errorTitle}
                description={job.error.message}
                retryLabel={job.error.retryable ? "Retry" : undefined}
                onRetry={job.error.retryable ? () => job.retryStage("synthesize") : undefined}
                testId="audio-error"
              />
            ) : null
          }
        />
      )}
      inspector={
        <>
          <InspectorSection title="Voice">
            <p className="mb-2 text-[11.5px] text-[var(--text-tertiary)]">A voice identity reference — separate from the model below.</p>
            <CreateVoiceSlotBinding projectId={projectId} value={voice} onChange={setVoice} />
          </InspectorSection>
          <InspectorSection title="Model">
            <StudioModelSwitcherField projectId={projectId} task="speech.synthesize" taskLabel="speech" selection={modelSelection} onSelect={setModelSelection} />
          </InspectorSection>
        </>
      }
    />
  );
}

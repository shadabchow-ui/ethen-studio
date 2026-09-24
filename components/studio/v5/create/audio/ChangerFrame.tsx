/**
 * STUDIO_11 — voice changer frame. Upload-transform form gated on
 * qualified capabilities: with no executable audio.transform endpoint
 * the form renders the blocked state and cannot run.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { StudioEmptyState, StudioErrorState } from "../../shell/states";
import { STUDIO_FOCUS_RING_CLASS } from "../../shell/tokens";
import { CreateVoiceSlotBinding } from "../../identity/CreateVoiceSlotBinding";
import { VoicePreview } from "../../identity/VoicePreview";
import type { CreateVoiceSlotState } from "../types";
import { EstimateBar } from "../EstimateBar";
import { CreateHistoryList } from "../CreateResult";
import { useCreateHistory } from "../useCreateHistory";
import { parseRouteDecision } from "../create-api-client";
import { buildResolveBody } from "../composer-request";
import { GeneratorLayout, GeneratorModeTabs, InspectorSection } from "../GeneratorLayout";
import { AudioStagePanel } from "./AudioGenerator";
import { StudioModelSwitcherField } from "../StudioModelSwitcher";
import { ComposerInputField, GeneratorComposer } from "../GeneratorComposer";
import { adaptAudioSubmit } from "../composer-legacy-adapter";
import { composerToolFor } from "../composer-registry";
import type { AudioToolDefinition } from "./types";
import { StageList } from "./StageList";
import { changerAvailable } from "./audio-tool-bindings";
import { toAudioHistoryEntry } from "./audio-history";
import { useAudioJob } from "./useAudioJob";

export function ChangerFrame({ tool, projectId }: { tool: AudioToolDefinition; projectId: string | null }) {
  const [sourceAssetId, setSourceAssetId] = React.useState("");
  const [voice, setVoice] = React.useState<CreateVoiceSlotState>({ voiceIdentityId: null, bound: true });
  const [modelSelection, setModelSelection] = React.useState("auto");
  const [capability, setCapability] = React.useState<{ checked: boolean; executable: boolean }>({ checked: false, executable: false });
  const history = useCreateHistory(projectId, "changer");
  const job = useAudioJob({
    projectId,
    tool: "changer",
    modelSelection,
    capIcu: null,
    sourceLanguage: null,
    targetLanguage: null,
    stageParameters: React.useCallback(
      () => ({ sourceAssetId, voiceIdentityId: voice.voiceIdentityId }),
      [sourceAssetId, voice.voiceIdentityId],
    ),
  });

  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      // Resolve is POST-only: probe capability through the typed
      // builder so a qualified audio.transform route unblocks the form.
      try {
        const response = await fetch("/api/studio/v1/catalog/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            buildResolveBody({ projectId, task: "audio.transform", modelSelection: "auto", capIcu: null }),
          ),
          cache: "no-store",
        });
        const parsed = parseRouteDecision((await response.json().catch(() => null)) as unknown);
        if (cancelled) return;
        setCapability({ checked: true, executable: changerAvailable(parsed.decision ? [{ executable: true }] : []) });
      } catch {
        if (!cancelled) setCapability({ checked: true, executable: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const quote = job.quotes.mix ?? job.quotes.transcribe ?? null;
  const result = job.jobs.mix ?? null;
  const mixQuote = job.quotes.mix ?? null;
  // Record the admitted mix job into durable history exactly once.
  const recordedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!projectId || !result || !job.project || recordedRef.current === result.jobId) return;
    recordedRef.current = result.jobId;
    history.record(
      toAudioHistoryEntry({
        toolId: "changer",
        projectId,
        audioProjectId: job.project.audioProjectId,
        job: result,
        quote: mixQuote,
        promptText: sourceAssetId,
      }),
    );
  }, [projectId, result, job.project, mixQuote, sourceAssetId, history]);
  const blocked = capability.checked && !capability.executable;
  const entry = composerToolFor("changer");
  const { model: submitModel } = adaptAudioSubmit(
    entry,
    "changer",
    {
      busy: job.busy,
      values: { voiceIdentityId: voice.voiceIdentityId, sourceAssetId },
      extraDisabled: projectId === null || blocked || job.busy,
      blockedMessage: blocked ? "No qualified voice capability." : null,
    },
    job.start,
  );

  const tabs = <GeneratorModeTabs activeId="changer" modality="audio" projectId={projectId} />;

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
                description="Voice changes belong to a project. Pick one to unlock the changer form."
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
            label="Changer preview (locked)"
            locked
            input={<ComposerInputField copy={entry.input} variant={entry.inputVariant} value="" onChange={() => {}} disabled />}
          />
        )}
        inspector={<InspectorSection title="Target voice"><p className="text-[12px] text-[var(--text-secondary)]">Settings unlock with a project scope.</p></InspectorSection>}
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
          {blocked ? (
            <div role="status" data-testid="changer-unavailable" className="mb-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">No qualified voice capability</p>
              <p className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">
                No approved model currently serves voice changing. The form stays readable but cannot run.
              </p>
              <p className="mt-2 text-[12.5px]">
                <Link
                  href={`/studio/models?projectId=${encodeURIComponent(projectId)}`}
                  className={`text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
                >
                  Browse voice models
                </Link>
              </p>
            </div>
          ) : null}
          {job.project ? (
            <div className="mt-4">
              <StageList stages={job.project.stages} busy={job.busy} onRetry={job.retryStage} />
            </div>
          ) : null}
          {result ? (
            <section aria-label="Changed result" className="mt-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3.5">
              <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Changed voice</h2>
              <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]" data-testid="audio-result-status">
                {result.statusLabel} · {result.endpointId}
              </p>
              <div className="mt-2">
                <VoicePreview voiceName="Changed voice" audioUrl={null} unavailableReason="Playback is verified at runtime; no preview URL is stored in Studio state." />
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
          label="Change voice action"
          openSettings={openSettings}
          input={
            <section aria-label="Changer source">
              <ComposerInputField
                copy={entry.input}
                variant={entry.inputVariant}
                value={sourceAssetId}
                onChange={setSourceAssetId}
              />
            </section>
          }
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
                retryLabel={job.error.retryable && job.currentStage ? "Retry stage" : undefined}
                onRetry={job.error.retryable && job.currentStage ? () => job.retryStage(job.currentStage as "mix") : undefined}
                testId="audio-error"
              />
            ) : null
          }
        />
      )}
      inspector={
        <>
          <InspectorSection title="Target voice">
            <CreateVoiceSlotBinding projectId={projectId} value={voice} onChange={setVoice} />
          </InspectorSection>
          <InspectorSection title="Model">
            <StudioModelSwitcherField projectId={projectId} task="audio.transform" taskLabel="voice changing" selection={modelSelection} onSelect={setModelSelection} />
          </InspectorSection>
        </>
      }
    />
  );
}

/**
 * STUDIO_11 — dubbing frame. Upload-transform composition:
 * transcribe → translate → speaker synthesis → align → mix, with
 * explicit per-stage estimates, editable transcript, speaker mapping,
 * staged failures, and per-stage cost. Resumable via stage retry.
 */

"use client";

import * as React from "react";
import { translateStudioAuthFailure } from "@/components/studio/auth/studio-auth-action";
import { StudioEmptyState, StudioErrorState } from "../../shell/states";
import { STUDIO_FOCUS_RING_CLASS } from "../../shell/tokens";
import { VoicePreview } from "../../identity/VoicePreview";
import { EstimateBar } from "../EstimateBar";
import { CreateHistoryList } from "../CreateResult";
import { useCreateHistory } from "../useCreateHistory";
import { GeneratorLayout, GeneratorModeTabs, InspectorSection } from "../GeneratorLayout";
import { AudioStagePanel } from "./AudioGenerator";
import { StudioModelSwitcherField } from "../StudioModelSwitcher";
import { ComposerInputField, GeneratorComposer } from "../GeneratorComposer";
import { ProWorkbenchLink } from "../ProWorkbenchLink";
import { adaptAudioSubmit } from "../composer-legacy-adapter";
import { composerToolFor } from "../composer-registry";
import type { AudioToolDefinition } from "./types";
import { SpeakerMapEditor } from "./SpeakerMapEditor";
import { StageList } from "./StageList";
import { TranscriptEditor } from "./TranscriptEditor";
import { parseTranscriptEdit } from "./audio-api-client";
import { toAudioHistoryEntry } from "./audio-history";
import { useAudioJob } from "./useAudioJob";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
];

export function DubbingFrame({ tool, projectId }: { tool: AudioToolDefinition; projectId: string | null }) {
  const [sourceAssetId, setSourceAssetId] = React.useState("");
  const [sourceLanguage, setSourceLanguage] = React.useState("auto");
  const [targetLanguage, setTargetLanguage] = React.useState("es");
  const [modelSelection, setModelSelection] = React.useState("auto");
  const [speakerVoices, setSpeakerVoices] = React.useState<Readonly<Record<string, string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const history = useCreateHistory(projectId, "dub");
  const job = useAudioJob({
    projectId,
    tool: "dub",
    modelSelection,
    capIcu: null,
    sourceLanguage: sourceLanguage === "auto" ? null : sourceLanguage,
    targetLanguage,
    stageParameters: React.useCallback(
      (stage) => ({
        sourceAssetId,
        sourceLanguage: sourceLanguage === "auto" ? null : sourceLanguage,
        targetLanguage,
        speakerMap: speakerVoices,
        stage,
      }),
      [sourceAssetId, sourceLanguage, targetLanguage, speakerVoices],
    ),
  });

  const transcript = job.project?.transcript ?? null;
  const speakers = React.useMemo(() => {
    if (job.project && job.project.speakers.length > 0) return job.project.speakers;
    if (!transcript) return [];
    const ids = [...new Set(transcript.segments.map((segment) => segment.speakerId))];
    return ids.map((speakerId) => ({ speakerId, label: null, voiceIdentityId: speakerVoices[speakerId] ?? null }));
  }, [job.project, transcript, speakerVoices]);

  const entry = composerToolFor("dub");
  const { model: submitModel } = adaptAudioSubmit(
    entry,
    "dub",
    {
      busy: job.busy,
      values: { sourceAssetId },
      extraDisabled: projectId === null || targetLanguage.length === 0 || job.busy,
      blockedMessage: null,
    },
    job.start,
  );
  const firstQuote = job.quotes.transcribe ?? null;
  const mixResult = job.jobs.mix ?? null;
  const mixQuote = job.quotes.mix ?? null;
  // Record the admitted mix job into durable history exactly once.
  const recordedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!projectId || !mixResult || !job.project || recordedRef.current === mixResult.jobId) return;
    recordedRef.current = mixResult.jobId;
    history.record(
      toAudioHistoryEntry({
        toolId: "dub",
        projectId,
        audioProjectId: job.project.audioProjectId,
        job: mixResult,
        quote: mixQuote,
        promptText: sourceAssetId,
      }),
    );
  }, [projectId, mixResult, job.project, mixQuote, sourceAssetId, history]);

  const handleSave = React.useCallback(
    async (texts: readonly string[]) => {
      if (!projectId || !job.project?.transcript) return;
      setSaving(true);
      setSaveError(null);
      try {
        const response = await fetch(
          `/api/studio/v1/audio/projects/${encodeURIComponent(job.project.audioProjectId)}/transcript`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              projectId,
              transcript: {
                version: 1,
                language: job.project.transcript.language,
                speakers: speakers.map((speaker) => ({ speaker_id: speaker.speakerId, label: speaker.label })),
                segments: job.project.transcript.segments.map((segment, index) => ({
                  start_ms: segment.startMs,
                  end_ms: segment.endMs,
                  speaker_id: segment.speakerId,
                  text: texts[index] ?? segment.text,
                  confidence: segment.confidence,
                  words: [],
                })),
                source: { task: "speech.transcribe", version: "studio-v5-j11", jobId: job.jobs.transcribe?.jobId ?? null },
              },
            }),
            cache: "no-store",
          },
        );
        const parsed = parseTranscriptEdit((await response.json().catch(() => null)) as unknown);
        // S4C: an expired session mid-save opens the modal instead of a
        // dead error (anonymous users never reach here: Start is pre-gated).
        if (response.status === 401) translateStudioAuthFailure(response.status, null, "transcript-save");
        if (parsed.error) {
          setSaveError(parsed.error.message);
        } else {
          job.refresh();
        }
      } catch {
        setSaveError("Transcript save failed before reaching the server.");
      } finally {
        setSaving(false);
      }
    },
    [projectId, job, speakers],
  );

  const tabs = <GeneratorModeTabs activeId="dub" modality="audio" projectId={projectId} />;
  const selectClass = "w-full rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-[13px] text-[var(--text-primary)] min-h-[44px]";

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
                description="Dubbing runs belong to a project. Pick one to unlock the dubbing form."
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
            label="Dub preview (locked)"
            locked
            input={<ComposerInputField copy={entry.input} variant={entry.inputVariant} value="" onChange={() => {}} disabled />}
          />
        )}
        inspector={<InspectorSection title="Dubbing"><p className="text-[12px] text-[var(--text-secondary)]">Settings unlock with a project scope.</p></InspectorSection>}
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
          {speakers.length > 0 ? (
            <div className="mt-4">
              <SpeakerMapEditor projectId={projectId} speakers={speakers} value={speakerVoices} onChange={setSpeakerVoices} />
            </div>
          ) : null}
          {job.project ? (
            <div className="mt-4">
              <StageList stages={job.project.stages} busy={job.busy} onRetry={job.retryStage} />
            </div>
          ) : null}
          {transcript ? (
            <div className="mt-4">
              <TranscriptEditor
                key={transcript.revision}
                language={transcript.language}
                revision={transcript.revision}
                segments={transcript.segments}
                saving={saving}
                saveError={saveError}
                onSave={handleSave}
              />
            </div>
          ) : null}
          {mixResult ? (
            <section aria-label="Dubbed result" className="mt-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3.5">
              <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Dubbed mix</h2>
              <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]" data-testid="audio-result-status">
                {mixResult.statusLabel} · {mixResult.endpointId}
              </p>
              <div className="mt-2">
                <VoicePreview voiceName="Dubbed mix" audioUrl={null} unavailableReason="Playback is verified at runtime; no preview URL is stored in Studio state." />
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
          label="Dub audio action"
          openSettings={openSettings}
          input={
            <section aria-label="Dubbing source">
              <ComposerInputField
                copy={entry.input}
                variant={entry.inputVariant}
                value={sourceAssetId}
                onChange={setSourceAssetId}
              />
            </section>
          }
          controls={<ProWorkbenchLink toolId="dub" projectId={projectId} />}
          estimate={
            <EstimateBar
              quote={firstQuote}
              stale={false}
              reapprovalRequired={false}
              estimating={job.phase === "estimating"}
              error={job.error && firstQuote === null ? { code: job.error.code, message: job.error.message } : null}
              onRetry={job.start}
            />
          }
          submit={submitModel}
          error={
            job.error && firstQuote !== null ? (
              <StudioErrorState
                title={entry.errorTitle}
                description={job.error.message}
                retryLabel={job.error.retryable && job.currentStage ? "Retry stage" : undefined}
                onRetry={job.error.retryable && job.currentStage ? () => job.retryStage(job.currentStage as "transcribe") : undefined}
                testId="audio-error"
              />
            ) : null
          }
        />
      )}
      inspector={
        <>
          <InspectorSection title="Languages">
            <div className="grid gap-2">
              <label className="space-y-1 text-[12.5px] text-[var(--text-secondary)]">
                Source language
                <select aria-label="Dub source language" value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)} className={selectClass}>
                  <option value="auto">Auto-detect</option>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-[12.5px] text-[var(--text-secondary)]">
                Target language
                <select aria-label="Dub target language" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} className={selectClass}>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </InspectorSection>
          <InspectorSection title="Model">
            <StudioModelSwitcherField projectId={projectId} task="speech.transcribe" taskLabel="dubbing" selection={modelSelection} onSelect={setModelSelection} />
          </InspectorSection>
          <InspectorSection title="Voices">
            <p className="text-[12px] text-[var(--text-secondary)]">
              {speakers.length > 0 ? "Map each detected speaker to a voice on the stage." : "Speakers appear after transcription; map each to a voice on the stage."}
            </p>
          </InspectorSection>
        </>
      }
    />
  );
}

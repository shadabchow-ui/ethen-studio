/**
 * STUDIO_11 — transcription frame. Binds the 09 transcribe slot on the
 * upload-transform layout: source asset, language/speaker settings,
 * one Transcribe action, readable transcript result with waveform
 * metadata and editable segments. Restored generator grammar: source and
 * transcript on the stage, language/speakers/model in the inspector.
 */

"use client";

import * as React from "react";
import { StudioEmptyState, StudioErrorState } from "../../shell/states";
import { STUDIO_FOCUS_RING_CLASS } from "../../shell/tokens";
import { EstimateBar } from "../EstimateBar";
import { CreateHistoryList } from "../CreateResult";
import { useCreateHistory } from "../useCreateHistory";
import { GeneratorLayout, GeneratorModeTabs, InspectorSection } from "../GeneratorLayout";
import { AudioStagePanel } from "./AudioGenerator";
import { StudioModelSwitcherField } from "../StudioModelSwitcher";
import { ComposerInputField, GeneratorComposer } from "../GeneratorComposer";
import { adaptAudioSubmit } from "../composer-legacy-adapter";
import { composerToolFor } from "../composer-registry";
import type { AudioToolDefinition } from "./types";
import { TranscriptEditor } from "./TranscriptEditor";
import { parseTranscriptEdit } from "./audio-api-client";
import { toAudioHistoryEntry } from "./audio-history";
import { useAudioJob } from "./useAudioJob";

export function TranscribeFrame({ tool, projectId }: { tool: AudioToolDefinition; projectId: string | null }) {
  const [sourceAssetId, setSourceAssetId] = React.useState("");
  const [language, setLanguage] = React.useState("auto");
  const [speakers, setSpeakers] = React.useState("auto");
  const [modelSelection, setModelSelection] = React.useState("auto");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const history = useCreateHistory(projectId, "transcribe");
  const job = useAudioJob({
    projectId,
    tool: "transcribe",
    modelSelection,
    capIcu: null,
    sourceLanguage: language === "auto" ? null : language,
    targetLanguage: null,
    stageParameters: React.useCallback(
      () => ({ sourceAssetId, language: language === "auto" ? null : language, speakers }),
      [sourceAssetId, language, speakers],
    ),
  });

  const quote = job.quotes.transcribe ?? null;
  const result = job.jobs.transcribe ?? null;
  const transcript = job.project?.transcript ?? null;
  // Record the admitted transcribe job into durable history exactly once.
  const recordedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!projectId || !result || !job.project || recordedRef.current === result.jobId) return;
    recordedRef.current = result.jobId;
    history.record(
      toAudioHistoryEntry({
        toolId: "transcribe",
        projectId,
        audioProjectId: job.project.audioProjectId,
        job: result,
        quote,
        promptText: sourceAssetId,
      }),
    );
  }, [projectId, result, job.project, quote, sourceAssetId, history]);
  const entry = composerToolFor("transcribe");
  const { model: submitModel } = adaptAudioSubmit(
    entry,
    "transcribe",
    {
      busy: job.busy,
      values: { sourceAssetId },
      extraDisabled: projectId === null || job.busy,
      blockedMessage: null,
    },
    job.start,
  );

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
                speakers: job.project.speakers.map((speaker) => ({ speaker_id: speaker.speakerId, label: null })),
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
    [projectId, job],
  );

  const tabs = <GeneratorModeTabs activeId="transcribe" modality="audio" projectId={projectId} />;
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
                description="Transcriptions belong to a project. Pick one to unlock source selection and history."
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
            label="Transcribe preview (locked)"
            locked
            input={<ComposerInputField copy={entry.input} variant={entry.inputVariant} value="" onChange={() => {}} disabled />}
          />
        )}
        inspector={<InspectorSection title="Transcription"><p className="text-[12px] text-[var(--text-secondary)]">Settings unlock with a project scope.</p></InspectorSection>}
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
          label="Transcribe audio action"
          openSettings={openSettings}
          input={
            <section aria-label="Source audio">
              <ComposerInputField
                copy={entry.input}
                variant={entry.inputVariant}
                value={sourceAssetId}
                onChange={setSourceAssetId}
              />
              {entry.input.hint ? <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">{entry.input.hint}</p> : null}
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
                retryLabel={job.error.retryable ? "Retry" : undefined}
                onRetry={job.error.retryable ? () => job.retryStage("transcribe") : undefined}
                testId="audio-error"
              />
            ) : null
          }
        />
      )}
      inspector={
        <>
          <InspectorSection title="Transcription">
            <div className="grid gap-2">
              <label className="space-y-1 text-[12.5px] text-[var(--text-secondary)]">
                Language
                <select aria-label="Transcript language" value={language} onChange={(event) => setLanguage(event.target.value)} className={selectClass}>
                  <option value="auto">Auto-detect</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="ja">Japanese</option>
                </select>
              </label>
              <label className="space-y-1 text-[12.5px] text-[var(--text-secondary)]">
                Speakers
                <select aria-label="Speaker count" value={speakers} onChange={(event) => setSpeakers(event.target.value)} className={selectClass}>
                  <option value="auto">Auto-detect</option>
                  <option value="1">1 speaker</option>
                  <option value="2">2 speakers</option>
                  <option value="3">3 speakers</option>
                  <option value="4+">4+ speakers</option>
                </select>
              </label>
            </div>
          </InspectorSection>
          <InspectorSection title="Model">
            <StudioModelSwitcherField projectId={projectId} task="speech.transcribe" taskLabel="transcription" selection={modelSelection} onSelect={setModelSelection} />
          </InspectorSection>
        </>
      }
    />
  );
}
